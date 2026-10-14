from __future__ import annotations

"""Tests for AnalyticsEngine — daily trend, peak hour, overview, helpers."""
from collections import namedtuple
from datetime import date, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from _utils import utcnow
from analytics_engine import AnalyticsEngine


@pytest.fixture
def engine():
    return AnalyticsEngine()


class _Rows:
    """SQLAlchemy-like result that supports iteration, .first(), and .one()."""
    def __init__(self, rows=None):
        self._rows = rows or []
    def first(self):
        return self._rows[0] if self._rows else None
    def one(self):
        """Return the single row; raise if 0 or 2+ rows."""
        if not self._rows:
            raise Exception("No rows returned")
        if len(self._rows) > 1:
            raise Exception("Multiple rows returned")
        return self._rows[0]
    def __iter__(self):
        return iter(self._rows)


def _mock_session():
    """Session mock for analytics queries."""
    s = AsyncMock()
    s.execute = AsyncMock(return_value=_Rows())
    s.scalar = AsyncMock(return_value=0)
    return s


# ── get_daily_trend ───────────────────────────────────────────────────

class TestDailyTrend:
    @pytest.mark.asyncio
    async def test_returns_correct_format(self, engine):
        """get_daily_trend returns list of {date, replies}."""
        session = _mock_session()
        Row = namedtuple("Row", ["d", "cnt"])
        session.execute.return_value = _Rows([
            Row(d=date(2026, 7, 6), cnt=5),
        ])

        result = await engine.get_daily_trend(7, session)
        assert len(result) == 1
        assert result[0] == {"date": "2026-07-06", "replies": 5}

    @pytest.mark.asyncio
    async def test_returns_empty_when_no_data(self, engine):
        """No data returns empty list."""
        session = _mock_session()
        result = await engine.get_daily_trend(7, session)
        assert result == []


# ── get_peak_hour ─────────────────────────────────────────────────────

class TestPeakHour:
    @pytest.mark.asyncio
    async def test_returns_hour_with_sample_data(self, engine):
        """get_peak_hour returns the hour with highest reply count."""
        session = _mock_session()
        Row = namedtuple("Row", ["h", "cnt"])
        session.execute.return_value = _Rows([Row(h=14, cnt=10)])

        result = await engine.get_peak_hour(7, session)
        assert result == 14

    @pytest.mark.asyncio
    async def test_returns_none_when_no_data(self, engine):
        """No data returns None."""
        session = _mock_session()
        result = await engine.get_peak_hour(7, session)
        assert result is None


# ── get_dashboard_overview ────────────────────────────────────────────

class TestDashboardOverview:
    @pytest.mark.asyncio
    async def test_returns_all_kpis(self, engine):
        """Dashboard overview returns expected structure."""
        session = _mock_session()
        # session.execute returns the aggregate row from get_dashboard_overview
        Row = namedtuple("Row", ["total_replies", "today_replies", "prior_replies", "unique_commenters"])
        session.execute = AsyncMock(return_value=_Rows([
            Row(total_replies=100, today_replies=10, prior_replies=80, unique_commenters=30)
        ]))
        # session.scalar returns: active_rules, total_subscribers,
        # total_messages, total_conversations, total_customers (v4 §7.24)
        session.scalar = AsyncMock(side_effect=[5, 200, 400, 40, 15])

        result = await engine.get_dashboard_overview(7, session)
        assert result["total_replies"] == 100
        assert result["today_replies"] == 10
        assert result["active_rules"] == 5
        assert result["total_subscribers"] == 200
        assert result["unique_commenters"] == 30
        assert result["change_pct"] == 25.0
        assert result["period_days"] == 7
        # v4 §7.24 — honest real-data KPIs
        assert result["total_messages"] == 400
        assert result["total_conversations"] == 40
        assert result["total_customers"] == 15


# ── get_top_rules ─────────────────────────────────────────────────────

class TestTopRules:
    @pytest.mark.asyncio
    async def test_returns_sorted_with_percentage(self, engine):
        """Top rules returns sorted rules with percentage share."""
        session = _mock_session()
        Row = namedtuple("Row", ["rule_id", "name", "cnt"])
        session.execute.return_value = _Rows([
            Row(rule_id=1, name="Rule A", cnt=30),
            Row(rule_id=2, name="Rule B", cnt=10),
        ])

        result = await engine.get_top_rules(7, 10, session)
        assert len(result) == 2
        assert result[0]["name"] == "Rule A"
        assert result[0]["percentage"] == 75.0

    @pytest.mark.asyncio
    async def test_empty_returns_empty_list(self, engine):
        session = _mock_session()
        result = await engine.get_top_rules(7, 10, session)
        assert result == []


# ── get_sentiment_trend ───────────────────────────────────────────────

class TestSentimentTrend:
    @pytest.mark.asyncio
    async def test_pivots_sentiments(self, engine):
        """Sentiment trend pivots into date buckets."""
        session = _mock_session()
        Row = namedtuple("Row", ["d", "sentiment", "cnt"])
        session.execute.return_value = _Rows([
            Row(d=date(2026, 7, 6), sentiment="positive", cnt=10),
            Row(d=date(2026, 7, 6), sentiment="negative", cnt=3),
            Row(d=date(2026, 7, 6), sentiment="neutral", cnt=7),
        ])

        result = await engine.get_sentiment_trend(7, session)
        assert len(result) == 1
        day = result[0]
        assert day["positive"] == 10
        assert day["negative"] == 3
        assert day["neutral"] == 7


# ── get_hourly_heatmap ────────────────────────────────────────────────

class TestHourlyHeatmap:
    @pytest.mark.asyncio
    async def test_returns_hour_buckets(self, engine):
        session = _mock_session()
        Row = namedtuple("Row", ["h", "d", "cnt"])
        session.execute.return_value = _Rows([
            Row(h=10, d=date(2026, 7, 6), cnt=4),
        ])

        result = await engine.get_hourly_heatmap(7, session)
        assert result == [{"hour": 10, "day": "2026-07-06", "count": 4}]

    @pytest.mark.asyncio
    async def test_empty(self, engine):
        session = _mock_session()
        assert await engine.get_hourly_heatmap(7, session) == []


# ── get_top_commenters ────────────────────────────────────────────────

class TestTopCommenters:
    @pytest.mark.asyncio
    async def test_returns_commenters(self, engine):
        session = _mock_session()
        Row = namedtuple("Row", ["commenter_name", "cnt", "last"])
        session.execute.return_value = _Rows([
            Row(commenter_name="أحمد", cnt=5, last=datetime(2026, 7, 6, 12, 0, 0)),
        ])

        result = await engine.get_top_commenters(7, 10, session)
        assert result[0]["name"] == "أحمد"
        assert result[0]["count"] == 5
        assert "2026-07-06" in result[0]["last_comment"]


# ── get_period_comparison ─────────────────────────────────────────────

class TestPeriodComparison:
    @pytest.mark.asyncio
    async def test_period_comparison_structure(self, engine):
        session = _mock_session()
        session.scalar = AsyncMock(side_effect=[120, 100])

        result = await engine.get_period_comparison(7, session)
        assert result["replies_now"] == 120
        assert result["replies_before"] == 100
        assert result["change_pct"] == 20.0
        assert result["period_days"] == 7


# ── _pct_change ───────────────────────────────────────────────────────

class TestPctChange:
    def test_normal(self, engine):
        assert engine._pct_change(150, 100) == 50.0

    def test_negative_change(self, engine):
        assert engine._pct_change(50, 100) == -50.0

    def test_zero_previous(self, engine):
        assert engine._pct_change(100, 0) == 0.0

    def test_no_change(self, engine):
        assert engine._pct_change(100, 100) == 0.0


# ── P10-3: real-SQLite regression (the recorded local-dev 500) ───────


class TestSqliteRealDb:
    """Real aiosqlite DB with SEEDED rows — the P10-3 recorded defect
    (P10-VERIFY: ``cast(created_at AS Date)`` → SQLite NUMERIC affinity →
    int 2026 → "fromisoformat: argument must be str" 500 on local-dev
    /dashboard/analytics). The mock suite above never runs SQL, and the
    endpoint tests never seeded rows — the Date result processor only
    runs when a row comes back, so an empty table crashes nowhere.
    """

    @pytest.fixture
    async def seeded(self):
        from types import SimpleNamespace

        from models import AISuggestion, Base, Reply
        from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
        from sqlalchemy.pool import StaticPool

        eng = create_async_engine(
            "sqlite+aiosqlite://", connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        async with eng.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        sf = async_sessionmaker(eng, expire_on_commit=False)
        now = utcnow()
        async with sf() as db:
            db.add_all([
                # tenant 1, in the 7-day window: 2 today + 1 three days ago
                Reply(tenant_id=1, fb_comment_id="p3-a", fb_post_id="p1", created_at=now),
                Reply(tenant_id=1, fb_comment_id="p3-b", fb_post_id="p1", created_at=now),
                Reply(tenant_id=1, fb_comment_id="p3-c", fb_post_id="p1",
                      created_at=now - timedelta(days=3)),
                # outside the window — must not appear
                Reply(tenant_id=1, fb_comment_id="p3-old", fb_post_id="p1",
                      created_at=now - timedelta(days=30)),
                # another tenant — must not leak into tenant 1's analytics
                Reply(tenant_id=999, fb_comment_id="p3-x", fb_post_id="p1", created_at=now),
                # sentiment rows: positive x2 + negative (1 today, 1 day-3)
                AISuggestion(tenant_id=1, sentiment="positive", created_at=now),
                AISuggestion(tenant_id=1, sentiment="negative", created_at=now),
                AISuggestion(tenant_id=1, sentiment="positive",
                             created_at=now - timedelta(days=3)),
            ])
            await db.commit()
        try:
            yield SimpleNamespace(sf=sf, now=now,
                                  today=now.date().isoformat(),
                                  past=(now - timedelta(days=3)).date().isoformat())
        finally:
            await eng.dispose()

    async def test_daily_trend_sqlite_returns_iso_date_strings(self, seeded):
        """SQLite path returns proper 'YYYY-MM-DD' buckets (was: TypeError
        'fromisoformat: argument must be str' on the first row fetch)."""
        async with seeded.sf() as s:
            rows = await AnalyticsEngine().get_daily_trend(7, s, tenant_id=1)
        dates = [r["date"] for r in rows]
        assert dates == [seeded.past, seeded.today]  # ascending, 2 buckets
        assert all(len(d) == 10 and d[4] == "-" for d in dates)
        assert {r["date"]: r["replies"] for r in rows} == {
            seeded.past: 1, seeded.today: 2}

    async def test_hourly_heatmap_sqlite_returns_date_strings(self, seeded):
        async with seeded.sf() as s:
            cells = await AnalyticsEngine().get_hourly_heatmap(7, s, tenant_id=1)
        by_day = {c["day"]: c for c in cells}
        assert set(by_day) == {seeded.past, seeded.today}
        assert by_day[seeded.today]["hour"] == seeded.now.hour
        assert by_day[seeded.today]["count"] == 2
        assert isinstance(by_day[seeded.today]["hour"], int)

    async def test_sentiment_trend_sqlite_buckets_by_date(self, seeded):
        async with seeded.sf() as s:
            rows = await AnalyticsEngine().get_sentiment_trend(7, s, tenant_id=1)
        by_date = {r["date"]: r for r in rows}
        assert set(by_date) == {seeded.past, seeded.today}
        assert by_date[seeded.today]["positive"] == 1
        assert by_date[seeded.today]["negative"] == 1
        assert by_date[seeded.past]["positive"] == 1


class TestAnalyticsRoutesSqlite:
    """P10-3 end-to-end: the recorded crash journey — /dashboard/analytics
    polls these routes; on local SQLite with ANY row present they 500'd.
    """

    async def test_analytics_routes_200_with_seeded_rows(self, v10_seed):
        from models import AISuggestion, Reply

        world = v10_seed.world
        ua, tid, _uid = await v10_seed.tenant_user()
        v10_seed.auth(ua, tid)
        now = utcnow()
        async with world.sf() as db:
            db.add_all([
                Reply(tenant_id=tid, fb_comment_id="p3-1", fb_post_id="p", created_at=now),
                Reply(tenant_id=tid, fb_comment_id="p3-2", fb_post_id="p", created_at=now),
                AISuggestion(tenant_id=tid, sentiment="positive", created_at=now),
            ])
            await db.commit()

        for path in (
            "/api/analytics/overview?days=30",       # routers/analytics.py
            "/api/analytics/daily-trend?days=7",     # analytics_engine.py
            "/api/analytics/hourly-heatmap?days=7",  # analytics_engine.py
            "/api/widgets/sentiment-trend?days=7",   # routers/widgets_routes.py
        ):
            r = await world.client.get(path)
            assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:300]}"

        daily = (await world.client.get("/api/analytics/daily-trend?days=7")).json()["data"]
        assert daily[-1] == {"date": now.date().isoformat(), "replies": 2}


class TestDialectBranchPin:
    """No Postgres exists in this sandbox — the production branch is pinned
    at SQL-compile level (honest gap): the Postgres spelling must stay the
    exact CAST(... AS DATE) the production queries always used, and the
    SQLite spelling must be the portable date()."""

    def test_postgres_keeps_cast_sqlite_uses_func_date(self):
        from types import SimpleNamespace

        from _utils import day_expr
        from models import Reply
        from sqlalchemy import Date, cast
        from sqlalchemy.dialects import postgresql
        from sqlalchemy.dialects import sqlite as sqlite_dialect

        pg = day_expr(Reply.created_at,
                      SimpleNamespace(bind=SimpleNamespace(dialect=postgresql.dialect())))
        lite = day_expr(Reply.created_at,
                        SimpleNamespace(bind=SimpleNamespace(dialect=sqlite_dialect.dialect())))
        assert str(pg.compile(dialect=postgresql.dialect())) == str(
            cast(Reply.created_at, Date).compile(dialect=postgresql.dialect()))
        assert str(lite.compile(dialect=sqlite_dialect.dialect())) == \
            "date(replies.created_at)"

    def test_fixed_modules_use_the_shared_day_expr_seam(self):
        import _utils
        import analytics_engine
        import routers.analytics
        import routers.widgets_routes

        for mod in (analytics_engine, routers.analytics, routers.widgets_routes):
            assert mod.day_expr is _utils.day_expr, (
                f"{mod.__name__} must go through the shared dialect-aware seam, "
                "not a raw cast(col, Date)")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
