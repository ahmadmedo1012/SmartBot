from __future__ import annotations

"""
Agent Memory — DB-backed session + user memory for Vercel serverless.
Stores in BotState table as JSON. Every request reads/writes from DB.

v9-A4 (cross-tenant fix): keys are now TENANT-SCOPED —
  ai_session_{tenant_id}_{username} / ai_memory_{tenant_id}_{username}
Before this, two tenants sharing a username (usernames are unique only
per-tenant) read and wrote the SAME session/memory rows, and every BotState
lookup ignored tenant_id. No data migration: pre-v9 keys
(ai_session_{username}) are legacy test data on single-tenant dev databases —
new code simply never reads them.
"""
import json
import logging

log = logging.getLogger("fb-agent-mem")

MAX_SESSION_TURNS = 50


def _session_key(tenant_id: int, username: str) -> str:
    return f"ai_session_{tenant_id}_{username}"


def _user_key(tenant_id: int, username: str) -> str:
    return f"ai_memory_{tenant_id}_{username}"


async def get_session(db, username: str, tenant_id: int = 0) -> list[dict]:
    """Load session history from DB. Returns list of turns (tenant-scoped)."""
    from models import BotState
    from sqlalchemy import select
    key = _session_key(tenant_id, username)
    row = await db.execute(
        select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == key))
    state = row.scalar_one_or_none()
    if not state or not state.value:
        return []
    try:
        data = json.loads(state.value)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


async def append_to_session(db, username: str, turn: dict, tenant_id: int = 0):
    """Append one {role, text, action} turn and trim to MAX_SESSION_TURNS."""
    from models import BotState
    from sqlalchemy import select
    key = _session_key(tenant_id, username)
    history = await get_session(db, username, tenant_id)
    history.append(turn)
    if len(history) > MAX_SESSION_TURNS:
        history = history[-MAX_SESSION_TURNS:]
    # Upsert (tenant-scoped)
    row = await db.execute(
        select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == key))
    state = row.scalar_one_or_none()
    if state:
        state.value = json.dumps(history, ensure_ascii=False)
    else:
        db.add(BotState(tenant_id=tenant_id, key=key,
                        value=json.dumps(history, ensure_ascii=False)))
    await db.commit()


async def clear_session(db, username: str, tenant_id: int = 0):
    """Delete session history for user (tenant-scoped)."""
    from models import BotState
    from sqlalchemy import select
    key = _session_key(tenant_id, username)
    row = await db.execute(
        select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == key))
    state = row.scalar_one_or_none()
    if state:
        await db.delete(state)
        await db.commit()


async def get_user_memory(db, username: str, tenant_id: int = 0) -> dict:
    """Load persistent user preferences/decisions (tenant-scoped)."""
    from models import BotState
    from sqlalchemy import select
    key = _user_key(tenant_id, username)
    row = await db.execute(
        select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == key))
    state = row.scalar_one_or_none()
    if not state or not state.value:
        return {"preferences": {}, "history": []}
    try:
        return json.loads(state.value)
    except (json.JSONDecodeError, TypeError):
        return {"preferences": {}, "history": []}


async def update_user_memory(db, username: str, updates: dict, tenant_id: int = 0):
    """Merge updates into user memory — preferences, decisions, etc."""
    from models import BotState
    from sqlalchemy import select
    key = _user_key(tenant_id, username)
    mem = await get_user_memory(db, username, tenant_id)
    for k, v in updates.items():
        if isinstance(v, dict) and isinstance(mem.get(k), dict):
            mem[k].update(v)
        elif isinstance(v, list) and isinstance(mem.get(k), list):
            mem[k].extend(v)
            if len(mem[k]) > 20:
                mem[k] = mem[k][-20:]
        else:
            mem[k] = v
    row = await db.execute(
        select(BotState).where(BotState.tenant_id == tenant_id, BotState.key == key))
    state = row.scalar_one_or_none()
    if state:
        state.value = json.dumps(mem, ensure_ascii=False)
    else:
        db.add(BotState(tenant_id=tenant_id, key=key,
                        value=json.dumps(mem, ensure_ascii=False)))
    await db.commit()
    return mem
