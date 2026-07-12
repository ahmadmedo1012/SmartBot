"""Flow Engine — Visual bot flow execution engine.
Executes ManyChat-style JSON graphs (nodes + edges) against Facebook comments.

Node types: TRIGGER, MESSAGE, CONDITION, ACTION, DELAY, GOAL, SEQUENCE
"""
import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from _utils import utcnow
from typing import Any

import httpx
from sqlalchemy import select, delete

from models import Flow, FlowExecution, Subscriber, SubscriberTag, Tag
from fb_client import FBClient
from bot import TextNormalizer

log = logging.getLogger("fb-flow")


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class FlowContext:
    """Runtime context for a single flow execution."""
    subscriber_id: int | None = None
    from_id: str = ""
    from_name: str = ""
    from_first: str = ""
    comment_id: str | None = None
    post_id: str | None = None
    text: str = ""
    trigger_type: str = ""  # keyword, post_comment, page_visit, scheduled, manual
    intent: str = ""  # classified intent
    platform: str = "messenger"  # messenger, instagram, whatsapp
    metadata: dict = field(default_factory=dict)


@dataclass
class FlowGraph:
    """Parsed flow graph — nodes, edges, and lookup maps."""
    flow_id: int
    name: str
    nodes: list[dict]
    edges: list[dict]
    node_map: dict[str, dict] = field(default_factory=dict)  # id -> node
    edge_map: dict[str, list[dict]] = field(default_factory=dict)  # source -> edges


# Common Arabic stop words (same set as bot.py for consistency)
_STOP_WORDS = frozenset({
    "في", "من", "إلى", "على", "عن", "مع", "كان", "هذا", "هذه", "ذلك",
    "تلك", "هو", "هي", "هم", "الذي", "التي", "الذين", "ما", "لم", "لن",
    "سوف", "قد", "لقد", "إن", "أن", "لا", "ما", "كل", "بعض", "نعم",
    "بلى", "ثم", "أو", "أم", "بل", "لأن", "حتى", "عند", "بين", "خلال",
    "دون", "غير", "مثل", "حول", "بسبب", "رغم", "قبل", "بعد", "فوق",
    "تحت", "داخل", "خارج", "أمام", "وراء", "يمين", "شمال", "فقط",
})

_NODE_TYPES = frozenset({"TRIGGER", "MESSAGE", "CONDITION", "ACTION", "DELAY", "GOAL", "SEQUENCE"})

_MAX_DEPTH = 50


# ---------------------------------------------------------------------------
# Flow Engine
# ---------------------------------------------------------------------------

class FlowEngine:
    """Executes ManyChat-style JSON graphs against Facebook comments."""

    def __init__(self, fb: FBClient):
        self.fb = fb

    # ── Graph loading ────────────────────────────────────────────────────────

    async def load_flow(self, flow_id: int, session) -> FlowGraph | None:
        """Load a flow from DB and build node/edge lookup maps."""
        result = await session.execute(select(Flow).where(Flow.id == flow_id))
        flow: Flow | None = result.scalar_one_or_none()
        if not flow:
            log.warning(f"Flow {flow_id} not found")
            return None

        nodes = flow.nodes if isinstance(flow.nodes, list) else json.loads(flow.nodes or "[]")
        edges = flow.edges if isinstance(flow.edges, list) else json.loads(flow.edges or "[]")

        node_map = {}
        for n in nodes:
            nid = n.get("id", "")
            if nid:
                node_map[nid] = n

        edge_map: dict[str, list[dict]] = {}
        for e in edges:
            src = e.get("source", "")
            if src:
                edge_map.setdefault(src, []).append(e)

        return FlowGraph(
            flow_id=flow.id, name=flow.name,
            nodes=nodes, edges=edges,
            node_map=node_map, edge_map=edge_map,
        )

    # ── Flow discovery ───────────────────────────────────────────────────────

    async def find_matching_flows(self, trigger_type: str, text: str = "",
                                  session=None) -> list[dict]:
        """Find active flows whose trigger nodes match the event."""
        result = await session.execute(
            select(Flow).where(Flow.status == "active").order_by(Flow.updated_at.desc())
        )
        flows = result.scalars().all()
        matches = []
        for flow in flows:
            nodes = flow.nodes if isinstance(flow.nodes, list) else json.loads(flow.nodes or "[]")
            for node in nodes:
                if node.get("type") != "TRIGGER":
                    continue
                config = node.get("data", {})
                if self._match_trigger(config, trigger_type, text):
                    matches.append({
                        "flow_id": flow.id,
                        "flow_name": flow.name,
                        "trigger_node": node,
                    })
                    break  # one trigger match per flow is enough
        return matches

    @staticmethod
    def _match_trigger(config: dict, trigger_type: str, text: str = "") -> bool:
        """Check if a trigger node config matches the incoming event."""
        expected_type = config.get("triggerType", "")
        if expected_type and expected_type != trigger_type:
            return False

        # page_visit / manual — always match
        if trigger_type in ("page_visit", "manual"):
            return True
        # post_comment — match any comment
        if trigger_type == "post_comment":
            return True

        # keyword match
        if trigger_type == "keyword" and text:
            keywords = config.get("keywords", [])
            if not keywords:
                return False
            match_mode = config.get("matchMode", "any")
            text_lower = text.lower().strip()
            text_norm = TextNormalizer.normalize(text_lower)

            matched = []
            for kw in keywords:
                kw_s = kw.strip().lower()
                if not kw_s or kw_s in _STOP_WORDS:
                    continue
                kw_norm = TextNormalizer.normalize(kw_s)
                matched.append(kw_norm in text_norm or kw_s in text_lower)

            if match_mode == "all":
                return all(matched) if matched else False
            elif match_mode == "exact":
                # exact: whole text must match ONE keyword (after normalize)
                return any(
                    TextNormalizer.normalize(kw.strip().lower()) == text_norm
                    for kw in keywords if kw.strip()
                )
            else:  # "any" default
                return any(matched)

        return False

    # ── Main execution ───────────────────────────────────────────────────────

    async def execute(self, flow_id: int, ctx: FlowContext, session) -> dict:
        """Execute a flow against a context. Returns full execution trace."""
        graph = await self.load_flow(flow_id, session)
        if not graph:
            return {"action": "flow_not_found", "flow_id": flow_id}

        # Find start node (first TRIGGER or first node)
        start_node = None
        for n in graph.nodes:
            if n.get("type") == "TRIGGER":
                start_node = n
                break
        if not start_node and graph.nodes:
            start_node = graph.nodes[0]
        if not start_node:
            return {"action": "no_nodes", "flow_id": flow_id}

        # Create execution record
        execution = FlowExecution(
            flow_id=flow_id,
            subscriber_id=ctx.subscriber_id,
            trigger_type=ctx.trigger_type,
            trigger_data={
                "from_id": ctx.from_id,
                "from_name": ctx.from_name,
                "from_first": ctx.from_first,
                "comment_id": ctx.comment_id,
                "post_id": ctx.post_id,
                "text": ctx.text[:500],
                "intent": ctx.intent,
                "platform": ctx.platform,
            },
            current_node_id=start_node.get("id", ""),
            status="active",
        )
        session.add(execution)
        try:
            await session.flush()
        except Exception as e:
            log.error(f"Failed to create execution record: {e}")
            return {"action": "db_error", "error": str(e)}

        execution_id = execution.id

        # Traverse
        try:
            trace = await self._traverse(start_node, ctx, graph, session, execution_id)
        except Exception as e:
            log.error(f"Flow {flow_id} execution {execution_id} error: {e}", exc_info=True)
            trace = {"action": "exception", "error": str(e)}

        # Update execution record
        status = "completed"
        if trace.get("action") in ("exception", "max_depth_exceeded"):
            status = "failed"
        elif trace.get("action") == "scheduled":
            status = "active"  # paused; will resume on delay callback
        expr = await session.get(FlowExecution, execution_id)
        if expr:
            expr.status = status
            expr.current_node_id = trace.get("node_id", "")
            if status in ("completed", "failed"):
                expr.completed_at = utcnow()
            if trace.get("action") == "exception":
                expr.error_log = {"error": trace.get("error", "")}

        # Update flow stats
        flow_row = await session.get(Flow, flow_id)
        if flow_row:
            flow_row.total_replies = (flow_row.total_replies or 0) + 1
            flow_row.last_triggered_at = utcnow()

        try:
            await session.commit()
        except Exception as e:
            log.error(f"Failed to finalize execution {execution_id}: {e}")

        return {"execution_id": execution_id, "trace": trace}

    # ── Graph traversal ──────────────────────────────────────────────────────

    async def _traverse(self, node: dict, ctx: FlowContext, graph: FlowGraph,
                        session, execution_id: int, depth: int = 0) -> dict:
        """Recursive graph traversal. Returns action dict."""
        if depth > _MAX_DEPTH:
            log.warning(f"Execution {execution_id}: max depth exceeded")
            return {"action": "max_depth_exceeded", "node_id": node.get("id", "")}

        node_type = node.get("type", "").upper()
        if node_type not in _NODE_TYPES:
            log.warning(f"Unknown node type: {node.get('type')} (id={node.get('id','')})")
            return {"action": "unknown_type", "node_id": node.get("id", "")}

        data = node.get("data", {}) or {}
        node_id = node.get("id", "")

        log.debug(f"Traverse depth={depth} type={node_type} id={node_id}")

        # ── TRIGGER ──
        if node_type == "TRIGGER":
            edges = graph.edge_map.get(node_id, [])
            if not edges:
                return {"action": "passed", "node_id": node_id}
            next_node_id = edges[0].get("target", "")
            next_node = graph.node_map.get(next_node_id)
            if not next_node:
                return {"action": "passed", "node_id": node_id}
            child = await self._traverse(next_node, ctx, graph, session, execution_id, depth + 1)
            return {"action": "passed", "node_id": node_id, "next": child}

        # ── MESSAGE ──
        if node_type == "MESSAGE":
            template = data.get("text", "")
            if not template:
                log.warning(f"MESSAGE node {node_id} has no text")
                rendered = ""
            else:
                rendered = await self._render_message(template, ctx)

            buttons = data.get("buttons", [])
            if buttons:
                log.info(f"MESSAGE {node_id}: buttons ({len(buttons)}) — not supported natively via comments")

            # Send via FB
            sent = False
            if rendered:
                if ctx.comment_id:
                    result = await self.fb.reply_to_comment(ctx.comment_id, rendered)
                    if result:
                        sent = True
                elif ctx.from_id:
                    result = await self.fb.send_dm(ctx.from_id, rendered)
                    if result:
                        sent = True

            if not sent and rendered:
                log.warning(f"MESSAGE {node_id}: failed to send (no comment_id or from_id, or API error)")
            else:
                log.info(f"MESSAGE {node_id}: sent \"{rendered[:60]}\"")

            edges = graph.edge_map.get(node_id, [])
            child = None
            if edges:
                next_id = edges[0].get("target", "")
                next_node = graph.node_map.get(next_id)
                if next_node:
                    child = await self._traverse(next_node, ctx, graph, session, execution_id, depth + 1)

            return {"action": "message_sent", "node_id": node_id, "message": rendered[:100], "next": child}

        # ── CONDITION ──
        if node_type == "CONDITION":
            field = data.get("field", "")
            operator = data.get("operator", "equals")
            value = data.get("value", "")
            passed = False

            if field == "intent":
                passed = self._eval_condition(ctx.intent, operator, value)
            elif field == "text":
                passed = self._eval_condition(ctx.text, operator, value)
            elif field == "tag_has" and ctx.subscriber_id:
                passed = await self._check_tag(value, ctx.subscriber_id, session)
            elif field == "custom":
                custom_val = ctx.metadata.get(data.get("customKey", ""), "")
                passed = self._eval_condition(custom_val, operator, value)
            else:
                log.warning(f"CONDITION {node_id}: unknown field={field} or no subscriber_id")

            # Find outgoing edge by handle
            edges = graph.edge_map.get(node_id, [])
            next_id = None
            for e in edges:
                handle = (e.get("sourceHandle") or "").lower()
                if passed and "true" in handle:
                    next_id = e.get("target", "")
                    break
                if not passed and "false" in handle:
                    next_id = e.get("target", "")
                    break
            if not next_id and edges:
                next_id = edges[0].get("target", "")

            child = None
            if next_id:
                next_node = graph.node_map.get(next_id)
                if next_node:
                    child = await self._traverse(next_node, ctx, graph, session, execution_id, depth + 1)

            action = "condition_matched" if passed else "condition_not_matched"
            return {"action": action, "node_id": node_id, "next": child}

        # ── ACTION ──
        if node_type == "ACTION":
            action_type = data.get("actionType", "")
            value = data.get("value", "")
            result = await self._execute_action(action_type, value, ctx, session)

            edges = graph.edge_map.get(node_id, [])
            child = None
            if edges:
                next_id = edges[0].get("target", "")
                next_node = graph.node_map.get(next_id)
                if next_node:
                    child = await self._traverse(next_node, ctx, graph, session, execution_id, depth + 1)

            return {**result, "node_id": node_id, "next": child}

        # ── DELAY ──
        if node_type == "DELAY":
            amount = int(data.get("amount", 0) or 0)
            unit = (data.get("unit") or "seconds").lower()
            unit_map = {"seconds": 1, "minutes": 60, "hours": 3600, "days": 86400}
            total_sec = amount * unit_map.get(unit, 1)

            if total_sec > 60:
                # Mark for resume — return schedule action; caller triggers later
                expr = await session.get(FlowExecution, execution_id)
                if expr:
                    expr.status = "active"
                    expr.current_node_id = node_id
                    try:
                        await session.commit()
                    except Exception:
                        pass
                log.info(f"DELAY {node_id}: scheduled {amount} {unit} ({total_sec}s)")
                return {"action": "scheduled", "node_id": node_id, "seconds": total_sec}
            else:
                await asyncio.sleep(total_sec)
                edges = graph.edge_map.get(node_id, [])
                child = None
                if edges:
                    next_id = edges[0].get("target", "")
                    next_node = graph.node_map.get(next_id)
                    if next_node:
                        child = await self._traverse(next_node, ctx, graph, session, execution_id, depth + 1)
                return {"action": "waited", "node_id": node_id, "seconds": total_sec, "next": child}

        # ── GOAL ──
        if node_type == "GOAL":
            expr = await session.get(FlowExecution, execution_id)
            if expr:
                expr.status = "completed"
                expr.completed_at = utcnow()
            return {"action": "flow_completed", "node_id": node_id, "status": "completed"}

        # ── SEQUENCE ──
        if node_type == "SEQUENCE":
            sub_flow_id = data.get("subFlowId") or data.get("sub_flow_id")
            if sub_flow_id and int(sub_flow_id) != graph.flow_id:
                log.info(f"SEQUENCE {node_id}: executing sub-flow {sub_flow_id}")
                return await self.execute(int(sub_flow_id), ctx, session)
            edges = graph.edge_map.get(node_id, [])
            child = None
            if edges:
                next_id = edges[0].get("target", "")
                next_node = graph.node_map.get(next_id)
                if next_node:
                    child = await self._traverse(next_node, ctx, graph, session, execution_id, depth + 1)
            return {"action": "sequence_continued", "node_id": node_id, "next": child}

        return {"action": "unhandled", "node_id": node_id}

    # ── Condition evaluation ─────────────────────────────────────────────────

    @staticmethod
    def _eval_condition(actual: str, operator: str, expected: str) -> bool:
        """Evaluate a condition operator against values."""
        try:
            if operator == "equals":
                return actual.strip().lower() == expected.strip().lower()
            elif operator == "contains":
                return expected.strip().lower() in actual.strip().lower()
            elif operator == "matches":
                import re
                return bool(re.search(expected, actual, re.IGNORECASE))
            elif operator == "gt":
                return float(actual) > float(expected)
            elif operator == "lt":
                return float(actual) < float(expected)
            elif operator == "not_empty":
                return bool(actual.strip())
        except (ValueError, AttributeError):
            return False
        return False

    async def _check_tag(self, tag_name: str, subscriber_id: int, session) -> bool:
        """Check if a subscriber has a specific tag."""
        try:
            stmt = (
                select(Tag)
                .join(SubscriberTag, Tag.id == SubscriberTag.tag_id)
                .where(SubscriberTag.subscriber_id == subscriber_id, Tag.name == tag_name)
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none() is not None
        except Exception as e:
            log.error(f"Tag check error: {e}")
            return False

    # ── Action execution ─────────────────────────────────────────────────────

    async def _execute_action(self, action_type: str, value: str,
                              ctx: FlowContext, session) -> dict:
        """Execute a single action node. Returns result dict."""
        if action_type == "tag_add":
            if not ctx.subscriber_id:
                return {"action": "tag_add", "success": False, "detail": "no subscriber"}
            try:
                tag = (await session.execute(select(Tag).where(Tag.name == value))).scalar_one_or_none()
                if not tag:
                    tag = Tag(name=value)
                    session.add(tag)
                    await session.flush()
                # Check dup
                existing = await session.execute(
                    select(SubscriberTag).where(
                        SubscriberTag.subscriber_id == ctx.subscriber_id,
                        SubscriberTag.tag_id == tag.id,
                    )
                )
                if not existing.scalar_one_or_none():
                    session.add(SubscriberTag(subscriber_id=ctx.subscriber_id, tag_id=tag.id))
                log.info(f"Tag '{value}' added to subscriber {ctx.subscriber_id}")
                return {"action": "tag_added", "success": True, "detail": value}
            except Exception as e:
                log.error(f"tag_add error: {e}")
                return {"action": "tag_add", "success": False, "detail": str(e)}

        if action_type == "tag_remove":
            if not ctx.subscriber_id:
                return {"action": "tag_remove", "success": False, "detail": "no subscriber"}
            try:
                tag = (await session.execute(select(Tag).where(Tag.name == value))).scalar_one_or_none()
                if tag:
                    await session.execute(
                        delete(SubscriberTag).where(
                            SubscriberTag.subscriber_id == ctx.subscriber_id,
                            SubscriberTag.tag_id == tag.id,
                        )
                    )
                return {"action": "tag_removed", "success": True, "detail": value}
            except Exception as e:
                log.error(f"tag_remove error: {e}")
                return {"action": "tag_remove", "success": False, "detail": str(e)}

        if action_type == "webhook":
            try:
                timeout = httpx.Timeout(10.0)
                async with httpx.AsyncClient(timeout=timeout) as client:
                    payload = {
                        "from_id": ctx.from_id,
                        "from_name": ctx.from_name,
                        "from_first": ctx.from_first,
                        "comment_id": ctx.comment_id,
                        "post_id": ctx.post_id,
                        "text": ctx.text,
                        "trigger_type": ctx.trigger_type,
                        "intent": ctx.intent,
                        "platform": ctx.platform,
                        "metadata": ctx.metadata,
                    }
                    r = await client.post(value, json=payload)
                    r.raise_for_status()
                log.info(f"Webhook {value} → {r.status_code}")
                return {"action": "webhook_called", "success": True, "detail": f"HTTP {r.status_code}"}
            except Exception as e:
                log.error(f"Webhook error: {e}")
                return {"action": "webhook", "success": False, "detail": str(e)}

        if action_type == "add_to_sequence":
            return {"action": "sequence_added", "success": True, "detail": value}

        if action_type == "dm":
            if not ctx.from_id:
                return {"action": "dm", "success": False, "detail": "no from_id"}
            try:
                msg = await self._render_message(value, ctx)
                result = await self.fb.send_dm(ctx.from_id, msg)
                if result:
                    return {"action": "dm_sent", "success": True, "detail": msg[:100]}
                return {"action": "dm", "success": False, "detail": "send failed"}
            except Exception as e:
                log.error(f"DM error: {e}")
                return {"action": "dm", "success": False, "detail": str(e)}

        log.warning(f"Unknown action type: {action_type}")
        return {"action": action_type, "success": False, "detail": f"unknown action type: {action_type}"}

    # ── Template rendering ───────────────────────────────────────────────────

    @staticmethod
    async def _render_message(template: str, ctx: FlowContext) -> str:
        """Replace template variables from FlowContext."""
        mention = f"@[{ctx.from_id}]" if ctx.from_id else ctx.from_first
        return (template
            .replace("{name}", ctx.from_first)
            .replace("{full_name}", ctx.from_name or ctx.from_first)
            .replace("{first_name}", ctx.from_first)
            .replace("{text}", ctx.text[:100])
            .replace("{comment}", ctx.text[:100])
            .replace("{mention}", mention)
            .replace("{intent}", ctx.intent)
            .replace("{trigger_type}", ctx.trigger_type))
