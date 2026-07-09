"""
Agent Memory — DB-backed session + user memory for Vercel serverless.
Stores in BotState table as JSON. Every request reads/writes from DB.
"""
import json, logging
from typing import Any

log = logging.getLogger("fb-agent-mem")

MAX_SESSION_TURNS = 50


def _session_key(username: str) -> str:
    return f"ai_session_{username}"


def _user_key(username: str) -> str:
    return f"ai_memory_{username}"


async def get_session(db, username: str) -> list[dict]:
    """Load session history from DB. Returns list of turns."""
    from sqlalchemy import select
    from models import BotState
    key = _session_key(username)
    row = await db.execute(select(BotState).where(BotState.key == key))
    state = row.scalar_one_or_none()
    if not state or not state.value:
        return []
    try:
        data = json.loads(state.value)
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError):
        return []


async def append_to_session(db, username: str, turn: dict):
    """Append one {role, text, action} turn and trim to MAX_SESSION_TURNS."""
    from sqlalchemy import select
    from models import BotState
    key = _session_key(username)
    history = await get_session(db, username)
    history.append(turn)
    if len(history) > MAX_SESSION_TURNS:
        history = history[-MAX_SESSION_TURNS:]
    # Upsert
    row = await db.execute(select(BotState).where(BotState.key == key))
    state = row.scalar_one_or_none()
    if state:
        state.value = json.dumps(history, ensure_ascii=False)
    else:
        db.add(BotState(key=key, value=json.dumps(history, ensure_ascii=False)))
    await db.commit()


async def clear_session(db, username: str):
    """Delete session history for user."""
    from sqlalchemy import select
    from models import BotState
    key = _session_key(username)
    row = await db.execute(select(BotState).where(BotState.key == key))
    state = row.scalar_one_or_none()
    if state:
        await db.delete(state)
        await db.commit()


async def get_user_memory(db, username: str) -> dict:
    """Load persistent user preferences/decisions."""
    from sqlalchemy import select
    from models import BotState
    key = _user_key(username)
    row = await db.execute(select(BotState).where(BotState.key == key))
    state = row.scalar_one_or_none()
    if not state or not state.value:
        return {"preferences": {}, "history": []}
    try:
        return json.loads(state.value)
    except (json.JSONDecodeError, TypeError):
        return {"preferences": {}, "history": []}


async def update_user_memory(db, username: str, updates: dict):
    """Merge updates into user memory — preferences, decisions, etc."""
    from sqlalchemy import select
    from models import BotState
    key = _user_key(username)
    mem = await get_user_memory(db, username)
    for k, v in updates.items():
        if isinstance(v, dict) and isinstance(mem.get(k), dict):
            mem[k].update(v)
        elif isinstance(v, list) and isinstance(mem.get(k), list):
            mem[k].extend(v)
            if len(mem[k]) > 20:
                mem[k] = mem[k][-20:]
        else:
            mem[k] = v
    row = await db.execute(select(BotState).where(BotState.key == key))
    state = row.scalar_one_or_none()
    if state:
        state.value = json.dumps(mem, ensure_ascii=False)
    else:
        db.add(BotState(key=key, value=json.dumps(mem, ensure_ascii=False)))
    await db.commit()
    return mem
