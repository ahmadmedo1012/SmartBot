from __future__ import annotations
"""Tests for SubscriberEngine — get_or_create, search, add/remove_tag."""
import pytest
from unittest.mock import AsyncMock, MagicMock, PropertyMock
from datetime import datetime, timezone
from collections import namedtuple

from subscriber_engine import SubscriberEngine
from models import Subscriber, Tag, SubscriberTag


def _mock_session():
    """Build a session mock compatible with SQLAlchemy async usage.

    Key detail: ``await session.execute(stmt)`` returns a sync ``Result``
    object whose methods (scalar_one_or_none, scalar, scalars) are all
    **synchronous**.  The ``Result`` must be a ``MagicMock``, not ``AsyncMock``.
    """
    s = AsyncMock()
    s.add = MagicMock()       # sync in SQLAlchemy async sessions
    s.commit = AsyncMock()
    s.refresh = AsyncMock()
    s.delete = AsyncMock()    # await session.delete(st) in remove_tag

    # This is the sync Result returned by await session.execute(...)
    result = MagicMock()
    result.scalar_one_or_none.return_value = None
    result.scalar.return_value = 0
    result.scalars.return_value.all.return_value = []
    result.first.return_value = None

    s.execute = AsyncMock(return_value=result)
    return s


class TestGetOrCreate:
    @pytest.fixture
    def engine(self):
        return SubscriberEngine()

    @pytest.mark.asyncio
    async def test_create_new(self, engine):
        """New fb_user_id creates a Subscriber."""
        session = _mock_session()
        session.execute.return_value.scalar_one_or_none.return_value = None

        sub = await engine.get_or_create("fb_1", name="أحمد علي", session=session)

        assert sub.fb_user_id == "fb_1"
        assert sub.first_name == "أحمد"
        session.add.assert_called_once()
        session.commit.assert_called_once()
        session.refresh.assert_called_once_with(sub)

    @pytest.mark.asyncio
    async def test_get_existing(self, engine):
        """Existing fb_user_id returns existing Subscriber, updates timestamp."""
        existing = Subscriber(
            id=1, fb_user_id="fb_1", name="أحمد علي", first_name="أحمد",
            platform="messenger",
            first_seen_at=datetime.now(timezone.utc),
            last_interaction_at=datetime.now(timezone.utc),
        )
        session = _mock_session()
        session.execute.return_value.scalar_one_or_none.return_value = existing

        sub = await engine.get_or_create("fb_1", session=session)

        assert sub.id == 1
        session.add.assert_not_called()
        session.commit.assert_called_once()

    @pytest.mark.asyncio
    async def test_create_fallback_name(self, engine):
        """When no name provided, first_name falls back to last 4 of fb_user_id."""
        session = _mock_session()
        session.execute.return_value.scalar_one_or_none.return_value = None

        sub = await engine.get_or_create("fb_abcd1234", session=session)

        assert sub.first_name == "1234"

    @pytest.mark.asyncio
    async def test_update_name_on_existing_with_blank_name(self, engine):
        """Existing subscriber with no name gets name filled in on second interaction."""
        existing = Subscriber(
            id=1, fb_user_id="fb_1", name="", first_name="",
            platform="messenger",
            first_seen_at=datetime.now(timezone.utc),
            last_interaction_at=datetime.now(timezone.utc),
        )
        session = _mock_session()
        session.execute.return_value.scalar_one_or_none.return_value = existing

        sub = await engine.get_or_create("fb_1", name="أحمد محمد", session=session)

        assert sub.name == "أحمد محمد"
        assert sub.first_name == "أحمد"


Row = namedtuple("Row", ["id", "name", "color"])


class TestSearch:
    @pytest.fixture
    def engine(self):
        return SubscriberEngine()

    @pytest.mark.asyncio
    async def test_search_with_query(self, engine):
        """Search by query returns matching subscribers."""
        session = _mock_session()
        # count returns 1
        session.execute.return_value.scalar.return_value = 1
        # main query returns a subscriber
        sub = Subscriber(
            id=1, fb_user_id="fb_1", name="أحمد", first_name="أحمد",
            platform="messenger", reply_count=0,
            first_seen_at=datetime.now(timezone.utc),
            last_interaction_at=datetime.now(timezone.utc),
        )
        session.execute.return_value.scalars.return_value.all.return_value = [sub]

        result = await engine.search(query="أحمد", session=session)
        assert result["total"] == 1
        assert len(result["items"]) == 1
        assert result["items"][0]["name"] == "أحمد"

    @pytest.mark.asyncio
    async def test_search_with_platform_filter(self, engine):
        """Platform filter narrows results — empty when no match."""
        session = _mock_session()
        session.execute.return_value.scalar.return_value = 0

        result = await engine.search(platform="instagram", session=session)
        assert result["total"] == 0
        assert result["items"] == []

    @pytest.mark.asyncio
    async def test_search_pagination(self, engine):
        """Pagination offset respects page/per_page."""
        session = _mock_session()
        session.execute.return_value.scalar.return_value = 2
        sub = Subscriber(
            id=1, fb_user_id="fb_1", name="A", first_name="A",
            platform="messenger", reply_count=0,
            first_seen_at=datetime.now(timezone.utc),
            last_interaction_at=datetime.now(timezone.utc),
        )
        session.execute.return_value.scalars.return_value.all.return_value = [sub]

        result = await engine.search(page=1, per_page=1, session=session)
        assert result["page"] == 1
        assert result["per_page"] == 1


class TestTag:
    @pytest.fixture
    def engine(self):
        return SubscriberEngine()

    @pytest.mark.asyncio
    async def test_add_tag(self, engine):
        """Add tag returns True on success."""
        session = _mock_session()

        ok = await engine.add_tag(1, 42, session)
        assert ok is True
        session.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_add_tag_duplicate(self, engine):
        """Duplicate tag (IntegrityError) returns True (already tagged)."""
        from sqlalchemy.exc import IntegrityError
        session = _mock_session()
        session.add.side_effect = IntegrityError("dup", None, None)

        ok = await engine.add_tag(1, 42, session)
        assert ok is True

    @pytest.mark.asyncio
    async def test_remove_tag(self, engine):
        """Remove tag returns True when SubscriberTag found."""
        st = SubscriberTag(subscriber_id=1, tag_id=42)
        session = _mock_session()
        session.execute.return_value.scalar_one_or_none.return_value = st

        ok = await engine.remove_tag(1, 42, session)
        assert ok is True
        session.delete.assert_called_once_with(st)

    @pytest.mark.asyncio
    async def test_remove_tag_not_found(self, engine):
        """Remove tag returns False when no SubscriberTag exists."""
        session = _mock_session()
        session.execute.return_value.scalar_one_or_none.return_value = None

        ok = await engine.remove_tag(1, 42, session)
        assert ok is False


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
