"""PDF Reports routes."""
import logging

from fastapi import APIRouter, Depends, HTTPException, Form, Query, Request, Response
from sqlalchemy import select
from database import get_db
from _utils import utcnow
from models import BotState, ReportSchedule, User
from routers.auth import get_current_user, require_role

from _services import pdf_engine, report_engine, _track_event

log = logging.getLogger("fb-api")
router = APIRouter(prefix="", tags=["reports"])


@router.get("/api/reports/status")
async def pdf_reports_status(_=Depends(get_current_user)):
    """Check PDF generation engine availability."""
    return {"available": pdf_engine.is_available(), "engine": pdf_engine.engine_name}


@router.post("/api/reports/generate")
async def generate_pdf_report(request: Request, _=Depends(require_role("editor"))):
    """Generate a PDF report.  Returns PDF bytes directly."""
    body = await request.json()
    rtype = body.get("type", "monthly")
    days = body.get("days", 30)
    b = body.get("branding", {})
    from pdf_reports_engine import BrandingConfig
    branding = BrandingConfig(
        logo_url=b.get("logo_url", ""),
        company_name=b.get("company_name", "SmartBot"),
        primary_color=b.get("primary_color", "#dc2626"),
    )
    if rtype == "monthly":
        pdf_bytes = await pdf_engine.monthly_report(days=days, branding=branding)
    elif rtype == "subscriber":
        pdf_bytes = await pdf_engine.subscriber_report(days=days, branding=branding)
    elif rtype == "campaign":
        campaign_type = body.get("campaign_type", "broadcast")
        campaign_id = body.get("campaign_id", "0")
        pdf_bytes = await pdf_engine.campaign_report(campaign_type, campaign_id, branding=branding)
    else:
        raise HTTPException(400, f"Unknown report type: {rtype}")
    return Response(content=pdf_bytes, media_type="application/pdf",
                    headers={"Content-Disposition": f"attachment; filename=report-{rtype}-{utcnow().strftime('%Y%m%d')}.pdf"})


@router.post("/api/reports/schedule")
async def reports_create_schedule(
    report_type: str = Form("monthly"), email: str = Form(""),
    schedule: str = Form("monthly"), db=Depends(get_db),
    current_user: User = Depends(require_role("admin")),
):
    """Create a report schedule."""
    rs = ReportSchedule(report_type=report_type, email=email, schedule=schedule, enabled=True, tenant_id=current_user._tenant_id)
    db.add(rs)
    await db.commit()
    await db.refresh(rs)
    return {"id": rs.id, "report_type": rs.report_type, "schedule": rs.schedule, "email": rs.email}


@router.get("/api/reports/schedules")
async def reports_list_schedules(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all report schedules."""
    rows = await db.execute(select(ReportSchedule).where(ReportSchedule.tenant_id == current_user._tenant_id).order_by(ReportSchedule.created_at.desc()))
    return [{
        "id": r.id, "report_type": r.report_type, "email": r.email,
        "enabled": r.enabled, "schedule": r.schedule,
        "last_sent": r.last_sent.isoformat() if r.last_sent else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows.scalars().all()]


@router.delete("/api/reports/schedules/{schedule_id}")
async def reports_delete_schedule(schedule_id: int, db=Depends(get_db), current_user: User = Depends(require_role("admin"))):
    """Delete a report schedule."""
    rs = (await db.execute(
        select(ReportSchedule).where(ReportSchedule.id == schedule_id, ReportSchedule.tenant_id == current_user._tenant_id)
    )).scalar_one_or_none()
    if not rs:
        raise HTTPException(404, "الجدول غير موجود")
    await db.delete(rs)
    await db.commit()
    return {"ok": True}
