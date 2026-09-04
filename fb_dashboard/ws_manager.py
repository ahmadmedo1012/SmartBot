from __future__ import annotations
"""WebSocket manager for real-time dashboard updates with tenant isolation."""
import json, logging, os
from typing import Any
from fastapi import WebSocket

_IS_VERCEL = bool(os.getenv("VERCEL"))

log = logging.getLogger("fb-ws")


class WSConnection:
    """WebSocket connection with tenant isolation."""
    def __init__(self, websocket: WebSocket, tenant_id: int, user_id: int):
        self.websocket = websocket
        self.tenant_id = tenant_id
        self.user_id = user_id


class ConnectionManager:
    def __init__(self):
        self._connections: list[WSConnection] = []

    async def connect(self, ws: WebSocket, tenant_id: int, user_id: int):
        await ws.accept()
        conn = WSConnection(ws, tenant_id, user_id)
        self._connections.append(conn)
        log.info(f"WS client connected tenant={tenant_id} user={user_id} ({self.count} total)")

    def disconnect(self, ws: WebSocket):
        self._connections = [c for c in self._connections if c.websocket != ws]
        log.info(f"WS client disconnected ({self.count} total)")

    async def broadcast_to_tenant(self, tenant_id: int, event: str, data: Any = None):
        """Broadcast event only to connections belonging to a specific tenant."""
        if _IS_VERCEL or not self._connections:
            return
        msg = json.dumps({"event": event, "data": data}, ensure_ascii=False, default=str)
        dead = []
        for conn in self._connections:
            if conn.tenant_id != tenant_id:
                continue
            try:
                await conn.websocket.send_text(msg)
            except Exception:
                dead.append(conn)
        if dead:
            self._connections = [c for c in self._connections if c not in dead]

    async def broadcast_to_user(self, tenant_id: int, user_id: int, event: str, data: Any = None):
        """Broadcast event only to a specific user within a tenant."""
        if _IS_VERCEL or not self._connections:
            return
        msg = json.dumps({"event": event, "data": data}, ensure_ascii=False, default=str)
        dead = []
        for conn in self._connections:
            if conn.tenant_id != tenant_id or conn.user_id != user_id:
                continue
            try:
                await conn.websocket.send_text(msg)
            except Exception:
                dead.append(conn)
        if dead:
            self._connections = [c for c in self._connections if c not in dead]

    @property
    def count(self) -> int:
        return len(self._connections)

    @property
    def is_enabled(self) -> bool:
        if _IS_VERCEL:
            return False
        return len(self._connections) > 0


ws_manager = ConnectionManager()
