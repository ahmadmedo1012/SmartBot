from __future__ import annotations

"""
Structured logging and diagnostics for SmartBot.
JSON-formatted logs, health metrics, performance tracking.

v22 (FIX-D) — tenant attribution: ``LogEvent`` carries a tenant_id and the
BotLog batch writer persists it. Before this, EVERY row landed tenant_id=0
(302/304 production rows) while its content was tenant-specific, so the
dashboard activity feed (``BotLog.tenant_id == _tid``) was empty for every
real tenant despite active bot cycles. Emitters that hold tenant context
(the per-tenant bot engines) use ``bind_tenant()`` so each event is stamped
without touching every call site.
"""
import json
import logging
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime

from _async import spawn  # v9-A11: GC-safe background tasks

# BotLog batch buffer and async flush
_botlog_batch: list[dict] = []
_botlog_flushing = False

async def _flush_botlog():
    global _botlog_flushing, _botlog_batch
    if _botlog_flushing:
        return
    _botlog_flushing = True
    try:
        from database import AsyncSessionLocal
        from models import BotLog
        batch, _botlog_batch = _botlog_batch, []
        if not batch:
            return
        async with AsyncSessionLocal() as session:
            for item in batch:
                # v22 (FIX-D): the emitter's tenant (bound logger / explicit
                # kwarg) reaches the row — the model default 0 was the lie.
                session.add(BotLog(
                    level=item["level"],
                    message=item["message"],
                    tenant_id=int(item.get("tenant_id") or 0),
                ))
            await session.commit()
    except Exception:
        pass
    finally:
        _botlog_flushing = False

# ── Log Levels ───────────────────────────────────────────────────
TRACE = 5
DEBUG = 10
INFO = 20
WARN = 30
ERROR = 40
FATAL = 50


@dataclass
class LogEvent:
    """Structured log event with context."""
    level: str
    message: str
    module: str = ""
    comment_id: str = ""
    rule_id: int | None = None
    intent: str = ""
    latency_ms: float = 0.0
    #: v22 (FIX-D) — the tenant that emitted this event (0 = unattributed,
    #: kept out of to_dict() so legacy JSON consumers see no new field).
    tenant_id: int = 0
    extra: dict = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

    def to_dict(self) -> dict:
        return {k: v for k, v in asdict(self).items() if v}


class StructuredLogger:
    """JSON-structured logger that also emits to stdlib logging."""

    def __init__(self, name: str = "fb-bot", level: int = logging.INFO):
        self._name = name
        self._log = logging.getLogger(name)
        self._log.setLevel(level)
        self._buffer: list[LogEvent] = []
        self._buffer_max = 1000

    # ── Public logging methods ──
    def info(self, message: str, **kw): self._emit(LogEvent("INFO", message, **kw))
    def warn(self, message: str, **kw): self._emit(LogEvent("WARN", message, **kw))
    def warning(self, message: str, **kw): self.warn(message, **kw)
    def error(self, message: str, **kw): self._emit(LogEvent("ERROR", message, **kw))
    def debug(self, message: str, **kw): self._emit(LogEvent("DEBUG", message, **kw))
    def trace(self, message: str, **kw): self._emit(LogEvent("TRACE", message, **kw))

    def _emit(self, event: LogEvent):
        line = json.dumps(event.to_dict(), ensure_ascii=False, default=str)
        level_map = {"TRACE": DEBUG, "DEBUG": DEBUG, "INFO": INFO,
                      "WARN": WARN, "ERROR": ERROR, "FATAL": FATAL}
        self._log.log(level_map.get(event.level, INFO), "%s", line)
        self._buffer.append(event)
        if len(self._buffer) > self._buffer_max:
            self._buffer.pop(0)
        # Broadcast via EventBus (router.py registers a WS bridge for log_event)
        try:
            from event_bus import event_bus
            spawn(event_bus.emit("log_event", event.to_dict()))
        except Exception:
            pass
        # Batch-write to BotLog every 10 events
        try:
            d = event.to_dict()
            payload = {
                "level": d.get("level", "INFO"),
                "message": d.get("message", ""),
                # v22 (FIX-D): survives the to_dict() falsy filter only when
                # non-zero; unattributed events keep the historical 0.
                "tenant_id": d.get("tenant_id", 0),
            }
            _botlog_batch.append(payload)
            if len(_botlog_batch) >= 10:
                spawn(_flush_botlog())
        except Exception:
            pass

    def get_buffer(self, level: str | None = None, module: str | None = None,
                   since: str | None = None, limit: int = 50) -> list[dict]:
        items = self._buffer
        if level:
            items = [e for e in items if e.level == level]
        if module:
            items = [e for e in items if e.module == module]
        if since:
            try:
                items = [e for e in items if e.timestamp >= since]
            except Exception:
                pass
        return [e.to_dict() for e in items[-limit:]]

    def get_stats(self) -> dict:
        """Get log volume stats by level."""
        counts = {"TRACE": 0, "DEBUG": 0, "INFO": 0, "WARN": 0, "ERROR": 0, "FATAL": 0}
        for e in self._buffer:
            counts[e.level] = counts.get(e.level, 0) + 1
        total = sum(counts.values())
        return {
            "total_events": total,
            "by_level": counts,
            "error_rate": round(counts["ERROR"] / max(total, 1) * 100, 2),
        }

    def bind_tenant(self, tenant_id: int) -> TenantBoundLogger:
        """v22 (FIX-D) — a tenant-scoped emitting view of this logger.

        Callers that know their tenant (per-tenant bot engines) get a view
        that stamps every event; the singleton buffer/broadcast stay shared.
        """
        return TenantBoundLogger(self, tenant_id)


class TenantBoundLogger:
    """v22 (FIX-D) — tenant-scoped emitting view over a StructuredLogger.

    The StructuredLogger stays a process-global singleton (its ring buffer
    feeds /api/logs + diagnostics, and the WS ``log_event`` bridge stays
    global), but every event emitted through a bound view carries the
    binding tenant so the BotLog batch writer attributes rows correctly.
    ``bot_engine`` binds one view per engine instance; plain
    ``get_logger()`` users keep the historical unattributed behavior.
    """

    def __init__(self, inner: StructuredLogger, tenant_id: int):
        self._inner = inner
        self._tenant_id = int(tenant_id or 0)

    # ── Public logging methods (mirror StructuredLogger) ──
    def info(self, message: str, **kw):
        kw.setdefault("tenant_id", self._tenant_id)
        self._inner.info(message, **kw)

    def warn(self, message: str, **kw):
        kw.setdefault("tenant_id", self._tenant_id)
        self._inner.warn(message, **kw)

    def warning(self, message: str, **kw):
        self.warn(message, **kw)

    def error(self, message: str, **kw):
        kw.setdefault("tenant_id", self._tenant_id)
        self._inner.error(message, **kw)

    def debug(self, message: str, **kw):
        kw.setdefault("tenant_id", self._tenant_id)
        self._inner.debug(message, **kw)

    def trace(self, message: str, **kw):
        kw.setdefault("tenant_id", self._tenant_id)
        self._inner.trace(message, **kw)

    # ── Read-side passthroughs (buffer/stats stay the singleton's) ──
    def get_buffer(self, level: str | None = None, module: str | None = None,
                   since: str | None = None, limit: int = 50) -> list[dict]:
        return self._inner.get_buffer(level=level, module=module, since=since, limit=limit)

    def get_stats(self) -> dict:
        return self._inner.get_stats()


# Singleton
bot_log: StructuredLogger | None = None


def get_logger(name: str = "fb-bot") -> StructuredLogger:
    global bot_log
    if bot_log is None:
        bot_log = StructuredLogger(name)
    return bot_log

