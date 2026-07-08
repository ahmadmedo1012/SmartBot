"""
Structured logging and diagnostics for SmartBot.
JSON-formatted logs, health metrics, performance tracking.
"""
import json
import logging
import os
import time
import traceback
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any

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

    def _emit(self, event: LogEvent):
        line = json.dumps(event.to_dict(), ensure_ascii=False, default=str)
        # Map level to stdlib
        level_map = {"TRACE": DEBUG, "DEBUG": DEBUG, "INFO": INFO,
                      "WARN": WARN, "ERROR": ERROR, "FATAL": FATAL}
        self._log.log(level_map.get(event.level, INFO), "%s", line)
        # Buffer for diagnostics
        self._buffer.append(event)
        if len(self._buffer) > self._buffer_max:
            self._buffer.pop(0)

    def trace(self, msg: str, **kw): self._emit(LogEvent(level="TRACE", message=msg, **kw))
    def debug(self, msg: str, **kw): self._emit(LogEvent(level="DEBUG", message=msg, **kw))
    def info(self, msg: str, **kw): self._emit(LogEvent(level="INFO", message=msg, **kw))
    def warn(self, msg: str, **kw): self._emit(LogEvent(level="WARN", message=msg, **kw))
    def error(self, msg: str, **kw): self._emit(LogEvent(level="ERROR", message=msg, **kw))
    def fatal(self, msg: str, **kw): self._emit(LogEvent(level="FATAL", message=msg, **kw))

    def get_buffer(self, level: str | None = None, limit: int = 50) -> list[dict]:
        items = self._buffer
        if level:
            items = [e for e in items if e.level == level]
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
