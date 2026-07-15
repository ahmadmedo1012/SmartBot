from __future__ import annotations
"""WebSocket manager for real-time dashboard updates."""
import json, logging, os
from typing import Any
from fastapi import WebSocket

_IS_VERCEL = bool(os.getenv("VERCEL"))

log = logging.getLogger("fb-ws")


class ConnectionManager:
    def __init__(self):
        self._connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._connections.add(ws)
        log.info(f"WS client connected ({self.count} total)")

    def disconnect(self, ws: WebSocket):
        self._connections.discard(ws)
        log.info(f"WS client disconnected ({self.count} total)")

    async def broadcast(self, event: str, data: Any = None):
        if _IS_VERCEL or not self._connections:
            return
        msg = json.dumps({"event": event, "data": data}, ensure_ascii=False, default=str)
        dead = set()
        for ws in self._connections.copy():
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        if dead:
            self._connections -= dead

    broadcast_json = broadcast  # alias for explicit structured-data calls

    @property
    def count(self) -> int:
        return len(self._connections)

    @property
    def is_enabled(self) -> bool:
        if _IS_VERCEL:
            return False
        return len(self._connections) > 0


ws_manager = ConnectionManager()
