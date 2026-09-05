# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from fastapi import APIRouter, Depends, HTTPException, Form, Query
from sqlalchemy import select, desc, func, or_
from datetime import datetime
from database import get_db
from _utils import iso_z
from models import Offer, BrandConfig, Customer, BotAlert, User
from routers.auth import get_current_user, require_role
from _responses import ok

router = APIRouter(prefix="", tags=["crm"])


@router.get("/api/crm/customers")
async def crm_list(
    stage: str = Query(""), search: str = Query(""),
    page: int = Query(1), per_page: int = Query(25),
    db=Depends(get_db), current_user: User = Depends(get_current_user),
):
    # ponytail: Customer at module level
    _tid = current_user._tenant_id
    stmt = select(Customer).where(Customer.tenant_id == _tid)
    if stage:
        stmt = stmt.where(Customer.stage == stage)
    if search:
        stmt = stmt.where(
            or_(Customer.name.ilike(f"%{search}%"), Customer.phone.ilike(f"%{search}%"))
        )
    # BUGFIX (2026-09-05): the outer count() referenced Customer.id, which
    # pulled `customers` into the outer FROM next to the subquery → cartesian
    # product (SAWarning) AND inflated totals (total = N×N). count(*) over the
    # subquery alone is correct; order_by(None) is hygiene before subquery().
    total = await db.scalar(
        select(func.count()).select_from(stmt.order_by(None).subquery())
    ) or 0
    rows = await db.execute(
        stmt.order_by(desc(Customer.last_contacted_at)).offset((page-1)*per_page).limit(per_page)
    )
    return ok(
        {
        "total": total or 0, "page": page, "per_page": per_page,
        "items": [{
            "id": c.id, "name": c.name, "phone": c.phone,
            "source": c.source, "stage": c.stage,
            "total_interactions": c.total_interactions,
            "interested_in": c.interested_in,
            "last_intent": c.last_intent,
            "notes": c.notes,
            "first_seen_at": iso_z(c.first_seen_at),
            "last_contacted_at": iso_z(c.last_contacted_at),
        } for c in rows.scalars().all()],
    }
    )


@router.post("/api/crm/customers")
async def crm_create(
    fb_user_id: str = Form(...), name: str = Form(""),
    phone: str = Form(""), stage: str = Form("lead"),
    interested_in: str = Form(""),
    db=Depends(get_db), current_user: User = Depends(require_role("editor")),
):
    # ponytail: Customer at module level
    existing = await db.execute(select(Customer).where(Customer.fb_user_id == fb_user_id))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "العميل موجود بالفعل")
    c = Customer(fb_user_id=fb_user_id, name=name, phone=phone,
                 stage=stage, interested_in=interested_in, tenant_id=current_user._tenant_id)
    db.add(c)
    await db.commit()
    return ok({"id": c.id})


@router.put("/api/crm/customers/{customer_id}")
async def crm_update(
    customer_id: int, name: str = Form(""), phone: str = Form(""),
    stage: str = Form(""), notes: str = Form(""), interested_in: str = Form(""),
    db=Depends(get_db), current_user: User = Depends(require_role("editor")),
):
    # ponytail: Customer at module level
    c = (await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not c:
        raise HTTPException(404, "العميل غير موجود")
    if name: c.name = name
    if phone: c.phone = phone
    if stage: c.stage = stage
    if notes: c.notes = notes
    if interested_in: c.interested_in = interested_in
    await db.commit()
    return ok({"ok": True})
