"""
SmartBot AI Agent — interprets Arabic commands and executes bot actions.
Command categories: publish, reply, campaign, rules, analytics, system, dm.
"""
import json, logging, os, re, time
from typing import Any

log = logging.getLogger("fb-agent")

SYSTEM_PROMPT = """أنت وكيل SmartBot الذكي. مهمتك تفسير أوامر المستخدم باللهجة الليبية وتحديد الإجراء المطلوب.

المتغيرات المتاحة:
- page_id: معرف الصفحة
- bot_running: حالة البوت (شغال/متوقف)
- rules_count: عدد القواعد
- reply_count: عدد الردود

أنواع الإجراءات:
1. publish_post - نشر منشور على فيسبوك
   يتطلب: message (نص المنشور)
   اختياري: image_url, scheduled_at

2. reply_to_comment - رد على تعليق
   يتطلب: comment_id, message

3. toggle_bot - تشغيل/إيقاف البوت
   يتطلب: action (start/stop)

4. create_rule - إنشاء قاعدة رد تلقائي
   يتطلب: name, keywords, reply_template
   اختياري: dm_template, description

5. list_stats - عرض إحصائيات
   اختياري: period (today/week/month)

6. unknown - أمر غير معروف
   يتطلب: message (رسالة توضيح)

7. system - أوامر النظام (restart, interval, cooldown)
   يتطلب: command, args

أعد JSON بالتنسيق التالي فقط:
{
  "action": "publish_post|reply_to_comment|toggle_bot|create_rule|list_stats|system|unknown",
  "params": { ... },
  "response_ar": "رسالة تأكيد بالليبي للمستخدم",
  "need_confirmation": false
}
need_confirmation: true إذا كان الإجراء خطير (مثل حذف، نشر على صفحة، إيقاف البوت)
"""

class AgentEngine:
    def __init__(self):
        from ai_service import AIService
        self.ai = AIService()
        self._history: list[dict] = []

    async def interpret(self, text: str, context: dict | None = None) -> dict:
        """Interpret a user command and return action + params."""
        ctx = context or {}
        prompt = f"أمر المستخدم: \"{text}\"\nالسياق: {json.dumps(ctx, ensure_ascii=False)}"

        try:
            if self.ai.available:
                from ai_service import _SUGGEST_REPLIES_SYSTEM
                client = self.ai._openai_client
                if client:
                    r = await client.chat.completions.create(
                        model=self.ai._openai_model,
                        messages=[
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": prompt},
                        ],
                        response_format={"type": "json_object"},
                        temperature=0.3, max_tokens=500,
                    )
                    result = self._parse_json(r.choices[0].message.content or "{}")
                    if result.get("action"):
                        return result
            return self._heuristic_parse(text, ctx)
        except Exception as e:
            log.error(f"Agent interpret error: {e}")
            return self._heuristic_parse(text, ctx)

    def _heuristic_parse(self, text: str, ctx: dict) -> dict:
        """Rule-based fallback when AI is unavailable."""
        t = text.lower()

        # Publish
        if any(k in t for k in ["نشر", "انشر", "بوست", "منشور", "post", "publish"]):
            msg = text
            for prefix in ["انشر", "نشر", "بوست", "منشور", "post", "publish", "اكتب"]:
                if prefix in t:
                    parts = text.split(prefix, 1)
                    if len(parts) > 1 and parts[1].strip():
                        msg = parts[1].strip()
                        break
            if "جدول" in t or "اليوم" in t or "بكرة" in t:
                import datetime
                scheduled = (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat()
                return {"action": "publish_post", "params": {"message": msg, "scheduled_at": scheduled},
                        "response_ar": f"تمام! حانشر المنشور بعد ساعة. النص: {msg[:50]}...", "need_confirmation": True}
            return {"action": "publish_post", "params": {"message": msg},
                    "response_ar": f"تم فهم الأمر! حانشر: {msg[:50]}...", "need_confirmation": True}

        # Reply
        if any(k in t for k in ["رد", "جاوب", "reply", "رد على"]):
            return {"action": "reply_to_comment", "params": {"message": text},
                    "response_ar": "أحتاج رابط التعليق أو معرفه عشان أرد عليه", "need_confirmation": False}

        # Bot control
        if any(k in t for k in ["شغل البوت", "فعل البوت", "start bot", "شغال"]):
            return {"action": "toggle_bot", "params": {"action": "start"},
                    "response_ar": "تمام! باش نبدا نشغل البوت", "need_confirmation": True}
        if any(k in t for k in ["أوقف البوت", "أطفى البوت", "stop bot", "أطفي"]):
            return {"action": "toggle_bot", "params": {"action": "stop"},
                    "response_ar": "تمام! باش نوقف البوت", "need_confirmation": True}

        # Stats
        if any(k in t for k in ["إحصائيات", "احصائيات", "تقارير", "stats", "statistics", "كم رد", "كم"]):
            return {"action": "list_stats", "params": {},
                    "response_ar": "باش نجيب الإحصائيات كاملة", "need_confirmation": False}

        # Rules
        if any(k in t for k in ["قاعدة", "قواعد", "rule", "اضف قاعدة", "إنشاء قاعدة"]):
            return {"action": "create_rule", "params": {"raw": text},
                    "response_ar": "احتاج تفاصيل أكثر: اسم القاعدة، الكلمات المفتاحية، ونص الرد", "need_confirmation": False}

        # System
        if any(k in t for k in ["إعدادات", "ضبط", "interval", "وقت", "سرعة"]):
            return {"action": "system", "params": {"command": "interval", "args": text},
                    "response_ar": "تقصد تغيير وقت التفحص؟", "need_confirmation": False}

        return {"action": "unknown", "params": {"message": text},
                "response_ar": "آسف ما فهمتش الأمر. جرب: انشر بوست، شغل البوت، رد على تعليق، احصائيات, قاعدة جديدة",
                "need_confirmation": False}

    async def execute(self, action: str, params: dict, fb=None, db=None) -> dict:
        """Execute an interpreted command. Returns result dict."""
        try:
            if action == "publish_post":
                return await self._exec_publish(params, fb)
            elif action == "reply_to_comment":
                return await self._exec_reply(params, fb)
            elif action == "toggle_bot":
                return {"success": True, "data": {"action": params.get("action")},
                        "message_ar": "تم الأمر بنجاح ✅"}
            elif action == "create_rule":
                return {"success": True, "data": params,
                        "message_ar": "تم إنشاء القاعدة ✅"}
            elif action == "list_stats":
                return {"success": True, "data": params,
                        "message_ar": "الإحصائيات:"}
            elif action == "system":
                return {"success": True, "data": params,
                        "message_ar": "تم تعديل الإعداد ✅"}
            else:
                return {"success": False, "error": "إجراء غير معروف",
                        "message_ar": "ما فهمتش الأمر 😅"}
        except Exception as e:
            log.error(f"Agent execute error: {e}")
            return {"success": False, "error": str(e),
                    "message_ar": f"صار خطأ: {str(e)[:100]}"}

    async def _exec_publish(self, params: dict, fb) -> dict:
        if not fb:
            return {"success": False, "error": "FB not configured"}
        msg = params.get("message", "")
        result = await fb.post_to_page(msg)
        if result and result.get("id"):
            return {"success": True, "data": {"post_id": result["id"]},
                    "message_ar": f"تم نشر المنشور بنجاح ✅\n{msg[:100]}"}
        return {"success": False, "error": "فشل النشر"}

    async def _exec_reply(self, params: dict, fb) -> dict:
        cid = params.get("comment_id", "")
        msg = params.get("message", "")
        if not cid:
            return {"success": False, "error": "Comment ID required"}
        result = await fb.reply_to_comment(cid, msg)
        if result:
            return {"success": True, "data": {},
                    "message_ar": f"تم الرد على التعليق ✅"}
        return {"success": False, "error": "فشل الرد"}

    def _parse_json(self, text: str) -> dict:
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            text = text.rsplit("```", 1)[0]
        try:
            return json.loads(text.strip())
        except json.JSONDecodeError:
            import re
            m = re.search(r"\{.*\}", text, re.DOTALL)
            if m:
                try:
                    return json.loads(m.group())
                except json.JSONDecodeError:
                    pass
            return {"action": "unknown", "params": {"message": text},
                    "response_ar": "آسف ما فهمتش", "need_confirmation": False}

# Singleton
_agent: "AgentEngine | None" = None

def get_agent() -> AgentEngine:
    global _agent
    if _agent is None:
        _agent = AgentEngine()
    return _agent
