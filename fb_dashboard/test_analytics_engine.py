"""Tests for AnalyticsEngine — daily trend, peak hour, overview, helpers."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, date
from collections import namedtuple

from analytics_engine import AnalyticsEngine


@pytest.fixture
def engine():
    return AnalyticsEngine()


class _Rows:
    """SQLAlchemy-like result that supports iteration and .first()."""
    def __init__(self, rows=None):
        self._rows = rows or []
    def first(self):
        return self._rows[0] if self._rows else None
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
        session.scalar = AsyncMock(side_effect=[100, 10, 5, 200, 30, 80])

        result = await engine.get_dashboard_overview(7, session)
        assert result["total_replies"] == 100
        assert result["today_replies"] == 10
        assert result["active_rules"] == 5
        assert result["total_subscribers"] == 200
        assert result["unique_commenters"] == 30
        assert result["change_pct"] == 25.0
        assert result["period_days"] == 7


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


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
