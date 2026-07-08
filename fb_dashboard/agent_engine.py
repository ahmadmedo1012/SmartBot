"""
SmartBot AI Agent — interprets Arabic commands and executes bot actions.
Command categories: publish, reply, campaign, rules, analytics, system, dm.
Uses AI to analyze, improve, and enhance content before executing.
"""
import json, logging, os, re, time
from typing import Any
from datetime import datetime

log = logging.getLogger("fb-agent")

SYSTEM_PROMPT = """أنت وكيل SmartBot الذكي. مهمتك تفسير أوامر المستخدم باللهجة الليبية.

أنت ذكي — لا تنشر النص حرفياً أبداً. حلل الأمر وطوّر المحتوى بنفسك.

مثال:
- قال "انشر بوست ترحيبي لرمضان" → أنت تكتب منشور احترافي عن رمضان
- قال "انشر بوست عن تخفيضات" → أنت تصوغ إعلان تسويقي محترف
- قال "انشر بوست عادي" → أنت تضيف لمسة احترافية

المتغيرات المتاحة:
- page_id: معرف الصفحة
- bot_running: حالة البوت (شغال/متوقف)
- rules_count: عدد القواعد
- reply_count: عدد الردود
- now: التاريخ والوقت الحالي

أنواع الإجراءات:
1. publish_post - نشر منشور على فيسبوك
   يتطلب: message (نص المنشور المُحسَّن)
   اختياري: image_url, scheduled_at

2. reply_to_comment - رد على تعليق
   يتطلب: comment_id, message (رد ذكي محترف)

3. toggle_bot - تشغيل/إيقاف البوت
   يتطلب: action (start/stop)

4. create_rule - إنشاء قاعدة رد تلقائي
   يتطلب: name, keywords, reply_template
   اختياري: dm_template, description

5. enhance_content - تحسين نص دون نشره
   يتطلب: text (النص الأصلي), enhanced (النسخة المحسنة)

6. list_stats - عرض إحصائيات

7. system - أوامر النظام

أعد JSON بالتنسيق التالي فقط:
{
  "action": "publish_post|reply_to_comment|toggle_bot|create_rule|enhance_content|list_stats|system|unknown",
  "params": { ... },
  "response_ar": "رسالة بالليبي تشرح ما فهمته وشنو راح تسوي",
  "need_confirmation": false
}
need_confirmation: true للأفعال الخطيرة (نشر، حذف، إيقاف بوت)
"""

class AgentEngine:
    def __init__(self):
        from ai_service import AIService
        self.ai = AIService()
        self._history: list[dict] = []

    async def enhance_with_ai(self, text: str, intent: str = "post") -> str:
        """Use AI to improve content before publishing."""
        if not self.ai.available or not text.strip():
            return text
        prompts = {
            "post": f"المستخدم قال: \"{text}\"\n\nحسّن هذا النص ليكون منشور فيسبوك احترافي وجذاب باللهجة الليبية. أضف لمسة تسويقية وإبداعية. لا تغير المعنى لكن خليه أحسن. اكتب الرد فقط بدون مقدمة.",
            "reply": f"المستخدم قال: \"{text}\"\n\nحسّن هذا الرد ليكون محترف ولطيف. استخدم اللهجة الليبية. اكتب الرد فقط.",
            "rule": f"المستخدم وصف قاعدة: \"{text}\"\n\nاستخرج اسم القاعدة والكلمات المفتاحية ونص الرد المثالي. أعد JSON: {{\"name\":\"\", \"keywords\":[\"\"], \"reply_template\":\"\"}}",
        }
        prompt = prompts.get(intent, prompts["post"])
        try:
            client = self.ai._openai_client
            if client:
                r = await client.chat.completions.create(
                    model=self.ai._openai_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.7, max_tokens=500,
                )
                enhanced = (r.choices[0].message.content or "").strip()
                if enhanced and len(enhanced) > 10:
                    return enhanced
        except Exception as e:
            log.error(f"Enhance error: {e}")
        return text

    async def interpret(self, text: str, context: dict | None = None) -> dict:
        """Interpret a user command using AI + content enhancement."""
        ctx = context or {}
        ctx["now"] = datetime.utcnow().isoformat()
        prompt = f"أمر المستخدم: \"{text}\"\nالسياق: {json.dumps(ctx, ensure_ascii=False)}"

        try:
            if self.ai.available:
                client = self.ai._openai_client
                if client:
                    r = await client.chat.completions.create(
                        model=self.ai._openai_model,
                        messages=[
                            {"role": "system", "content": SYSTEM_PROMPT},
                            {"role": "user", "content": prompt},
                        ],
                        response_format={"type": "json_object"},
                        temperature=0.4, max_tokens=800,
                    )
                    result = self._parse_json(r.choices[0].message.content or "{}")
                    if result.get("action"):
                        # Enhance content for publish/reply
                        if result["action"] == "publish_post":
                            msg = result.get("params", {}).get("message", text)
                            enhanced = await self.enhance_with_ai(msg, "post")
                            result["params"]["message"] = enhanced
                            result["params"]["original"] = msg
                            result["response_ar"] = f"فهمتك! 🎯\n\nحسّنت النص وخليته احترافي:\n\n{enhanced[:200]}{'...' if len(enhanced) > 200 else ''}\n\nننشره؟"
                        elif result["action"] == "reply_to_comment":
                            msg = result.get("params", {}).get("message", text)
                            enhanced = await self.enhance_with_ai(msg, "reply")
                            result["params"]["message"] = enhanced
                            result["params"]["original"] = msg
                        return result
            return self._heuristic_parse(text, ctx)
        except Exception as e:
            log.error(f"Agent interpret error: {e}")
            return self._heuristic_parse(text, ctx)

    def _heuristic_parse(self, text: str, ctx: dict) -> dict:
        """Smart fallback when AI unavailable — still enhances content."""
        t = text.lower()
        now = datetime.utcnow()

        # Determine if seasonal
        month = now.month
        season = ""
        if month in (9, 10, 11, 12, 1, 2): season = "خريفية/شتوية"
        elif month in (3, 4, 5): season = "ربيعية"
        else: season = "صيفية"

        # Publish with smart content generation
        if any(k in t for k in ["نشر", "انشر", "بوست", "منشور", "post", "publish"]):
            msg = text
            for prefix in ["انشر", "نشر", "بوست", "منشور", "post", "publish", "اكتب"]:
                if prefix in t:
                    parts = text.split(prefix, 1)
                    if len(parts) > 1 and parts[1].strip():
                        msg = parts[1].strip()
                        break
            # Smart content generation
            if "ترحيبي" in t or "ترحيب" in t:
                msg = f"🌹 أهلاً بكم متابعينا الأعزاء!\n\nنفتخر بوجودكم معنا في صفحتنا. فريق عمل SmartBot في خدمتكم على مدار الساعة.\n\nلا تترددوا في التواصل معنا لأي استفسار أو طلب. نورتونا 🤍\n\n#ترحيب #فريق_SmartBot #خدمة_العملاء"
            elif "رمضان" in t or "عيد" in t:
                msg = f"🌙 كل عام وأنتم بخير بمناسبة {msg[:30]}!\n\nأسرة SmartBot تتمنى لكم أياماً مليئة بالبركة والفرح. تقبل الله منا ومنكم صالح الأعمال.\n\nنحن هنا لخدمتكم طوال الشهر الفضيل ✨\n\n#رمضان #كل_عام_وأنتم_بخير #SmartBot"
            elif "تخفيض" in t or "عرض" in t or "خصم" in t or "حملة" in t:
                msg = f"🔥 عرض {season} المميز!\n\n{msg}\n\n⏳ العرض لفترة محدودة — لا تفوت الفرصة!\n\nللتواصل والطلب، راسلونا على الخاص 📩\n\n#عرض_خاص #{season} #SmartBot"
            else:
                msg = f"{msg}\n\n#SmartBot #فيسبوك"

            if "جدول" in t or "بكرة" in t or "غداً" in t:
                scheduled = (now.replace(hour=9, minute=0, second=0) + __import__('datetime').timedelta(days=1)).isoformat()
                return {"action": "publish_post", "params": {"message": msg, "scheduled_at": scheduled},
                        "response_ar": f"تم تحسين النص! حانشره بكرة الصباح ☀️\n\n{msg[:100]}...", "need_confirmation": True}
            return {"action": "publish_post", "params": {"message": msg},
                    "response_ar": f"فهمتك! النص أصبح جاهز: {msg[:80]}...", "need_confirmation": True}

        if any(k in t for k in ["رد", "جاوب", "reply", "رد على"]):
            return {"action": "reply_to_comment", "params": {"message": text},
                    "response_ar": "أحتاج رابط التعليق أو معرفه عشان أرد عليه", "need_confirmation": False}

        if any(k in t for k in ["شغل البوت", "فعل البوت", "start bot", "شغال"]):
            return {"action": "toggle_bot", "params": {"action": "start"},
                    "response_ar": "تمام! باش نبدا نشغل البوت", "need_confirmation": True}
        if any(k in t for k in ["أوقف البوت", "أطفى البوت", "stop bot", "أطفي"]):
            return {"action": "toggle_bot", "params": {"action": "stop"},
                    "response_ar": "تمام! باش نوقف البوت", "need_confirmation": True}

        if any(k in t for k in ["إحصائيات", "احصائيات", "تقارير", "stats", "statistics", "كم رد", "كم"]):
            return {"action": "list_stats", "params": {},
                    "response_ar": "باش نجيب الإحصائيات كاملة", "need_confirmation": False}

        if any(k in t for k in ["قاعدة", "قواعد", "rule", "اضف قاعدة", "إنشاء قاعدة"]):
            return {"action": "create_rule", "params": {"raw": text},
                    "response_ar": "احتاج تفاصيل أكثر: اسم القاعدة، الكلمات المفتاحية، ونص الرد", "need_confirmation": False}

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
        img = params.get("image_url", "")
        if img:
            result = await fb.post_to_page_with_image(msg, img)
        else:
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
