"""v16-E6 (D3 design) — wall-clock-independent day seeding helpers.

Why (F1): the app buckets daily stats by UTC *calendar* midnight —
``fb_dashboard/_services.py:357-382`` (``_get_trend_data``) computes
``today_start = datetime(now.year, now.month, now.day, ...)`` from the
UTC-naive ``_utils.utcnow()``. Any "N hours ago" seed is therefore
time-of-day dependent: a 26-hours-ago seed at a 01:40 UTC run lands on
the day *before* yesterday and the trend math shifts (test_b3_trend
failed every run in [00:00, 02:00) UTC — reproduced live in D3).

Guarantees for ANY wall clock:

  ``utc_day_start(ref)``  → UTC midnight of ``ref``'s calendar day — an
      exact mirror of the app's bucket boundary.

  ``seed_day(0)``         → the MIDPOINT of the elapsed part of today:
      always in the past (a midpoint of elapsed time is elapsed) and
      always inside today.
  ``seed_day(-k)`` (k≥1)  → ``hour`` hours (default 12 = noon) after that
      day's UTC midnight: always inside that day (0 ≤ hour < 24) and
      always in the past — a past day's noon is strictly before today's
      00:00, which is ≤ now.
  ``seed_day(+k)``        → ValueError: future seeds are wall-clock
      dependent by definition (dishonest to offer).

Determinism self-test: ``test_dayseed_deterministic`` in
tests/test_v15_perf.py sweeps a full 24h of simulated wall clocks
(30-minute steps + the midnight edges) and pins every invariant above.
"""
from __future__ import annotations

from datetime import datetime, timedelta

__all__ = ["utc_day_start", "seed_day"]


def _now() -> datetime:
    """UTC-naive now via the app's single clock (``_utils.utcnow``).

    Lazy import: the importing test module inserts ``fb_dashboard/`` into
    ``sys.path`` before first use (tests/test_v15_perf.py does it at module
    import time), so calling-time import is always safe.
    """
    from _utils import utcnow

    return utcnow()


def utc_day_start(ref: datetime | None = None) -> datetime:
    """UTC calendar midnight of ``ref`` — the app's daily bucket boundary.

    Mirrors ``fb_dashboard/_services.py:357-382`` (``_get_trend_data``):
    ``today_start = datetime(now.year, now.month, now.day)`` computed from
    the UTC-naive ``_utils.utcnow()``. ``ref`` defaults to now; only the
    calendar fields matter (naive or aware UTC input both work — the result
    is always naive, matching the app's comparison domain).
    """
    if ref is None:
        ref = _now()
    return datetime(ref.year, ref.month, ref.day)


def seed_day(day_offset: int = 0, *, hour: float | None = None,
             ref: datetime | None = None) -> datetime:
    """A timestamp GUARANTEED to land inside the intended UTC calendar day.

    - ``day_offset=0``  → midpoint of the elapsed part of today (always
      past, always today). ``hour`` is meaningless here and rejected.
    - ``day_offset<0``  → ``hour`` (default 12) hours after that day's UTC
      midnight; ``hour`` must be in ``[0, 24)``.
    - ``day_offset>0``  → ValueError (future = wall-clock dependent).

    ``ref`` overrides "now" — used only by the determinism self-test to
    sweep simulated wall clocks; production call sites leave it None.
    """
    if day_offset > 0:
        raise ValueError(
            "day_offset must be <= 0 — future seeds are wall-clock dependent")
    if hour is not None and not 0 <= hour < 24:
        raise ValueError(f"hour must be in [0, 24) — got {hour}")

    now = _now() if ref is None else ref
    start = utc_day_start(now)

    if day_offset == 0:
        if hour is not None:
            raise ValueError(
                "hour= applies to negative day offsets only — "
                "day 0 uses the elapsed-part midpoint")
        # midpoint of the elapsed part of today: 0 <= elapsed/2 <= elapsed
        return start + (now - start) / 2

    return start + timedelta(days=day_offset, hours=12 if hour is None else hour)
