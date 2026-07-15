from __future__ import annotations
"""
Diagnostics and health monitoring for SmartBot.
Provides API endpoints for system health, performance metrics,
and diagnostic information.
"""
import asyncio
import json
import os
import time as time_module
from collections import defaultdict
from typing import Any


class DiagnosticsEngine:
    """Collect and report system diagnostics."""

    def __init__(self):
        self._cycle_times: list[float] = []
        self._api_errors: list[dict] = []
        self._cycle_count = 0
        self._last_cycle_time: float = 0
        self._max_samples = 100

    def record_cycle(self, elapsed_ms: float):
        self._cycle_count += 1
        self._last_cycle_time = elapsed_ms
        self._cycle_times.append(elapsed_ms)
        if len(self._cycle_times) > self._max_samples:
            self._cycle_times.pop(0)

    def record_api_error(self, endpoint: str, status: int, message: str):
        self._api_errors.append({
            "endpoint": endpoint,
            "status": status,
            "message": message[:200],
            "time": time_module.time(),
        })
        if len(self._api_errors) > self._max_samples:
            self._api_errors.pop(0)

    def get_cycle_stats(self) -> dict:
        if not self._cycle_times:
            return {"count": 0, "avg_ms": 0, "max_ms": 0, "min_ms": 0}
        return {
            "count": self._cycle_count,
            "avg_ms": round(sum(self._cycle_times) / len(self._cycle_times), 1),
            "max_ms": round(max(self._cycle_times), 1),
            "min_ms": round(min(self._cycle_times), 1),
            "last_ms": round(self._last_cycle_time, 1),
        }

    def get_recent_errors(self, limit: int = 20) -> list[dict]:
        return self._api_errors[-limit:]

    def get_error_rate(self) -> float:
        if not self._cycle_times:
            return 0.0
        return round(len(self._api_errors) / max(self._cycle_count, 1) * 100, 2)

    def get_system_info(self) -> dict:
        import sys
        return {
            "python": sys.version.split()[0],
            "platform": sys.platform,
            "memory_mb": "N/A",
            "uptime_seconds": int(time_module.time() - self._start_time) if hasattr(self, '_start_time') else 0,
            "pid": os.getpid(),
        }

    def reset(self):
        self._cycle_times.clear()
        self._api_errors.clear()
        self._cycle_count = 0


# Singleton
_diag: DiagnosticsEngine | None = None


def get_diagnostics() -> DiagnosticsEngine:
    global _diag
    if _diag is None:
        _diag = DiagnosticsEngine()
        _diag._start_time = time_module.time()
    return _diag
