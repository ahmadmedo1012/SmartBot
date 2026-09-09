"""User CRUD routes: list, create, update, delete."""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
import logging

from _responses import ok
from database import get_db
from fastapi import APIRouter, Depends, Form, HTTPException
from models import NotificationPreference, User
from sqlalchemy import delete, select

from routers.auth import require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["users"])

_VALID_ROLES = {"admin", "editor", "viewer"}

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
    from _hash import hash_password
    pw_hash = hash_password(password)
    user = User(username=username, password_hash=pw_hash, role=role, tenant_id=current_user._tenant_id)
    db.add(user)
    await db.commit()
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
