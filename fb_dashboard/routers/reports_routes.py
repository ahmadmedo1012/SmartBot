"""PDF Reports routes."""
# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
import logging

from _responses import ok
from _services import pdf_engine
from _utils import iso_z, utcnow
from database import get_db
from fastapi import APIRouter, Depends, Form, HTTPException, Request, Response
from models import ReportSchedule, User
from sqlalchemy import select

from routers.auth import get_current_user, require_role

log = logging.getLogger("fb-api")
router = APIRouter(prefix="", tags=["reports"])


@router.get("/api/reports/status")
async def pdf_reports_status(_=Depends(get_current_user)):
    """Check PDF generation engine availability."""
    return ok({"available": pdf_engine.is_available(), "engine": pdf_engine.engine_name})


@router.post("/api/reports/generate")
async def generate_pdf_report(request: Request, current_user: User = Depends(require_role("editor"))):
    """Generate a PDF report.  Returns PDF bytes directly.

    v9-A1: the report is generated STRICTLY for the current user's tenant —
    tenant_id is passed into every query of pdf_reports_engine (replies,
    subscribers, top commenters PII, growth, campaign lookup). Previously the
    engine queried globally: any tenant's PDF embedded every other tenant's
    commenter names and campaign data (cross-tenant P1 leak).
    """
    body = await request.json()
    rtype = body.get("type", "monthly")
    days = body.get("days", 30)
    try:
        days = int(days)
    except (TypeError, ValueError):
        raise HTTPException(400, "قيمة days غير صالحة") from None
    if not 1 <= days <= 365:
        raise HTTPException(400, "days يجب أن يكون بين 1 و 365")
    tenant_id = current_user._tenant_id
    b = body.get("branding", {})
    from pdf_reports_engine import BrandingConfig
    branding = BrandingConfig(
        logo_url=str(b.get("logo_url", ""))[:500],
        company_name=str(b.get("company_name", "SmartBot"))[:200],
        primary_color=str(b.get("primary_color", "#dc2626"))[:32],
    )
    if rtype == "monthly":
        pdf_bytes = await pdf_engine.monthly_report(days=days, branding=branding, tenant_id=tenant_id)
    elif rtype == "subscriber":
        pdf_bytes = await pdf_engine.subscriber_report(days=days, branding=branding, tenant_id=tenant_id)
    elif rtype == "campaign":
        campaign_type = body.get("campaign_type", "broadcast")
        campaign_id = str(body.get("campaign_id", "0"))
        if campaign_type not in ("broadcast", "flow"):
            raise HTTPException(400, "نوع الحملة غير صالح")
        if not campaign_id.isdigit():
            raise HTTPException(400, "معرف الحملة غير صالح")
        pdf_bytes = await pdf_engine.campaign_report(campaign_type, campaign_id, branding=branding, tenant_id=tenant_id)
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
    return ok({"id": rs.id, "report_type": rs.report_type, "schedule": rs.schedule, "email": rs.email})


@router.get("/api/reports/schedules")
async def reports_list_schedules(db=Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all report schedules."""
    rows = await db.execute(select(ReportSchedule).where(ReportSchedule.tenant_id == current_user._tenant_id).order_by(ReportSchedule.created_at.desc()))
    return ok(
        [{
        "id": r.id, "report_type": r.report_type, "email": r.email,
        "enabled": r.enabled, "schedule": r.schedule,
        "last_sent": iso_z(r.last_sent),
        "created_at": iso_z(r.created_at),
    } for r in rows.scalars().all()]
    )


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
    return ok({"ok": True})
