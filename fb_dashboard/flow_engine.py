from __future__ import annotations

"""Flow Engine — Visual bot flow execution engine (P43-SB1: production revival).

Executes ManyChat-style JSON graphs (nodes + edges) for Facebook comments and
Messenger conversations.

Node types: TRIGGER, MESSAGE, CONDITION, ACTION, DELAY, GOAL, SEQUENCE

History: dormant since Sprint 1 (production traffic used bot.py keyword rules
only, reachable solely via POST /api/flows/{id}/test). P43-SB1 revives it in
place as the REAL automation executor:

  * ``FlowEngine`` — the shared graph walker (loading, trigger matching,
    condition evaluation, actions, template rendering). The legacy recursive
    ``execute()``/``_traverse()`` surface keeps serving the /test endpoint.
  * ``validate_flow_structure`` / ``validate_flow_graph`` — draft-level and
    publish-level JSON graph validation (Arabic errors).
  * ``FlowRuntime`` — the resumable state machine behind FlowExecution rows:
    every inbound Messenger message advances (or starts) one run per
    subscriber, MESSAGE nodes send DMs through the tenant FB client with
    Message-flow attribution, DELAY nodes park the run with ``resume_at``
    until the automation beat (heartbeat / piggyback / bot-cycle) resumes it.
  * ``handle_incoming_message`` — the messenger_service ingestion hook.
  * ``resume_due_flow_executions`` — the beat-side delay-resume sweep
    (idempotent atomic claim, per-execution tenant scoping).

Safety rails (each pinned by tests/test_p43_flow_runtime.py):
  * ONE active FlowExecution per subscriber at a time;
  * hard cap of executed nodes per message/beat advance (loop guard);
  * flow-start cooldown per (tenant, subscriber, flow) — the pipeline
    CooldownManager pattern;
  * has_flows is enforced at flow ACTIVATION (routers/flows.py publish),
    never at execution (downgraded tenants keep their live runs — the
    creation-time-only family doctrine);
  * any runtime error marks the execution ``failed`` with an ``error_log``
    and NEVER breaks the live reply path (the caller falls back to the
    normal keyword rules).
"""
import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import timedelta

import httpx
from _utils import utcnow
from bot import TextNormalizer
from bot_engine.cooldown import CooldownManager
from bot_engine.text import TemplateRenderer
from database import AsyncSessionLocal
from fb_client import FBClient
from models import (
    BotLog,
    Conversation,
    Flow,
    FlowExecution,
    Message,
    Subscriber,
    SubscriberTag,
    Tag,
)
from sqlalchemy import delete, func, select, update

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
    # P43-SB1: the Messenger conversation binding (runtime advance key)
    page_id: str = ""
    conversation_fb_id: str = ""
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
    "سوف", "قد", "لقد", "إن", "أن", "لا", "كل", "بعض", "نعم",
    "بلى", "ثم", "أو", "أم", "بل", "لأن", "حتى", "عند", "بين", "خلال",
    "دون", "غير", "مثل", "حول", "بسبب", "رغم", "قبل", "بعد", "فوق",
    "تحت", "داخل", "خارج", "أمام", "وراء", "يمين", "شمال", "فقط",
})

_NODE_TYPES = frozenset({"TRIGGER", "MESSAGE", "CONDITION", "ACTION", "DELAY", "GOAL", "SEQUENCE"})

_MAX_DEPTH = 50


# ---------------------------------------------------------------------------
# P43-SB1 — graph validation (draft structure + publish-level integrity)
# ---------------------------------------------------------------------------

def validate_flow_structure(nodes, edges) -> list[str]:
    """Draft-level JSON structure check (used by POST/PUT /api/flows).

    Empty node/edge lists are ALLOWED (a draft may start blank); anything
    present must be structurally sound: nodes are dicts with unique ids and
    known types, edges are dicts whose source/target reference declared
    nodes. Returns a list of Arabic error strings (empty = valid).
    """
    errors: list[str] = []
    if nodes is None:
        nodes = []
    if edges is None:
        edges = []
    if not isinstance(nodes, list) or not isinstance(edges, list):
        return ["بنية المسار غير صالحة — يجب أن تكون nodes و edges قائمتين"]
    node_ids: set[str] = set()
    for n in nodes:
        if not isinstance(n, dict):
            errors.append("كل عقدة يجب أن تكون كائناً (object)")
            continue
        nid = str(n.get("id") or "")
        if not nid:
            errors.append("عقدة بلا معرّف (id) — كل عقدة تحتاج معرّفاً فريداً")
        elif nid in node_ids:
            errors.append(f"معرّف عقدة مكرر: {nid}")
        else:
            node_ids.add(nid)
        ntype = str(n.get("type") or "").upper()
        if ntype not in _NODE_TYPES:
            errors.append(f"نوع عقدة غير معروف: {ntype or '(فارغ)'} — الأنواع المدعومة: {', '.join(sorted(_NODE_TYPES))}")
    for e in edges:
        if not isinstance(e, dict):
            errors.append("كل وصلة (edge) يجب أن تكون كائناً (object)")
            continue
        src = str(e.get("source") or "")
        tgt = str(e.get("target") or "")
        if not src:
            errors.append("وصلة بلا عقدة مصدر (source)")
        elif node_ids and src not in node_ids:
            errors.append(f"الوصلة تبدأ من عقدة غير معرّفة: {src}")
        if not tgt:
            errors.append("وصلة بلا عقدة هدف (target)")
        elif node_ids and tgt not in node_ids:
            errors.append(f"الوصلة تؤدي إلى عقدة غير معرّفة: {tgt}")
    return errors


def validate_flow_graph(nodes, edges) -> list[str]:
    """Publish-level validation (POST /api/flows/{id}/publish).

    Structure (validate_flow_structure) PLUS the runtime integrity contract:
      * at least one node;
      * EXACTLY one TRIGGER node (the entry — the runtime starts from it and
        mid-flow edges back to it act as keyword-wait gates);
      * no orphan cycles: every node must be able to reach a terminal node
        (a GOAL, or a dead-end — an implicit completion). A cycle with no
        exit would park the execution forever on the step cap.
    Returns a list of Arabic error strings (empty = publishable).
    """
    errors = validate_flow_structure(nodes, edges)
    if errors:
        return errors
    if not nodes:
        return ["لا توجد عقد في المسار — أضف عقدة تشغيل (TRIGGER) وعقدة رسالة قبل النشر"]
    node_map = {
        str(n.get("id") or ""): n for n in nodes
        if isinstance(n, dict) and n.get("id")
    }
    triggers = [n for n in node_map.values() if str(n.get("type") or "").upper() == "TRIGGER"]
    if len(triggers) != 1:
        errors.append(
            "يجب أن يحتوي المسار على عقدة تشغيل (TRIGGER) واحدة بالضبط — "
            f"الموجود حالياً: {len(triggers)}"
        )
    # adjacency + reverse adjacency
    outgoing: dict[str, set[str]] = {}
    reverse: dict[str, set[str]] = {}
    for e in edges:
        if not isinstance(e, dict):
            continue
        src = str(e.get("source") or "")
        tgt = str(e.get("target") or "")
        if src in node_map and tgt in node_map:
            outgoing.setdefault(src, set()).add(tgt)
            reverse.setdefault(tgt, set()).add(src)
    # terminals: GOAL nodes or nodes with no outgoing edges (implicit end)
    terminals = {
        nid for nid, n in node_map.items()
        if str(n.get("type") or "").upper() == "GOAL" or nid not in outgoing
    }
    # reverse BFS from terminals → the set of nodes that CAN terminate
    can_terminate = set(terminals)
    stack = list(terminals)
    while stack:
        cur = stack.pop()
        for prev in reverse.get(cur, ()):
            if prev not in can_terminate:
                can_terminate.add(prev)
                stack.append(prev)
    orphans = sorted(nid for nid in node_map if nid not in can_terminate)
    if orphans:
        shown = ", ".join(orphans[:5])
        more = f" (+{len(orphans) - 5} أخرى)" if len(orphans) > 5 else ""
        errors.append(
            "يوجد مسار مغلق بلا نهاية (دورة يتيمة): العقد "
            f"{shown}{more} لا تصل إلى أي عقدة إنهاء (GOAL أو نهاية مسار) — "
            "أضف مخرجاً من الدورة"
        )
    return errors


def _build_graph(flow: Flow) -> FlowGraph:
    """Build a FlowGraph from a Flow row without a DB round-trip."""
    nodes = flow.nodes if isinstance(flow.nodes, list) else json.loads(flow.nodes or "[]")
    edges = flow.edges if isinstance(flow.edges, list) else json.loads(flow.edges or "[]")
    node_map = {}
    for n in nodes:
        nid = str((n or {}).get("id", "") if isinstance(n, dict) else "")
        if nid:
            node_map[nid] = n
    edge_map: dict[str, list[dict]] = {}
    for e in edges:
        src = str((e or {}).get("source", "") if isinstance(e, dict) else "")
        if src:
            edge_map.setdefault(src, []).append(e)
    return FlowGraph(
        flow_id=flow.id, name=flow.name,
        nodes=nodes, edges=edges, node_map=node_map, edge_map=edge_map,
    )


# ---------------------------------------------------------------------------
# Flow Engine — the shared graph walker
# ---------------------------------------------------------------------------

class FlowEngine:
    """Executes ManyChat-style JSON graphs against Facebook comments."""

    def __init__(self, fb: FBClient, tenant_id: int = 0):
        self.fb = fb
        self.tenant_id = tenant_id

    # ── Graph loading ────────────────────────────────────────────────────────

    async def load_flow(self, flow_id: int, session) -> FlowGraph | None:
        """Load a flow from DB and build node/edge lookup maps."""
        result = await session.execute(
            select(Flow).where(Flow.id == flow_id, Flow.tenant_id == self.tenant_id)
        )
        flow: Flow | None = result.scalar_one_or_none()
        if not flow:
            log.warning(f"Flow {flow_id} not found")
            return None
        return _build_graph(flow)

    @staticmethod
    def _match_trigger(config: dict, trigger_type: str, text: str = "") -> bool:
        """Check if a trigger node config matches the incoming event.

        P43-SB1: keyword matching now flows through the SAME normalizer the
        keyword rules use (bot_engine/matching semantics —
        ``normalize_for_matching`` strips Libyan prefixes too), so a flow
        TRIGGER and a rule keyword see identical text.
        """
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
            text_norm = TextNormalizer.normalize_for_matching(text_lower)

            matched = []
            for kw in keywords:
                kw_s = str(kw).strip().lower()
                if not kw_s or kw_s in _STOP_WORDS:
                    continue
                kw_norm = TextNormalizer.normalize_for_matching(kw_s)
                matched.append(kw_norm in text_norm or kw_s in text_lower)

            if match_mode == "all":
                return all(matched) if matched else False
            elif match_mode == "exact":
                # exact: whole text must match ONE keyword (after normalize)
                return any(
                    TextNormalizer.normalize_for_matching(str(kw).strip().lower()) == text_norm
                    for kw in keywords if str(kw).strip()
                )
            else:  # "any" default
                return any(matched)

        return False

    # ── Main execution (legacy /test surface — kept verbatim) ───────────────

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
            log.error(f"Failed to create execution record: {e}", exc_info=True)
            return {"action": "db_error", "error": str(e)}

        execution_id = execution.id

        # Traverse
        try:
            trace = await self._traverse(start_node, ctx, graph, session, execution_id)
        except Exception as e:
            log.exception(f"Flow {flow_id} execution {execution_id} error: {e}")
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
            log.error(f"Failed to finalize execution {execution_id}: {e}", exc_info=True)

        return {"execution_id": execution_id, "trace": trace}

    # ── Graph traversal (recursive — the /test walker) ──────────────────────

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
            subscriber = None
            if ctx.subscriber_id:
                subscriber = await session.get(Subscriber, ctx.subscriber_id)
            passed = await self._eval_condition_node(data, ctx, session, subscriber)

            # Find outgoing edge by handle
            edges = graph.edge_map.get(node_id, [])
            next_id = None
            for e in edges:
                handle = (e.get("sourceHandle") or "").lower()
                if passed and ("true" in handle or "yes" in handle):
                    next_id = e.get("target", "")
                    break
                if not passed and ("false" in handle or "no" in handle):
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
            result = await self._execute_action_node(data, ctx, session)

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
                        # r133-A6 (b): resume state not persisted — the next
                        # resume may replay this DELAY node.
                        log.warning("flow delay state persist failed (exec=%s)",
                                    execution_id, exc_info=True)
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
        """Evaluate a condition operator against values.

        P43-SB1: the operator set grows to the flat spec vocabulary —
        ``eq``/``ne``/``contains``/``exists`` (plus the legacy aliases
        equals/not_empty and the numeric/regex family). Unknown → False.
        """
        op = (operator or "").strip().lower()
        # P43 aliases → canonical legacy ops
        if op in ("eq", "equals", "=="):
            op = "equals"
        elif op in ("ne", "not_equals", "!="):
            op = "not_equals"
        elif op in ("exists", "not_empty"):
            op = "not_empty"
        try:
            if op == "equals":
                return str(actual).strip().lower() == str(expected).strip().lower()
            elif op == "not_equals":
                return str(actual).strip().lower() != str(expected).strip().lower()
            elif op == "contains":
                return str(expected).strip().lower() in str(actual).strip().lower()
            elif op == "matches":
                import re
                return bool(re.search(str(expected), str(actual), re.IGNORECASE))
            elif op == "gt":
                return float(actual) > float(expected)
            elif op == "lt":
                return float(actual) < float(expected)
            elif op == "not_empty":
                return bool(str(actual or "").strip())
        except (ValueError, AttributeError, TypeError):
            return False
        return False

    async def _eval_condition_node(self, data: dict, ctx: FlowContext,
                                   session, subscriber: Subscriber | None) -> bool:
        """Evaluate a CONDITION node config against the LIVE context.

        P43-SB1 flat schema: ``{"left": "var:city" | "tag:VIP" | "text" |
        "intent", "op": "eq|ne|contains|exists", "right": "..."}`` —
        ``left`` (or the legacy ``var`` key) resolves against
        subscriber.custom_data / subscriber tags / the current message.
        The legacy ``field``/``operator``/``value`` schema keeps working
        (intent / text / tag_has / custom).
        """
        left = str(data.get("left") or data.get("var") or "").strip()
        op = str(data.get("op") or data.get("operator") or "eq")
        right = data.get("right", data.get("value", ""))
        right_s = "" if right is None else str(right)

        if left:
            if left.startswith("var:"):
                key = left[4:]
                custom = (subscriber.custom_data or {}) if subscriber is not None else {}
                actual = custom.get(key)
                return self._eval_condition(
                    "" if actual is None else str(actual), op, right_s)
            if left.startswith("tag:"):
                tag_name = left[4:]
                if subscriber is None:
                    return False
                has = await self._check_tag(tag_name, subscriber.id, session)
                # exists reads the tag itself (an actual of "false" would be
                # non-empty text and lie through the not_empty operator)
                if op.strip().lower() in ("exists", "not_empty"):
                    return has
                return self._eval_condition("true" if has else "false", op,
                                            right_s or "true")
            if left == "text":
                return self._eval_condition(ctx.text, op, right_s)
            if left == "intent":
                return self._eval_condition(ctx.intent, op, right_s)
            # a bare key name → treat as a custom_data field (forgiving)
            if subscriber is not None:
                custom = subscriber.custom_data or {}
                if left in custom:
                    return self._eval_condition(str(custom[left]), op, right_s)
            return self._eval_condition(left, op, right_s)

        # ── legacy schema ──
        field = str(data.get("field") or "")
        operator = str(data.get("operator") or "equals")
        value = data.get("value", "")
        value_s = "" if value is None else str(value)
        if field == "intent":
            return self._eval_condition(ctx.intent, operator, value_s)
        if field == "text":
            return self._eval_condition(ctx.text, operator, value_s)
        if field == "tag_has" and ctx.subscriber_id:
            return await self._check_tag(value_s, ctx.subscriber_id, session)
        if field == "custom":
            custom_val = ctx.metadata.get(str(data.get("customKey", "")), "")
            return self._eval_condition(str(custom_val), operator, value_s)
        if field and subscriber is not None:
            # P43: unknown field names fall back to custom_data lookup
            custom = subscriber.custom_data or {}
            if field in custom:
                return self._eval_condition(str(custom[field]), operator, value_s)
        log.warning(f"CONDITION: unknown field={field!r} or no subscriber context")
        return False

    async def _check_tag(self, tag_name: str, subscriber_id: int, session) -> bool:
        """Check if a subscriber has a specific tag."""
        try:
            stmt = (
                select(Tag)
                .join(SubscriberTag, Tag.id == SubscriberTag.tag_id)
                .where(
                    Tag.tenant_id == self.tenant_id,
                    SubscriberTag.subscriber_id == subscriber_id,
                    Tag.name == tag_name,
                )
            )
            result = await session.execute(stmt)
            return result.scalar_one_or_none() is not None
        except Exception as e:
            log.error(f"Tag check error: {e}", exc_info=True)
            return False

    # ── Action execution ─────────────────────────────────────────────────────

    async def _execute_action_node(self, data: dict, ctx: FlowContext,
                                   session) -> dict:
        """Execute a single ACTION node (P43-SB1 dispatch).

        Supported action types (``data.actionType``, with the P43 snake_case
        aliases accepted): ``tag_add``/``add_tag`` · ``tag_remove``/
        ``remove_tag`` · ``set_field`` · ``add_to_sequence`` (REAL enrollment
        via sequence_engine) · ``webhook`` (SSRF-guarded) · ``dm``.
        """
        action_type = str(data.get("actionType") or "")
        value = data.get("value", "")
        # P43 flat extras: set_field carries key+value; add_to_sequence carries sequenceId
        if action_type in ("add_tag", "remove_tag", "tag_add", "tag_remove"):
            value = data.get("tag", value)
        if action_type == "set_field":
            return await self._action_set_field(data, ctx, session)
        return await self._execute_action(action_type, value, ctx, session, data)

    async def _action_set_field(self, data: dict, ctx: FlowContext, session) -> dict:
        """P43-SB1 ACTION set_field — write a key into subscriber.custom_data."""
        key = str(data.get("key") or data.get("field") or "").strip()
        raw = data.get("value", "")
        if not key:
            return {"action": "set_field", "success": False, "detail": "no key"}
        if not ctx.subscriber_id:
            return {"action": "set_field", "success": False, "detail": "no subscriber"}
        subscriber = await session.get(Subscriber, ctx.subscriber_id)
        if subscriber is None or subscriber.tenant_id != self.tenant_id:
            return {"action": "set_field", "success": False, "detail": "subscriber not in tenant"}
        custom = dict(subscriber.custom_data or {})
        custom[key] = raw
        subscriber.custom_data = custom
        log.info("custom_data[%r]=%r set for subscriber %s (flow action)",
                 key, raw, ctx.subscriber_id)
        return {"action": "set_field", "success": True, "detail": key}

    async def _execute_action(self, action_type: str, value: str,
                              ctx: FlowContext, session,
                              data: dict | None = None) -> dict:
        """Execute a single action node. Returns result dict."""
        data = data or {}

        if action_type in ("tag_add", "add_tag"):
            if not ctx.subscriber_id:
                return {"action": "tag_add", "success": False, "detail": "no subscriber"}
            try:
                tag = (await session.execute(select(Tag).where(Tag.tenant_id == self.tenant_id, Tag.name == value))).scalar_one_or_none()
                if not tag:
                    tag = Tag(name=value, tenant_id=self.tenant_id)
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
                log.error(f"tag_add error: {e}", exc_info=True)
                return {"action": "tag_add", "success": False, "detail": str(e)}

        if action_type in ("tag_remove", "remove_tag"):
            if not ctx.subscriber_id:
                return {"action": "tag_remove", "success": False, "detail": "no subscriber"}
            try:
                tag = (await session.execute(select(Tag).where(Tag.tenant_id == self.tenant_id, Tag.name == value))).scalar_one_or_none()
                if tag:
                    await session.execute(
                        delete(SubscriberTag).where(
                            SubscriberTag.subscriber_id == ctx.subscriber_id,
                            SubscriberTag.tag_id == tag.id,
                        )
                    )
                return {"action": "tag_removed", "success": True, "detail": value}
            except Exception as e:
                log.error(f"tag_remove error: {e}", exc_info=True)
                return {"action": "tag_remove", "success": False, "detail": str(e)}

        if action_type == "webhook":
            # v15-E4 (D2-H2): the SAME SSRF guard the image fetcher uses
            # (ai_service.assert_safe_outbound_url): https-only + literal-IP
            # checks + DNS RESOLUTION — a flow node's URL is user-configurable
            # (any editor can create a flow and run /test), and the old code
            # POSTed subscriber PII (from_id/name/text/intent) to ANY address,
            # including 169.254.169.254 / RFC1918 / ::1. Rejected here → clean
            # Arabic failure, no request leaves the server. httpx keeps its
            # 10s timeout and never follows redirects (explicit).
            try:
                from ai_service import UnsafeImageUrlError, assert_safe_outbound_url
                await assert_safe_outbound_url(value, label="رابط الويبهوك")
            except UnsafeImageUrlError as e:
                log.warning("flow webhook action refused unsafe URL: %s", e)
                return {"action": "webhook", "success": False, "detail": str(e)}
            try:
                timeout = httpx.Timeout(10.0)
                async with httpx.AsyncClient(
                    timeout=timeout, follow_redirects=False,
                ) as client:
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
                log.error(f"Webhook error: {e}", exc_info=True)
                return {"action": "webhook", "success": False, "detail": str(e)}

        if action_type == "add_to_sequence":
            # P43-SB1: REAL enrollment (sequence_engine.subscribe — v25 B-01
            # tenant ownership checks included). The old stub answered
            # success=True without enrolling anyone.
            sequence_id = data.get("sequenceId") or data.get("sequence_id") or value
            if not ctx.subscriber_id:
                return {"action": "add_to_sequence", "success": False, "detail": "no subscriber"}
            try:
                seq_id = int(sequence_id)
            except (TypeError, ValueError):
                return {"action": "add_to_sequence", "success": False,
                        "detail": f"invalid sequence id: {sequence_id!r}"}
            try:
                from sequence_engine import sequence_engine
                ok = await sequence_engine.subscribe(
                    ctx.subscriber_id, seq_id, session, tenant_id=self.tenant_id)
                detail = f"sequence {seq_id}" if ok else f"sequence {seq_id} rejected (duplicate/foreign)"
                return {"action": "sequence_added" if ok else "add_to_sequence",
                        "success": bool(ok), "detail": detail}
            except Exception as e:
                log.error(f"add_to_sequence error: {e}", exc_info=True)
                return {"action": "add_to_sequence", "success": False, "detail": str(e)}

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
                log.error(f"DM error: {e}", exc_info=True)
                return {"action": "dm", "success": False, "detail": str(e)}

        log.warning(f"Unknown action type: {action_type}")
        return {"action": action_type, "success": False, "detail": f"unknown action type: {action_type}"}

    # ── Template rendering ───────────────────────────────────────────────────

    @staticmethod
    async def _render_message(template: str, ctx: FlowContext) -> str:
        """Render a MESSAGE template.

        P43-SB1: BOTH placeholder families render — the ManyChat-style
        double-brace (``{{first_name}}`` / ``{{full_name}}`` / ``{{name}}`` /
        ``{{message}}`` / ``{{text}}``) and the legacy single-brace family
        (via bot_engine.text.TemplateRenderer — the same renderer the
        keyword rules use, on a FlowContext shim).
        """
        if not template:
            return ""
        mention = f"@[{ctx.from_id}]" if ctx.from_id else ctx.from_first
        rendered = (template
            .replace("{{first_name}}", ctx.from_first)
            .replace("{{full_name}}", ctx.from_name or ctx.from_first)
            .replace("{{name}}", ctx.from_first)
            .replace("{{last_name}}", (ctx.from_name or ctx.from_first).split(" ")[-1])
            .replace("{{message}}", ctx.text[:100])
            .replace("{{text}}", ctx.text[:100])
            .replace("{{mention}}", mention)
            .replace("{{intent}}", ctx.intent)
            .replace("{{trigger_type}}", ctx.trigger_type))
        # legacy single-brace family via the shared renderer (CommentContext shim)
        shim = _CtxShim(
            from_id=ctx.from_id, from_name=ctx.from_name or ctx.from_first,
            from_first=ctx.from_first,
            from_username=ctx.from_name or ctx.from_first,
            text=ctx.text,
        )
        return TemplateRenderer.render(rendered, shim)


@dataclass
class _CtxShim:
    """CommentContext-compatible shim so TemplateRenderer serves FlowContext."""
    from_id: str = ""
    from_name: str = ""
    from_first: str = ""
    from_username: str = ""
    text: str = ""
    cid: str = ""
    post_id: str = ""
    raw: dict = field(default_factory=dict)


# ---------------------------------------------------------------------------
# P43-SB1 — the production runtime (resumable FlowExecution state machine)
# ---------------------------------------------------------------------------

#: Hard cap on nodes executed per message/beat advance — the loop guard.
#: A graph cycle with no exit (publish validation normally rejects those)
#: burns at most this many steps, then the execution is marked failed.
_MAX_STEPS_PER_ADVANCE = 25

#: Per-(tenant, subscriber, flow) cooldown between flow STARTS — the pipeline
#: CooldownManager pattern (bot_engine/cooldown.py). ADVANCES are never
#: cooled down (a conversation must keep flowing); only re-ENTRY after a
#: completed run waits out the window so keyword spam cannot loop-start.
_FLOW_START_COOLDOWN_SEC = 60.0

_flow_cooldown = CooldownManager(default_cooldown_sec=_FLOW_START_COOLDOWN_SEC)


def _reset_flow_runtime() -> None:
    """Test seam — clear the module-level flow-start cooldown
    (same contract as _services._reset_token_type_cache)."""
    global _flow_cooldown
    _flow_cooldown = CooldownManager(default_cooldown_sec=_FLOW_START_COOLDOWN_SEC)


def _ctx_from_subscriber(subscriber: Subscriber, text: str,
                         conversation_fb_id: str = "",
                         page_id: str = "") -> FlowContext:
    """Build the runtime FlowContext from the Subscriber row + fresh text."""
    first = (subscriber.first_name
             or (subscriber.name or "").split(" ")[0]
             or subscriber.fb_user_id)
    return FlowContext(
        subscriber_id=subscriber.id,
        from_id=subscriber.fb_user_id,
        from_name=subscriber.name or first,
        from_first=first,
        text=text,
        trigger_type="keyword",
        platform=subscriber.platform or "messenger",
        conversation_fb_id=conversation_fb_id,
        page_id=page_id,
    )


class FlowRuntime:
    """P43-SB1 — the resumable executor behind FlowExecution rows.

    Walker semantics (one advance = one inbound message, or one beat resume):

      * TRIGGER  — the ENTRY trigger is consumed by the keyword match that
                   started the run (never re-executed). A MID-flow TRIGGER is
                   a keyword-wait gate: the run parks BEFORE it and the next
                   matching message passes it; a non-matching message leaves
                   the run parked (and falls through to keyword rules).
      * MESSAGE  — sends the rendered DM through the tenant FB client,
                   records the Message row (replied_by_bot + flow_id
                   attribution, rule_id stays NULL) and bumps the
                   conversation counters. ``data.wait=true`` parks the run
                   AFTER the send awaiting the subscriber's reply; the
                   default continues to the successor.
      * CONDITION— evaluates against the fresh text / subscriber.custom_data
                   / tags and follows the yes/no edge.
      * ACTION   — add_tag / remove_tag / set_field / add_to_sequence /
                   webhook / dm side effects.
      * DELAY    — parks the run with ``resume_at`` (minutes granularity per
                   the node's unit); ONLY the automation beat resumes it
                   (incoming messages never skip a delay).
      * GOAL     — terminal: execution completed.
      * SEQUENCE — enrolls the subscriber into an existing Sequence
                   (sequence_engine.subscribe); dead-end = implicit
                   completion.

    Parking model: ``current_node_id`` is ALWAYS the next node to execute.
    ``resume_at`` non-NULL = delay-parked (beat-owned); NULL + status=active
    = waiting for subscriber input (message-owned).
    """

    def __init__(self, fb, tenant_id: int):
        self.fb = fb
        self.tenant_id = tenant_id
        self.engine = FlowEngine(fb, tenant_id=tenant_id)

    # ── graph plumbing ───────────────────────────────────────────────────────

    @staticmethod
    def _next_of(graph: FlowGraph, node_id: str) -> str:
        """First outgoing edge target ("" = dead end)."""
        edges = graph.edge_map.get(node_id) or []
        for e in edges:
            tgt = str((e or {}).get("target") or "")
            if tgt and tgt in graph.node_map:
                return tgt
        return ""

    @staticmethod
    def _branch_of(graph: FlowGraph, node_id: str, passed: bool) -> str:
        """CONDITION branch: the yes edge when passed, else the no edge."""
        edges = graph.edge_map.get(node_id) or []
        fallback = ""
        for e in edges:
            handle = str((e or {}).get("sourceHandle") or "").lower()
            tgt = str((e or {}).get("target") or "")
            if not tgt or tgt not in graph.node_map:
                continue
            if not fallback:
                fallback = tgt
            if passed and ("true" in handle or "yes" in handle):
                return tgt
            if not passed and ("false" in handle or "no" in handle):
                return tgt
        # no matching handle: yes-branch falls back to the first edge,
        # no-branch with no explicit no-edge = dead end (implicit completion)
        return fallback if passed else ""

    async def _load_graph(self, db, flow_id: int) -> tuple[FlowGraph | None, Flow | None]:
        flow = (await db.execute(
            select(Flow).where(Flow.id == flow_id, Flow.tenant_id == self.tenant_id)
        )).scalar_one_or_none()
        if flow is None:
            return None, None
        return _build_graph(flow), flow

    # ── entry: an inbound Messenger message ─────────────────────────────────

    async def advance_on_message(self, db, execution: FlowExecution, *,
                                 conversation: Conversation | None,
                                 subscriber: Subscriber, text: str) -> dict:
        """Advance a waiting execution with the subscriber's fresh message."""
        result = {"handled": False, "action": "none", "execution_id": execution.id, "sent": False}
        graph, flow = await self._load_graph(db, execution.flow_id)
        if graph is None or flow is None:
            execution.status = "failed"
            execution.error_log = {"error": "flow_missing", "node_id": execution.current_node_id}
            execution.completed_at = utcnow()
            await db.commit()
            result["action"] = "flow_missing"
            return result
        if flow.status != "active":
            # paused/archived mid-run — expire honestly (never fail silently)
            execution.status = "expired"
            execution.completed_at = utcnow()
            execution.error_log = {"error": f"flow_{flow.status}", "node_id": execution.current_node_id}
            await db.commit()
            result["action"] = f"flow_{flow.status}"
            return result

        ctx = _ctx_from_subscriber(
            subscriber, text,
            conversation_fb_id=(conversation.fb_conversation_id if conversation else ""),
            page_id=(ctx_page_id(conversation)) or "",
        )
        node = graph.node_map.get(str(execution.current_node_id or ""))
        if node is None:
            return await self._complete(db, execution, result)

        node_type = str(node.get("type") or "").upper()
        if node_type == "TRIGGER":
            # keyword-wait gate — the fresh message must match to pass
            cfg = node.get("data") or {}
            if not FlowEngine._match_trigger(cfg, "keyword", text):
                result["action"] = "waiting_input"
                await db.commit()  # no state change; release the read txn
                return result
            nxt = self._next_of(graph, str(node.get("id") or ""))
            if not nxt:
                return await self._complete(db, execution, result)
            return await self._run(db, execution, graph, nxt, ctx, subscriber, conversation, result)

        return await self._run(db, execution, graph, str(node.get("id") or ""),
                               ctx, subscriber, conversation, result)

    # ── the iterative walker ────────────────────────────────────────────────

    async def _run(self, db, execution: FlowExecution, graph: FlowGraph,
                   start_node_id: str, ctx: FlowContext, subscriber: Subscriber,
                   conversation: Conversation | None, result: dict) -> dict:
        """Run nodes from ``start_node_id`` until a parking point/terminal.

        Commits after every executed node (a crash between nodes leaves the
        run parked at the last committed node — the next message/beat
        resumes; a failed send never loses earlier sends' records).
        """
        steps_now = 0
        current = start_node_id
        while current:
            if steps_now >= _MAX_STEPS_PER_ADVANCE:
                return await self._fail(db, execution, result,
                                        "step_cap",
                                        f"تجاوز سقف الخطوات لكل رسالة ({_MAX_STEPS_PER_ADVANCE}) — حارس الحلقات")
            node = graph.node_map.get(current)
            if node is None:
                return await self._complete(db, execution, result)
            node_id = str(node.get("id") or "")
            node_type = str(node.get("type") or "").upper()
            data = node.get("data") or {}
            steps_now += 1
            execution.steps = (execution.steps or 0) + 1

            # ── TRIGGER: mid-flow keyword-wait gate — park BEFORE it ──
            if node_type == "TRIGGER":
                execution.current_node_id = node_id
                execution.resume_at = None
                await db.commit()
                result.update({"action": "waiting_input", "handled": True})
                return result

            # ── MESSAGE: send DM + record + (maybe) wait for reply ──
            if node_type == "MESSAGE":
                try:
                    rendered = await FlowEngine._render_message(str(data.get("text") or ""), ctx)
                    sent = await self._send_message(db, execution, conversation, ctx, rendered)
                except Exception as e:
                    log.exception("flow MESSAGE node failed (exec=%s node=%s)",
                                  execution.id, node_id)
                    return await self._fail(db, execution, result, "send_error", str(e)[:300])
                if not sent:
                    return await self._fail(db, execution, result, "send_failed",
                                            "تعذّر إرسال الرسالة — تحقق من صلاحية توكن الصفحة ونافذة 24 ساعة")
                result["sent"] = True
                result["handled"] = True
                nxt = self._next_of(graph, node_id)
                if data.get("wait"):
                    # park AFTER the send — current_node_id is the successor,
                    # the subscriber's next message resumes from there
                    execution.current_node_id = nxt  # "" = dead end → next message completes
                    execution.resume_at = None
                    await db.commit()
                    result["action"] = "waiting_reply"
                    return result
                if not nxt:
                    return await self._complete(db, execution, result)
                # crash-safe: persist the resume point BEFORE moving on, so a
                # crash between nodes never replays a sent MESSAGE
                execution.current_node_id = nxt
                await db.commit()
                current = nxt
                continue

            # ── CONDITION: evaluate + branch ──
            if node_type == "CONDITION":
                try:
                    passed = await self.engine._eval_condition_node(data, ctx, db, subscriber)
                except Exception as e:
                    log.exception("flow CONDITION node failed (exec=%s node=%s)",
                                  execution.id, node_id)
                    return await self._fail(db, execution, result, "condition_error", str(e)[:300])
                nxt = self._branch_of(graph, node_id, passed)
                if not nxt:
                    return await self._complete(db, execution, result)
                execution.current_node_id = nxt
                await db.commit()
                current = nxt
                continue

            # ── ACTION: side effects ──
            if node_type == "ACTION":
                try:
                    await self.engine._execute_action_node(data, ctx, db)
                except Exception as e:
                    log.exception("flow ACTION node failed (exec=%s node=%s)",
                                  execution.id, node_id)
                    return await self._fail(db, execution, result, "action_error", str(e)[:300])
                nxt = self._next_of(graph, node_id)
                if not nxt:
                    return await self._complete(db, execution, result)
                execution.current_node_id = nxt
                await db.commit()
                current = nxt
                continue

            # ── DELAY: park with resume_at (the beat owns resumption) ──
            if node_type == "DELAY":
                seconds = self._delay_seconds(data)
                execution.resume_at = utcnow() + timedelta(seconds=seconds)
                execution.current_node_id = self._next_of(graph, node_id)
                await db.commit()
                result.update({"action": "delayed", "handled": True})
                return result

            # ── GOAL: terminal ──
            if node_type == "GOAL":
                return await self._complete(db, execution, result)

            # ── SEQUENCE: enroll into an existing Sequence ──
            if node_type == "SEQUENCE":
                seq_raw = data.get("sequenceId") or data.get("sequence_id")
                if seq_raw is None:
                    sub_flow = data.get("subFlowId") or data.get("sub_flow_id")
                    if sub_flow:
                        log.warning("SEQUENCE node %s uses legacy subFlowId=%s — "
                                    "runtime runs sequences only (enroll via sequenceId)",
                                    node_id, sub_flow)
                else:
                    try:
                        from sequence_engine import sequence_engine
                        await sequence_engine.subscribe(
                            subscriber.id, int(seq_raw), db, tenant_id=self.tenant_id)
                    except Exception as e:
                        log.exception("SEQUENCE enroll failed (exec=%s node=%s)",
                                      execution.id, node_id)
                        return await self._fail(db, execution, result, "sequence_error", str(e)[:300])
                nxt = self._next_of(graph, node_id)
                if not nxt:
                    return await self._complete(db, execution, result)
                execution.current_node_id = nxt
                await db.commit()
                current = nxt
                continue

            # unknown type → fail loudly (structure validation should have
            # caught this at publish; drafts can still reach the runtime)
            return await self._fail(db, execution, result, "unknown_node_type",
                                    f"نوع عقدة غير معروف: {node_type}")

        return await self._complete(db, execution, result)

    # ── node helpers ────────────────────────────────────────────────────────

    @staticmethod
    def _delay_seconds(data: dict) -> int:
        """DELAY duration in seconds — minutes-first per the flat spec.

        Accepts ``data.minutes`` directly, or the legacy ``amount``+``unit``
        (seconds/minutes/hours/days). Negative/zero clamps to 0 (resume on
        the next beat); a hard ceiling (30 days) bounds abuse.
        """
        unit_map = {"seconds": 1, "minutes": 60, "hours": 3600, "days": 86400}
        if data.get("minutes") is not None:
            try:
                seconds = int(float(data["minutes"])) * 60
            except (TypeError, ValueError):
                seconds = 0
        else:
            try:
                amount = int(float(data.get("amount", 0) or 0))
            except (TypeError, ValueError):
                amount = 0
            unit = str(data.get("unit") or "minutes").lower()
            seconds = amount * unit_map.get(unit, 60)
        return max(0, min(seconds, 30 * 86400))

    async def _send_message(self, db, execution: FlowExecution,
                            conversation: Conversation | None,
                            ctx: FlowContext, rendered: str) -> bool:
        """Send one flow DM and record it (P43 attribution contract).

        Message row: is_from_page=True, replied_by_bot=True, rule_id=NULL,
        flow_id=execution.flow_id — the per-flow stats join key. Counters
        bump atomically (the v25 D-04 pattern). Usage accounting increments
        the same replies_used meter the keyword path uses (money-core
        honesty); failures are logged, never raised.
        """
        if not rendered or not ctx.from_id:
            log.warning("flow MESSAGE skipped: empty render or no recipient (exec=%s)", execution.id)
            return False
        result = None
        if self.fb is not None:
            try:
                result = await self.fb.send_dm(ctx.from_id, rendered)
            except Exception:
                log.exception("flow send_dm crashed (exec=%s)", execution.id)
                result = None
        ok = bool(result) and not result.get("_error")
        mid = str((result or {}).get("message_id")
                  or (result or {}).get("mid") or "")

        conv_id = conversation.id if conversation is not None else None
        fb_conv_id = conversation.fb_conversation_id if conversation is not None else ctx.conversation_fb_id
        # dedup: only trust a real Graph mid as the dedup key
        if mid:
            existing = await db.execute(
                select(Message.id).where(
                    Message.tenant_id == self.tenant_id,
                    Message.fb_message_id == mid,
                )
            )
            if existing.scalar_one_or_none() is not None:
                log.info("flow DM echo already stored (mid=%s) — send recorded once", mid)
                return True
        db.add(Message(
            tenant_id=self.tenant_id,
            conversation_id=conv_id,
            fb_message_id=mid or f"flow_{execution.id}_{execution.steps}",
            fb_conversation_id=fb_conv_id or "",
            sender_id=ctx.page_id or "",
            sender_name="SmartBot",
            text=rendered,
            is_from_page=True,
            replied_by_bot=True,
            rule_id=None,
            flow_id=execution.flow_id,
        ))
        if conv_id is not None:
            await db.execute(
                update(Conversation)
                .where(Conversation.id == conv_id)
                .values(
                    message_count=func.coalesce(Conversation.message_count, 0) + 1,
                    last_message_text=rendered[:500],
                    last_message_at=utcnow(),
                )
            )
        # flow stats + usage accounting (money-core: every bot reply counts)
        try:
            flow_row = await db.get(Flow, execution.flow_id)
            if flow_row is not None:
                flow_row.total_replies = (flow_row.total_replies or 0) + 1
                flow_row.last_triggered_at = utcnow()
            from bot_engine.pipeline import get_plan_limits, increment_replies_used
            limits = await get_plan_limits(db, self.tenant_id)
            await increment_replies_used(
                db, self.tenant_id, 1, period_start=(limits or {}).get("period_start"))
        except Exception:
            log.warning("flow DM accounting failed (exec=%s) — reply stands",
                        execution.id, exc_info=True)
        if not ok:
            # honest telemetry (the keyword path's WARN doctrine)
            try:
                db.add(BotLog(
                    tenant_id=self.tenant_id, level="WARN",
                    message=f"تعذّر إرسال رسالة المسار (تنفيذ {execution.id}) — "
                            "تحقق من صلاحية توكن الصفحة ونافذة 24 ساعة",
                ))
            except Exception:
                log.debug("flow send WARN BotLog failed", exc_info=True)
        return ok

    # ── terminal states ─────────────────────────────────────────────────────

    async def _complete(self, db, execution: FlowExecution, result: dict) -> dict:
        """Terminal success: the run reached a GOAL / dead-end."""
        execution.status = "completed"
        execution.completed_at = utcnow()
        execution.resume_at = None
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            log.exception("flow completion commit failed (exec=%s) — "
                          "the run stays active and the next message retries",
                          execution.id)
        result["action"] = "completed"
        # the flow consumed the trigger message — even ACTION-only runs
        # (no MESSAGE sent) own it; the keyword fallback stays quiet.
        result["handled"] = True
        return result

    async def _fail(self, db, execution: FlowExecution, result: dict,
                    code: str, detail: str) -> dict:
        """Terminal failure — status=failed + error_log, honestly persisted.

        A run that already SENT messages keeps handled=True (falling back to
        the keyword rules would double-reply); a dry failure returns
        handled=False so the live reply path continues normally."""
        error_log = {"error": code, "detail": detail,
                     "node_id": execution.current_node_id}
        execution.status = "failed"
        execution.completed_at = utcnow()
        execution.resume_at = None
        execution.error_log = error_log
        try:
            await db.commit()
        except Exception:
            await db.rollback()
            # re-apply on the rolled-back instance and retry ONCE — the
            # failure marker must not itself fail silently
            execution.status = "failed"
            execution.completed_at = utcnow()
            execution.resume_at = None
            execution.error_log = error_log
            try:
                await db.commit()
            except Exception:
                log.exception("could not persist flow failure (exec=%s)",
                              execution.id)
        result.update({"action": code, "handled": result.get("sent", False)})
        return result


def ctx_page_id(conversation: Conversation | None) -> str:
    """Best-effort page id for a conversation (synthetic ids carry it)."""
    if conversation is None:
        return ""
    fb_conv = conversation.fb_conversation_id or ""
    if fb_conv.startswith("w_"):
        parts = fb_conv[2:].rsplit("_", 1)
        if len(parts) == 2:
            return parts[0]
    return ""


# ── the messenger_service ingestion hook ────────────────────────────────────

async def handle_incoming_message(tenant_id: int, page_id: str,
                                  conversation_fb_id: str, sender_id: str,
                                  text: str, fb_client=None,
                                  sender_name: str = "") -> dict:
    """P43-SB1 entry — one inbound Messenger message against the flow layer.

    Called by messenger_service AFTER the message + conversation +
    subscriber are durable. Order:
      1. SB-2 yield: ``bot_paused`` conversations never auto-advance flows;
      2. an ACTIVE FlowExecution bound to (subscriber, conversation) gets
         the fresh text (advance);
      3. else the tenant's active flows whose ENTRY TRIGGER keywords match
         the text start a new run (one-active-per-subscriber guard +
         start cooldown).

    Returns ``{"handled": bool, "action": str, "execution_id": int|None,
    "sent": bool}`` — ``handled=False`` always falls back to the normal
    keyword auto-reply path in the caller.
    """
    status = {"handled": False, "action": "none", "execution_id": None, "sent": False}
    if not text or not sender_id:
        status["action"] = "ignored"
        return status
    try:
        async with AsyncSessionLocal() as db:
            conversation = (await db.execute(
                select(Conversation).where(
                    Conversation.tenant_id == tenant_id,
                    Conversation.fb_conversation_id == conversation_fb_id,
                )
            )).scalar_one_or_none()
            # SB-2: human takeover — the bot yields completely
            if conversation is not None and conversation.bot_paused:
                status["action"] = "bot_paused"
                return status

            subscriber = (await db.execute(
                select(Subscriber).where(
                    Subscriber.tenant_id == tenant_id,
                    Subscriber.fb_user_id == sender_id,
                )
            )).scalar_one_or_none()
            if subscriber is None:
                status["action"] = "no_subscriber"
                return status

            runtime = FlowRuntime(fb_client, tenant_id)

            # ── 1) advance an active run bound to this conversation ──
            active_stmt = (
                select(FlowExecution)
                .where(
                    FlowExecution.tenant_id == tenant_id,
                    FlowExecution.subscriber_id == subscriber.id,
                    FlowExecution.status == "active",
                )
                .order_by(FlowExecution.id.desc())
            )
            if conversation is not None:
                active_stmt = active_stmt.where(
                    FlowExecution.conversation_id == conversation.id)
            active = (await db.execute(active_stmt)).scalar_one_or_none()
            if active is not None:
                if active.resume_at is not None:
                    # delay-parked: only the beat resumes it; the message
                    # falls through to the keyword rules
                    status.update({"action": "delayed", "execution_id": active.id})
                    return status
                return await runtime.advance_on_message(
                    db, active, conversation=conversation,
                    subscriber=subscriber, text=text)

            # ── 2) start a new run: first matching active flow wins ──
            flows = (await db.execute(
                select(Flow).where(
                    Flow.tenant_id == tenant_id,
                    Flow.status == "active",
                ).order_by(Flow.id)
            )).scalars().all()
            for flow in flows:
                graph = _build_graph(flow)
                trigger = None
                for n in graph.nodes:
                    if isinstance(n, dict) and str(n.get("type") or "").upper() == "TRIGGER":
                        trigger = n
                        break
                if trigger is None:
                    continue
                if not FlowEngine._match_trigger(trigger.get("data") or {}, "keyword", text):
                    continue
                # one active FlowExecution per subscriber at a time
                any_active = (await db.execute(
                    select(FlowExecution.id).where(
                        FlowExecution.tenant_id == tenant_id,
                        FlowExecution.subscriber_id == subscriber.id,
                        FlowExecution.status == "active",
                    )
                )).scalar_one_or_none()
                if any_active is not None:
                    status.update({"action": "busy", "execution_id": any_active})
                    return status
                # re-entry cooldown (loop prevention — advances never cool down)
                if _flow_cooldown.is_blocked(f"{tenant_id}:{subscriber.id}:{flow.id}"):
                    status["action"] = "cooldown"
                    return status
                execution = FlowExecution(
                    tenant_id=tenant_id,
                    flow_id=flow.id,
                    subscriber_id=subscriber.id,
                    conversation_id=conversation.id if conversation is not None else None,
                    trigger_type="keyword",
                    trigger_data={
                        "from_id": subscriber.fb_user_id,
                        "from_name": subscriber.name or sender_name,
                        "text": text[:500],
                        "conversation_fb_id": conversation_fb_id,
                        "page_id": page_id,
                    },
                    current_node_id=str(trigger.get("id") or ""),
                    status="active",
                    steps=0,
                )
                db.add(execution)
                await db.flush()
                # the entry TRIGGER is consumed by the keyword match above
                nxt = FlowRuntime._next_of(graph, str(trigger.get("id") or ""))
                result = {"handled": False, "action": "none",
                          "execution_id": execution.id, "sent": False}
                if not nxt:
                    return await runtime._complete(db, execution, result)
                return await runtime._run(
                    db, execution, graph, nxt,
                    _ctx_from_subscriber(subscriber, text,
                                         conversation_fb_id=conversation_fb_id,
                                         page_id=page_id),
                    subscriber, conversation, result)
            status["action"] = "no_match"
            return status
    except Exception as e:
        log.exception("flow runtime failed (tenant=%s sender=%s): %s",
                      tenant_id, sender_id, e)
        status["action"] = "error"
        return status


# ── the beat-side delay-resume sweep ────────────────────────────────────────

async def resume_due_flow_executions(sf=None, tenant_id: int | None = None,
                                     limit: int = 50) -> int:
    """Resume DELAY-parked executions whose ``resume_at`` has passed.

    Driven by the automation beat (heartbeat / piggyback / bot-cycle step).
    Idempotent: each execution is claimed atomically
    (``UPDATE ... SET resume_at=NULL WHERE id=:id AND resume_at IS NOT
    NULL``) BEFORE any work — a racing beat gets rowcount 0 and skips.
    Tenant-scoped: each execution resolves its own tenant's FB client; pass
    ``tenant_id`` to sweep one tenant (the bot-cycle per-tenant loop).
    Returns the number of executions resumed by THIS sweep.
    """
    if sf is None:
        sf = AsyncSessionLocal
    try:
        async with sf() as db:
            stmt = (
                select(FlowExecution)
                .where(
                    FlowExecution.status == "active",
                    FlowExecution.resume_at.isnot(None),
                    FlowExecution.resume_at <= utcnow(),
                )
                .order_by(FlowExecution.resume_at)
                .limit(limit)
            )
            if tenant_id is not None:
                stmt = stmt.where(FlowExecution.tenant_id == tenant_id)
            due = (await db.execute(stmt)).scalars().all()
    except Exception:
        log.exception("flow resume sweep: due query failed")
        return 0

    resumed = 0
    for ex in due:
        try:
            # ── atomic claim — exactly one beat wins ──
            async with sf() as db:
                claim = await db.execute(
                    update(FlowExecution)
                    .execution_options(synchronize_session="fetch")
                    .where(
                        FlowExecution.id == ex.id,
                        FlowExecution.resume_at.isnot(None),
                    )
                    .values(resume_at=None)
                )
                await db.commit()
                if not claim.rowcount:
                    continue  # a racing beat claimed it first

            async with sf() as db:
                fresh = await db.get(FlowExecution, ex.id)
                if fresh is None or fresh.status != "active":
                    continue
                client = None
                try:
                    if fresh.tenant_id:
                        from _services import get_tenant_fb_client
                        client = await get_tenant_fb_client(fresh.tenant_id)
                except Exception:
                    log.warning("flow resume: tenant %s client resolution failed",
                                fresh.tenant_id, exc_info=True)
                runtime = FlowRuntime(client, fresh.tenant_id or 0)
                subscriber = (await db.execute(
                    select(Subscriber).where(
                        Subscriber.id == fresh.subscriber_id,
                        Subscriber.tenant_id == (fresh.tenant_id or 0),
                    )
                )).scalar_one_or_none() if fresh.subscriber_id else None
                if subscriber is None:
                    fresh.status = "failed"
                    fresh.error_log = {"error": "subscriber_missing"}
                    fresh.completed_at = utcnow()
                    await db.commit()
                    continue
                conversation = None
                if fresh.conversation_id:
                    conversation = await db.get(Conversation, fresh.conversation_id)
                trigger_data = fresh.trigger_data or {}
                ctx = _ctx_from_subscriber(
                    subscriber, str(trigger_data.get("text") or ""),
                    conversation_fb_id=(
                        conversation.fb_conversation_id if conversation
                        else str(trigger_data.get("conversation_fb_id") or "")),
                    page_id=str(trigger_data.get("page_id") or ""),
                )
                graph, flow = await runtime._load_graph(db, fresh.flow_id)
                result = {"handled": False, "action": "resumed",
                          "execution_id": fresh.id, "sent": False}
                if graph is None or flow is None:
                    await runtime._fail(db, fresh, result, "flow_missing", "التدفق لم يعد موجوداً")
                elif flow.status != "active":
                    fresh.status = "expired"
                    fresh.completed_at = utcnow()
                    fresh.error_log = {"error": f"flow_{flow.status}"}
                    await db.commit()
                else:
                    await runtime._run(
                        db, fresh, graph, str(fresh.current_node_id or ""),
                        ctx, subscriber, conversation, result)
                resumed += 1
        except Exception:
            log.exception("flow resume failed (exec=%s)", ex.id)
    return resumed
