"""Team management routes."""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from database import get_db
from models import User
from routers.auth import get_current_user, require_role, require_platform_admin
from _services import team_engine
from _responses import ok

router = APIRouter(tags=["team"])


@router.get("/api/team/members")
async def team_members(db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    return ok(await team_engine.get_team_members(db, tenant_id=current_user._tenant_id))


@router.get("/api/team/activity")
async def team_activity(days: int = Query(7), db=Depends(get_db), current_user: User = Depends(get_current_user)):
    return ok(await team_engine.get_team_activity(days, db, tenant_id=current_user._tenant_id))


@router.get("/api/team/performance")
async def team_performance(db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    return ok(await team_engine.get_team_performance(db, tenant_id=current_user._tenant_id))


@router.get("/api/team/role-summary")
async def team_role_summary(db=Depends(get_db), _=Depends(require_platform_admin)):
    return ok(await team_engine.get_user_role_summary(db))
