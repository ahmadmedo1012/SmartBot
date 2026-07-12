"""
Structured logging and diagnostics for SmartBot.
JSON-formatted logs, health metrics, performance tracking.
"""
import asyncio
import json
import logging
import os
import time
import traceback
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any

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
                session.add(BotLog(level=item["level"], message=item["message"]))
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
    extra: dict = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

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
        # Broadcast via EventBus and WebSocket (best-effort)
        try:
            from event_bus import event_bus
            asyncio.create_task(event_bus.emit("log_event", event.to_dict()))
        except Exception:
            pass
        try:
            from ws_manager import ws_manager
            if ws_manager.count:
                asyncio.create_task(ws_manager.broadcast("log_event", event.to_dict()))
        except Exception:
            pass
        # Batch-write to BotLog every 10 events
        try:
            d = event.to_dict()
            payload = {"level": d.get("level", "INFO"), "message": d.get("message", "")}
            _botlog_batch.append(payload)
            if len(_botlog_batch) >= 10:
                asyncio.create_task(_flush_botlog())
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


# Singleton
bot_log: StructuredLogger | None = None


def get_logger(name: str = "fb-bot") -> StructuredLogger:
    global bot_log
    if bot_log is None:
        bot_log = StructuredLogger(name)
    return bot_log


# ── Performance Timer ─────────────────────────────────────────────

@dataclass
class Timer:
    label: str = ""
    _start: float = field(default_factory=time.time)

    def elapsed(self) -> float:
        return (time.time() - self._start) * 1000  # ms

    def log(self, logger: StructuredLogger | None = None, **kw):
        ms = self.elapsed()
        (logger or get_logger()).info(f"[timer] {self.label}", latency_ms=ms, **kw)
        return ms
