from __future__ import annotations
"""Audit log helper for auth and sensitive operations."""
from models import AuditLog


async def log_audit(db, action: str, actor_id: int = None, target_type: str = "",
                    target_id: int = None, metadata: dict = None, ip: str = "",
                    tenant_id: int = 0):
    db.add(AuditLog(
        tenant_id=tenant_id,
        action=action,
        actor_id=actor_id,
        target_type=target_type,
        target_id=target_id,
        data=metadata or {},
        ip=ip,
    ))
    await db.flush()
