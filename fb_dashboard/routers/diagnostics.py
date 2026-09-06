# Response contract (Track A): every endpoint returns {"success": bool, "data": ...} via _responses.ok()
from __future__ import annotations

"""Diagnostics routes: status, cycle-stats, errors, logs, events, permissions, demo-test."""
import logging

from _responses import ok
from config import settings
from fastapi import APIRouter, Depends, Form, Query

from routers.auth import require_platform_admin, require_role

log = logging.getLogger("fb-api")
router = APIRouter(tags=["diagnostics"])


# v12-E2.8: GET /api/debug + POST /api/debug/fb-reply REMOVED — dead routes
# (zero consumers in frontend/e2e/tests). /api/debug exposed env/credential
# booleans to any authenticated user; fb-reply (128 lines) probed the Graph
# API with the GLOBAL platform token — both superseded by the platform-admin
# /api/diagnostics/* family below.


# v9-A6: the diagnostics system endpoints below read GLOBAL state (the
# StructuredLogger ring buffer / DiagnosticsEngine aggregates) whose entries
# carry no tenant marker — messages can embed other tenants' comment texts
# and usernames. They are therefore restricted to the platform admin.


@router.get("/api/diagnostics/status")
async def diagnostic_status(_=Depends(require_platform_admin)):
    from diagnostics import get_diagnostics
    from monitor import get_logger
    d = get_diagnostics()
    logger = get_logger()
    return ok(
        {"system": d.get_system_info(), "cycles": d.get_cycle_stats(),
            "errors": {"recent": d.get_recent_errors(10), "rate_pct": d.get_error_rate()},
            "logs": logger.get_stats()}
    )


@router.get("/api/diagnostics/cycle-stats")
async def diagnostic_cycles(_=Depends(require_platform_admin)):
    from diagnostics import get_diagnostics
    return ok(get_diagnostics().get_cycle_stats())


@router.get("/api/diagnostics/recent-errors")
async def diagnostic_errors(limit: int = Query(20), _=Depends(require_platform_admin)):
    from diagnostics import get_diagnostics
    return ok({"errors": get_diagnostics().get_recent_errors(limit)})


@router.get("/api/diagnostics/logs")
async def diagnostic_logs(level: str = Query(""), module: str = Query(""),
                          since: str = Query(""), limit: int = Query(50, ge=1, le=500),
                          _=Depends(require_platform_admin)):
    from monitor import get_logger
    return ok(
        {"logs": get_logger().get_buffer(level or None, module=module or None,
                                            since=since or None, limit=limit)}
    )


@router.get("/api/diagnostics/stats")
async def diagnostic_stats(_=Depends(require_platform_admin)):
    from monitor import get_logger
    return ok(get_logger().get_stats())


@router.get("/api/diagnostics/events")
async def diagnostic_events(limit: int = Query(100, ge=1, le=500), _=Depends(require_platform_admin)):
    from monitor import get_logger
    return ok({"events": get_logger().get_buffer(limit=limit)})


@router.get("/api/diagnostics/permissions")
async def diagnostic_permissions(_=Depends(require_platform_admin)):
    """v9-A6: platform-admin only — probes the GLOBAL page token's scopes."""
    from fb_client import FBClient
    if not settings.FACEBOOK_ACCESS_TOKEN:
        return ok({"has_token": False})
    fb = FBClient(settings.FACEBOOK_ACCESS_TOKEN, settings.FACEBOOK_PAGE_ID)
    debug = await fb._get("debug_token", {"input_token": settings.FACEBOOK_ACCESS_TOKEN})
    perms = []
    if debug and "data" in debug:
        perms = (debug["data"].get("scopes", []) or debug["data"].get("granular_scopes", []))
    return ok({"has_token": True, "permissions": perms})


@router.post("/api/diagnostics/demo-test-comment")
async def diagnostic_demo_comment(comment_text: str = Form(...), _=Depends(require_role("admin"))):
    from bot import TextNormalizer
    from enhanced_intent import EnhancedIntentClassifier
    classification = EnhancedIntentClassifier.classify(comment_text)
    normalized = TextNormalizer.normalize_for_matching(comment_text)
    return ok({"original": comment_text, "normalized": normalized, "classification": classification})
