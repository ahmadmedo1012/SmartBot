"""
Agent Brain — LLM Orchestrator Core.
Reasoning engine: receives user input + context, calls LLM, returns structured action.
"""
from __future__ import annotations
import json, logging
from typing import Any

from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from agent_tools import get_tools_system_prompt, get_tool, get_tool_schema
from ai_service import AIService

log = logging.getLogger("fb-agent-brain")

SYSTEM_PROMPT_BASE = """أنت وكيل SmartBot الذكي — العقل المدبر للنظام.

مهمتك تفسير أوامر المستخدم باللهجة الليبية وتنفيذها مباشرة.

## القواعد الأساسية:
1. أنت ذكي — لا تنشر النص حرفياً. حلّله وطوّره بنفسك.
2. كل الأدوات تنفذ مباشرة — لا تطلب تأكيد.
3. للصور: حللها أولاً عبر image_analyze ثم انشر مع وصف مناسب.
4. إذا ما فهمت الأمر، استخدم action=unknown واطلب توضيح.
5. استخدم السياق والتاريخ لتخصيص الردود.

مثال:
- "انشر بوست ترحيبي لرمضان" → publish_post مع رسالة احترافية عن رمضان
- "رد على هذا التعليق" → reply_to_comment مع رد ذكي
- "شغل البوت" → toggle_bot مع action=start

الصيغة المطلوبة — JSON فقط:
{
  "action": "اسم_الأداة",
  "params": { ... },
  "response_ar": "رسالة بالليبي تشرح شنو سويت",
  "confidence": 0.0-1.0
}
"""

_action_handlers: dict[str, callable] = {}


def register_handler(action: str, handler: callable):
    _action_handlers[action] = handler


def get_handler(action: str) -> callable | None:
    return _action_handlers.get(action)


_ai = None


def _get_ai():
    global _ai
    if _ai is None:
        _ai = AIService()
    return _ai


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((ConnectionError, TimeoutError)),
    reraise=True,
)
async def _retry_llm_call(client, model: str, text: str, ctx: dict) -> dict:
    """Retry-wrapped LLM call. Only retries connection/timeout errors, not API errors."""
    prompt = f"أمر المستخدم: \"{text}\"\nالسياق: {json.dumps(ctx, ensure_ascii=False)}"
    r = await client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": build_system_prompt(
                ctx.get("_session", []), ctx.get("_memory", {}))},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.4, max_tokens=800,
    )
    result = _parse_json(r.choices[0].message.content or "{}")
    return result


def build_system_prompt(session_history: list[dict], user_memory: dict) -> str:
    """Build the full system prompt with tools + context + memory."""
    tools_section = get_tools_system_prompt()
    memory_section = ""
    if user_memory.get("preferences"):
        memory_section = f"\n\n## تفضيلات المستخدم:\n{json.dumps(user_memory['preferences'], ensure_ascii=False)}"
    history_section = ""
    if session_history:
        recent = session_history[-5:]
        history_section = f"\n\n## آخر المحادثات:\n{json.dumps(recent, ensure_ascii=False)}"
    return f"{SYSTEM_PROMPT_BASE}\n\n{tools_section}{memory_section}{history_section}"


async def reason(text: str, context: dict | None = None) -> dict:
    """Core reasoning: call LLM, parse structured JSON response."""
    try:
        ai = _get_ai()
        ctx = context or {}
    except Exception:
        ai = _get_ai.cache = {"available": False}
        class _Fake: available = False
        ai = _Fake()
        ctx = context or {}
    prompt = f"أمر المستخدم: \"{text}\"\nالسياق: {json.dumps(ctx, ensure_ascii=False)}"

    # Try LLM first
    if getattr(ai, 'available', False):
        try:
            client = ai._openai_client
            if ai._provider == "openai" and client:
                r = await _retry_llm_call(client, ai._openai_model, text, ctx)
                if r.get("action"):
                    return r
            elif ai._provider == "gemini" and ai._google_module:
                genai = ai._google_module
                model = genai.GenerativeModel(ai._model)
                full = f"{build_system_prompt(ctx.get('_session', []), ctx.get('_memory', {}))}\n\n{prompt}"
                r = await model.generate_content_async(full)
                result = _parse_json(r.text)
                if result.get("action"):
                    return result
        except Exception as e:
            log.error(f"Brain LLM error: {e}")

    # Fallback: heuristic parse
    return _heuristic_parse(text, ctx)


def _heuristic_parse(text: str, ctx: dict) -> dict:
    """Smart fallback when AI unavailable — keyword-based but content-aware."""
    t = text.lower()

    if any(k in t for k in ["نشر", "انشر", "بوست", "منشور", "post", "publish"]):
        msg = text
        for prefix in ["انشر", "نشر", "بوست", "منشور", "post", "publish", "اكتب"]:
            if prefix in t:
                parts = text.split(prefix, 1)
                if len(parts) > 1 and parts[1].strip():
                    msg = parts[1].strip()
                    break
        if "ترحيب" in t:
            msg = f"🌹 أهلاً بكم متابعينا الأعزاء!\n\nنفتخر بوجودكم معنا. فريق SmartBot في خدمتكم.\n\n#ترحيب #SmartBot"
        elif "رمضان" in t:
            msg = f"🌙 كل عام وأنتم بخير! تقبل الله منا ومنكم صالح الأعمال.\n\n#رمضان #SmartBot"
        elif "تخفيض" in t or "عرض" in t or "خصم" in t:
            msg = f"🔥 عرض مميز!\n\n{msg}\n\n⏳ لفترة محدودة!\n\n#عرض_خاص #SmartBot"
        return {
            "action": "publish_post",
            "params": {"message": msg},
            "response_ar": f"تم تحسين النص وجاهز للنشر ✅\n\n{msg[:100]}...",
            "confidence": 0.8,
        }

    if any(k in t for k in ["شغل البوت", "فعل البوت", "start bot"]):
        return {"action": "toggle_bot", "params": {"action": "start"},
                "response_ar": "تم تشغيل البوت ✅", "confidence": 0.9}
    if any(k in t for k in ["أوقف البوت", "stop bot", "أطفي"]):
        return {"action": "toggle_bot", "params": {"action": "stop"},
                "response_ar": "تم إيقاف البوت ✅", "confidence": 0.9}
    if any(k in t for k in ["احصائيات", "الإحصائيات", "stats", "تقارير"]):
        return {"action": "list_stats", "params": {},
                "response_ar": "باش نجيب الإحصائيات كاملة", "confidence": 0.9}
    if any(k in t for k in ["قاعدة", "rule", "اضف قاعدة"]):
        return {"action": "create_rule", "params": {"raw": text},
                "response_ar": "احتاج تفاصيل أكثر: اسم القاعدة والكلمات المفتاحية ونص الرد",
                "confidence": 0.6}

    return {"action": "unknown", "params": {"message": text},
            "response_ar": "ما فهمتش الأمر. جرب: انشر بوست، شغل البوت، احصائيات",
            "confidence": 0.0}


def _validate_with_schema(result: dict) -> dict:
    """Validate result['params'] against tool's JSON schema. Returns result or fixes/zeros confidence on mismatch."""
    action = result.get("action", "unknown")
    params = result.get("params", {})
    if action == "unknown":
        return result
    schema = get_tool_schema(action)
    if not schema:
        return result  # no validation for unknown/old tools
    try:
        import jsonschema
        jsonschema.validate(params, schema)
        return result
    except Exception as e:
        log.warning(f"jsonschema validation failed for {action}: {e}")
        result.setdefault("warnings", []).append(f"المُدخلات غير متطابقة مع الصيغة المطلوبة")
        result["confidence"] = min(result.get("confidence", 0.5), 0.3)
        return result


def _parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[-1]
        text = text.rsplit("```", 1)[0]
    try:
        result = json.loads(text.strip())
        return _validate_with_schema(result) if result.get("action") else result
    except json.JSONDecodeError:
        import re
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if m:
            try:
                result = json.loads(m.group())
                return _validate_with_schema(result) if result.get("action") else result
            except json.JSONDecodeError:
                pass
        return {"action": "unknown", "params": {}, "response_ar": "آسف ما فهمتش", "confidence": 0.0}
