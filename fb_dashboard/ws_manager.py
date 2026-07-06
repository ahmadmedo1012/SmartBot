"""WebSocket manager for real-time dashboard updates."""
import json, logging
from typing import Any
from fastapi import WebSocket

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
        msg = json.dumps({"event": event, "data": data}, ensure_ascii=False, default=str)
        dead = set()
        for ws in self._connections:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.add(ws)
        if dead:
            self._connections -= dead

    @property
    def count(self) -> int:
        return len(self._connections)


ws_manager = ConnectionManager()
