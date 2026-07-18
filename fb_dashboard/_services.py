"""Shared state & helpers extracted from runner.py for router modules."""
from __future__ import annotations
import asyncio
import json
import logging
import os
from datetime import datetime, timedelta

from sqlalchemy import select, func

from _utils import utcnow
from _lazy import lazy
from config import settings
from database import AsyncSessionLocal
from bot import BotEngine
from _crypto import decrypt_token

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("fb-api")

_post_cursors: dict[int, str] = {}

# Lazy engine proxies
fb = lazy(lambda: __import__('fb_client', fromlist=['FBClient']).FBClient(
    settings.FACEBOOK_ACCESS_TOKEN, settings.FACEBOOK_PAGE_ID))
sequence_engine = lazy(lambda: __import__('sequence_engine', fromlist=['SequenceEngine']).SequenceEngine(fb))
broadcast_engine = lazy(lambda: __import__('broadcast_engine', fromlist=['BroadcastEngine']).BroadcastEngine(fb))
subscriber_engine = lazy(lambda: __import__('subscriber_engine', fromlist=['SubscriberEngine']).SubscriberEngine())
tag_engine = lazy(lambda: __import__('subscriber_engine', fromlist=['TagEngine']).TagEngine())
analytics_engine = lazy(lambda: __import__('analytics_engine', fromlist=['AnalyticsEngine']).AnalyticsEngine())
report_engine = lazy(lambda: __import__('report_engine', fromlist=['ReportEngine']).ReportEngine(analytics_engine))
pdf_engine = lazy(lambda: __import__('pdf_reports_engine', fromlist=['PdfReportsEngine']).PdfReportsEngine())
content_calendar_engine = lazy(lambda: __import__('content_calendar', fromlist=['ContentCalendarEngine']).ContentCalendarEngine(fb))
team_engine = lazy(lambda: __import__('team_engine', fromlist=['TeamEngine']).TeamEngine())
commerce_engine = lazy(lambda: __import__('commerce_engine', fromlist=['CommerceEngine']).CommerceEngine())
_publisher = lazy(lambda: __import__('publisher_engine', fromlist=['PublisherEngine']).PublisherEngine())
api_cache = lazy(lambda: __import__('api_cache', fromlist=['APICache']).APICache())
flow_engine = lazy(lambda: __import__('flow_engine', fromlist=['FlowEngine']).FlowEngine(fb))

# AI service
_ai_service = None

def get_ai():
    global _ai_service
    if _ai_service is None:
        from ai_service import AIService
        _ai_service = AIService()
        if not _ai_service.available:
            log.info("AI Service: no provider configured (set OPENAI_API_KEY or GEMINI_API_KEY)")
    return _ai_service

# Bot engine — per-tenant dict registry (same pattern as _get_ctx/_get_offer)
_bot_engines: dict[int, BotEngine] = {}
_bot_engine_lock = __import__('threading').RLock()

def get_bot_engine(fb_client=None, tenant_id: int = 0) -> BotEngine:
    global _bot_engines
    with _bot_engine_lock:
        if fb_client is not None:
            _bot_engines[tenant_id] = BotEngine(fb_client, tenant_id=tenant_id)
            return _bot_engines[tenant_id]
        if tenant_id not in _bot_engines:
            _bot_engines[tenant_id] = BotEngine(None, tenant_id=tenant_id)
        return _bot_engines[tenant_id]

def reset_bot_engines():
    """Reset all BotEngine instances (used during test teardown / tenant deactivation)."""
    global _bot_engines
    with _bot_engine_lock:
        _bot_engines.clear()

async def get_tenant_fb_client(tenant_id: int):
    async with AsyncSessionLocal() as db:
        row = await db.execute(
            select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == "fb_page_id")
        )
        page_id_bs = row.scalar_one_or_none()
        row = await db.execute(
            select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == "fb_access_token")
        )
        token_bs = row.scalar_one_or_none()
    if not page_id_bs or not token_bs or not token_bs.value:
        return None
    try:
        token = decrypt_token(token_bs.value)
    except Exception:
        return None
    return __import__('fb_client', fromlist=['FBClient']).FBClient(token, page_id_bs.value or "")

# Trend helper
async def _get_trend_data(db, tenant_id: int) -> dict:
    now = utcnow()
    today_start = datetime(now.year, now.month, now.day, tzinfo=now.tzinfo)
    yesterday_start = today_start - timedelta(days=1)
    week_start = now - timedelta(days=7)
    prior_week_start = now - timedelta(days=14)
    today_replies = await db.scalar(select(func.count(Reply.id)).where(
        Reply.tenant_id == tenant_id, Reply.created_at >= today_start,
    )) or 0
    yesterday_replies = await db.scalar(select(func.count(Reply.id)).where(
        Reply.tenant_id == tenant_id,
        Reply.created_at >= yesterday_start, Reply.created_at < today_start,
    )) or 0
    week_replies = await db.scalar(select(func.count(Reply.id)).where(
        Reply.tenant_id == tenant_id, Reply.created_at >= week_start,
    )) or 0
    prior_week_replies = await db.scalar(select(func.count(Reply.id)).where(
        Reply.tenant_id == tenant_id,
        Reply.created_at >= prior_week_start, Reply.created_at < week_start,
    )) or 0
    return {
        "today": round((today_replies - yesterday_replies) / yesterday_replies * 100, 1)
        if yesterday_replies else (100 if today_replies else 0),
        "week": round((week_replies - prior_week_replies) / prior_week_replies * 100, 1)
        if prior_week_replies else (100 if week_replies else 0),
    }

# Prevent circular import — Reply model imported lazily
from models import Reply, BotState, BotLog, BotAlert

# Event tracking
def _track_event(event_type: str, metadata: dict | None = None, tenant_id: int = 0):
    from models import AnalyticsEvent
    async def _write():
        try:
            async with AsyncSessionLocal() as s:
                ev = AnalyticsEvent(event_type=event_type, metadata_json=json.dumps(metadata or {}, ensure_ascii=False))
                if tenant_id:
                    ev.tenant_id = tenant_id
                s.add(ev)
                await s.commit()
        except Exception:
            pass
    asyncio.create_task(_write())
    return

# Webhook constants
WEBHOOK_VERIFY_TOKEN = os.getenv("FB_WEBHOOK_VERIFY_TOKEN", "")
WEBHOOK_APP_SECRET = os.getenv("FACEBOOK_APP_SECRET", "")
