from __future__ import annotations

"""Text utilities for the auto-reply engine: template rendering + Arabic text
normalization (extracted verbatim from the old monolithic ``bot.py``, v11-A2).
"""

from typing import TYPE_CHECKING

if TYPE_CHECKING:  # annotation-only dependency — no runtime import cycle with matching
    from bot_engine.matching import CommentContext

# -------------------------------------------------------------------
# Template Renderer
# -------------------------------------------------------------------

class TemplateRenderer:
    PLACEHOLDERS = ("{name}", "{full_name}", "{username}", "{message}", "{mention}")

    @classmethod
    def render(cls, template: str, ctx: CommentContext) -> str:
        mention = f"@[{ctx.from_id}]" if ctx.from_id else ctx.from_first
        return (template
            .replace("{name}", ctx.from_first)
            .replace("{full_name}", ctx.from_name or ctx.from_first)
            .replace("{username}", ctx.from_username or ctx.from_first)
            .replace("{message}", ctx.text[:100])
            .replace("{mention}", mention))

    @classmethod
    def validate(cls, template: str) -> bool:
        return bool(template and template.strip())

# -------------------------------------------------------------------
# Text Normalizer (v2 — Unicode NFKC for better normalization)
# -------------------------------------------------------------------

class TextNormalizer:
    ALEF_MAP = str.maketrans({"أ": "ا", "إ": "ا", "آ": "ا"})
    TAH_MAP = str.maketrans({"ة": "ه"})
    YEH_MAP = str.maketrans({"ى": "ي", "ئ": "ي"})
    WAW_MAP = str.maketrans({"ؤ": "و"})
    DIACRITICS = "ًٌٍَُِّْ"
    LIBYAN_PREFIXES = ("باش ", "نحنا ", "انتو ", "هما ", "عندك ", "عندكم ",
                       "شنو ", "شحال ", "قداش ", "قداه ", "شكون ", "علاش ",
                       "واش ", "هذاك ", "هذيك ", "هذولا ")

    TATWEEL = "ـ"  # U+0640 — السـعر should equal السعر (v4 §5.19)

    @classmethod
    def normalize(cls, text: str) -> str:
        import unicodedata
        t = unicodedata.normalize("NFKC", text.lower().strip())
        t = t.translate(cls.ALEF_MAP).translate(cls.TAH_MAP)
        t = t.translate(cls.YEH_MAP).translate(cls.WAW_MAP)
        for ch in cls.DIACRITICS:
            t = t.replace(ch, "")
        t = t.replace(cls.TATWEEL, "")
        return t

    @classmethod
    def normalize_for_matching(cls, text: str) -> str:
        t = cls.normalize(text)
        for prefix in cls.LIBYAN_PREFIXES:
            if t.startswith(prefix):
                t = t[len(prefix):]
        return t
