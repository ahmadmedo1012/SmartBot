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
        self._record(user_id, now)
        return False

    def _record(self, user_id: str, now: float) -> None:
        """Write the hit and prune expired entries (r134).

        r134 (R134-W1-SB2a2 #8): per-tenant engines live in a registry that
        is never evicted, so the old unbounded write was a slow memory leak
        on single-server deploys — every commenter id ever seen stayed in
        ``_store`` for the process lifetime. Cheap bound: on each add, drop
        entries older than the MAX possible window (constructor default ∪
        per-user overrides). Such an entry can never satisfy any window
        check again (``now`` only grows), so pruning it never changes
        behavior — the store stays bounded by the users active within the
        last window instead of by process lifetime.
        """
        horizon = max(self._default_sec, *self._user_windows.values()) \
            if self._user_windows else self._default_sec
        if self._store:
            self._store = {uid: ts for uid, ts in self._store.items()
                           if (now - ts) < horizon}
        self._store[user_id] = now

    def adjust_window(self, user_id: str, seconds: int):
        seconds = max(10, min(3600, seconds))
        if user_id == "global":
            self._default_sec = seconds
        else:
            self._user_windows[user_id] = seconds
