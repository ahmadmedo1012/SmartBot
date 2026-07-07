"""Analytics Engine — Advanced metrics, reporting, and insights."""
import json
import logging
from datetime import datetime, timedelta, date
from typing import Any

from sqlalchemy import select, func, cast, Date, extract, desc, and_, text

from models import Reply, Rule, BotLog, AnalyticsEvent, AISuggestion, Subscriber

log = logging.getLogger("fb-analytics")


class AnalyticsEngine:
    """Aggregation layer for dashboard analytics.

    All methods are async and expect an open SQLAlchemy async session.
    Date filtering uses a sliding window of ``days`` ending at the current
    UTC time.  Every method returns plain dicts / lists — no ORM objects
    leak out.
    """

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _cutoff(days: int) -> datetime:
        """Start of the analysis window."""
        return datetime.utcnow() - timedelta(days=days)

    @staticmethod
    def _pct_change(current: int, previous: int) -> float:
        """Percentage change, 0 when there is nothing to compare against."""
        if previous == 0:
            return 0.0
        return round((current - previous) / previous * 100, 1)

    # ------------------------------------------------------------------
    # Public API  (8 methods)
    # ------------------------------------------------------------------

    async def get_dashboard_overview(self, days: int, session) -> dict:
        """High-level KPIs for the dashboard hero cards.

        Returns total / today replies, active rules, subscriber count,
        and a percentage change versus the identical-length window
        immediately before ``days``.
        """
        now = datetime.utcnow()
        cutoff = self._cutoff(days)
        prior_cutoff = self._cutoff(days * 2)

        total_replies = (
            await session.scalar(
                select(func.count(Reply.id)).where(Reply.created_at >= cutoff)
            )
            or 0
        )

        today_replies = (
            await session.scalar(
                select(func.count(Reply.id)).where(
                    cast(Reply.created_at, Date) == now.date()
                )
            )
            or 0
        )

        active_rules = (
            await session.scalar(
                select(func.count(Rule.id)).where(Rule.enabled == True)
            )
            or 0
        )

        total_subs = (
            await session.scalar(select(func.count(Subscriber.id))) or 0
        )

        unique_commenters = (
            await session.scalar(
                select(func.count(func.distinct(Reply.commenter_name))).where(
                    and_(
                        Reply.commenter_name != "",
                        Reply.created_at >= cutoff,
                    )
                )
            )
            or 0
        )

        # Prior period comparison
        prior_replies = (
            await session.scalar(
                select(func.count(Reply.id)).where(
                    and_(
                        Reply.created_at >= prior_cutoff,
                        Reply.created_at < cutoff,
                    )
                )
            )
            or 0
        )

        return {
            "total_replies": total_replies,
            "today_replies": today_replies,
            "active_rules": active_rules,
            "total_subscribers": total_subs,
            "unique_commenters": unique_commenters,
            "prior_replies": prior_replies,
            "change_pct": self._pct_change(total_replies, prior_replies),
            "period_days": days,
        }

    async def get_daily_trend(self, days: int, session) -> list[dict]:
        """Daily reply count for the last ``days``, ordered ascending.

        Each entry: ``{"date": "YYYY-MM-DD", "replies": N}``.
        Days with zero replies are absent.
        """
        cutoff = self._cutoff(days)
        rows = await session.execute(
            select(
                cast(Reply.created_at, Date).label("d"),
                func.count(Reply.id).label("cnt"),
            )
            .where(Reply.created_at >= cutoff)
            .group_by(cast(Reply.created_at, Date))
            .order_by(cast(Reply.created_at, Date))
        )
        return [{"date": str(row.d), "replies": row.cnt} for row in rows]

    async def get_hourly_heatmap(self, days: int, session) -> list[dict]:
        """Hour-of-day × day-of-week heatmap cells.

        Returns one row per (hour, date) bucket that has at least one reply:
        ``{"hour": 0-23, "day": "YYYY-MM-DD", "count": N}``.
        """
        cutoff = self._cutoff(days)
        rows = await session.execute(
            select(
                extract("hour", Reply.created_at).label("h"),
                cast(Reply.created_at, Date).label("d"),
                func.count(Reply.id).label("cnt"),
            )
            .where(Reply.created_at >= cutoff)
            .group_by(text("h"), text("d"))
            .order_by(text("d"), text("h"))
        )
        return [
            {"hour": int(row.h), "day": str(row.d), "count": row.cnt}
            for row in rows
        ]

    async def get_top_rules(
        self, days: int, limit: int, session
    ) -> list[dict]:
        """Most frequently matched rules, with percentage share.

        Joins ``Reply`` → ``Rule`` and aggregates by rule.
        Returns ``{"rule_id", "name", "count", "percentage"}`` sorted
        descending by count, capped at ``limit``.
        """
        cutoff = self._cutoff(days)
        rows = await session.execute(
            select(
                Reply.rule_id,
                Rule.name,
                func.count(Reply.id).label("cnt"),
            )
            .join(Rule, Reply.rule_id == Rule.id)
            .where(
                and_(Reply.created_at >= cutoff, Reply.rule_id.isnot(None))
            )
            .group_by(Reply.rule_id, Rule.name)
            .order_by(desc("cnt"))
            .limit(limit)
        )
        results = [
            {"rule_id": row.rule_id, "name": row.name, "count": row.cnt}
            for row in rows
        ]
        total = sum(r["count"] for r in results) or 1
        for r in results:
            r["percentage"] = round(r["count"] / total * 100, 1)
        return results

    async def get_sentiment_trend(
        self, days: int, session
    ) -> list[dict]:
        """Sentiment distribution over time from ``AISuggestion`` rows.

        Pivots sentiment values into three columns per date:
        ``{"date", "positive", "negative", "neutral"}``.
        Unknown sentiment values are rolled into ``neutral``.
        """
        cutoff = self._cutoff(days)
        rows = await session.execute(
            select(
                cast(AISuggestion.created_at, Date).label("d"),
                AISuggestion.sentiment,
                func.count(AISuggestion.id).label("cnt"),
            )
            .where(AISuggestion.created_at >= cutoff)
            .group_by(
                cast(AISuggestion.created_at, Date), AISuggestion.sentiment
            )
            .order_by(cast(AISuggestion.created_at, Date))
        )
        trend: dict[str, dict] = {}
        for row in rows:
            d = str(row.d)
            if d not in trend:
                trend[d] = {
                    "date": d,
                    "positive": 0,
                    "negative": 0,
                    "neutral": 0,
                }
            sent = (row.sentiment or "neutral").lower()
            bucket = trend[d]
            if sent in bucket:
                bucket[sent] = row.cnt
            else:
                bucket["neutral"] += row.cnt
        return list(trend.values())

    async def get_peak_hour(self, days: int, session) -> int | None:
        """Hour (0-23) with the highest reply volume in the window.

        Returns ``None`` when there is no data.
        """
        cutoff = self._cutoff(days)
        row = (
            await session.execute(
                select(
                    extract("hour", Reply.created_at).label("h"),
                    func.count(Reply.id).label("cnt"),
                )
                .where(Reply.created_at >= cutoff)
                .group_by(text("h"))
                .order_by(desc("cnt"))
                .limit(1)
            )
        ).first()
        return int(row.h) if row else None

    async def get_top_commenters(
        self, days: int, limit: int, session
    ) -> list[dict]:
        """Most active commenters in the window.

        Each entry: ``{"name", "count", "last_comment"}`` where
        ``last_comment`` is an ISO-8601 string or ``None``.
        Filters out blank names.
        """
        cutoff = self._cutoff(days)
        rows = await session.execute(
            select(
                Reply.commenter_name,
                func.count(Reply.id).label("cnt"),
                func.max(Reply.created_at).label("last"),
            )
            .where(
                and_(
                    Reply.created_at >= cutoff,
                    Reply.commenter_name != "",
                )
            )
            .group_by(Reply.commenter_name)
            .order_by(desc("cnt"))
            .limit(limit)
        )
        return [
            {
                "name": row.commenter_name,
                "count": row.cnt,
                "last_comment": (
                    row.last.isoformat() if row.last else None
                ),
            }
            for row in rows
        ]

    async def get_period_comparison(
        self, days: int, session
    ) -> dict:
        """Compare current period to the same-length preceding period.

        Returns ``{"replies_before", "replies_now", "change_pct",
        "period_days"}``.  Useful for "vs last month" widgets.
        """
        now = datetime.utcnow()
        cutoff = now - timedelta(days=days)
        prior_cutoff = cutoff - timedelta(days=days)

        replies_now = (
            await session.scalar(
                select(func.count(Reply.id)).where(
                    and_(
                        Reply.created_at >= cutoff,
                        Reply.created_at <= now,
                    )
                )
            )
            or 0
        )

        replies_before = (
            await session.scalar(
                select(func.count(Reply.id)).where(
                    and_(
                        Reply.created_at >= prior_cutoff,
                        Reply.created_at < cutoff,
                    )
                )
            )
            or 0
        )

        return {
            "replies_before": replies_before,
            "replies_now": replies_now,
            "change_pct": self._pct_change(replies_now, replies_before),
            "period_days": days,
        }
