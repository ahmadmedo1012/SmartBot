"""
AI Service — Smart Reply Engine for SmartBot.
Supports Gemini & OpenAI providers.

Usage:
    ai = AIService()
    suggestions = await ai.suggest_replies(comment_text, page_context)
    tone = await ai.analyze_tone(comment_text)
"""
import logging, json, os, time
from typing import Any

log = logging.getLogger("fb-ai")

# ---------------------------------------------------------------------------
# Optional provider SDKs — graceful fallback if not installed
# ---------------------------------------------------------------------------
_openai = None
_google = None

def _lazy_openai():
    global _openai
    if _openai is None:
        try:
            from openai import AsyncOpenAI
            _openai = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
        except Exception:
            _openai = False  # sentinel
    return _openai if _openai is not False else None

def _lazy_google():
    global _google
    if _google is None:
        try:
            import google.generativeai as genai
            genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
            _google = genai
        except Exception:
            _google = False
    return _google if _google is not False else None

# ---------------------------------------------------------------------------
# Provider enum
# ---------------------------------------------------------------------------
PROVIDER_NONE = "none"
PROVIDER_OPENAI = "openai"
PROVIDER_GEMINI = "gemini"

# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

_SUGGEST_REPLIES_SYSTEM = """أنت مساعد ردود ذكي لصفحة فيسبوك تجارية. مهمتك توليد ردود احترافية على تعليقات العملاء.

تعليمات:
1. الردود يجب أن تكون باللغة العربية الفصحى أو العامية حسب التعليق
2. استخدم أسلوب مهذب ومحترف
3. قدم 3 اقتراحات ردود مختلفة في الطول والأسلوب
4. كل رد يجب أن يتضمن اسم العميل {name} في بدايته
5. صنف نية التعليق: استفسار | شكوى | إشادة | تواصل | محايد
6. حدد المشاعر: إيجابي | سلبي | محايد | عاجل

أعد الرد بهذا التنسيق JSON:
{{
  "suggestions": ["رد 1", "رد 2", "رد 3"],
  "intent": "استفسار | شكوى | إشادة | تواصل | محايد",
  "sentiment": "إيجابي | سلبي | محايد | عاجل",
  "confidence": 0.0-1.0
}}"""

_ANALYZE_TONE_SYSTEM = """حلل مشاعر ونبرة هذا التعليق بدقة. أعد JSON:
{{
  "sentiment": "positive|negative|neutral|urgent",
  "intent": "complaint|question|praise|contact|neutral",
  "urgency": 0.0-1.0,
  "key_topics": ["موضوع1", "موضوع2"],
  "summary": "جملة تلخيصية"
}}"""

# ---------------------------------------------------------------------------
# AI Service
# ---------------------------------------------------------------------------

class AIService:
    def __init__(self):
        self._provider = self._detect_provider()
        self._openai_client = _lazy_openai()
        self._google_module = _lazy_google()
        self._model = os.getenv("AI_MODEL", "gemini-1.5-flash")
        self._openai_model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    def _detect_provider(self) -> str:
        if os.getenv("OPENAI_API_KEY"):
            return PROVIDER_OPENAI
        if os.getenv("GEMINI_API_KEY"):
            return PROVIDER_GEMINI
        return PROVIDER_NONE

    @property
    def available(self) -> bool:
        return self._provider != PROVIDER_NONE

    @property
    def provider_name(self) -> str:
        return self._provider

    # ------------------------------------------------------------------
    # Suggest replies
    # ------------------------------------------------------------------

    async def suggest_replies(self, text: str, name: str = "", page_context: str = "") -> dict[str, Any]:
        """Generate 3 reply suggestions given a comment."""
        if not self.available or not text:
            return self._fallback_suggestions(text, name)

        prompt = f"تعليق عميل: \"{text}\"\nاسم العميل: {name or 'العميل'}\nسياق الصفحة: {page_context or 'متجر تجاري'}"
        try:
            if self._provider == PROVIDER_OPENAI:
                return await self._openai_suggest(prompt)
            elif self._provider == PROVIDER_GEMINI:
                return await self._gemini_suggest(prompt)
        except Exception as e:
            log.error(f"AI suggestion error: {e}")
        return self._fallback_suggestions(text, name)

    async def _openai_suggest(self, prompt: str) -> dict:
        client = self._openai_client
        if not client:
            return self._fallback_suggestions(prompt, "")
        r = await client.chat.completions.create(
            model=self._openai_model,
            messages=[
                {"role": "system", "content": _SUGGEST_REPLIES_SYSTEM},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.7,
            max_tokens=500,
        )
        return self._parse_ai_json(r.choices[0].message.content or "{}")

    async def _gemini_suggest(self, prompt: str) -> dict:
        genai = self._google_module
        if not genai:
            return self._fallback_suggestions(prompt, "")
        model = genai.GenerativeModel(self._model)
        full_prompt = f"{_SUGGEST_REPLIES_SYSTEM}\n\n{prompt}"
        r = await model.generate_content_async(full_prompt)
        return self._parse_ai_json(r.text)

    # ------------------------------------------------------------------
    # Tone analysis
    # ------------------------------------------------------------------

    async def analyze_tone(self, text: str) -> dict[str, Any]:
        """Analyze sentiment, intent, urgency of a comment."""
        if not self.available or not text:
            return {"sentiment": "neutral", "intent": "neutral", "urgency": 0.0, "key_topics": [], "summary": ""}

        prompt = f"حلل هذا التعليق: \"{text}\""
        try:
            if self._provider == PROVIDER_OPENAI:
                client = self._openai_client
                if not client:
                    return {"sentiment": "neutral", "intent": "neutral", "urgency": 0.0, "key_topics": [], "summary": ""}
                r = await client.chat.completions.create(
                    model=self._openai_model,
                    messages=[
                        {"role": "system", "content": _ANALYZE_TONE_SYSTEM},
                        {"role": "user", "content": prompt},
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.3,
                )
                return self._parse_ai_json(r.choices[0].message.content or "{}")
            elif self._provider == PROVIDER_GEMINI:
                genai = self._google_module
                if not genai:
                    return {"sentiment": "neutral", "intent": "neutral", "urgency": 0.0, "key_topics": [], "summary": ""}
                model = genai.GenerativeModel(self._model)
                r = await model.generate_content_async(f"{_ANALYZE_TONE_SYSTEM}\n\n{prompt}")
                return self._parse_ai_json(r.text)
        except Exception as e:
            log.error(f"Tone analysis error: {e}")
        return {"sentiment": "neutral", "intent": "neutral", "urgency": 0.0, "key_topics": [], "summary": ""}

    # ------------------------------------------------------------------
    # Auto-reply generation (one-shot)
    # ------------------------------------------------------------------

    async def generate_reply(self, text: str, name: str = "", tone: str = "",
                             keywords: list[str] | None = None) -> str | None:
        """Generate one optimal reply for auto-reply, matching keywords context."""
        if not self.available or not text:
            return None
        kw_context = f"الكلمات المفتاحية المطابقة: {', '.join(keywords)}. " if keywords else ""
        prompt = (
            f"تعليق عميل: \"{text}\"\nاسم العميل: {name or 'العميل'}\n{kw_context}"
            f"النبرة المطلوبة: {tone or 'ودية مهنية'}\n"
            "ولد رد واحد مناسب ومختصر (لا يتجاوز 200 حرف). اكتب الرد مباشرة بدون مقدمة."
        )
        try:
            if self._provider == PROVIDER_OPENAI:
                client = self._openai_client
                if not client:
                    return None
                r = await client.chat.completions.create(
                    model=self._openai_model,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=0.6, max_tokens=250,
                )
                return (r.choices[0].message.content or "").strip()
            elif self._provider == PROVIDER_GEMINI:
                genai = self._google_module
                if not genai:
                    return None
                model = genai.GenerativeModel(self._model)
                r = await model.generate_content_async(prompt)
                return (r.text or "").strip()
        except Exception as e:
            log.error(f"Generate reply error: {e}")
        return None

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _fallback_suggestions(self, text: str, name: str) -> dict:
        n = name or "صديقنا"
        return {
            "suggestions": [
                f"{n} شكراً لتواصلك 😊 سنتواصل معك قريباً",
                f"{n} أهلاً بك! شكراً لتعليقك. هل يمكننا مساعدتك بأي شيء آخر؟",
                f"{n} نحن سعداء بتواصلك. للاستفسار السريع يرجى مراسلتنا على الخاص 📩",
            ],
            "intent": "محايد",
            "sentiment": "محايد",
            "confidence": 0.6,
        }

    def _parse_ai_json(self, text: str) -> dict:
        text = text.strip()
        # Strip markdown code fences if present
        if text.startswith("```"):
            text = text.split("\n", 1)[-1]
            text = text.rsplit("```", 1)[0]
        try:
            return json.loads(text.strip())
        except json.JSONDecodeError:
            log.warning(f"AI returned non-JSON: {text[:200]}")
            # Try to extract JSON from text
            import re
            m = re.search(r"\{.*\}", text, re.DOTALL)
            if m:
                try:
                    return json.loads(m.group())
                except json.JSONDecodeError:
                    pass
            return {"suggestions": [], "intent": "محايد", "sentiment": "محايد", "confidence": 0.0}
