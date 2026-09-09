"""Onboarding wizard API routes (plan §5).

5-step wizard backend:
  Step 2  POST /connect-page     — page id/name + access token (Fernet-encrypted,
                                   upsert-safe, same storage as the Pages screen)
                                   + subscribe_page_webhooks via the TENANT client
                                   (v15-E1 C-CORE1 — the wizard used to store the
                                   page and NEVER subscribe, so Facebook never
                                   delivered a single event for wizard users)
          POST /test-connection  — verify page+token against Graph API BEFORE confirm
  Step 4  POST /first-rule       — create the first auto-reply rule
          POST /suggest-reply    — AI-assisted reply draft (deterministic fallback
                                   when no AI provider is configured — or when the
                                   plan lacks has_ai: v15-E1 D2-H1 gate)
  Step 5  POST /complete         — mark tenant.onboarding_completed

v15-E1: role gates (D1-H2) — connect-page requires admin (mirrors
PUT /api/facebook/settings), first-rule requires editor (mirrors
POST /api/rules); the wizard used to let a viewer rebind the whole
tenant's page/token and inject live reply rules.
"""
from __future__ import annotations

import asyncio
import logging

from _crypto import encrypt_token
from _responses import ok
from database import get_db
from fastapi import APIRouter, Body, Depends, HTTPException
from models import BotState, Rule, Tenant, User
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from routers.auth import get_current_user, require_role

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
    current_user: User = Depends(require_role("admin")),
):
    """Save the user's Facebook page connection during onboarding.

    access_token is encrypted with Fernet (same as the Pages screen) —
    the old XOR+base64 scheme was NOT decryptable by get_tenant_fb_client.

    v15-E1 C-CORE1 — after the save succeeds, the page is SUBSCRIBED to
    Facebook real-time webhooks through the tenant's own client
    (``get_tenant_fb_client`` — the same resolver the webhook dispatch
    uses, never the platform env client). A failed subscription does NOT
    block the save — its status rides the ok() response so the wizard can
    show it and the owner can retry from /dashboard/pages (PUT settings
    re-subscribes). v15-E1 D1-H4 — a page already bound to another tenant
    trips uq_botstate_key_value → 409 with a clear Arabic message (was a
    raw IntegrityError 500).
    """
    if not current_user.tenant_id:
        raise HTTPException(400, "لا توجد مساحة عمل")
    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise HTTPException(404, "المساحة غير موجودة")
    try:
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
    except IntegrityError:
        # D1-H4 / D13-F1 — the partial unique index uq_botstate_key_value
        # (key='fb_page_id') makes a double page-binding fail at the DB level
        # (at autoflush OR commit — both covered here); surface 409, not 500.
        await db.rollback()
        raise HTTPException(
            409, "هذه الصفحة مربوطة بمساحة عمل أخرى — تواصل مع الدعم إن كنت تعتقد أن ذلك خطأ"
        ) from None

    # Evict cached per-tenant FB clients + engine registry so the new
    # credentials take effect immediately (same as PUT /api/facebook/settings)
    try:
        from routers.inbox import _tenant_fb_cache as _inbox_fb_cache
        _inbox_fb_cache.pop(current_user.tenant_id, None)
    except Exception:
        pass
    try:
        from _services import reset_bot_engines
        reset_bot_engines()
    except Exception:
        pass

    # ── C-CORE1: subscribe the page to webhooks via the TENANT client ──
    webhook_result = None
    subscribed = False
    if body.page_id or body.access_token:
        try:
            from _services import get_tenant_fb_client
            fb_client = await get_tenant_fb_client(current_user.tenant_id)
            if fb_client is not None:
                # bounded wait: the wizard response must not hang on a slow
                # Graph call (failure is non-fatal — retryable later)
                result = await asyncio.wait_for(fb_client.subscribe_page_webhooks(), timeout=8)
                subscribed = bool(
                    result and not result.get("_error") and result.get("success") is True
                )
                webhook_result = result
        except TimeoutError:
            webhook_result = {"_error": True, "body": "timeout"}
        except Exception as e:
            webhook_result = {"_error": True, "body": str(e)[:200]}

    data = {
        "page_id": body.page_id,
        "webhook_subscribed": subscribed,
        "webhook": webhook_result or "skipped",
    }
    if not subscribed:
        data["webhook_hint"] = (
            "لم يكتمل اشتراك الويبهوك للصفحة — يمكن إعادة المحاولة لاحقًا من "
            "صفحة «صفحاتي» أو إعدادات فيسبوك"
        )
    return ok(data)


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
        # v12-E2.11: unified ok() envelope (was a raw success:False dict) —
        # the connection outcome lives INSIDE data ({connected, error}),
        # same shape as facebook_routes.test_facebook_connection.
        return ok({"connected": False, "error": "أدخل معرف الصفحة ورمز الوصول"})

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
            # v12-E2.11: ok() envelope (see above)
            return ok({"connected": False,
                    "error": f"فشل التحقق من فيسبوك: {detail or r.status_code}"})
        data = r.json()
        return ok({"connected": True,
                "page_name": data.get("name", ""), "fan_count": data.get("fan_count", 0)})
    except Exception as e:
        # v12-E2.11: ok() envelope (see above)
        # v17-E-B3 (D9 #3): the English exception detail never reaches the
        # wizard (OnboardingWizard renders testResult.error) — it goes to the
        # log, the payload carries a fixed Arabic message.
        log.warning("onboarding test-connection failed (tenant=%s page=%s): %s",
                    current_user._tenant_id, page_id[:40], str(e)[:300])
        return ok({"connected": False,
                   "error": "تعذر الاتصال بفيسبوك — تحقق من اتصالك بالإنترنت ثم أعد المحاولة"})


# Deterministic fallbacks so the wizard works with zero AI configuration
_REPLY_TEMPLATES = {
    "سعر": "شكراً لاهتمامك! أسعارنا تبدأ من {{price}} د.ل — تفضل بمراسلتنا على الخاص لتفاصيل أكثر 🙌",
    "توصيل": "التوصيل متاح لجميع المناطق 🚚 — أخبرنا بموقعك في رسالة خاصة لتحديد التكلفة والوقت.",
    "سلام": "أهلاً وسهلاً بك 🌟 كيف نساعدك اليوم؟",
}


@router.post("/suggest-reply")
async def suggest_reply(
    payload: dict = Body(...),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """AI-assisted reply drafting (plan §5.1 step 4).

    Uses the configured AI provider when available; otherwise returns a
    deterministic template suggestion so the wizard never blocks.

    v15-E1 D2-H1 — the has_ai plan gate: a plan without the AI feature
    never reaches the provider (the deterministic fallback answers), and
    the response carries an explicit Arabic note so the owner knows WHY
    the suggestion is a template.
    """
    keyword = (payload.get("keyword") or "").strip()
    if not keyword:
        raise HTTPException(400, "أدخل كلمة مفتاحية أولاً")

    suggestion = None
    source = "template"
    ai_blocked = False
    ai_note = ""

    # ── v15-D2-H1: has_ai gate (the ONE AI call point in this router) ──
    try:
        from bot_engine.pipeline import get_plan_limits
        limits = await get_plan_limits(db, current_user._tenant_id)
    except Exception:
        limits = None
    if limits is not None and limits.get("has_ai") is False:
        ai_blocked = True
        ai_note = (
            "اقتراحات الذكاء الاصطناعي غير متاحة في خطتك الحالية — تم استخدام "
            "القوالب الجاهزة. قم بالترقية لتفعيل الاقتراحات الذكية."
        )
    else:
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

    return ok({"suggestion": suggestion.strip(), "source": source,
               "ai_blocked": ai_blocked, "ai_note": ai_note})


@router.post("/first-rule")
async def create_first_rule(
    body: FirstRulePayload = Body(...),
    db=Depends(get_db),
    current_user: User = Depends(require_role("editor")),
):
    """Save the user's first auto-reply rule during onboarding.

    v15-E1 D1-H2 — editor gate (mirrors POST /api/rules): the wizard used to
    accept ANY role, so a viewer could inject a live auto-reply rule.
    """
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
        return ok({"rule_id": rule.id})
    return ok({"rule_id": None})
