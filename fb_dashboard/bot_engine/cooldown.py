from __future__ import annotations

"""Per-user reply cooldown window manager (extracted verbatim from the old
monolithic ``bot.py``, v11-A2).
"""

import time

# -------------------------------------------------------------------
# Cooldown Manager (v2 with configurable window)
# -------------------------------------------------------------------

class CooldownManager:
    def __init__(self, default_cooldown_sec: int = 60):
        self._default_sec = default_cooldown_sec
        self._store: dict[str, float] = {}
        self._user_windows: dict[str, int] = {}  # per-user override

    def is_blocked(self, user_id: str) -> bool:
        if not user_id or user_id in ("None", "0", "undefined"):
            return False
        now = time.time()
        last = self._store.get(user_id)
        window = self._user_windows.get(user_id, self._default_sec)
        if last and (now - last) < window:
            return True
        self._store[user_id] = now
        return False

    def adjust_window(self, user_id: str, seconds: int):
        seconds = max(10, min(3600, seconds))
        if user_id == "global":
            self._default_sec = seconds
        else:
            self._user_windows[user_id] = seconds
