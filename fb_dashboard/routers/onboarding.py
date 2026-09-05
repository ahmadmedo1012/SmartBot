"""Onboarding wizard API routes (plan §5).

5-step wizard backend:
  Step 2  POST /connect-page     — page id/name + access token (Fernet-encrypted,
                                   upsert-safe, same storage as the Pages screen)
          POST /test-connection  — verify page+token against Graph API BEFORE confirm
  Step 4  POST /first-rule       — create the first auto-reply rule
          POST /suggest-reply    — AI-assisted reply draft (deterministic fallback
                                   when no AI provider is configured)
  Step 5  POST /complete         — mark tenant.onboarding_completed
"""
from __future__ import annotations
import logging

from fastapi import APIRouter, Depends, Body, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from database import get_db
from models import User, Tenant, Rule, BotState
from routers.auth import get_current_user
from _crypto import encrypt_token

log = logging.getLogger("fb-onboarding")

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


class ConnectPagePayload(BaseModel):
    page_id: str = ""
    page_name: str = ""
    access_token: str = ""


class FirstRulePayload(BaseModel):
    keyword: str = ""
    reply: str = ""


async def _upsert_botstate(db, tenant_id: int, key: str, value: str) -> None:
    """Upsert a tenant BotState row (safe on wizard retries)."""
    row = await db.execute(
        select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == key)
    )
    bs = row.scalar_one_or_none()
    if bs is not None:
        bs.value = value
    else:
        db.add(BotState(tenant_id=tenant_id, key=key, value=value))


@router.post("/connect-page")
async def connect_page(
    body: ConnectPagePayload = Body(...),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save the user's Facebook page connection during onboarding.

    access_token is encrypted with Fernet (same as the Pages screen) —
    the old XOR+base64 scheme was NOT decryptable by get_tenant_fb_client.
    """
    if not current_user.tenant_id:
        raise HTTPException(400, "لا توجد مساحة عمل")
    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise HTTPException(404, "المساحة غير موجودة")
    if body.page_id:
        await _upsert_botstate(db, current_user.tenant_id, "fb_page_id", body.page_id.strip())
    if body.page_name:
        await _upsert_botstate(db, current_user.tenant_id, "fb_page_name", body.page_name.strip())
    if body.access_token:
        await _upsert_botstate(
            db, current_user.tenant_id, "fb_access_token",
            encrypt_token(body.access_token.strip()),
        )
    await db.commit()
    return {"success": True, "data": {"page_id": body.page_id}}


@router.post("/test-connection")
async def test_connection(
    body: ConnectPagePayload = Body(default=None),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Verify page_id + access_token against the Graph API BEFORE confirming.

    Accepts credentials in the body (pre-save test) or falls back to the
    tenant's stored BotState (post-save test). Plan §5.1 step 2:
    'Test connection قبل التأكيد'.
    """
    page_id = (body.page_id or "").strip() if body else ""
    token = (body.access_token or "").strip() if body else ""

    if not (page_id and token):
        row = await db.execute(
            select(BotState).where(
                BotState.tenant_id == current_user._tenant_id,
                BotState.key == "fb_page_id",
            )
        )
        bs = row.scalar_one_or_none()
        if bs:
            page_id = bs.value
        row = await db.execute(
            select(BotState).where(
                BotState.tenant_id == current_user._tenant_id,
                BotState.key == "fb_access_token",
            )
        )
        bs = row.scalar_one_or_none()
        if bs and bs.value:
            from _crypto import decrypt_token
            try:
                token = decrypt_token(bs.value)
            except Exception:
                token = ""

    if not page_id or not token:
        return {"success": False, "data": {"connected": False, "error": "أدخل معرف الصفحة ورمز الوصول"}}

    try:
        import httpx
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get(
                f"https://graph.facebook.com/v21.0/{page_id}",
                params={"fields": "name,fan_count", "access_token": token},
            )
        if r.status_code != 200:
            detail = ""
            try:
                err = r.json().get("error", {})
                detail = err.get("message", "")[:150]
            except Exception:
                pass
            return {"success": False, "data": {"connected": False,
                    "error": f"فشل التحقق من فيسبوك: {detail or r.status_code}"}}
        data = r.json()
        return {"success": True, "data": {"connected": True,
                "page_name": data.get("name", ""), "fan_count": data.get("fan_count", 0)}}
    except Exception as e:
        return {"success": False, "data": {"connected": False, "error": f"تعذر الاتصال بفيسبوك: {str(e)[:150]}"}}


# Deterministic fallbacks so the wizard works with zero AI configuration
_REPLY_TEMPLATES = {
    "سعر": "شكراً لاهتمامك! أسعارنا تبدأ من {{price}} د.ل — تفضل بمراسلتنا على الخاص لتفاصيل أكثر 🙌",
    "توصيل": "التوصيل متاح لجميع المناطق 🚚 — أخبرنا بموقعك في رسالة خاصة لتحديد التكلفة والوقت.",
    "سلام": "أهلاً وسهلاً بك 🌟 كيف نساعدك اليوم؟",
}


@router.post("/suggest-reply")
async def suggest_reply(
    payload: dict = Body(...),
    current_user: User = Depends(get_current_user),
):
    """AI-assisted reply drafting (plan §5.1 step 4).

    Uses the configured AI provider when available; otherwise returns a
    deterministic template suggestion so the wizard never blocks.
    """
    keyword = (payload.get("keyword") or "").strip()
    if not keyword:
        raise HTTPException(400, "أدخل كلمة مفتاحية أولاً")

    suggestion = None
    source = "template"
    try:
        from _services import get_ai
        ai = get_ai()
        if ai.available:
            result = await ai.suggest_replies(
                f"تعليق يحتوي كلمة '{keyword}'", page_context="صفحة فيسبوك تجارية",
            )
            suggestions = (result or {}).get("suggestions") or []
            if suggestions and isinstance(suggestions[0], str) and len(suggestions[0].strip()) > 5:
                suggestion = suggestions[0]
                source = "ai"
    except Exception:
        suggestion = None

    if not suggestion:
        for k, tpl in _REPLY_TEMPLATES.items():
            if k in keyword:
                suggestion = tpl.replace("{{price}}", "50")
                break
        if not suggestion:
            suggestion = (
                f"شكراً لاهتمامك بـ'{keyword}' 🙌 راسلنا على الخاص وسنجيبك بكل التفاصيل فوراً!"
            )

    return {"success": True, "data": {"suggestion": suggestion.strip(), "source": source}}


@router.post("/first-rule")
async def create_first_rule(
    body: FirstRulePayload = Body(...),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save the user's first auto-reply rule during onboarding."""
    if not current_user.tenant_id:
        raise HTTPException(400, "لا توجد مساحة عمل")
    if body.keyword and body.reply:
        rule = Rule(
            tenant_id=current_user.tenant_id,
            name=f"قاعدة {body.keyword}",
            keywords=[body.keyword.strip()],
            reply_template=body.reply.strip(),
            enabled=True,
            bot_type="reply",
        )
        db.add(rule)
        await db.commit()
        return {"success": True, "data": {"rule_id": rule.id}}
    return {"success": True, "data": {"rule_id": None}}
