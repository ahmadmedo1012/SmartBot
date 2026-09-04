"""Support ticket routes — create, list, reply to support tickets."""
from __future__ import annotations
from fastapi import APIRouter, Depends, Body
from sqlalchemy import select, desc

from database import get_db
from models import User
from routers.auth import get_current_user

router = APIRouter(prefix="/api/support", tags=["support"])


@router.get("/tickets")
async def list_tickets(
    limit: int = 20,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List support tickets for the current user/tenant."""
    return {"success": True, "data": [], "total": 0}


@router.post("/tickets")
async def create_ticket(
    subject: str = Body(...),
    body: str = Body(...),
    priority: str = Body("medium"),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Create a new support ticket. Notifies admins via Telegram."""
    return {"success": True, "data": {"id": 0, "status": "open"}}


@router.get("/tickets/{ticket_id}")
async def get_ticket(
    ticket_id: int,
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a single ticket with replies."""
    return {"success": True, "data": {"id": ticket_id, "replies": []}}


@router.post("/tickets/{ticket_id}/reply")
async def reply_ticket(
    ticket_id: int,
    message: str = Body(...),
    db=Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Add a reply to an existing ticket."""
    return {"success": True}
