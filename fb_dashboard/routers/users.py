"""User CRUD routes: list, create, update, delete."""
import logging

from fastapi import APIRouter, Depends, Form, HTTPException
from sqlalchemy import select

from database import get_db
from models import User
from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["users"])


@router.get("/api/users")
async def list_users(db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    rows = await db.execute(
        select(User).where(User.tenant_id == current_user._tenant_id).order_by(User.id)
    )
    return [{"id": u.id, "username": u.username, "role": u.role, "created_at": u.created_at.isoformat() if u.created_at else None}
            for u in rows.scalars().all()]


@router.post("/api/users")
async def create_user(username: str = Form(...), password: str = Form(...), role: str = Form("viewer"),
                      db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    existing = await db.execute(select(User).where(User.username == username, User.tenant_id == current_user._tenant_id))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Username exists")
    from _hash import hash_password
    pw_hash = hash_password(password)
    user = User(username=username, password_hash=pw_hash, role=role, tenant_id=current_user._tenant_id)
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return {"id": user.id}


@router.put("/api/users/{user_id}")
async def update_user(user_id: int, role: str = Form(...), password: str = Form(""),
                      db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    user = (await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    user.role = role
    if password:
        from _hash import hash_password
        user.password_hash = hash_password(password)
    await db.commit()
    return {"ok": True}


@router.delete("/api/users/{user_id}")
async def delete_user(user_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    user = (await db.execute(
        select(User).where(User.id == user_id, User.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == current_user.id:
        raise HTTPException(400, "Cannot delete yourself")
    await db.delete(user)
    await db.commit()
    return {"ok": True}
