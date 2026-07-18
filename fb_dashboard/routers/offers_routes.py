from fastapi import APIRouter, Depends, HTTPException, Form, Query
from sqlalchemy import select, desc, or_
from datetime import datetime
from database import get_db
from models import Offer, BrandConfig, Customer, BotAlert, User
from routers.auth import get_current_user, require_role

router = APIRouter(prefix="", tags=["offers"])


@router.get("/api/offers")
async def list_offers(active_only: bool = Query(False), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    _tid = current_user._tenant_id
    stmt = select(Offer).where(Offer.tenant_id == _tid)
    if active_only:
        stmt = stmt.where(Offer.is_active == True)
    rows = await db.execute(stmt.order_by(Offer.created_at.desc()))
    return [{
        "id": o.id, "title": o.title, "code": o.code, "description": o.description,
        "discount_type": o.discount_type, "discount_value": o.discount_value,
        "max_uses": o.max_uses, "used_count": o.used_count,
        "auto_reply_rule_id": o.auto_reply_rule_id, "is_active": o.is_active,
        "expires_at": o.expires_at.isoformat() if o.expires_at else None,
    } for o in rows.scalars().all()]


@router.post("/api/offers")
async def create_offer(
    title: str = Form(...), code: str = Form(""), description: str = Form(""),
    discount_type: str = Form("percentage"), discount_value: int = Form(0),
    expires_at: str = Form(""), db=Depends(get_db), current_user: User = Depends(require_role("admin")),
):
    exp = datetime.fromisoformat(expires_at) if expires_at else None
    offer = Offer(title=title, code=code, description=description,
                  discount_type=discount_type, discount_value=discount_value, expires_at=exp,
                  tenant_id=current_user._tenant_id)
    db.add(offer)
    await db.commit()
    await db.refresh(offer)
    return {"id": offer.id}


@router.post("/api/offers/{offer_id}/toggle")
async def toggle_offer(offer_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    offer = (await db.execute(
        select(Offer).where(Offer.id == offer_id, Offer.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not offer: raise HTTPException(404, "العرض غير موجود")
    offer.is_active = not offer.is_active
    await db.commit()
    return {"ok": True, "is_active": offer.is_active}


@router.delete("/api/offers/{offer_id}")
async def delete_offer(offer_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    offer = (await db.execute(
        select(Offer).where(Offer.id == offer_id, Offer.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not offer: raise HTTPException(404, "العرض غير موجود")
    await db.delete(offer)
    await db.commit()
    return {"ok": True}
