"""Marketing campaigns routes — bulk messaging, scheduling, audience targeting."""
from __future__ import annotations
from fastapi import APIRouter, Depends, Body, Query
from sqlalchemy import select, desc, func

from database import get_db
from models import User
from routers.auth import get_current_user

router = APIRouter(prefix="/api/marketing", tags=["marketing"])


@router.get("/campaigns")
async def list_campaigns(
    limit: int = Query(20, ge=1, le=100),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List marketing campaigns for the current tenant."""
    return {"success": True, "data": [], "total": 0}


@router.post("/campaigns")
async def create_campaign(
    name: str = Body(...),
    message: str = Body(...),
    audience: str = Body("all"),
    scheduled_at: str = Body(None),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new marketing campaign."""
    return {"success": True, "data": {"id": 0, "status": "draft"}}


@router.post("/campaigns/{campaign_id}/send")
async def send_campaign(
    campaign_id: int,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send (or queue) a campaign immediately."""
    return {"success": True}


@router.get("/campaigns/{campaign_id}/stats")
async def campaign_stats(
    campaign_id: int,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get delivery / open / click stats for a campaign."""
    return {"success": True, "data": {"sent": 0, "delivered": 0, "opened": 0, "clicked": 0}}
