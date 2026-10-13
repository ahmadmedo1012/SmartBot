"""v16-E6 (D3 design) — wall-clock-independent day seeding helpers.

r137-follow-through (phase8): the app buckets daily stats by TRIPOLI
midnight — ``fb_dashboard/_services.py: _get_trend_data`` calls
``tripoli_day_start(now)`` («ليبي أولاً»: اليوم/أمس بحدّ طرابلس UTC+2
الثابت). The original v16-E6 helper mirrored the OLD UTC-midnight
boundary, so inside the 22:00–24:00 UTC window (Tripoli already on the
next calendar day) the "today" seed landed in Tripoli-*yesterday* and
``test_b3_trend`` failed with -100.0 instead of -50.0 — reproduced live
at 22:50 UTC locally and on the GitHub runner at 22:21Z. The helper now
anchors to the app's own ``tripoli_day_start`` (single source, imported
— not reimplemented).

Guarantees for ANY wall clock:

  ``day_start(ref)``     → Tripoli midnight of ``ref``'s calendar day, in
      the naive-UTC domain — the EXACT mirror of the app's bucket
      boundary (``_utils.tripoli_day_start``).
  ``seed_day(0)``       → the MIDPOINT of the elapsed part of the current
      Tripoli day: always in the past and always inside the Tripoli day.
  ``seed_day(-k)`` (k≥1) → ``hour`` hours (default 12 = noon) after that
      Tripoli day's start: always inside that day and always in the past
      (a past day's noon is strictly before the current day's start,
      which is ≤ now).
  ``seed_day(+k)``      → ValueError: future seeds are wall-clock
      dependent by definition (dishonest to offer).

Determinism self-test: ``test_dayseed_deterministic`` in
tests/test_v15_perf.py sweeps a full 24h of simulated wall clocks
(30-minute steps + the midnight edges) and pins every invariant above —
against the Tripoli boundary.
"""
from __future__ import annotations

from datetime import datetime, timedelta

__all__ = ["day_start", "seed_day"]


def _now() -> datetime:
    """UTC-naive now via the app's single clock (``_utils.utcnow``).

    Lazy import: the importing test module inserts ``fb_dashboard/`` into
    ``sys.path`` before first use (tests/test_v15_perf.py does it at module
    import time), so calling-time import is always safe.
    """
    from _utils import utcnow

    return utcnow()


def day_start(ref: datetime | None = None) -> datetime:
    """Tripoli calendar midnight of ``ref`` — the app's daily bucket boundary.

    Mirrors ``fb_dashboard/_services.py: _get_trend_data`` (r137 «ليبي
    أولاً»): ``today_start = tripoli_day_start(now)``. ``ref`` defaults to
    now; the result is a naive-UTC datetime comparable with the app's
    ``created_at`` columns. This is the seed-domain twin of the app's own
    boundary — imported from ``_utils``, never reimplemented.
    """
    if ref is None:
        ref = _now()
    from _utils import tripoli_day_start

    return tripoli_day_start(ref)


def seed_day(day_offset: int = 0, *, hour: float | None = None,
             ref: datetime | None = None) -> datetime:
    """A timestamp GUARANTEED to land inside the intended TRIPOLI day.

    - ``day_offset=0``  → midpoint of the elapsed part of the current
      Tripoli day (always past, always today). ``hour`` is meaningless
      here and rejected.
    - ``day_offset<0``  → ``hour`` (default 12) hours after that Tripoli
      day's start; ``hour`` must be in ``[0, 24)``.
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
    start = day_start(now)

    if day_offset == 0:
        if hour is not None:
            raise ValueError(
                "hour= applies to negative day offsets only — "
                "day 0 uses the elapsed-part midpoint")
        # midpoint of the elapsed part of the current Tripoli day:
        # 0 <= elapsed/2 <= elapsed, so day_start <= seed <= now
        return start + (now - start) / 2

    return start + timedelta(days=day_offset, hours=12 if hour is None else hour)
