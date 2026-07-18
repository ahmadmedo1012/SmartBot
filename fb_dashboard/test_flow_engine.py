from __future__ import annotations
"""Tests for FlowEngine — graph traversal, trigger matching, condition eval."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from flow_engine import FlowEngine, FlowContext, FlowGraph


def _async_session():
    """Create an AsyncMock session suitable for _traverse.

    GOAL / ACTION / DELAY nodes do ``await session.get(FlowExecution, id)``
    and ``await session.commit()`` — a plain MagicMock isn't awaitable.
    """
    s = AsyncMock()
    s.get.return_value = AsyncMock()
    s.commit.return_value = None
    return s


@pytest.fixture
def fb_mock():
    m = AsyncMock()
    m.reply_to_comment = AsyncMock(return_value={"id": "reply_1"})
    m.send_dm = AsyncMock(return_value=None)
    return m


@pytest.fixture
def engine(fb_mock):
    return FlowEngine(fb_mock)


# ── FlowContext + match_trigger ────────────────────────────────────────

class TestMatchTrigger:
    def test_keyword_any_match(self, engine):
        ctx = FlowContext(text="سعر", trigger_type="keyword")
        cfg = {"triggerType": "keyword", "keywords": ["سعر", "غش"], "matchMode": "any"}
        assert engine._match_trigger(cfg, "keyword", "سعر")

    def test_keyword_any_no_match(self, engine):
        ctx = FlowContext(text="مرحبا", trigger_type="keyword")
        cfg = {"triggerType": "keyword", "keywords": ["سعر"], "matchMode": "any"}
        assert not engine._match_trigger(cfg, "keyword", "مرحبا")

    def test_keyword_exact(self, engine):
        cfg = {"triggerType": "keyword", "keywords": ["سعر"], "matchMode": "exact"}
        assert engine._match_trigger(cfg, "keyword", "سعر")
        assert not engine._match_trigger(cfg, "keyword", "سعر المنتج")

    def test_keyword_all(self, engine):
        cfg = {"triggerType": "keyword", "keywords": ["سعر", "خصم"], "matchMode": "all"}
        assert engine._match_trigger(cfg, "keyword", "سعر خصم")
        assert not engine._match_trigger(cfg, "keyword", "سعر فقط")

    def test_post_comment_always(self, engine):
        cfg = {"triggerType": "post_comment"}
        assert engine._match_trigger(cfg, "post_comment")

    def test_page_visit_always(self, engine):
        cfg = {}
        assert engine._match_trigger(cfg, "page_visit")

    def test_trigger_type_mismatch(self, engine):
        cfg = {"triggerType": "keyword"}
        assert not engine._match_trigger(cfg, "post_comment")

    def test_stop_word_skipped(self, engine):
        cfg = {"triggerType": "keyword", "keywords": ["في", "سعر"]}
        assert engine._match_trigger(cfg, "keyword", "سعر")
        assert not engine._match_trigger(cfg, "keyword", "في البداية")

    def test_empty_keywords_no_match(self, engine):
        cfg = {"triggerType": "keyword", "keywords": []}
        assert not engine._match_trigger(cfg, "keyword", "سعر")


# ── _traverse with MESSAGE node ───────────────────────────────────────

class TestTraverse:
    @pytest.mark.asyncio
    async def test_trigger_passes_through(self, engine):
        """TRIGGER with an edge to a GOAL should pass through."""
        graph = FlowGraph(
            flow_id=1, name="test",
            nodes=[{"id": "t1", "type": "TRIGGER", "data": {}},
                   {"id": "g1", "type": "GOAL", "data": {}}],
            edges=[{"source": "t1", "target": "g1"}],
            node_map={"t1": {"id": "t1", "type": "TRIGGER", "data": {}},
                      "g1": {"id": "g1", "type": "GOAL", "data": {}}},
            edge_map={"t1": [{"source": "t1", "target": "g1"}]},
        )
        ctx = FlowContext()
        result = await engine._traverse(graph.node_map["t1"], ctx, graph, _async_session(), 1)
        assert result["action"] == "passed"
        assert result["next"]["action"] == "flow_completed"

    @pytest.mark.asyncio
    async def test_message_sends_reply(self, engine, fb_mock):
        """MESSAGE node with text sends via reply_to_comment."""
        graph = FlowGraph(
            flow_id=1, name="test",
            nodes=[{"id": "m1", "type": "MESSAGE", "data": {"text": "أهلاً {name}"}},
                   {"id": "g1", "type": "GOAL", "data": {}}],
            edges=[{"source": "m1", "target": "g1"}],
            node_map={"m1": {"id": "m1", "type": "MESSAGE", "data": {"text": "أهلاً {name}"}},
                      "g1": {"id": "g1", "type": "GOAL", "data": {}}},
            edge_map={"m1": [{"source": "m1", "target": "g1"}]},
        )
        ctx = FlowContext(comment_id="c1", from_first="أحمد")
        result = await engine._traverse(graph.node_map["m1"], ctx, graph, _async_session(), 1)
        assert result["action"] == "message_sent"
        assert "أهلاً" in result["message"]
        fb_mock.reply_to_comment.assert_called_once_with("c1", "أهلاً أحمد")

    @pytest.mark.asyncio
    async def test_message_no_text_does_not_send(self, engine, fb_mock):
        """MESSAGE node without text logs a warning, does not call FB."""
        graph = FlowGraph(
            flow_id=1, name="test",
            nodes=[{"id": "m1", "type": "MESSAGE", "data": {}}],
            edges=[],
            node_map={"m1": {"id": "m1", "type": "MESSAGE", "data": {}}},
            edge_map={},
        )
        ctx = FlowContext(comment_id="c1")
        result = await engine._traverse(graph.node_map["m1"], ctx, graph, _async_session(), 1)
        assert result["action"] == "message_sent"
        fb_mock.reply_to_comment.assert_not_called()

    @pytest.mark.asyncio
    async def test_message_sends_dm_when_no_comment_id(self, engine, fb_mock):
        """MESSAGE falls back to send_dm when comment_id is absent."""
        graph = FlowGraph(
            flow_id=1, name="test",
            nodes=[{"id": "m1", "type": "MESSAGE", "data": {"text": "اهلا"}}],
            edges=[],
            node_map={"m1": {"id": "m1", "type": "MESSAGE", "data": {"text": "اهلا"}}},
            edge_map={},
        )
        ctx = FlowContext(from_id="u1")
        await engine._traverse(graph.node_map["m1"], ctx, graph, _async_session(), 1)
        fb_mock.send_dm.assert_called_once_with("u1", "اهلا")


# ── CONDITION evaluation ──────────────────────────────────────────────

class TestCondition:
    def test_intent_equals(self, engine):
        assert engine._eval_condition("negative", "equals", "negative")
        assert not engine._eval_condition("positive", "equals", "negative")

    def test_text_contains(self, engine):
        assert engine._eval_condition("كم السعر", "contains", "سعر")
        assert not engine._eval_condition("مرحبا", "contains", "سعر")

    def test_regex_matches(self, engine):
        assert engine._eval_condition("call 0100", "matches", r"01\d+")
        assert not engine._eval_condition("hello", "matches", r"01\d+")

    def test_gt_lt(self, engine):
        assert engine._eval_condition("5", "gt", "3")
        assert not engine._eval_condition("2", "gt", "3")
        assert engine._eval_condition("2", "lt", "3")
        assert not engine._eval_condition("5", "lt", "3")

    def test_not_empty(self, engine):
        assert engine._eval_condition("hello", "not_empty", "")
        assert not engine._eval_condition("", "not_empty", "")
        assert not engine._eval_condition("  ", "not_empty", "")

    def test_bad_operator(self, engine):
        assert not engine._eval_condition("x", "nonexistent", "y")

    def test_garbage_value_returns_false(self, engine):
        assert not engine._eval_condition("abc", "gt", "def")


# ── _traverse with CONDITION node ─────────────────────────────────────

class TestConditionTraverse:
    @pytest.mark.asyncio
    async def test_condition_intent_true_branch(self, engine):
        """CONDITION on intent=true should follow true edge."""
        graph = FlowGraph(
            flow_id=1, name="test",
            nodes=[{"id": "c1", "type": "CONDITION", "data": {"field": "intent", "operator": "equals", "value": "negative"}},
                   {"id": "g1", "type": "GOAL", "data": {}}],
            edges=[{"source": "c1", "target": "g1", "sourceHandle": "true"},
                   {"source": "c1", "target": "g1", "sourceHandle": "false"}],
            node_map={"c1": {"id": "c1", "type": "CONDITION", "data": {"field": "intent", "operator": "equals", "value": "negative"}},
                      "g1": {"id": "g1", "type": "GOAL", "data": {}}},
            edge_map={"c1": [{"source": "c1", "target": "g1", "sourceHandle": "true"},
                             {"source": "c1", "target": "g1", "sourceHandle": "false"}]},
        )
        ctx = FlowContext(intent="negative")
        result = await engine._traverse(graph.node_map["c1"], ctx, graph, _async_session(), 1)
        assert result["action"] == "condition_matched"

    @pytest.mark.asyncio
    async def test_condition_intent_false_branch(self, engine):
        ctx = FlowContext(intent="positive")
        graph = FlowGraph(
            flow_id=1, name="test",
            nodes=[{"id": "c1", "type": "CONDITION", "data": {"field": "intent", "operator": "equals", "value": "negative"}},
                   {"id": "g1", "type": "GOAL", "data": {}}],
            edges=[{"source": "c1", "target": "g1", "sourceHandle": "true"},
                   {"source": "c1", "target": "g1", "sourceHandle": "false"}],
            node_map={"c1": {"id": "c1", "type": "CONDITION", "data": {"field": "intent", "operator": "equals", "value": "negative"}},
                      "g1": {"id": "g1", "type": "GOAL", "data": {}}},
            edge_map={"c1": [{"source": "c1", "target": "g1", "sourceHandle": "true"},
                             {"source": "c1", "target": "g1", "sourceHandle": "false"}]},
        )
        result = await engine._traverse(graph.node_map["c1"], ctx, graph, _async_session(), 1)
        assert result["action"] == "condition_not_matched"

    @pytest.mark.asyncio
    async def test_condition_unknown_field(self, engine):
        """Unknown field should not crash, action should be not_matched."""
        graph = FlowGraph(
            flow_id=1, name="test",
            nodes=[{"id": "c1", "type": "CONDITION", "data": {"field": "bogus", "operator": "equals", "value": "x"}},
                   {"id": "g1", "type": "GOAL", "data": {}}],
            edges=[{"source": "c1", "target": "g1", "sourceHandle": "true"}],
            node_map={"c1": {"id": "c1", "type": "CONDITION", "data": {"field": "bogus", "operator": "equals", "value": "x"}},
                      "g1": {"id": "g1", "type": "GOAL", "data": {}}},
            edge_map={"c1": [{"source": "c1", "target": "g1", "sourceHandle": "true"}]},
        )
        ctx = FlowContext()
        result = await engine._traverse(graph.node_map["c1"], ctx, graph, _async_session(), 1)
        assert result["action"] in ("condition_not_matched", "condition_matched")


# ── GOAL node termination ─────────────────────────────────────────────

class TestGoal:
    @pytest.mark.asyncio
    async def test_goal_terminates(self, engine):
        """GOAL node returns flow_completed."""
        graph = FlowGraph(
            flow_id=1, name="test",
            nodes=[{"id": "g1", "type": "GOAL", "data": {}}],
            edges=[],
            node_map={"g1": {"id": "g1", "type": "GOAL", "data": {}}},
            edge_map={},
        )
        ctx = FlowContext()
        result = await engine._traverse(graph.node_map["g1"], ctx, graph, _async_session(), 1)
        assert result["action"] == "flow_completed"
        assert result["status"] == "completed"


# ── Max depth guard ───────────────────────────────────────────────────

class TestMaxDepth:
    @pytest.mark.asyncio
    async def test_max_depth_exceeded(self, engine):
        graph = FlowGraph(
            flow_id=1, name="test",
            nodes=[{"id": "t1", "type": "TRIGGER", "data": {}}],
            edges=[],
            node_map={"t1": {"id": "t1", "type": "TRIGGER", "data": {}}},
            edge_map={},
        )
        ctx = FlowContext()
        result = await engine._traverse(graph.node_map["t1"], ctx, graph, _async_session(), 1, depth=999)
        assert result["action"] == "max_depth_exceeded"


# ── _render_message ───────────────────────────────────────────────────

class TestRenderMessage:
    @pytest.mark.asyncio
    async def test_render_name(self, engine):
        ctx = FlowContext(from_first="أحمد", from_name="أحمد علي", from_id="123")
        result = await engine._render_message("{name} مرحبا", ctx)
        assert result == "أحمد مرحبا"

    @pytest.mark.asyncio
    async def test_render_full_name(self, engine):
        ctx = FlowContext(from_first="أحمد", from_name="أحمد علي")
        result = await engine._render_message("{full_name}", ctx)
        assert result == "أحمد علي"

    @pytest.mark.asyncio
    async def test_render_mention_with_id(self, engine):
        ctx = FlowContext(from_id="12345", from_first="احمد")
        result = await engine._render_message("{mention}", ctx)
        assert result == "@[12345]"

    @pytest.mark.asyncio
    async def test_render_mention_fallback(self, engine):
        ctx = FlowContext(from_first="احمد")
        result = await engine._render_message("{mention}", ctx)
        assert result == "احمد"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
