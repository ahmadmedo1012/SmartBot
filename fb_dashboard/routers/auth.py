from __future__ import annotations

"""Auth & user routes: login, register, logout, /me, audit log."""
import logging
import re
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from _audit import log_audit
from _hash import hash_password, verify_password
from _responses import ok
from _subscription import subscription_snapshot
from _utils import iso_z, utcnow
from config import settings
from database import get_db
from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from models import AuditLog, BlacklistedToken, SubscriptionPlan, Tenant, User
from sqlalchemy import desc, func, or_, select
from sqlalchemy.exc import IntegrityError

log = logging.getLogger("fb-api")
router = APIRouter(tags=["auth"])

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE = timedelta(hours=24)


def make_token(username: str, tenant_id: int = 0, token_ver: int = 0) -> str:
    """Mint a session JWT. ``ver`` (v12-E2.4) pins the user's token version —
    bumping ``User.token_ver`` (password change/reset) instantly revokes every
    previously minted token for that user without waiting for expiry/blacklist.

    v15-E2 (D3-M2/C-5001): token_ver الرقمي يُطبَّع عبر ``or 0`` — قاعدة
    الإنتاج legacy أضافت العمود بلا DEFAULT فبقيت قيمه NULL، وint(None)
    هنا هو الـ500 الحي الموثق على /api/login (D14). الشفاء الجذري في
    014/reconcile (backfill NULL) — هذا الحزام يمنع الانتكاس.
    """
    jti = secrets.token_hex(16)
    now = datetime.now(UTC)
    return jwt.encode(
        {"sub": username, "tid": tenant_id, "jti": jti, "ver": int(token_ver or 0),
         "iat": now, "nbf": now,
         "exp": now + ACCESS_TOKEN_EXPIRE},
        settings.SECRET_KEY, algorithm=ALGORITHM,
    )


async def get_current_user(request: Request, db=Depends(get_db)):
    token = request.cookies.get("token")
    if not token:
        raise HTTPException(401, "غير مصرح به")
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "انتهت صلاحية الجلسة") from None
    except jwt.InvalidTokenError:
        raise HTTPException(401, "رمز غير صالح") from None
    jti = payload.get("jti", "")
    if jti:
        blacklisted = await db.execute(select(BlacklistedToken).where(BlacklistedToken.jti == jti))
        if blacklisted.scalar_one_or_none():
            raise HTTPException(401, "تم إلغاء الجلسة")
    # v10-A1 (HIGH#3): username uniqueness is PER-TENANT (uq_user_tenant_username),
    # so a global username lookup can match rows from several tenants — and
    # scalar_one_or_none() then raises MultipleResultsFound → a 500 on EVERY
    # authenticated request for BOTH users (mutual lockout). The JWT carries
    # the minting tenant (tid from make_token), so scope the lookup to it.
    # Fallback for legacy tokens without tid: bounded first-match — ambiguity
    # is resolved deterministically (oldest row = bootstrap admin first),
    # and can never raise again.
    sub = payload.get("sub", "")
    tid = payload.get("tid")
    stmt = select(User).where(User.username == sub)
    if isinstance(tid, int):
        stmt = stmt.where(User.tenant_id == tid)
    user = (await db.execute(stmt.order_by(User.id).limit(1))).scalars().first()
    if not user:
        raise HTTPException(401, "المستخدم غير موجود")
    # v12-E2.4: token version check — a token minted before the user's
    # token_ver was bumped (password change / admin reset) is rejected even
    # though its signature/expiry are still valid. getattr keeps legacy DBs
    # (pre-migration) treating the column as 0 = accept.
    if int(payload.get("ver", 0) or 0) != int(getattr(user, "token_ver", 0) or 0):
        raise HTTPException(401, "تم تحديث بيانات الدخول — يرجى تسجيل الدخول مرة أخرى")
    if user.tenant_id:
        tenant = await db.get(Tenant, user.tenant_id)
        if not tenant or not tenant.is_active:
            raise HTTPException(403, "حساب المنظمة موقوف أو محذوف — تواصل مع الدعم")
    user._tenant_id = user.tenant_id or 0
    return user


ROLE_HIERARCHY = {"admin": 3, "editor": 2, "viewer": 1}


def require_role(min_role: str):
    async def checker(current_user: User = Depends(get_current_user)):
        if ROLE_HIERARCHY.get(current_user.role, 0) < ROLE_HIERARCHY.get(min_role, 0):
            raise HTTPException(403, "صلاحيات غير كافية")
        return current_user
    return checker


def is_platform_admin(user) -> bool:
    """True for the bootstrap admin (tenant 0/None) or a delegated platform admin.

    Distinguishes GLOBAL authority (bank details, telegram approvers, platform
    users) from tenant-admin authority (own workspace). Without this split every
    self-registered tenant owner counted as a platform admin — the root cause
    of the 2026-09-05 cross-tenant findings.
    """
    if user is None:
        return False
    if user.tenant_id in (None, 0):
        return True
    return bool(getattr(user, "is_platform_admin", False))


async def require_platform_admin(current_user: User = Depends(require_role("admin"))):
    """Guard for GLOBAL endpoints — tenant admins get 403."""
    if not is_platform_admin(current_user):
        raise HTTPException(403, "هذه العملية تتطلب صلاحيات مسؤول المنصة")
    return current_user


@router.post("/api/login")
async def login(body: dict = Body(None), request: Request = None, db=Depends(get_db)):
    if not body:
        raise HTTPException(400, "جسم الطلب JSON مطلوب")
    username = body.get("username", "")
    password = body.get("password", "")
    email_lookup = username if "@" in username else ""
    ip = request.client.host if request and request.client else "unknown"
    from _rate_limit import check_rate_limit
    if not await check_rate_limit(db, f"login:{ip}", max_attempts=10, window_seconds=60):
        raise HTTPException(429, "محاولات كثيرة جداً — حاول بعد 60 ثانية")
    # Two-step lookup: username first (unique per tenant), then email.
    # The old or_() + scalar_one_or_none() raised MultipleResultsFound (500)
    # when two tenants reuse a username or an email is shared — and username
    # uniqueness is per-tenant, so ambiguity is a normal state, not an error.
    # v10-A1: order_by(id) makes the pick deterministic (bootstrap/platform
    # admin is always the oldest row) instead of engine-order luck.
    user = (await db.execute(
        select(User).where(User.username == username).order_by(User.id).limit(1)
    )).scalars().first()
    if not user and email_lookup:
        # v15-E2 (D12-H4): البحث بالبريد غير حساس لحالة الأحرف — قيد
        # uq_user_email_lower الفريد يضمن نتيجة واحدة حتمًا، والبحث القديم
        # الحساس للحالة كان يفشل في إيجاد الحساب رغم وجوده (بريد مسجل بحالة
        # مختلفة) فيبدو للمستخدم أن حسابه «غير موجود».
        user = (await db.execute(
            select(User).where(func.lower(User.email) == email_lookup.lower())
            .order_by(User.id).limit(1)
        )).scalars().first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(401, "بيانات تسجيل الدخول غير صحيحة")
    token = make_token(user.username, user.tenant_id, getattr(user, "token_ver", 0))
    await log_audit(db, "login", actor_id=user.id, ip=ip, tenant_id=user.tenant_id or 0)
    await db.commit()
    # v16-E2 (D4 honest-login): the old response returned
    # ``getattr(user, 'plan', 'free')`` — ``User.plan`` is NEVER written by any
    # code path, so login always answered "free" even for a PAID/TRIAL tenant
    # (a paid customer sees "free" right after paying). The honest source is
    # the tenant row — the SAME one /api/me reads below (auth.py:265-280).
    login_plan = "free"
    login_tenant = None
    if user.tenant_id:
        login_tenant = await db.get(Tenant, user.tenant_id)
        if login_tenant:
            login_plan = login_tenant.plan or "free"
    # v19 Step 1: the honest-login plan name alone never said whether the
    # tenant is CURRENTLY entitled (PAID/TRIAL + unexpired plan_end). The
    # snapshot block (same derivation as /api/me) lets the frontend gate the
    # «اشتراك» CTA and the backend guards share ONE source of truth.
    login_sub = await subscription_snapshot(db, user)
    secure = not getattr(settings, 'DEBUG', False)
    resp = JSONResponse(ok({
        "user": {
            "id": user.id, "username": user.username, "name": user.email or user.username,
            "role": user.role, "tenant_id": user.tenant_id,
            "subscriptionStatus": login_plan,
            **login_sub,
        }
    }))
    resp.set_cookie(key="token", value=token, httponly=True, secure=secure, samesite="lax",
                    max_age=int(ACCESS_TOKEN_EXPIRE.total_seconds()))
    return resp


def _logout_expiry_naive_utc(exp: int | float) -> datetime:
    """Epoch exp of a JWT → NAIVE-UTC datetime (the repo DateTime convention).

    v22 FIX-A (W1-D1 B-1, live on production 2026-09-10): the old inline
    ``datetime.fromtimestamp(exp, tz=UTC)`` handed asyncpg a TZ-AWARE
    datetime for ``blacklisted_tokens.expires_at`` — a
    ``TIMESTAMP WITHOUT TIME ZONE`` column — and asyncpg (Neon/PG)
    REJECTS that bind (DataError) at commit; the surrounding
    ``except Exception: pass`` swallowed it, so on production the logout
    blacklist row was NEVER written: a logged-out (or stolen) session token
    stayed valid for up to 24h. SQLite (aiosqlite) accepts aware datetimes,
    which is why local tests never caught it — same bug class as the v21
    posts-sync fix (``_parse_fb_time``: astimezone(UTC).replace(tzinfo=None));
    this helper matches that contract and is unit-tested for it.
    """
    return datetime.fromtimestamp(exp, tz=UTC).replace(tzinfo=None)


@router.post("/api/logout")
async def logout(request: Request, db=Depends(get_db)):
    token = request.cookies.get("token")
    # Decode failures (expired / invalid signature) are NOT write failures: the
    # session is already dead — nothing left to revoke, and the cookie delete
    # below completes the client-side logout. The DB write, however, MUST
    # succeed (or fail loudly) — that asymmetry is the whole point of v22 FIX-A.
    payload = None
    if token:
        try:
            payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        except jwt.PyJWTError:
            payload = None
    if payload:
        jti = payload.get("jti", "")
        exp = payload.get("exp")
        # make_token always mints jti+exp; a valid-signature token without
        # both is a pre-v12 relic — unrevokable by blacklist, and token_ver
        # (v12-E2.4) remains the revocation channel for those. Nothing to do.
        if jti and exp:
            try:
                db.add(BlacklistedToken(jti=jti, expires_at=_logout_expiry_naive_utc(exp)))
                await db.commit()
            except Exception:
                # v22 FIX-A (W1-D1 B-1): NEVER swallow this again. A logout
                # whose revocation write failed must not answer 200 — the
                # user would believe the session is closed while it lives up
                # to 24h (mirror of the honest-503 heartbeat ledger: a beat
                # that cannot do its job must not look green). Log loudly,
                # roll back, and fail the request so the client retries.
                await db.rollback()
                log.exception(
                    "logout: blacklist insert FAILED (jti=%s…) — session NOT revoked",
                    str(jti)[:8],
                )
                raise HTTPException(
                    500, "تعذر إبطال الجلسة على الخادم — يرجى المحاولة مرة أخرى"
                ) from None
    secure = not getattr(settings, 'DEBUG', False)
    resp = JSONResponse(ok())
    resp.delete_cookie("token", httponly=True, secure=secure, samesite="lax")
    return resp


@router.post("/api/register")
async def register(body: dict = Body(None), request: Request = None, db=Depends(get_db)):
    if not body:
        raise HTTPException(400, "جسم الطلب JSON مطلوب")
    username = body.get("username", "")
    email = body.get("email", "")
    password = body.get("password", "")
    name = body.get("name", username)
    ip = request.client.host if request.client else "unknown"
    from _rate_limit import check_rate_limit
    if not await check_rate_limit(db, f"register:{ip}", max_attempts=5, window_seconds=300):
        raise HTTPException(429, "محاولات كثيرة جداً — حاول بعد 5 دقائق")
    if len(username) < 3 or len(username) > 32 or not re.match(r'^[\w.-]+$', username):
        raise HTTPException(400, "اسم المستخدم يجب أن يكون 3-32 حرفاً (أحرف وأرقام و . _ - فقط)")
    if not re.match(r'^[^\s@]+@[^\s@]+\.[^\s@]+$', email) or len(email) > 200:
        raise HTTPException(400, "البريد الإلكتروني غير صالح")
    existing = await db.execute(
        select(User).where(or_(User.username == username, User.email == email)).limit(1)
    )
    if existing.scalars().first():
        raise HTTPException(400, "اسم المستخدم أو البريد موجود مسبقاً")
    if len(password) < 8:
        raise HTTPException(400, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
    tenant = Tenant(name=username)
    # Trial period (plan §2.5): register with a trial-enabled plan → TRIAL status
    # until plan_end; expiry flips it to EXPIRED_TRIAL in BotEngine (§2.6).
    trial_plan_id = body.get("plan_id", 0)
    if trial_plan_id:
        trial_plan = await db.get(SubscriptionPlan, int(trial_plan_id))
        if trial_plan and trial_plan.is_active and (trial_plan.trial_days or 0) > 0:
            tenant.plan_id = trial_plan.id
            tenant.plan = trial_plan.name.lower()
            tenant.subscription_status = "TRIAL"
            tenant.plan_start = utcnow()
            tenant.plan_end = utcnow() + timedelta(days=trial_plan.trial_days)
    # v15-E2 (D12-H4): الفحص أعلاه (check-then-insert) يعبره سباق تسجيلين
    # متزامنين بنفس البريد (الـhashing يوسع النافذة ~200ms) فيولد حسابين
    # — الثاني «زومبي»: الدخول بالبريد يلتقط الأقدم حتمًا فكلمة مروره
    # تُرفض للأبد. قيد uq_user_email_lower (ترحيلة 014) هو خط الدفاع
    # الأخير، وهنا نلتقطه: 409 عربية بدل 500 خام، مع rollback كامل قبلها
    # (المستأجر المُفلَوش لا يبقى يتيمًا).
    try:
        db.add(tenant)
        await db.flush()
        pw_hash = hash_password(password)
        user = User(username=username, email=email, name=name, password_hash=pw_hash, tenant_id=tenant.id, role="admin")
        db.add(user)
        await db.flush()
        await log_audit(db, "register", actor_id=user.id, ip=ip, tenant_id=tenant.id)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        # تفريق الرسالة حسب القيد المُخالَف — uq_user_email_lower (فهرس
        # تعبيري) يظهر بالاسم في رسائل SQLite/PG، وuq_user_tenant_username
        # بأسماء أعمدته.
        conflict = str(getattr(exc, "orig", exc) or exc).lower()
        if "email" in conflict:
            raise HTTPException(409, "البريد الإلكتروني مسجل مسبقاً") from None
        raise HTTPException(409, "اسم المستخدم أو البريد مسجل مسبقاً") from None
    token = make_token(username, tenant.id, getattr(user, "token_ver", 0))
    secure = not getattr(settings, 'DEBUG', False)
    resp = JSONResponse(ok({
        "user": {"id": user.id, "username": username, "name": name, "tenant_id": tenant.id, "role": "admin"}
    }))
    resp.set_cookie(key="token", value=token, httponly=True, secure=secure, samesite="lax",
                    max_age=int(ACCESS_TOKEN_EXPIRE.total_seconds()))
    return resp


@router.get("/api/me")
@router.get("/api/auth/me")
async def auth_me(current_user: User = Depends(get_current_user), db=Depends(get_db)):
    plan = "free"
    onboarding_completed = True
    if current_user.tenant_id:
        tenant = await db.get(Tenant, current_user.tenant_id)
        if tenant:
            plan = tenant.plan or "free"
            onboarding_completed = bool(tenant.onboarding_completed)
    # v12-E2.10: unified ok() envelope — the `authenticated` sibling is dropped
    # (D4 map: zero runtime consumers of that key; AuthGuard relies on HTTP status).
    # v19 Step 1: subscriptionState/hasActiveSubscription/hasPendingSubscription/
    # subscriptionPlanEnd ride along so EVERY page load (AuthGuard refetches
    # /api/me per pathname change) sees the real server-side truth with no
    # stale cache — the plan's «SSE may silently die in background tabs» fix
    # makes correctness depend on any later page load, not a live channel.
    sub = await subscription_snapshot(db, current_user)
    return ok({
        "user": {
            "id": current_user.id, "username": current_user.username,
            "name": current_user.email or current_user.username,
            "role": current_user.role, "tenant_id": current_user.tenant_id,
            "email": current_user.email, "phone": current_user.phone or "",
            # v22-D6 (W1-D6 #7-م1): non-sensitive boolean so the frontend can
            # keep the /admin shell out of tenant admins' way (UX only — the
            # real security layer stays the API 403s behind
            # require_platform_admin; a spoofed client value grants nothing).
            # Derived with the SAME helper those guards use (tenant 0/None or
            # the delegated flag), so the guard can never disagree with the
            # enforcement it mirrors.
            "is_platform_admin": is_platform_admin(current_user),
            "subscriptionStatus": plan,
            **sub,
            "permissions": [],
            "roleLabel": current_user.role,
            "onboardingCompleted": onboarding_completed,
        }
    })


@router.post("/api/onboarding/complete")
async def complete_onboarding(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Mark the current tenant's onboarding wizard as complete."""
    if not current_user.tenant_id:
        raise HTTPException(400, "لا توجد مساحة عمل مرتبطة بهذا الحساب")
    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise HTTPException(404, "المساحة غير موجودة")
    tenant.onboarding_completed = True
    await db.commit()
    return ok({"onboardingCompleted": True})


@router.post("/api/onboarding/skip")
async def skip_onboarding(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """Persistently dismiss the onboarding wizard (user pressed تخي).

    Without this, skip was local-state only and the wizard re-appeared on
    every page navigation — the dismissal now sticks like completion does.
    The wizard remains re-runnable from the dashboard help entry points.
    """
    if not current_user.tenant_id:
        raise HTTPException(400, "لا توجد مساحة عمل مرتبطة بهذا الحساب")
    tenant = await db.get(Tenant, current_user.tenant_id)
    if not tenant:
        raise HTTPException(404, "المساحة غير موجودة")
    tenant.onboarding_completed = True
    await db.commit()
    await log_audit(db, "onboarding_skip", actor_id=current_user.id, tenant_id=tenant.id)
    return ok({"onboardingCompleted": True, "skipped": True})


@router.get("/api/audit/logs")
async def get_audit_logs(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), db=Depends(get_db),
                          current_user: User = Depends(require_role("admin"))):
    # v9-A9: bounded pagination (was unbounded — negative page/ huge page_size)
    # v12-E2.15: page_size → per_page (unify the 4th pagination convention with
    # replies/crm/inbox/fb — types.ts Paginated already speaks per_page only).
    offset = (page - 1) * per_page
    stmt = select(AuditLog).where(AuditLog.tenant_id == current_user._tenant_id)
    total = await db.scalar(select(func.count(AuditLog.id)).where(AuditLog.tenant_id == current_user._tenant_id)) or 0
    rows = await db.execute(stmt.order_by(desc(AuditLog.created_at)).offset(offset).limit(per_page))
    return ok({
        "items": [{
            "id": r.id, "action": r.action, "actor_id": r.actor_id,
            "target_type": r.target_type, "target_id": r.target_id,
            "metadata": r.data, "ip": r.ip,
            "created_at": iso_z(r.created_at),
        } for r in rows.scalars().all()],
        "total": total, "page": page, "per_page": per_page,
    })


@router.post("/api/admin/reset-password")
async def admin_reset_password(body: dict = Body(None), request: Request = None, db=Depends(get_db),
                                current_user: User = Depends(require_role("admin"))):
    """Reset a user's password. Tenant admins may only reset users in their own
    tenant; the platform admin (tenant 0 or delegated) may reset any user.

    SECURITY (2026-09-05): the old `db.get(User, user_id)` had no tenant scoping —
    any self-registered tenant owner could reset ANY user's password, including
    the bootstrap platform admin (full account takeover chain).
    """
    if not body or "user_id" not in body or "new_password" not in body:
        raise HTTPException(400, "user_id و new_password مطلوبان")
    user_id = body["user_id"]
    new_password = body["new_password"]
    if not isinstance(new_password, str) or len(new_password) < 8:
        raise HTTPException(400, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
    stmt = select(User).where(User.id == int(user_id)).limit(1)
    if not is_platform_admin(current_user):
        stmt = stmt.where(User.tenant_id == current_user._tenant_id)
    user = (await db.execute(stmt)).scalars().first()
    if not user:
        raise HTTPException(404, "المستخدم غير موجود في مساحة عملك")
    user.password_hash = hash_password(new_password)
    # v12-E2.4: bump the token version — every session JWT minted for this
    # user (including one stolen before the reset) dies on its next request.
    user.token_ver = int(getattr(user, "token_ver", 0) or 0) + 1
    await db.commit()
    ip = request.client.host if request and request.client else "unknown"
    await log_audit(db, "reset_password", actor_id=current_user.id, target_type="user",
                    target_id=user_id, ip=ip, tenant_id=current_user._tenant_id)
    # v22 FIX-A (W1-D1 B-2): log_audit is add+flush — with no commit after it
    # the audit row was flushed into a session that closed without
    # committing → silently lost (live evidence: successful prod resets left
    # zero reset_password rows). Mirror the platform_update_user pattern
    # (admin_routes.py): commit → log_audit → commit.
    await db.commit()
    return ok({"updated": True})


@router.post("/api/auth/change-password")
async def change_password(body: dict = Body(None), request: Request = None, db=Depends(get_db),
                          current_user: User = Depends(get_current_user)):
    """Self-service password change — verifies the current password first.

    Previously the platform had NO way for a logged-in user to rotate their own
    password (only admin reset), which pushed operators toward shared defaults.
    """
    if not body:
        raise HTTPException(400, "جسم الطلب JSON مطلوب")
    current_password = str(body.get("current_password") or "")
    new_password = str(body.get("new_password") or "")
    # v15-E2 (D6-M4): سقف 5 محاولات/ساعة لكل مستخدم — verify_password
    # (argon2id) في كل محاولة يحجب الحلقة، وبلا سقف يستطيع مهاجم دوّس
    # أداء المنصة كلها بنفسه. المفتاح per-user لا per-IP (المهاجم هنا
    # صاحب الجلسة نفسها). يُحسب قبل التحقق — المحاولات الفاشلة هي
    # المقصودة (brute-force لكلمة المرور الحالية).
    from _rate_limit import check_rate_limit
    if not await check_rate_limit(
        db, f"change-password:{current_user.id}", max_attempts=5, window_seconds=3600,
    ):
        raise HTTPException(429, "محاولات كثيرة لتغيير كلمة المرور — حاول بعد ساعة")
    if not current_password:
        raise HTTPException(400, "كلمة المرور الحالية مطلوبة")
    if len(new_password) < 8:
        raise HTTPException(400, "كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل")
    if not verify_password(current_password, current_user.password_hash):
        raise HTTPException(401, "كلمة المرور الحالية غير صحيحة")
    if verify_password(new_password, current_user.password_hash):
        raise HTTPException(400, "كلمة المرور الجديدة مطابقة للحالية")
    current_user.password_hash = hash_password(new_password)
    # v12-E2.4: bump the token version — old sessions (incl. this cookie on
    # other devices) are revoked; the login flow re-mints a fresh token.
    current_user.token_ver = int(getattr(current_user, "token_ver", 0) or 0) + 1
    await db.commit()
    ip = request.client.host if request and request.client else "unknown"
    await log_audit(db, "change_password", actor_id=current_user.id, ip=ip,
                    tenant_id=current_user._tenant_id)
    # v22 FIX-A (W1-D1 B-2): same fix as admin_reset_password — the flushed
    # audit row needs its own commit or it is lost at session close.
    await db.commit()
    return ok({"changed": True})


@router.get("/api/users")
async def list_users(page: int = Query(1, ge=1), per_page: int = Query(50, ge=1, le=200), db=Depends(get_db),
                     current_user: User = Depends(require_role("admin"))):
    # v9-A9: bounded pagination (was unbounded — negative page/ huge page_size)
    # v12-E2.15: page_size → per_page (see /api/audit/logs).
    offset = (page - 1) * per_page
    total = await db.scalar(select(func.count(User.id)).where(User.tenant_id == current_user._tenant_id)) or 0
    rows = await db.execute(
        select(User).where(User.tenant_id == current_user._tenant_id)
        .order_by(desc(User.created_at)).offset(offset).limit(per_page)
    )
    return ok({
        "items": [{
            "id": u.id, "username": u.username, "name": u.email or u.username,
            "role": u.role, "email": u.email, "phone": u.phone or "",
            "created_at": iso_z(u.created_at),
        } for u in rows.scalars().all()],
        "total": total, "page": page, "per_page": per_page,
    })


@router.get("/api/admin/notification-preferences")
async def get_notification_prefs(current_user: User = Depends(get_current_user)):
    return ok({
        "telegramNotifyOrders": True,
        "telegramNotifyPayments": True,
        "telegramNotifySettings": True,
    })


@router.put("/api/admin/notification-preferences")
async def update_notification_prefs(body: dict = Body(None), current_user: User = Depends(get_current_user)):
    return ok({
        "telegramNotifyOrders": body.get("telegramNotifyOrders", True) if body else True,
        "telegramNotifyPayments": body.get("telegramNotifyPayments", True) if body else True,
        "telegramNotifySettings": body.get("telegramNotifySettings", True) if body else True,
    })
