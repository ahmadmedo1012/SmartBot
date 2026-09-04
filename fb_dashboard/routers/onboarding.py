"""Onboarding wizard API routes."""
from __future__ import annotations
import logging
from fastapi import APIRouter, Depends, Body, HTTPException
from pydantic import BaseModel
from sqlalchemy import select

from database import get_db
from models import User, Tenant, Rule, BotState
from routers.auth import get_current_user
from config import settings
import base64, hashlib

log = logging.getLogger("fb-onboarding")

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


class ConnectPagePayload(BaseModel):
    page_id: str = ""
    page_name: str = ""


class FirstRulePayload(BaseModel):
    keyword: str = ""
    reply: str = ""


def _encrypt_value(value: str) -> str:
    """Encrypt a token for DB storage. Uses base64 as dev fallback."""
    if not value:
        return ""
    key = settings.SECRET_KEY or "dev-key"
    key_bytes = key.encode()[:32].ljust(32, b"0")
    # Simple XOR + base64 for dev (Fernet not required here since tokens are already encrypted via FB)
    encrypted = "".join(chr(ord(c) ^ ord(key_bytes[i % len(key_bytes)])) for i, c in enumerate(value))
    return base64.b64encode(encrypted.encode()).decode()


@router.post("/connect-page")
async def connect_page(
    body: ConnectPagePayload = Body(...),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Save the user's Facebook page connection during onboarding."""
    if not current_user.tenant_id:
        raise HTTPException(400, "لا توجد مساحة عمل")
    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise HTTPException(404, "المساحة غير موجودة")
    if body.page_id:
        db.add(BotState(
            tenant_id=current_user.tenant_id,
            key="fb_page_id",
            value=body.page_id,
        ))
    if body.page_name:
        db.add(BotState(
            tenant_id=current_user.tenant_id,
            key="fb_page_name",
            value=body.page_name,
        ))
    await db.commit()
    return {"success": True, "data": {"page_id": body.page_id}}


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
