from __future__ import annotations

"""Reply pipeline — structured stages with error boundaries (extracted
verbatim from the old monolithic ``bot.py``, v11-A2).
"""

import asyncio
import logging
import time

from _async import spawn  # v9-A11: GC-safe background tasks
from _utils import utcnow
from fb_client import FBClient
from models import Customer, Reply
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from bot_engine.cooldown import CooldownManager
from bot_engine.deps import _get_ctx, _get_diag, _get_ei, _get_monitor, _get_offer, ws_manager
from bot_engine.matching import CommentContext, IntentAwareMatcher
from bot_engine.text import TemplateRenderer

log = logging.getLogger("fb-bot")

# -------------------------------------------------------------------
# Reply Pipeline (v2 — structured stages with error boundaries)
# -------------------------------------------------------------------

class ReplyPipeline:
    """Pipeline with error boundaries per stage and diagnostics."""

    def __init__(self, fb: FBClient, dedup_engine, cooldown: CooldownManager, tenant_id: int = 0):
        self.fb = fb
        self.dedup = dedup_engine
        self.cooldown = cooldown
        self._tenant_id = tenant_id
        self._mon = _get_monitor()
        self._diag = _get_diag(self._tenant_id)

    async def process(self, session, raw_comment: dict, post_id: str,
                      matcher: IntentAwareMatcher) -> bool:
        """Returns True if a reply was sent. Each stage is isolated."""
        ctx = None
        try:
            ctx = self._extract(raw_comment, post_id)
        except Exception as e:
            self._mon.error("extract failed", module="pipeline", extra={"error": str(e)})
            return False

        if not ctx or not ctx.text:
            return False

        # Stage 1: Skip own page
        try:
            page_id_str = str(self.fb.page_id)
            if ctx.from_id and ctx.from_id not in ('None', '0') and ctx.from_id == page_id_str:
                return False
        except Exception:
            pass

        # Stage 2: Dedup
        try:
            if await self.dedup.is_dup(ctx.cid):
                self._mon.debug(f"dedup skip {ctx.cid[:12]}")
                return False
        except Exception:
            pass

        # Stage 2b: Get user context (new vs returning)
        user_ctx = None
        try:
            ctx_engine = _get_ctx(self._tenant_id)
            user_ctx = ctx_engine.get(ctx.from_id)
        except Exception:
            pass

        # Stage 3: Classify intent
        intent = "neutral"
        classification = {}
        try:
            EI = _get_ei()
            classification = EI.classify(ctx.text) or {}
            intent = classification.get("primary_intent", "neutral")
        except Exception as e:
            self._mon.warn("intent classify failed", module="pipeline", extra={"error": str(e)})

        # Stage 4: Match rule
        try:
            t0 = time.time()
            template, dm_template, rule_id = matcher.match(ctx.text, intent)
            latency = (time.time() - t0) * 1000
            if latency > 50:
                self._mon.warn(f"slow match {latency:.0f}ms", module="pipeline")
        except Exception as e:
            self._mon.error(f"match failed: {e}", module="pipeline")
            return False

        if not template or not TemplateRenderer.validate(template):
            self._mon.debug("no matching rule", comment_id=ctx.cid[:12], intent=intent)
            return False

        # Stage 5: Cooldown
        try:
            if self.cooldown.is_blocked(ctx.from_id):
                self._mon.debug(f"cooldown {ctx.from_first}", comment_id=ctx.cid[:12])
                return False
        except Exception:
            pass

        # Stage 5b: Urgent notification via WebSocket
        try:
            urgency = classification.get("urgency", 0) if isinstance(classification, dict) else 0
            if ws_manager and (intent in ("complaint", "urgent", "negative") or urgency > 0.5):
                spawn(ws_manager.broadcast_to_tenant(self._tenant_id, "alert", {
                    "type": "urgent_comment", "severity": "warning",
                    "message": f"تعليق عاجل من {ctx.from_first}: {ctx.text[:100]}",
                    "link": f"/comments?comment_id={ctx.cid[:20]}"
                }))
        except Exception:
            pass

        # Stage 5c: Adjust cooldown by user category
        try:
            if user_ctx and user_ctx.is_frequent():
                self.cooldown.adjust_window(ctx.from_id, 30)
            else:
                self.cooldown.adjust_window(ctx.from_id, 60)
        except Exception:
            pass

        # Stage 6: Attach offer (context-aware)
        sales_stage = None
        try:
            # Check if EnhancedIntentClassifier returned sales info
            if intent in ("price_inquiry", "order", "subscription", "contact", "question"):
                o_engine = _get_offer(self._tenant_id)
                # New users get welcome offers
                if user_ctx and user_ctx.is_new():
                    offer = await o_engine.get_best_offer(session, ctx.from_id, "welcome", tenant_id=self._tenant_id)
                else:
                    offer = await o_engine.get_best_offer(session, ctx.from_id, intent, tenant_id=self._tenant_id)
                if offer and offer.get("id"):
                    o_engine.mark_delivered(ctx.from_id, offer["id"])
                if isinstance(classification, dict):
                    sales_stage = classification.get("sales_stage") or "consideration"
        except Exception as e:
            self._mon.warn(f"offer failed: {e}", module="pipeline")

        # Stage 7: Render reply (public comment — NO offer text, it garbles)
        try:
            reply = TemplateRenderer.render(template, ctx)
        except Exception as e:
            self._mon.error(f"render failed: {e}", module="pipeline")
            return False

        user_type = "new"
        if user_ctx:
            user_type = "frequent" if user_ctx.is_frequent() else "returning" if user_ctx.is_returning() else "new"
        self._mon.info(f"→ Reply to {ctx.from_first}",
                       comment_id=ctx.cid[:12], intent=intent, rule_id=rule_id,
                       extra={"user_type": user_type, "sales_stage": sales_stage or ""})

        # Stage 8: Send with exponential backoff
        result = None
        max_attempts = 3
        send_started = time.time()
        for attempt in range(max_attempts):
            try:
                result = await self.fb.reply_to_comment(ctx.cid, reply)
                if result:
                    self._diag.record_cycle((time.time() - send_started) * 1000)
                    break
                if attempt < max_attempts - 1:
                    delay = 2 ** attempt  # 1, 2, 4s backoff
                    self._mon.warn(f"retry {attempt+1}/{max_attempts}",
                                   comment_id=ctx.cid[:12], module="pipeline",
                                   extra={"delay": delay})
                    await asyncio.sleep(delay)
            except Exception as e:
                self._mon.error(f"send attempt {attempt+1} failed: {e}",
                                comment_id=ctx.cid[:12], module="pipeline")
                if attempt < max_attempts - 1:
                    await asyncio.sleep(2 ** attempt)

        if result is None:
            self._mon.error(f"✗ send failed after {max_attempts} attempts",
                            comment_id=ctx.cid[:12], module="pipeline")
            try:
                self._diag.record_api_error(f"comment/{ctx.cid[:20]}/comments", 0, "Max retries exceeded")
            except Exception:
                pass
            return False

        # Mark dedup only after successful send
        await self.dedup.mark(ctx.cid)

        # Stage 8b: Send DM (private reply or messenger)
        dm_sent = False
        if dm_template and ctx.from_id and ctx.from_id != str(self.fb.page_id):
            try:
                log.info(f"DM attempt to {ctx.from_first}: template={dm_template[:50]}")
                dm_text = TemplateRenderer.render(dm_template, ctx)
                # Strategy 1: Private reply — works when page has pages_manage_metadata
                dm_result = await self.fb.send_private_reply(ctx.cid, dm_text)
                if dm_result and not dm_result.get("_error"):
                    dm_sent = True
                else:
                    fb_err = "(unknown)"
                    if dm_result and dm_result.get("_error"):
                        fb_err = dm_result.get("body", dm_result.get("error", fb_err))
                    self._mon.warn(f"private_reply failed: {fb_err}", comment_id=ctx.cid[:12], module="pipeline")
                    # Strategy 2: MESSAGE_TAG — works for opted-in users without prior conversation
                    dm_result = await self.fb.send_dm(ctx.from_id, dm_text, messaging_type="MESSAGE_TAG", tag="POST_PURCHASE_UPDATE")
                    if dm_result:
                        dm_sent = True
                    else:
                        # Strategy 3: RESPONSE — requires user messaged page in last 24h
                        dm_result = await self.fb.send_dm(ctx.from_id, dm_text, messaging_type="RESPONSE")
                        if dm_result:
                            dm_sent = True
                if dm_sent:
                    self._mon.info(f"✓ DM sent to {ctx.from_first}", comment_id=ctx.cid[:12])
                else:
                    self._mon.warn("× DM failed after all strategies", comment_id=ctx.cid[:12], module="pipeline")
            except Exception as e:
                self._mon.warn(f"dm failed: {e}", comment_id=ctx.cid[:12], module="pipeline")

        # Stage 9: Log to DB
        try:
            session.add(Reply(
                tenant_id=self._tenant_id,
                fb_comment_id=ctx.cid,
                fb_post_id=ctx.post_id,
                commenter_name=ctx.from_name,
                comment_text=ctx.text,
                reply_text=reply,
                rule_id=rule_id,
            ))
            # v4 §4.10 — upsert the stored Comment row so /api/comments
            # (DB-first) reflects replies even without live Graph reachability
            try:
                from models import Comment as _C
                _crow = (await session.execute(
                    select(_C).where(
                        _C.tenant_id == self._tenant_id,
                        _C.fb_comment_id == ctx.cid,
                    )
                )).scalar_one_or_none()
                if _crow is None:
                    _crow = _C(
                        tenant_id=self._tenant_id,
                        fb_comment_id=ctx.cid,
                        fb_post_id=str(ctx.post_id or ""),
                        commenter_id=str(ctx.from_id or ""),
                        commenter_name=ctx.from_name or "",
                        comment_text=ctx.text or "",
                    )
                    session.add(_crow)
                _crow.reply_text = reply
                _crow.replied_by_bot = True
            except Exception as _ce:
                self._mon.debug(f"comment upsert skipped: {_ce}", comment_id=ctx.cid[:12])
            await session.commit()
        except IntegrityError:
            await session.rollback()
            self._mon.info(f"DB dedup {ctx.cid[:12]}")
            return False
        except Exception as e:
            self._mon.error(f"DB log failed: {e}", module="pipeline")
            await session.rollback()
            return False

        # Stage 10: Update context + auto-create CRM lead
        try:
            ctx_engine = _get_ctx(self._tenant_id)
            uc = ctx_engine.get(ctx.from_id)
            uc.add_comment(ctx.text, intent, rule_id)
            uc.add_reply(reply)
            if intent in ("complaint", "negative"):
                ctx_engine.tag_user(ctx.from_id, "complainer")
            elif intent in ("price_inquiry", "subscription", "order", "contact"):
                ctx_engine.tag_user(ctx.from_id, "potential_buyer")
                # Auto-create/update CRM record in DB
                try:
                    existing = await session.execute(
                        select(Customer).where(Customer.fb_user_id == ctx.from_id)
                    )
                    c = existing.scalar_one_or_none()
                    if c:
                        c.total_interactions = (c.total_interactions or 0) + 1
                        c.last_intent = intent
                        c.last_contacted_at = utcnow()
                        if c.stage == "lead" and intent in ("price_inquiry", "subscription"):
                            c.stage = "prospect"
                    else:
                        c = Customer(
                            fb_user_id=ctx.from_id, name=ctx.from_name,
                            source="facebook", stage="lead", tenant_id=self._tenant_id,
                            last_intent=intent, total_interactions=1,
                        )
                        session.add(c)
                    await session.commit()
                except Exception as e:
                    self._mon.warn(f"CRM update failed: {e}", module="pipeline")
        except Exception as e:
            self._mon.warn(f"context update failed: {e}", module="pipeline")

        # Notify WebSocket
        try:
            if ws_manager:
                spawn(ws_manager.broadcast_to_tenant(self._tenant_id, "new_reply", {
                    "commenter": ctx.from_name, "comment": ctx.text[:50],
                    "reply": reply[:50], "rule_id": rule_id,
                }))
                spawn(ws_manager.broadcast_to_tenant(self._tenant_id, "notification", {
                    "type": "reply", "title": "رد جديد",
                    "message": f"تم الرد على {ctx.from_first}",
                    "link": "/replies",
                }))
        except Exception:
            pass

        self._mon.info(f"✓ Replied {ctx.from_first}", comment_id=ctx.cid[:12], rule_id=rule_id)
        return True

    def _extract(self, c: dict, post_id: str) -> CommentContext | None:
        cid = c.get("id", "")
        msg = (c.get("message", "") or "").strip()
        if not cid:
            return None
        from_data = c.get("from", {})
        from_id = str(from_data.get("id", "")) if from_data.get("id") else ""
        from_name = from_data.get("name", "") or ""
        if not from_name:
            from_name = from_data.get("username", "") or "صديقنا"
        from_first = from_name.split()[0] if from_name else "صديقنا"
        from_username = from_data.get("username", "") or ""
        return CommentContext(
            cid=cid, post_id=post_id, text=msg,
            from_id=from_id, from_name=from_name,
            from_first=from_first, from_username=from_username,
            raw=c,
        )
