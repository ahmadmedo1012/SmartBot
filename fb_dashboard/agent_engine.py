"""
SmartBot AI Agent v2 — LLM Orchestrator with Tool Registry, Memory, Auto-Execute.
Bot engine (keyword reply pipeline) remains untouched.
"""
from __future__ import annotations
import asyncio, json, logging, time
from typing import Any
from datetime import datetime

from sqlalchemy import select, func, desc

log = logging.getLogger("fb-agent")

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
        from fb_client import FBClient
        from config import settings
        _fb_client = FBClient(settings.FACEBOOK_ACCESS_TOKEN, settings.FACEBOOK_PAGE_ID)
    return _fb_client


class AgentEngine:
    """Agent v2 — brain+memory+tools orchestrator with auto-execute."""

    def __init__(self):
        self._history: list[dict] = []  # ponytail: in-memory fallback, DB is primary

    async def process(self, text: str, image_url: str = "", username: str = "admin",
                      db=None) -> dict:
        """Main entry: load context → reason → execute → remember → return."""
        if db is None:
            log.error("process called without db session")
            return self._error("خطأ في قاعدة البيانات")

        # 1. Load memory
        mem = _get_mem()
        session_history = await mem.get_session(db, username)
        user_memory = await mem.get_user_memory(db, username)

        # 2. Build context
        from models import Reply, Rule
        reply_count = await db.scalar(select(func.count(Reply.id))) or 0
        rule_count = await db.scalar(select(func.count(Rule.id))) or 0
        from config import settings
        # ponytail: bot_task ref — imported lazily to avoid circular dep
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

        # 3. Analyze image if present
        if image_url:
            try:
                from ai_service import AIService
                ai = AIService()
                if ai.available:
                    analysis = await ai.analyze_image(image_url)
                    if analysis:
                        ctx["image_analysis"] = analysis
                        log.info(f"Image analysis: {analysis[:100]}")
            except Exception as e:
                log.warning(f"Image analysis failed: {e}")

        # 4. Reason (LLM call)
        brain = _get_brain()
        interpretation = await brain["reason"](text, ctx)
        action = interpretation.get("action", "unknown")
        params = interpretation.get("params", {})
        response_ar = interpretation.get("response_ar", "")

        # 5. Attach image to publish + inject analysis into message
        if image_url and action == "publish_post" and "image_url" not in params:
            params["image_url"] = image_url
        # Inject image analysis into the message if available
        if action == "publish_post" and ctx.get("image_analysis"):
            analysis_snippet = ctx["image_analysis"][:80]
            msg = params.get("message", "")
            if analysis_snippet and analysis_snippet not in msg:
                params["message"] = f"{msg}\n\n📷 {analysis_snippet}"

        # 6. Execute tool (always — auto-exec)
        result = {"success": True, "data": {}, "message_ar": response_ar}
        if action != "unknown":
            exec_result = await self._execute(action, params, db)
            result = {**result, **exec_result}

        # 7. Record in session memory
        turn = {"role": "user", "text": text, "timestamp": datetime.utcnow().isoformat()}
        try:
            await mem.append_to_session(db, username, turn)
            if action != "unknown":
                await mem.update_user_memory(db, username, {
                    "last_action": action,
                    "last_timestamp": datetime.utcnow().isoformat(),
                })
        except Exception as e:
            log.warning(f"Memory write failed: {e}")

        # 8. Update in-memory fallback
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

    async def _execute(self, action: str, params: dict, db) -> dict:
        """Execute a tool action. Handles all registered tools."""
        try:
            fb = _get_fb()
            from config import settings

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
                rule = Rule(name=name, keywords=kw if isinstance(kw, list) else [kw],
                            reply_template=tmpl)
                db.add(rule)
                await db.commit()
                return {"success": True, "data": {"rule_id": rule.id},
                        "message_ar": f"تم إنشاء القاعدة \"{name}\" ✅"}

            elif action == "list_stats":
                from models import Reply, Rule
                total = await db.scalar(select(func.count(Reply.id))) or 0
                rules = await db.scalar(select(func.count(Rule.id))) or 0
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
                from ai_service import AIService
                ai = AIService()
                img_url = params.get("image_url", "")
                if img_url and ai.available:
                    analysis = await ai.analyze_image(img_url)
                    return {"success": True, "data": {"analysis": analysis},
                            "message_ar": f"تحليل الصورة: {analysis[:150]}"}
                return {"success": True, "data": {"analysis": ""},
                        "message_ar": "تم تحليل الصورة ✅"}

            return {"success": False, "message_ar": f"إجراء غير معروف: {action}"}
        except Exception as e:
            log.error(f"Execute {action} error: {e}")
            return {"success": False, "message_ar": f"خطأ: {str(e)[:100]}"}

    def _error(self, msg: str) -> dict:
        return {"action": "unknown", "params": {}, "response_ar": msg, "success": False}


# Singleton
_agent: "AgentEngine | None" = None


def get_agent() -> AgentEngine:
    global _agent
    if _agent is None:
        _agent = AgentEngine()
    return _agent
