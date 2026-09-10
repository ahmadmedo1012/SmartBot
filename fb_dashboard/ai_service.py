from __future__ import annotations

"""
AI Service — Smart Reply Engine for SmartBot.
Supports Gemini & OpenAI providers.

Usage:
    ai = AIService()
    suggestions = await ai.suggest_replies(comment_text, page_context)
    tone = await ai.analyze_tone(comment_text)
"""
import asyncio
import ipaddress
import json
import logging
import os
from typing import Any
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv

load_dotenv()

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
            _openai = AsyncOpenAI(
    api_key=os.getenv("OPENAI_API_KEY", ""),
    base_url=os.getenv("OPENAI_BASE_URL", None),
)
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
# v10-A8: SSRF guard for URL-fetched images
# ---------------------------------------------------------------------------
class UnsafeImageUrlError(ValueError):
    """رابط صورة رفضه حارس SSRF — مخطط غير https أو مضيف شبكة داخلية.

    رسالة عربية مُحكمة من عندنا (ليست تفاصيل داخلية) فيجوز عرضها للمستخدم.
    """


def _is_private_or_local_host(host: str) -> bool:
    """True إذا كان المضيف محلياً/خاصاً/غير قابل للجلب من الخادم."""
    if not host:
        return True
    if host == "localhost" or host.endswith(".localhost"):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        # ليس IP حرفياً. نرفض الأسماء ذات الترميز الرقمي ("127.1"، "2130706433"،
        # "0x7f000001") لأن مقابس بايثون تحلها إلى loopback رغم أنها ليست IP
        # سليماً بصيغته — ولا يستعملها اسم مضيف مشروع أبداً.
        digits_dots = host.replace(".", "")
        return digits_dots.isdigit() or host.startswith("0x")
    return _ip_is_blocked(ip)


def _ip_is_blocked(ip) -> bool:
    """v15-E4 (D6-H2): True لأي عنوان لا يجوز للخادم جلب/الاتصال به —
    RFC1918 (10/8 · 172.16/12 · 192.168/16) · loopback (127/8 · ::1) ·
    link-local (169.254/16 — يشمل 169.254.169.254 لميتاداتا السحابة) ·
    IPv6 ULA (fc00::/7) · reserved/unspecified · multicast · CGNAT
    (100.64/10 — غير قابل للتوجيه عالمياً: not is_global) — بأي عائلة
    عناوين. الموجب المقبول الوحيد: IP عام قابل للتوجيه (is_global)."""
    return (
        ip.is_private        # 10/8, 172.16/12, 192.168/16, IPv6 ULA…
        or ip.is_loopback    # 127/8, ::1
        or ip.is_link_local  # 169.254/16, fe80::/10
        or ip.is_reserved
        or ip.is_unspecified
        or ip.is_multicast
        or not ip.is_global   # CGNAT 100.64/10 وكل ما ليس قابلاً للتوجيه عالمياً
    )


async def _resolve_host_ips(host: str) -> list[str]:
    """v15-E4 (D6-H2): حلّ DNS للمضيف عبر ``loop.getaddrinfo`` (في منفّذ
    التنفيذ — لا يحجب حلقة الأحداث) وأرجع كل عناوين A/AAAA.

    هذا هو ختم فجوة DNS: الحارس القديم فحص IP الحرفي فقط، فاسم مثل
    ``receipt.evil.ly`` المُوجّه إلى 169.254.169.254 عبر سجل DNS اجتاز الفحص
    ثم حُلّ وقت الجلب — داخل الشبكة. الآن يُرفض أي نطاق يحلّ ولو إلى عنوان
    داخلي واحد."""
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, None)
    return [info[4][0] for info in infos]


async def assert_safe_outbound_url(url: str, label: str = "رابط الصورة") -> None:
    """v15-E4 (D6-H2) — حارس SSRF مع حل DNS، قبل أي جلب/تمرير خارجي.

    الطبقتان:
    1. الفحص السريع المتزامن (``_assert_safe_image_url``): المخطط https فقط
       + رفض IP الحرفي الداخلي بأي صيغة ترميز — عقد v10-A8 كاملاً؛
    2. حلّ DNS (getaddrinfo): الاسم الذي يجتاز الطبقة الأولى ثم يحلّ إلى
       RFC1918/link-local/loopback/IPv6-ULA/reserved يُرفض هنا — برسالة
       عربية مضبوطة من عندنا (لا تفاصيل داخلية).

    ``label`` يخصص نص الرسالة ("رابط الصورة"/"رابط الويبهوك") — الحارس نفسه
    يستعمله flow_engine لفعل الويبهوك (D2-H2). فشل الحل نفسه = رفض صريح
    (لا نعبر نطاقاً لا نستطيع التحقق منه).
    """
    _assert_safe_image_url(url, label=label)
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if not host:
        raise UnsafeImageUrlError(f"{label} مرفوض — العنوان غير صالح")
    try:
        ipaddress.ip_address(host)
        return  # IP حرفي — تحقّق منه الحارس السريع أعلاه
    except ValueError:
        pass
    try:
        ips = await _resolve_host_ips(host)
    except Exception as exc:
        raise UnsafeImageUrlError(
            f"{label} مرفوض — تعذر التحقق من سلامة النطاق"
        ) from exc
    for ip_text in ips:
        try:
            ip = ipaddress.ip_address(ip_text)
        except ValueError:
            continue
        if _ip_is_blocked(ip):
            raise UnsafeImageUrlError(
                f"{label} مرفوض — النطاق يحلّ إلى عنوان شبكة داخلية أو خاصة")


def _assert_safe_image_url(url: str, label: str = "رابط الصورة") -> None:
    """حراسة SSRF قبل أي جلب/تمرير لرابط صورة خارجي (v10-A8، G1#9).

    المسار الخطر: رابط يقرره دماغ LLM من نص المستخدم → أداة image_analyze
    تجلبه من الخادم. القواعد: مخطط https فقط (http قابل للاعتراض)، ورفض
    المضيفات الخاصة/المحلية بأي صيغة ترميز.

    v15-E4 (D6-H2): هذه هي الطبقة السريعة فقط (IP الحرفي) — الفحص الكامل مع
    حل DNS في :func:`assert_safe_outbound_url` (تستدعي هذه أولاً وتمرّر
    label). العقد المتزامن محفوظ كما هو (يستعمله fb_client/pdf/approvals —
    بلا وسيط label = "رابط الصورة" كما كان).
    """
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise UnsafeImageUrlError(f"{label} مرفوض — يُسمح فقط بروابط https")
    if _is_private_or_local_host((parsed.hostname or "").lower()):
        raise UnsafeImageUrlError(
            f"{label} مرفوض — لا يمكن الجلب من مضيفات داخلية أو خاصة")


# v15-E4 (D6-H2): حدود جلب الصور الخادمي — مهلة 10 ثوان وسقف 5MB
# (نفس عائلة _fetch_remote_receipt في approvals.py) وبلا اتباع إعادة توجيه
# (كل قفزة يُعاد التحقق منها بالحارس الكامل أعلاه).
_IMAGE_FETCH_TIMEOUT_S = 10.0
_IMAGE_MAX_BYTES = 5 * 1024 * 1024
_IMAGE_MAX_REDIRECTS = 3


async def _fetch_image_bytes(url: str) -> bytes | None:
    """v15-E4 (D6-H2): جلب صورة محروس — مهلة 10s · سقف 5MB · بلا توجيه.

    - ``follow_redirects=False``: كل 301/302/303/307/308 يُحلّ يدوياً ويُعاد
      عليه الحارس الكامل (حل DNS للهدف الجديد) قبل اتباعه — إعادة التوجيه
      إلى مضيف داخلي تُرفض حتى لو كان الأصل عاماً (حد 3 قفزات)؛
    - قراءة متدفقة مع قطع فوري عند تجاوز سقف الحجم (قبل اكتمال التنزيل)؛
    - أي فشل → None (المستدعي يرد رفضاً نظيفاً).
    """
    current = url
    async with httpx.AsyncClient(
        timeout=httpx.Timeout(_IMAGE_FETCH_TIMEOUT_S), follow_redirects=False,
    ) as client:
        for _hop in range(_IMAGE_MAX_REDIRECTS + 1):
            async with client.stream("GET", current) as resp:
                if resp.status_code in (301, 302, 303, 307, 308):
                    location = resp.headers.get("location")
                    if not location:
                        return None
                    current = str(httpx.URL(current).join(location))
                    # إعادة التحقق الكاملة للقفزة الجديدة (مخطط + DNS)
                    try:
                        await assert_safe_outbound_url(current)
                    except UnsafeImageUrlError:
                        log.warning("image redirect to an unsafe target refused")
                        return None
                    continue
                if resp.status_code != 200:
                    return None
                content_length = resp.headers.get("content-length")
                if content_length and int(content_length) > _IMAGE_MAX_BYTES:
                    log.warning("image fetch exceeded %d bytes — refused", _IMAGE_MAX_BYTES)
                    return None
                buf = bytearray()
                async for chunk in resp.aiter_bytes():
                    buf.extend(chunk)
                    if len(buf) > _IMAGE_MAX_BYTES:
                        log.warning("image fetch exceeded %d bytes mid-stream — refused",
                                    _IMAGE_MAX_BYTES)
                        return None
                return bytes(buf)
    return None

# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

_SUGGEST_REPLIES_SYSTEM = """أنت مساعد ردود ذكي لصفحة فيسبوك تجارية في ليبيا. مهمتك توليد ردود احترافية على تعليقات العملاء.

تعليمات:
1. الردود باللهجة الليبية العامية (مثل: "شنو"، "شكون"، "وين"، "هذاك"، "شحال"، "باهي")
2. استخدم أسلوب مهذب وحنون ومحترف
3. قدم 3 اقتراحات ردود مختلفة: قصير، متوسط، طويل
4. كل رد يبدأ باسم العميل {name}
5. إذا كان التعليق استفسار عن منتج/سعر، أضف عرض أو دعوة للخاص
6. إذا كان شكوى، اعتذر واطلب التواصل على الخاص مع وعد بالتعويض
7. صنف النية والتعليق

أعد JSON:
{{
  "suggestions": ["رد 1", "رد 2", "رد 3"],
  "intent": "استفسار | شكوى | إشادة | تواصل | محايد",
  "sentiment": "إيجابي | سلبي | محايد | عاجل",
  "confidence": 0.0-1.0
}}"""

_ANALYZE_TONE_SYSTEM = """أنت محلل مشاعر متخصص في اللهجة الليبية. حلل التعليق بدقة:
{{
  "sentiment": "positive|negative|neutral|urgent",
  "intent": "complaint|question|praise|contact|neutral",
  "urgency": 0.0-1.0,
  "key_topics": ["موضوع1", "موضوع2"],
  "summary": "ملخص بالعربية الفصحى"
}}"""

# ---------------------------------------------------------------------------
# AI Service
# ---------------------------------------------------------------------------


def _expected_provider_error_types() -> tuple[type[BaseException], ...]:
    """v24-R3 (M7): the EXPECTED failure family for a provider vision call.

    ``analyze_image`` used to swallow ``Exception`` wholesale — provider
    errors, transport errors AND genuine code bugs all answered "" (a
    silent failure indistinguishable from an honest empty result). The
    tuple below is the "expected" set: transport/timeout (httpx,
    asyncio.TimeoutError == TimeoutError on 3.12), decode/value errors
    (bad base64 — binascii.Error subclasses ValueError — malformed
    payloads) and OS-level image errors (PIL's UnidentifiedImageError
    subclasses OSError). Provider SDK API errors are included best-effort
    (installed SDKs only). Anything OUTSIDE this family now propagates to
    the caller, which already maps unexpected exceptions to a generic
    Arabic failure (agent_engine.process / the image_analyze tool).
    """
    types: list[type[BaseException]] = [httpx.HTTPError, TimeoutError, ValueError, OSError]
    try:  # best-effort: the OpenAI SDK's API error family (auth/quota/5xx)
        from openai import APIError as _OpenAIAPIError  # type: ignore[assignment]

        types.append(_OpenAIAPIError)
    except Exception:
        pass
    try:  # best-effort: the Gemini SDK's GoogleAPIError family
        from google.api_core.exceptions import GoogleAPIError  # type: ignore[assignment]

        types.append(GoogleAPIError)
    except Exception:
        pass
    return tuple(types)


_EXPECTED_PROVIDER_ERRORS = _expected_provider_error_types()


class AIService:
    def __init__(self):
        self._provider = self._detect_provider()
        self._openai_client = _lazy_openai()
        self._google_module = _lazy_google()
        self._model = os.getenv("AI_MODEL", "gemini-1.5-flash")
        self._openai_model = os.getenv("OPENAI_MODEL",
            os.getenv("AI_MODEL", "gpt-4o-mini"))
        # v23: the honest-failure surface — the owner's complaint was «AI
        # doesn't work» with ZERO indication why. Every provider call now
        # stashes its last error (short, provider-message only, never a
        # traceback) so /api/ai/* and /api/bot/behavior can SHOW the reason
        # (403 region / 401 key / 429 quota / model-not-found) instead of
        # a silent empty reply.
        self.last_error: str = ""

    def _detect_provider(self) -> str:
        # Check actual import success, not just env var
        oa = _lazy_openai()
        if oa is not None and os.getenv("OPENAI_API_KEY"):
            return PROVIDER_OPENAI
        gg = _lazy_google()
        if gg is not None and os.getenv("GEMINI_API_KEY"):
            return PROVIDER_GEMINI
        return PROVIDER_NONE

    @property
    def available(self) -> bool:
        return (self._provider == PROVIDER_OPENAI and self._openai_client is not None) \
            or (self._provider == PROVIDER_GEMINI and self._google_module is not None)

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
            log.error(f"AI suggestion error: {e}", exc_info=True)
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
            log.error(f"Tone analysis error: {e}", exc_info=True)
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
            # v23: honest failure — stash the reason for the surfaces above.
            self.last_error = str(e)[:200]
            log.error(f"Generate reply error: {e}", exc_info=True)
        return None

    # ------------------------------------------------------------------
    # Vision / Image Analysis
    # ------------------------------------------------------------------

    async def analyze_image(self, image_path_or_url: str, prompt: str = "وصف هذه الصورة بالعربية") -> str:
        """Analyze an image using AI vision — https URLs or ``data:image/`` URIs ONLY.

        Returns an Arabic description (empty string = refusal/unavailable —
        with the REASON on ``self.last_error`` since v24-R3, same honest-
        failure surface as generate_reply).

        v14-E1 #7 (D8-H1): local-file support is REMOVED. The image source is
        LLM-controllable (agent tool params come from a model reading user
        text), so anything that was not an http(s) URL used to be opened from
        disk, base64-encoded and shipped to the AI provider — a local-file
        disclosure path (".env", "../static/uploads/…"). Source policy now:
          - ``https://`` → guarded by ``assert_safe_outbound_url`` (v10-A8
            + v15-E4/D6-H2: rejects non-https schemes, private/loopback
            literal hosts AND hosts whose DNS resolution lands on internal
            ranges — raises the controlled UnsafeImageUrlError; the agent
            engine surfaces its Arabic message; http:// is refused there);
          - ``data:image/…`` → passed through as-is (internally generated:
            the agent-upload flow embeds data-URIs on serverless — this also
            FIXES that flow, the old open() branch crashed on data URIs);
          - anything else (local paths, /static/…, file://, junk) → clean
            refusal: log + return "" — never an open().
        """
        if not self.available or not image_path_or_url:
            return ""

        src = image_path_or_url
        if src.startswith("data:image/"):
            image_url = src
        elif src.startswith(("http://", "https://")):
            # v10-A8 + v15-E4 (D6-H2): remote URL — validated BEFORE any fetch
            # or forwarding (Gemini fetches server-side; OpenAI receives the
            # URL), WITH DNS resolution: a hostname that lands on
            # 169.254.169.254/RFC1918/::1 is rejected here, not at fetch time.
            await assert_safe_outbound_url(src)
            image_url = src
        else:
            log.warning(
                "analyze_image refused non-https/non-data image source (len=%d)"
                " — local file reads are disabled (v14-E1, D8-H1)",
                len(src),
            )
            return ""

        try:
            if self._provider == PROVIDER_OPENAI and self._openai_client:
                return await self._openai_vision(image_url, prompt)
            elif self._provider == PROVIDER_GEMINI and self._google_module:
                return await self._gemini_vision(image_url, prompt)
        except UnsafeImageUrlError:
            # v15-E4 (D6-H2): رفضنا المضبوطة يُعرض كما هو (رسالة عربية آمنة) —
            # لا تُبتلع في الخطأ العام: المستخدم/الوكيل يحتاج معرفة السبب.
            raise
        except _EXPECTED_PROVIDER_ERRORS as e:
            # v24-R3 (M7): the expected provider/transport failure family →
            # honest "" + the reason on last_error (the v23 surface). Unexpected
            # exceptions are NO LONGER swallowed: they propagate to the caller
            # (agent_engine.process / the image_analyze tool), which already
            # answers a generic Arabic failure instead of a silent empty result.
            self.last_error = str(e)[:200]
            log.error(f"analyze_image error: {e}", exc_info=True)
            return ""
        return ""

    async def _openai_vision(self, image_url: str, prompt: str) -> str:
        """Vision via OpenAI — content parts with image_url."""
        client = self._openai_client
        if not client:
            return ""
        content = [{"type": "text", "text": prompt}]
        if image_url.startswith("data:"):
            content.append({"type": "image_url", "image_url": {"url": image_url, "detail": "high"}})
        else:
            content.append({"type": "image_url", "image_url": {"url": image_url, "detail": "high"}})
        r = await client.chat.completions.create(
            model=self._openai_model,
            messages=[{"role": "user", "content": content}],
            max_tokens=500, temperature=0.3,
        )
        return (r.choices[0].message.content or "").strip()

    async def _gemini_vision(self, image_url: str, prompt: str) -> str:
        """Vision via Gemini.

        v15-E4 (D6-H2): the remote fetch is guarded end-to-end —
        ``_fetch_image_bytes`` (no redirects without re-validation, 10s
        timeout, 5MB streamed cap) instead of the old raw ``client.get``
        (unbounded, no explicit timeout). The URL itself was already
        DNS-checked by ``analyze_image`` before dispatch.

        v24-R3 (M7): base64 decoding and the Pillow decode of a multi-MB
        image are 100-300ms+ of pure CPU — both now run in a worker thread
        (``asyncio.to_thread``) instead of blocking the event loop (every
        concurrent request used to stall behind one image).
        """
        genai = self._google_module
        if not genai:
            return ""
        model = genai.GenerativeModel(self._model)
        img_data = None
        if image_url.startswith("data:"):
            import base64
            _, b64 = image_url.split(",", 1)
            img_data = await asyncio.to_thread(base64.b64decode, b64)
        elif image_url.startswith(("http://", "https://")):
            img_data = await _fetch_image_bytes(image_url)
            if img_data is None:
                log.warning("gemini vision: guarded fetch refused/failed for remote image")
                return ""

        def _decode_image(data: bytes):
            import io

            import PIL.Image
            img = PIL.Image.open(io.BytesIO(data))
            img.load()  # force the full decode HERE, inside the worker thread
            return img

        img = None
        if img_data:
            img = await asyncio.to_thread(_decode_image, img_data)
        if img is None:
            return ""
        r = await model.generate_content_async([prompt, img])
        return (r.text or "").strip()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _fallback_suggestions(self, text: str, name: str) -> dict:
        n = name or "صديقنا"
        comment_lower = text.lower()
        if any(k in comment_lower for k in ["سعر", "شحال", "بكم", "كم", "price", "ثمن"]):
            return {
                "suggestions": [
                    f"أهلاً {n} 😊 تواصل معنا على الخاص وعرضنا الحصري في انتظارك 💥",
                    f"{n} حياك الله! نحنا حابين نعطيك أفضل عرض، راسلنا على الخاص 🎁",
                    f"{n} الله يحيك! إذا تحب تعرف الأسعار والعروض الحصرية، خابرنا على الخاص وبنخدمك 💪",
                ],
                "intent": "استفسار", "sentiment": "محايد", "confidence": 0.7,
            }
        if any(k in comment_lower for k in ["شكوى", "مشكلة", "مضايق", "غش", "نصب", "خايس", "سيء"]) :
            return {
                "suggestions": [
                    f"{n} نأسف على هالموقف! والله ما هذا مستوانا. تواصل معنا على الخاص ونعوضك 🙏",
                    f"{n} نأسفين خويا 📞 راسلنا على الخاص نحلوا المشكلة قبل لا تكبر 💪",
                ],
                "intent": "شكوى", "sentiment": "سلبي", "confidence": 0.8,
            }
        if any(k in comment_lower for k in ["جميل", "رائع", "ممتاز", "nice", "great", "love"]):
            return {
                "suggestions": [
                    f"{n} الله يبارك فيك! 🤍 كلماتك تسعدنا وايد. نورت الصفحة 🌹",
                    f"{n} تسلم والله! هذا الكلام يخلينا نقدم الأفضل دايماً 💪🔥",
                ],
                "intent": "إشادة", "sentiment": "إيجابي", "confidence": 0.9,
            }
        return {
            "suggestions": [
                f"أهلاً {n}! 🤍 شكراً لتواصلك معنا، نحنا هنا لخدمتك على طول 💬",
                f"{n} حياك الله! إذا عندك أي سؤال أو استفسار، راسلنا على الخاص وبنردو عليك بسرعة ⚡",
                f"{n} تسلم والله! نورت الصفحة 🤍🌹 إذا تحب شي، احنا موجودين 👋",
            ],
            "intent": "محايد", "sentiment": "محايد", "confidence": 0.6,
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
