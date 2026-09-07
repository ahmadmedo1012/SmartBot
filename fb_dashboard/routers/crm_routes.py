# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()

import logging

from _responses import ok
from _utils import iso_z
from database import get_db
from fastapi import APIRouter, Depends, Form, HTTPException, Query
from models import Customer, User
from sqlalchemy import desc, func, or_, select
from sqlalchemy.exc import IntegrityError

from routers.auth import get_current_user, require_role

router = APIRouter(prefix="", tags=["crm"])
log = logging.getLogger("fb-api")


# v15-E4 (D13-F1 عائلة 409): نص الرسالة الموحد لإنشاء عميل مكرر — الفحص
# المسبق يرد 409 مباشرة، وسباق الإنشاء المتزامن (uq_customer_tenant_fbuser)
# يُلتقط عند الالتزام ويرد نفس الـ 409 — لا 500 خام أبداً.
_CRM_DUPLICATE_DETAIL = "العميل موجود مسبقاً بهذا المعرّف في مساحتك — راجع قائمة العملاء أو استخدم معرّفاً آخر"


@router.get("/api/crm/customers")
async def crm_list(
    stage: str = Query(""), search: str = Query(""),
    # v14-E3 (D10 §6): كانت بلا ge/le → per_page=100000 يسحب الجدول كاملاً
    # وpage=0 يعطي offset سالباً. سقف le=200 + ge=1 (نمط inbox.py).
    page: int = Query(1, ge=1), per_page: int = Query(25, ge=1, le=200),
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
    # v9-A9: duplicate check is tenant-scoped — a global fb_user_id check let
    # tenant A's customer wrongly block tenant B from creating the same one.
    # v15-E4 (D13-F1): 409 (كان 400) — التكرار تعارض حالة، والبطارية الصارمة
    # (SIM_STRICT_409) تتوقع عائلة التعارض كلها 409 لا 500/400 مبعثرة.
    existing = await db.execute(
        select(Customer).where(Customer.fb_user_id == fb_user_id,
                               Customer.tenant_id == current_user._tenant_id))
    if existing.scalar_one_or_none():
        raise HTTPException(409, _CRM_DUPLICATE_DETAIL)
    c = Customer(fb_user_id=fb_user_id, name=name, phone=phone,
                 stage=stage, interested_in=interested_in, tenant_id=current_user._tenant_id)
    db.add(c)
    try:
        await db.commit()
    except IntegrityError as exc:
        # v15-E4 (D12 sibling): طلبا إنشاء متزامنان لنفس العميل — الخاسر
        # يلتقط قيد التفرد عند الالتزام ويرد 409 عربية نظيفة (كان 500 خام).
        await db.rollback()
        log.warning("crm customer create conflict: %s", exc)
        raise HTTPException(409, _CRM_DUPLICATE_DETAIL) from exc
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
    if name:
        c.name = name
    if phone:
        c.phone = phone
    if stage:
        c.stage = stage
    if notes:
        c.notes = notes
    if interested_in:
        c.interested_in = interested_in
    await db.commit()
    return ok({"ok": True})
