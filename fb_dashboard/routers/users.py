"""User CRUD routes: list, create, update, delete."""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
import logging

from _responses import ok
from database import get_db
from fastapi import APIRouter, Depends, Form, HTTPException
from models import NotificationPreference, SubscriptionPlan, User
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from routers.auth import is_platform_admin, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["users"])

_VALID_ROLES = {"admin", "editor", "viewer"}

# v17-E-B2 (D6 — حد الفريق): رسالة 403 العربية التي يعرضها toast صفحة
# الفريق (عقد الواجهة رقم 3 في خطة v17: E-B2 → E-F8). N = max_team.
_TEAM_LIMIT_MSG = "حد أعضاء الفريق لخطتك هو {n} — رقّ خطتك لإضافة المزيد"

# v17-E-B2 (خطة v17 §E-B2-4 — حارس الدور): منح/ترقية دور admin حكر
# لمدير المنصة (is_platform_admin). أدمن المستأجر العادي — رغم
# require_role("admin") — لم يعد قادرًا على سكّ مديرين داخل مساحة عملته.
_ADMIN_ROLE_MSG = "تعيين دور «مدير» متاح لمدير المنصة فقط — يمكنك تعيين «محرر» أو «مشاهد»"

# NOTE (2026-09-05): GET /api/users was removed — it was dead code shadowed by
# routers/auth.py's tenant-scoped paginated implementation (first-wins).


@router.post("/api/users")
async def create_user(username: str = Form(...), password: str = Form(...), role: str = Form("viewer"),
                      db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    # Validation (2026-09-05): role is whitelisted; password needs a minimum.
    if role not in _VALID_ROLES:
        raise HTTPException(400, "الدور يجب أن يكون admin أو editor أو viewer")
    if len(password) < 8:
        raise HTTPException(400, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
    if len(username) < 3 or len(username) > 32:
        raise HTTPException(400, "اسم المستخدم يجب أن يكون 3-32 حرفاً")
    existing = await db.execute(select(User).where(User.username == username, User.tenant_id == current_user._tenant_id))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "اسم المستخدم موجود مسبقاً في مساحة عملك")

    # v17-E-B2 (§E-B2-4): دور admin بيد مدير المنصة فقط — أدمن المستأجر
    # يمنح editor/viewer (الحارس لم يكن موجودًا: أي أدمن مستأجر كان يستطيع
    # سكّ أدمن آخرين داخل مساحته).
    if role == "admin" and not is_platform_admin(current_user):
        raise HTTPException(403, _ADMIN_ROLE_MSG)

    # v17-E-B2 (D6 — حد الفريق): قارن عدد مقاعد المستأجر الحاليين بإجمالي
    # مقاعد خطته (max_team — بما فيها المالك، وهو الرقم الذي تعِد به
    # صفحة الأسعار «فريق حتى N»). القراءة عبر get_plan_limits (نقطة قراءة
    # الخطة الوحيدة D2-H1: plan_id أو خطة Free للمستأجر بلا خطة، مع انحدار
    # الولايات المنتهية لFree) ثم fetch لصف الخطة نفسه لقراءة max_team.
    # غياب صفوف الخطط كليًا = fail-open بلا حد (عقيدة money-core).
    from bot_engine.pipeline import get_plan_limits
    limits = await get_plan_limits(db, current_user._tenant_id)
    if limits is not None:
        plan = await db.get(SubscriptionPlan, limits["plan_id"])
        max_team = getattr(plan, "max_team", None) if plan is not None else None
        if max_team is not None:
            seats = int(await db.scalar(
                select(func.count()).select_from(User).where(
                    User.tenant_id == current_user._tenant_id)) or 0)
            if seats >= int(max_team):
                raise HTTPException(403, _TEAM_LIMIT_MSG.format(n=int(max_team)))

    from _hash import hash_password
    pw_hash = hash_password(password)
    user = User(username=username, password_hash=pw_hash, role=role, tenant_id=current_user._tenant_id)
    db.add(user)
    try:
        await db.commit()
    except IntegrityError as exc:
        # v24-C4 (M1): two concurrent create_user calls with the same username
        # race past the pre-check above; the loser hit uq_user_tenant_username
        # at commit → raw 500 (register.py:295-312 already maps this to 409).
        # Same contract here: rollback first, then the SAME Arabic message the
        # pre-check answers so the client sees one behavior, not two.
        await db.rollback()
        log.warning("create_user race conflict (tenant %s): %s", current_user._tenant_id, exc)
        raise HTTPException(409, "اسم المستخدم موجود مسبقاً في مساحة عملك") from exc
    await db.refresh(user)
    return ok({"id": user.id})


@router.put("/api/users/{user_id}")
async def update_user(user_id: int, role: str = Form(...), password: str = Form(""),
                      db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    user = (await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "المستخدم غير موجود")
    if role not in _VALID_ROLES:
        raise HTTPException(400, "الدور يجب أن يكون admin أو editor أو viewer")
    # v17-E-B2 (§E-B2-4): PUT هو نفس ناقل الترقية — بلا هذا الحارس كان
    # حارس POST يُتجاوز بترقية عضو قائم. الاستثناء الوحيد: إبقاء مدير قائم
    # على دوره (لا منح صلاحية جديدة — no-op).
    if (role == "admin" and user.role != "admin"
            and not is_platform_admin(current_user)):
        raise HTTPException(403, _ADMIN_ROLE_MSG)
    if password and len(password) < 8:
        raise HTTPException(400, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
    user.role = role
    if password:
        from _hash import hash_password
        user.password_hash = hash_password(password)
        # v14-E1 #5 (D5-H1): bump token_ver — exact parity with
        # /api/admin/reset-password (auth.py) and /api/auth/change-password.
        # Without the bump, every JWT minted before this admin-set password
        # kept working for up to 24h (privilege-session survival).
        user.token_ver = int(getattr(user, "token_ver", 0) or 0) + 1
    await db.commit()
    return ok({"ok": True})


@router.delete("/api/users/{user_id}")
async def delete_user(user_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    user = (await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "المستخدم غير موجود")
    if user.id == current_user.id:
        raise HTTPException(400, "لا يمكنك حذف حسابك")
    # v16-E5 (D6-H2): اكتساف تفضيلات إشعارات المستخدم قبل حذفه —
    # uq_notif_pref_user (فريد على user_id) يحجب إدراجًا لاحقًا لنفس
    # المعرف (SQLite يعيد استخدام rowid المحرّر)، وعلى PostgreSQL تبقى
    # الصفوف يتيمة للأبد. telegram_approvers يُفرَّغ تلقائيًا عبر FK
    # ON DELETE SET NULL (models.py + 015) — لا حاجة لمسحه هنا.
    await db.execute(
        delete(NotificationPreference).where(NotificationPreference.user_id == user_id)
    )
    await db.delete(user)
    await db.commit()
    return ok({"ok": True})
