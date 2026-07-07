"""Tests for InboxEngine — fetch_all_conversations normalization, message routing."""
import pytest
from unittest.mock import AsyncMock, MagicMock
from inbox_engine import InboxEngine


@pytest.fixture
def fb_mock():
    m = AsyncMock()
    m.get_conversations = AsyncMock(return_value=[
        {"id": "conv_1", "subject": "مرحباً", "message_count": 3, "unread_count": 1,
         "senders": {"data": [{"id": "u1", "name": "أحمد"}]},
         "updated_time": "2026-07-06T12:00:00+0000"},
        {"id": "conv_2", "subject": "استفسار", "message_count": 1, "unread_count": 0,
         "senders": {"data": [{"id": "u2", "name": "محمد"}]},
         "updated_time": "2026-07-05T10:00:00+0000"},
    ])
    m.get_conversation_messages = AsyncMock(return_value=[
        {"id": "m1", "message": "hello", "from": {"id": "u1", "name": "أحمد"}, "created_time": "2026-07-06T12:00:00+0000"},
    ])
    m.send_conversation_message = AsyncMock(return_value={"id": "reply_ok"})
    return m


@pytest.fixture
def engine(fb_mock):
    return InboxEngine(fb_mock)


# ── fetch_all_conversations ───────────────────────────────────────────

class TestFetchAllConversations:
    @pytest.mark.asyncio
    async def test_normalizes_messenger(self, engine):
        """Messenger conversations get msg_ prefix and normalized fields."""
        session = AsyncMock()
        session.execute.return_value = []
        result = await engine.fetch_all_conversations(session)

        # 2 Messenger + 3 platform status items
        assert len(result) == 5
        first = result[0]
        assert first["id"] == "msg_conv_1"
        assert first["platform"] == "messenger"
        assert first["subject"] == "مرحباً"
        assert first["senders"] == [{"id": "u1", "name": "أحمد"}]
        assert first["message_count"] == 3
        assert first["unread_count"] == 1
        assert first["updated_time"] == "2026-07-06T12:00:00+0000"
        assert first["tags"] == []

        # Platform status items appended at end
        for i, prefix in enumerate(("ig_", "wa_", "tg_")):
            item = result[2 + i]
            assert item["status"] == "needs_config"
            assert item["id"].startswith(prefix)

    @pytest.mark.asyncio
    async def test_handles_no_senders(self, engine):
        """Conversation without senders data should not crash."""
        engine.fb.get_conversations = AsyncMock(return_value=[
            {"id": "conv_3", "subject": "x", "message_count": 0, "unread_count": 0,
             "updated_time": ""},
        ])
        session = AsyncMock()
        session.execute.return_value = []
        result = await engine.fetch_all_conversations(session)
        assert len(result) == 4  # 1 Messenger + 3 platform status
        assert result[0]["senders"] == []

    @pytest.mark.asyncio
    async def test_empty_fetch_returns_platform_status_only(self, engine):
        """When FB returns None, return only platform status items."""
        engine.fb.get_conversations = AsyncMock(return_value=None)
        session = AsyncMock()
        result = await engine.fetch_all_conversations(session)
        assert len(result) == 3
        assert all(r["status"] == "needs_config" for r in result)

    @pytest.mark.asyncio
    async def test_empty_fetch_list_returns_platform_status_only(self, engine):
        """When FB returns empty list, return only platform status items."""
        engine.fb.get_conversations = AsyncMock(return_value=[])
        session = AsyncMock()
        result = await engine.fetch_all_conversations(session)
        assert len(result) == 3
        assert all(r["status"] == "needs_config" for r in result)


# ── message routing by prefix ─────────────────────────────────────────

class TestMessageRouting:
    @pytest.mark.asyncio
    async def test_get_messenger_messages(self, engine):
        """msg_ prefix fetches via FB and normalizes."""
        session = AsyncMock()
        result = await engine.get_messages("msg_conv_1", session)
        assert len(result) == 1
        assert result[0]["id"] == "m1"
        assert result[0]["message"] == "hello"
        assert result[0]["platform"] == "messenger"

    @pytest.mark.asyncio
    async def test_send_reply_messenger(self, engine):
        """send_reply with msg_ prefix uses send_conversation_message."""
        session = AsyncMock()
        ok = await engine.send_reply("msg_conv_1", "رد", session)
        assert ok is True
        engine.fb.send_conversation_message.assert_called_once_with("conv_1", "رد")

    @pytest.mark.asyncio
    async def test_send_reply_non_messenger_returns_config_status(self, engine):
        """Non-Messenger prefix returns needs_config dict."""
        session = AsyncMock()
        result = await engine.send_reply("ig_conv_1", "رد", session)
        assert isinstance(result, dict)
        assert result["status"] == "needs_config"
        assert result["platform"] == "instagram"
        engine.fb.send_conversation_message.assert_not_called()

    @pytest.mark.asyncio
    async def test_non_messenger_messages_return_config(self, engine):
        """get_messages for IG/WA/TG returns needs_config messages."""
        session = AsyncMock()
        for prefix in ("ig_", "wa_", "tg_"):
            result = await engine.get_messages(f"{prefix}conv_1", session)
            assert len(result) == 1
            assert result[0]["status"] == "needs_config"
            assert result[0]["platform"] in ("instagram", "whatsapp", "telegram")


# ── _parse_id ─────────────────────────────────────────────────────────

class TestParseId:
    def test_strips_msg_prefix(self, engine):
        assert engine._parse_id("msg_conv_1") == ("msg_", "conv_1")

    def test_strips_ig_prefix(self, engine):
        assert engine._parse_id("ig_conv_1") == ("ig_", "conv_1")

    def test_bare_id_defaults_msg(self, engine):
        assert engine._parse_id("conv_1") == ("msg_", "conv_1")


# ── search_conversations ──────────────────────────────────────────────

class TestSearchConversations:
    @pytest.mark.asyncio
    async def test_search_by_subject(self, engine):
        convs = [{"subject": "مرحباً", "senders": []},
                 {"subject": "استفسار", "senders": []}]
        result = await engine.search_conversations("مرحباً", convs)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_search_by_sender(self, engine):
        convs = [{"subject": "", "senders": [{"name": "أحمد"}]},
                 {"subject": "", "senders": [{"name": "محمد"}]}]
        result = await engine.search_conversations("أحمد", convs)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_empty_query_returns_all(self, engine):
        convs = [{"subject": "a", "senders": []}, {"subject": "b", "senders": []}]
        result = await engine.search_conversations("", convs)
        assert len(result) == 2

    @pytest.mark.asyncio
    async def test_no_match_returns_empty(self, engine):
        convs = [{"subject": "hello", "senders": []}]
        result = await engine.search_conversations("xyz", convs)
        assert result == []


# ── get_conversation_stats ────────────────────────────────────────────

class TestConversationStats:
    @pytest.mark.asyncio
    async def test_returns_stats(self, engine):
        session = AsyncMock()
        session.scalar.return_value = 5
        result = await engine.get_conversation_stats(session)
        assert result["total_conversations"] == 2
        assert result["unread_count"] == 1  # only conv_1 has unread
        assert result["platform_breakdown"]["messenger"] == 2
        assert result["messages_today"] == 5


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
