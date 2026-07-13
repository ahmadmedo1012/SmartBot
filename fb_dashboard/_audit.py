"""Audit log helper for auth and sensitive operations."""
from models import AuditLog


async def log_audit(db, action: str, actor_id: int = None, target_type: str = "",
                    target_id: int = None, metadata: dict = None, ip: str = ""):
    db.add(AuditLog(
        action=action,
        actor_id=actor_id,
        target_type=target_type,
        target_id=target_id,
        metadata=metadata or {},
        ip=ip,
    ))
    await db.flush()
