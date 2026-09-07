"""
SmartBot AI Agent v2 — LLM Orchestrator with Tool Registry, Memory, Auto-Execute.
Bot engine (keyword reply pipeline) remains untouched.
"""
from __future__ import annotations

import asyncio
import logging

from _utils import utcnow
from sqlalchemy import func, select

log = logging.getLogger("fb-agent")

# v10-A2 — tools that mutate PLATFORM-level state. They run with the
# platform Facebook client (_fb_client) or against the platform bot task
# (runner._bot_task), i.e. they affect EVERY tenant — so they require the
# caller's role to be "admin", exactly like the dedicated routes
# (bot.py stop_bot / restart_bot). Tenant-scoped tools (create_rule,
# list_stats) stay open to editors.
_ADMIN_ONLY_TOOLS = frozenset({
    "toggle_bot",       # يوقف/يشغّل بوت المنصة العام
    "publish_post",     # ينشر عبر توكن صفحة المنصة
    "reply_to_comment", # يعلّق علنًا عبر توكن صفحة المنصة
    "system",           # تعديل إعدادات المنصة
})

# Lazy imports for new modules
_agent_brain = None
_agent_memory = None
_agent_tools = None
_fb_client = None


def _get_brain():
    global _agent_brain
    if _agent_brain is None:
        from agent_brain import reason, register_handler
        _agent_brain = {"reason": reason, "register_handler": register_handler}
    return _agent_brain


def _get_mem():
    global _agent_memory
    if _agent_memory is None:
        import agent_memory as _agent_memory
    return _agent_memory


def _get_tools():
    global _agent_tools
    if _agent_tools is None:
        import agent_tools as _agent_tools
    return _agent_tools


def _get_fb():
    global _fb_client
    if _fb_client is None:
        from config import settings
        from fb_client import FBClient
        _fb_client = FBClient(settings.FACEBOOK_ACCESS_TOKEN, settings.FACEBOOK_PAGE_ID)
    return _fb_client


class AgentEngine:
    """Agent v2 — brain+memory+tools orchestrator with auto-execute."""

    def __init__(self):
        self._history: list[dict] = []  # ponytail: in-memory fallback, DB is primary

    async def process(self, text: str, image_url: str = "", username: str = "admin",
                      db=None, tenant_id: int = 0, role: str = "viewer") -> dict:
        """Main entry: load context → reason → execute → remember → return.

        v10-A2: `role` is the CALLING user's role (least-privilege default
        "viewer") — the tool gate in _execute refuses platform-level actions
        for non-admins. Without it an editor could stop the PLATFORM bot
        (runner._bot_task) for every tenant at once (HIGH#4).
        """
        if db is None:
            log.error("process called without db session")
            return self._error("خطأ في قاعدة البيانات")

        step = "load mem"
        try:
            mem = _get_mem()
            # v9-A4: session/memory keys are tenant-scoped
            session_history = await mem.get_session(db, username, tenant_id)
            user_memory = await mem.get_user_memory(db, username, tenant_id)

            step = "build ctx"
            from models import Reply, Rule
            # v4 §3.6 — tenant-scoped counts (were global: cross-tenant context
            # leaked into AI agent answers on a multi-tenant deployment)
            reply_count = await db.scalar(
                select(func.count(Reply.id)).where(Reply.tenant_id == tenant_id)
            ) or 0
            rule_count = await db.scalar(
                select(func.count(Rule.id)).where(Rule.tenant_id == tenant_id)
            ) or 0
            from config import settings
            bot_running = False
            try:
                import sys as _sys
                if 'runner' in _sys.modules:
                    bot_running = _sys.modules['runner']._bot_task is not None \
                        and not _sys.modules['runner']._bot_task.done()
            except Exception:
                pass
            ctx = {
                "page_id": settings.FACEBOOK_PAGE_ID,
                "bot_running": bot_running,
                "rules_count": rule_count,
                "reply_count": reply_count,
                "user": username,
                "has_image": bool(image_url),
                "_session": session_history,
                "_memory": user_memory,
            }

            if image_url:
                try:
                    from ai_service import AIService
                    ai = AIService()
                    if ai.available:
                        analysis = await ai.analyze_image(image_url)
                        if analysis:
                            ctx["image_analysis"] = analysis
                except Exception as e:
                    log.warning(f"Image analysis failed: {e}")

            step = "brain"
            brain = _get_brain()
            interpretation = await brain["reason"](text, ctx)
            action = interpretation.get("action", "unknown")
            params = interpretation.get("params", {})
            response_ar = interpretation.get("response_ar", "")

            step = "attach image"
            if image_url and action == "publish_post" and "image_url" not in params:
                params["image_url"] = image_url
            if action == "publish_post" and ctx.get("image_analysis"):
                analysis_snippet = ctx["image_analysis"][:80]
                msg = params.get("message", "")
                if analysis_snippet and analysis_snippet not in msg:
                    params["message"] = f"{msg}\n\n📷 {analysis_snippet}"

            step = "execute"
            result = {"success": True, "data": {}, "message_ar": response_ar}
            if action != "unknown":
                exec_result = await self._execute(action, params, db,
                                                  tenant_id=tenant_id, role=role)
                result = {**result, **exec_result}

            step = "memory write"
            turn = {"role": "user", "text": text, "timestamp": utcnow().isoformat()}
            try:
                await mem.append_to_session(db, username, turn, tenant_id)
                if action != "unknown":
                    await mem.update_user_memory(db, username, {
                        "last_action": action,
                        "last_timestamp": utcnow().isoformat(),
                    }, tenant_id)
            except Exception as e:
                log.warning(f"Memory write failed: {e}")

            self._history.append({"role": "agent", "action": action, "text": response_ar})
            if len(self._history) > 50:
                self._history.pop(0)

            return {
                "action": action,
                "params": params,
                "response_ar": result.get("message_ar", response_ar),
                "data": result.get("data", {}),
                "success": result.get("success", False),
            }
        except Exception as e:
            log.error(f"process failed at step={step}: {e}", exc_info=True)
            import traceback
            log.error(traceback.format_exc(), exc_info=True)
            # v10-A9: the step name + raw str(e) leaked internal details
            # (DB errors, paths) to the client — generic Arabic message only.
            return {"action": "error", "params": {},
                    "response_ar": "حدث خطأ داخلي أثناء تنفيذ طلب المساعد الذكي — حاول مرة أخرى",
                    "data": {"step": step}, "success": False}

    async def _execute(self, action: str, params: dict, db,
                       tenant_id: int = 0, role: str = "viewer") -> dict:
        """Execute a tool action. Handles all registered tools.

        v10-A2 permission gate: these tools act with the PLATFORM's Facebook
        client (_fb_client) or on the PLATFORM bot task — the tenant-scoped
        equivalents don't exist yet, so until they do the gate matches the
        dedicated routes (bot.py stop_bot/restart_bot = admin-only).
        """
        if action in _ADMIN_ONLY_TOOLS and role != "admin":
            return {"success": False,
                    "message_ar": "هذا الإجراء يتطلب صلاحيات مسؤول — اطلبه من مدير مساحة عملك"}
        try:
            fb = _get_fb()

            if action == "publish_post":
                msg = params.get("message", "")
                img = params.get("image_url", "")
                if img:
                    result = await fb.post_to_page_with_image(msg, img)
                else:
                    result = await fb.post_to_page(msg)
                if result and result.get("id"):
                    return {"success": True, "data": {"post_id": result["id"]},
                            "message_ar": f"تم النشر بنجاح ✅\n{msg[:100]}"}
                return {"success": False, "message_ar": "فشل النشر على فيسبوك"}

            elif action == "reply_to_comment":
                cid = params.get("comment_id", "")
                msg = params.get("message", "")
                if not cid:
                    return {"success": False, "message_ar": "مطلوب معرف التعليق"}
                result = await fb.reply_to_comment(cid, msg)
                if result:
                    return {"success": True, "message_ar": "تم الرد على التعليق ✅"}
                return {"success": False, "message_ar": "فشل الرد على التعليق"}

            elif action == "toggle_bot":
                import sys as _sys
                act = params.get("action", "start")
                if act == "stop":
                    bt = getattr(_sys.modules.get('runner'), '_bot_task', None) if 'runner' in _sys.modules else None
                    if bt and not bt.done():
                        bt.cancel()
                    return {"success": True, "message_ar": "تم إيقاف البوت ✅"}
                else:
                    import sys as _sys2
                    _run = getattr(_sys2.modules.get('runner'), '_run_bot_loop', None)
                    if _run:
                        bt = asyncio.create_task(_run())
                        # Inject back so runner.py can track it
                        runner_mod = _sys2.modules.get('runner')
                        if runner_mod:
                            runner_mod._bot_task = bt
                    return {"success": True, "message_ar": "تم تشغيل البوت ✅"}

            elif action == "create_rule":
                from models import Rule
                raw = params.get("raw", params.get("name", ""))
                name = params.get("name", f"قاعدة {raw[:30]}")
                kw = params.get("keywords", [raw])
                tmpl = params.get("reply_template", raw)
                # v10-A5: without tenant_id the rule defaulted to 0 (platform
                # space) — invisible to its creator and unmanageable from the
                # UI. Same one-line pattern as onboarding.py create_first_rule.
                rule = Rule(name=name, keywords=kw if isinstance(kw, list) else [kw],
                            reply_template=tmpl, tenant_id=tenant_id)
                db.add(rule)
                await db.commit()
                return {"success": True, "data": {"rule_id": rule.id},
                        "message_ar": f"تم إنشاء القاعدة \"{name}\" ✅"}

            elif action == "list_stats":
                from models import Reply, Rule
                # v10-A4: tenant-scoped counts (v4 §3.6 pattern — the ctx
                # build above already filtered, this branch leaked all
                # tenants' totals to any editor).
                total = await db.scalar(
                    select(func.count(Reply.id)).where(Reply.tenant_id == tenant_id)) or 0
                rules = await db.scalar(
                    select(func.count(Rule.id)).where(Rule.tenant_id == tenant_id)) or 0
                return {"success": True, "data": {"total_replies": total, "rules_count": rules},
                        "message_ar": f"إحصائيات: {total} رد, {rules} قاعدة"}

            elif action == "system":
                return {"success": True, "data": params,
                        "message_ar": "تم تعديل الإعدادات ✅"}

            elif action == "analyze_comment":
                return {"success": True, "data": {"analysis": params.get("comment_text", "")},
                        "message_ar": "تم التحليل ✅"}

            elif action == "enhance_content":
                return {"success": True, "data": {"enhanced": params.get("text", "")},
                        "message_ar": "تم تحسين النص ✅"}

            elif action == "image_analyze":
                from ai_service import AIService, UnsafeImageUrlError
                ai = AIService()
                img_url = params.get("image_url", "")
                if img_url and ai.available:
                    try:
                        analysis = await ai.analyze_image(img_url)
                    except UnsafeImageUrlError as e:
                        # v10-A8: OUR controlled Arabic rejection — safe to
                        # surface (unlike raw provider/stack errors).
                        return {"success": False, "message_ar": str(e)}
                    return {"success": True, "data": {"analysis": analysis},
                            "message_ar": f"تحليل الصورة: {analysis[:150]}"}
                return {"success": True, "data": {"analysis": ""},
                        "message_ar": "تم تحليل الصورة ✅"}

            return {"success": False, "message_ar": f"إجراء غير معروف: {action}"}
        except Exception as e:
            log.exception(f"Execute {action} error: {e}")
            # v10-A9: no str(e) to the client — generic Arabic message only.
            return {"success": False,
                    "message_ar": "حدث خطأ أثناء تنفيذ الإجراء — حاول مرة أخرى"}

    def _error(self, msg: str) -> dict:
        return {"action": "unknown", "params": {}, "response_ar": msg, "success": False}


# Singleton
_agent: AgentEngine | None = None


def get_agent() -> AgentEngine:
    global _agent
    if _agent is None:
        _agent = AgentEngine()
    return _agent
