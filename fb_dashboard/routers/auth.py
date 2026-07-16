from __future__ import annotations
"""Auth & user routes: login, register, logout, /me, audit log."""
import asyncio
import json
import logging
import os
import re
import secrets
from datetime import datetime, timezone, timedelta

import jwt
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import select, func, desc, or_

from config import settings
from database import get_db
from models import User, Tenant, BlacklistedToken, AuditLog
from _hash import hash_password, verify_password
from _audit import log_audit

log = logging.getLogger("fb-api")
router = APIRouter(tags=["auth"])

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE = timedelta(hours=24)


def make_token(username: str, tenant_id: int = 0) -> str:
    jti = secrets.token_hex(16)
    return jwt.encode(
        {"sub": username, "tid": tenant_id, "jti": jti,
         "exp": datetime.now(timezone.utc) + ACCESS_TOKEN_EXPIRE},
        settings.SECRET_KEY, algorithm=ALGORITHM,
    )


async def get_current_user(request: Request, db=Depends(get_db)):
    token = request.cookies.get("token")
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    jti = payload.get("jti", "")
    if jti:
        blacklisted = await db.execute(select(BlacklistedToken).where(BlacklistedToken.jti == jti))
        if blacklisted.scalar_one_or_none():
            raise HTTPException(401, "Token revoked")
    user = await db.execute(select(User).where(User.username == payload["sub"]))
    user = user.scalar_one_or_none()
    if not user:
        raise HTTPException(401, "User not found")
    if user.tenant_id:
        tenant = await db.get(Tenant, user.tenant_id)
        if not tenant or not tenant.is_active:
            raise HTTPException(403, "Tenant account is inactive or deleted")
    user._tenant_id = user.tenant_id or 0
    return user


ROLE_HIERARCHY = {"admin": 3, "editor": 2, "viewer": 1}


def require_role(min_role: str):
    async def checker(current_user: User = Depends(get_current_user)):
        if ROLE_HIERARCHY.get(current_user.role, 0) < ROLE_HIERARCHY.get(min_role, 0):
            raise HTTPException(403, "Insufficient permissions")
        return current_user
    return checker


@router.post("/api/login")
async def login(username: str = Form(...), password: str = Form(...),
                request: Request = None, db=Depends(get_db)):
    ip = request.client.host if request and request.client else "unknown"
    from _rate_limit import check_rate_limit
    if not await check_rate_limit(db, f"login:{ip}", max_attempts=10, window_seconds=60):
        raise HTTPException(429, "محاولات كثيرة جداً — حاول بعد 60 ثانية")
    user = await db.execute(select(User).where(or_(User.username == username, User.email == username)))
    user = user.scalar_one_or_none()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(401, "بيانات تسجيل الدخول غير صحيحة")
    token = make_token(user.username, user.tenant_id)
    await log_audit(db, "login", actor_id=user.id, ip=ip, tenant_id=user.tenant_id or 0)
    await db.commit()
    resp = JSONResponse({"ok": True, "role": user.role, "username": user.username})
    resp.set_cookie(key="token", value=token, httponly=True, secure=True, samesite="lax",
                    max_age=int(ACCESS_TOKEN_EXPIRE.total_seconds()))
    return resp


@router.post("/api/logout")
async def logout(request: Request, db=Depends(get_db)):
    token = request.cookies.get("token")
    if token:
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
            jti = payload.get("jti", "")
            exp = payload.get("exp")
            if jti and exp:
                db.add(BlacklistedToken(jti=jti, expires_at=datetime.fromtimestamp(exp, tz=timezone.utc)))
                await db.commit()
        except Exception:
            pass
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("token", httponly=True, secure=True, samesite="lax")
    return resp


@router.post("/api/register")
async def register(request: Request, username: str = Form(...), email: str = Form(...),
                   password: str = Form(...), db=Depends(get_db)):
    ip = request.client.host if request.client else "unknown"
    from _rate_limit import check_rate_limit
    if not await check_rate_limit(db, f"register:{ip}", max_attempts=5, window_seconds=300):
        raise HTTPException(429, "محاولات كثيرة جداً — حاول بعد 5 دقائق")
    if len(username) < 3:
        raise HTTPException(400, "اسم المستخدم يجب أن يكون 3 أحرف على الأقل")
    if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email):
        raise HTTPException(400, "البريد الإلكتروني غير صالح")
    existing = await db.execute(select(User).where(or_(User.username == username, User.email == email)))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "اسم المستخدم أو البريد موجود مسبقاً")
    if len(password) < 6:
        raise HTTPException(400, "كلمة المرور يجب أن تكون 6 أحرف على الأقل")
    tenant = Tenant(name=username)
    db.add(tenant)
    await db.flush()
    pw_hash = hash_password(password)
    user = User(username=username, email=email, password_hash=pw_hash, tenant_id=tenant.id, role="admin")
    db.add(user)
    await db.flush()
    await log_audit(db, "register", actor_id=user.id, ip=ip, tenant_id=tenant.id)
    await db.commit()
    token = make_token(username, tenant.id)
    resp = JSONResponse({"ok": True, "username": username, "tenant_id": tenant.id})
    resp.set_cookie(key="token", value=token, httponly=True, secure=True, samesite="lax",
                    max_age=int(ACCESS_TOKEN_EXPIRE.total_seconds()))
    return resp


@router.get("/api/me")
@router.get("/api/auth/me")
async def auth_me(current_user: User = Depends(get_current_user), db=Depends(get_db)):
    plan = "free"
    if current_user.tenant_id:
        tenant = await db.get(Tenant, current_user.tenant_id)
        if tenant:
            plan = tenant.plan or "free"
    return {
        "authenticated": True, "role": current_user.role, "username": current_user.username,
        "tenant_id": current_user.tenant_id, "email": current_user.email, "plan": plan,
    }


@router.get("/api/audit/logs")
async def get_audit_logs(limit: int = 50, db=Depends(get_db),
                          current_user: User = Depends(require_role("admin"))):
    rows = await db.execute(
        select(AuditLog).where(AuditLog.tenant_id == current_user._tenant_id)
        .order_by(desc(AuditLog.created_at)).limit(limit)
    )
    return [{
        "id": r.id, "action": r.action, "actor_id": r.actor_id,
        "target_type": r.target_type, "target_id": r.target_id,
        "metadata": r.data, "ip": r.ip,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows.scalars().all()]
