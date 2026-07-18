"""Commerce / Shopify routes."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Form, Query, Request, Response
from sqlalchemy import select
from database import get_db
from _utils import utcnow
from models import BotState, ReportSchedule, User
from routers.auth import get_current_user, require_role

from _services import commerce_engine

log = logging.getLogger("fb-api")
router = APIRouter(prefix="", tags=["commerce"])


@router.get("/api/commerce/status")
async def commerce_status(_=Depends(get_current_user)):
    return commerce_engine.get_status()


@router.post("/api/commerce/shopify/configure")
async def shopify_configure(request: Request, db=Depends(get_db), _=Depends(require_role("admin"))):
    from commerce_engine import ShopifyIntegration
    body = await request.json()
    for key, value in body.items():
        existing = await db.execute(select(BotState).where(BotState.key == f"shopify_{key}"))
        row = existing.scalar_one_or_none()
        val = str(value)
        if key == "access_token":
            from _crypto import encrypt_token
            val = encrypt_token(val) or val
        if row:
            row.value = val
        else:
            db.add(BotState(key=f"shopify_{key}", value=val))
    await db.commit()
    commerce_engine.shopify = ShopifyIntegration(
        store_domain=body.get("store_domain", ""),
        access_token=body.get("access_token", ""),
        webhook_secret=body.get("webhook_secret", ""),
    )
    return {"ok": True, "store": body.get("store_domain", "")}


@router.post("/api/commerce/shopify/webhook/{topic:path}")
async def shopify_webhook(topic: str, request: Request):
    if not getattr(commerce_engine, 'shopify', None):
        raise HTTPException(503, "Shopify not configured")
    if not await commerce_engine.shopify.verify_webhook(request):
        raise HTTPException(401, "Invalid HMAC signature")
    body = await request.json()
    ctx = await commerce_engine.shopify.handle_webhook(topic, body)
    return ctx


@router.get("/api/commerce/shopify/products")
async def shopify_products(limit: int = Query(10), _=Depends(get_current_user)):
    return {"products": await commerce_engine.shopify.get_products(limit)}


@router.get("/api/commerce/shopify/orders")
async def shopify_orders(limit: int = Query(10), status: str = Query("any"), _=Depends(get_current_user)):
    return {"orders": await commerce_engine.shopify.get_orders(limit, status)}
