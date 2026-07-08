"""
Enhanced intent classifier with fuzzy matching, compound intent detection,
urgency scoring, and expanded multi-dialect Arabic coverage.
"""
import logging
import re

log = logging.getLogger("fb-intent")


# ── Expanded Keyword Sets ──────────────────────────────────────

_NEGATIVE = {
    "غش", "نصب", "خايس", "فظيع", "سيء", "رديء", "weak",
    "terrible", "scam", "زبالة", "مقرف", "disgusting", "worst",
    "horrible", "broken", "احتيال", "محتال", "fake", "fraud",
    "خسارة", "فاشل", "فشل", "failure", "cheat", "cheated",
    "مظلوم", "حرامية", "نصابين", "نصابة", "مخيس", "مو زين", "زفت",
    "خربان", "تعبان", "مقرف", "مقرفه", "مقرفين", "قرفان",
    "كذاب", "كذابة", "حرامي", "حرامية", "احتيال", "نصب",
    "وعود كاذبة", "وعود", "ما يشتغلش", "ما يخدمش", "ما يشتغلش",
    "يزعج", "مزعج", "تأخير", "متأخر", "تأخر", "تتأخر", "تتأخروا",
    "مشكلة", "مشاكل", "ضد", "ايقاف", "وقف", "بلوك",
    "مخالفة", "تلاعب", "استغلال", "غير لائق",
    # Expanded Libyan
    "مو زين", "ما عليه", "هبل", "خرطي", "تف", "عيب",
    "خايب", "معفن", "مريض", "بايخ", "فاضي", "فارغ",
    "ماعندكم", "ما عندكم", "نصبوه", "ضحك", "ضحكوا",
    "ماعندهم", "ما عندهم",
}

_POSITIVE = {
    "جميل", "رائع", "حلو", "nice", "great", "awesome",
    "ممتاز", "excellent", "amazing", "fantastic", "مبدع", "ابداع",
    "love", "loved", "best", "wonderful",
    "زين", "باهي", "فخم", "جيد", "قدها", "تمام", "ممتازة",
    "شكرا", "شكراً", "thank", "thanks", "مشكور",
    "ما شاء الله", "ماشاء الله", "تبارك", "الله يبارك",
    "احسنت", "أحسنت", "bravo", "برافو", "عمل رائع",
    # Expanded
    "في القمة", "ممتاز جدا", "ممتاز جداً", "روعة",
    "تحفة", "تحفه", "فن", "ابداع", "مبهر", "مذهل",
    "يستاهل", "تستاهل", "بطل", "ابطال", "أسطورة",
    "أكثر من رائع", "منور", "نورتونا", "نورت",
}

_QUESTION = {
    "كم", "سعر", "price", "how", "what", "أين", "وين",
    "متى", "كيف", "question", "query", "سؤال", "استفسار", "help",
    "مساعدة", "when", "where", "why", "شنو", "شحال", "قداش", "قداه",
    "شكون", "واش", "هل", "هل في", "هل عند", "هل يوجد",
    "هل ليك", "عندكم", "عندك", "موجود", "كاين", "كاينة",
    "بش كم", "بقداش", "قديش", "بكام", "إيش", "كم سعر",
    "تفاصيل", "وصف", "معلومات", "المواصفات", "المقاسات",
    "هل تقوم", "هل تعمل", "هل يشتغل", "هل في خدمة", "توفر",
    "توصيل", "شحن", "التوصيل", "الشحن",
    "الدفع", "طريقة الدفع", "التقسيط", "الأقساط",
}

_CONTACT = {
    "رقم", "واتساب", "whatsapp", "تواصل", "message",
    "contact", "dm", "رسالة", "ارسل", "call", "phone", "telegram",
    "خابر", "كلم", "خاص", "راسل", "ماسنجر", "ع الخاص",
    "الخاص", "واتس", "الواتساب", "الواتس", "الوتساب", "الوتس",
    "رقم الهاتف", "رقم الجوال", "رقم الموبايل", "رقم التلفون",
    "اتصال", "اتصل", "ناديني", "نادني", "خاص", "بص خاص",
    "مراسلة", "مراسلتي", "تواصل معي", "تواصل معنا",
    "الانستا", "انستغرام", "انستجرام", "سكايب", "viber",
}

_URGENCY = {
    "عاجل", "مستعجل", "urgent", "ضروري", "ضرورة",
    "بسرعة", "بأسرع وقت", "أسرع", "بسرعة", "بسرعة الله",
    "طوارئ", "طارئ", "حالة", "حالة طارئة", "مهم جدا",
    "مهم جداً", "تكفى", "تكفون", "الله يخليك", "يا ليت",
    "وينكم", "وييييييين", "خلاص", "طفح", "طفح الكيل",
    "انقذونا", "انقذوني",
}

_PRICE = {
    "سعر", "السعر", "price", "كم", "التكلفة", "التكلفه",
    "بكام", "بقداش", "قداش", "سعره", "سعرها", "سعرو",
    "الحساب", "الفاتورة", "التسعيرة", "التسعيره",
    "خصم", "عرض", "العرض", "التخفيض", "التخفيضات",
}

_GREETING = {
    "السلام عليكم", "عليكم السلام", "وعليكم السلام",
    "صباح الخير", "مساء الخير", "صباح النور", "مساء النور",
    "مرحبا", "مرحباً", "اهلا", "أهلا", "اهلين", "أهلين",
    "هلا", "هلا والله", "يا هلا", "يا مرحبا",
    "hello", "hi", "hey", "good morning", "good evening",
    "تحية", "تحياتي", "التحية",
}

_ORDER = {
    "طلب", "اطلب", "طلب جديد", "اريد اطلب", "بغي اطلب",
    "شراء", "اشتري", "ابي اشتري", "نبغي", "نبغى",
    "احجز", "حجز", "reservation", "book", "booking",
    "طلب منتج", "طلب سلعة", "طلبية", "أوردر", "order",
    "بايعني", "بيعني", "خليني اشتري",
}

_COMPLAINT = {
    "شكوى", "شكوة", "complain", "complaint", "مشتكي", "مشتكية",
    "مظلمة", "ظلم", "تظلم", "تظلمات", "قضية", "قضيه",
    "تبليغ", "ابلاغ", "بلاغ", "إبلاغ",
}


# Multi-word phrases only (for phrase matching)
_URGENCY_PHRASES = {
    "بأسرع وقت", "بسرعة الله", "حالة طارئة", "مهم جدا", "مهم جداً",
    "الله يخليك", "يا ليت", "طفح الكيل", "انقذونا", "انقذوني",
}
_PRICE_PHRASES = {
    "كم سعر", "بش كم", "بقداش",
}
_GREETING_PHRASES = {
    "السلام عليكم", "عليكم السلام", "وعليكم السلام",
    "صباح الخير", "مساء الخير", "صباح النور", "مساء النور",
    "هلا والله", "يا هلا", "يا مرحبا",
    "good morning", "good evening",
}
_CONTACT_PHRASES = {
    "ع الخاص", "رقم الهاتف", "رقم الجوال", "رقم الموبايل", "رقم التلفون",
    "بص خاص", "تواصل معي", "تواصل معنا",
}
_COMPLAINT_PHRASES = {
    "وعود كاذبة",
}
_ORDER_PHRASES = {
    "طلب جديد", "اريد اطلب", "بغي اطلب", "طلب منتج", "طلب سلعة",
}
_POSITIVE_PHRASES = {
    "ما شاء الله", "ماشاء الله", "الله يبارك", "عمل رائع",
    "في القمة", "ممتاز جدا", "ممتاز جداً", "أكثر من رائع",
}


class EnhancedIntentClassifier:
    """
    Multi-dimension intent classifier:
    - Primary intent (one of: complaint, problem, price_inquiry, order, contact,
      question, praise, thanks, greeting, collaboration, negative, neutral)
    - Secondary intent (sub-intent)
    - Urgency score (0.0-1.0)
    - Sentiment (positive/negative/neutral)
    """

    # Intent priority: higher = more important when multiple match
    INTENT_PRIORITY = {
        "complaint": 90,
        "problem": 85,
        "urgent": 80,
        "price_inquiry": 60,
        "order": 70,
        "contact": 65,
        "negative": 75,
        "collaboration": 50,
        "question": 40,
        "praise": 30,
        "thanks": 25,
        "greeting": 20,
        "neutral": 10,
    }

    @classmethod
    def _stem_word(cls, word: str) -> str:
        """Strip common Arabic prefixes and suffixes for matching."""
        # Common Arabic prefixes
        for p in ("بال", "فل", "وب", "فب", "بل", "ول", "وال", "وال", "فال", "ب", "ف", "و", "ل", "ال"):
            if word.startswith(p) and len(word) > len(p) + 1:
                word = word[len(p):]
                break
        # Common Arabic suffixes
        for s in ("هم", "هن", "كما", "كم", "كن", "نا", "ني", "ون", "ين", "ات", "ان"):
            if word.endswith(s) and len(word) > len(s) + 1:
                word = word[:-len(s)]
                break
        return word

    @classmethod
    def classify(cls, text: str) -> dict:
        """
        Returns structured classification:
        {
            "primary_intent": str,
            "secondary_intent": str | None,
            "sentiment": str,
            "urgency": float,
            "matched_keywords": list[str],
        }
        """
        if not text or not text.strip():
            return {"primary_intent": "neutral", "secondary_intent": None,
                    "sentiment": "neutral", "urgency": 0.0, "matched_keywords": []}

        words = text.lower().strip().split()
        word_set = set(words)
        text_lower = text.lower()

        matched_keywords = []
        intents = {}

        def _check_set(s: set, intent: str, weight: int = 1, stemmed: str | None = None):
            # Check exact word intersection
            found = word_set & s
            if found:
                matched_keywords.extend(found)
                intents[intent] = intents.get(intent, 0) + len(found) * weight
            # Check stemmed (affix-stripped) words
            if stemmed:
                stemmed_set = {cls._stem_word(w) for w in words}
                sfound = stemmed_set & s
                if sfound:
                    matched_keywords.extend(sfound)
                    intents[intent] = intents.get(intent, 0) + len(sfound) * weight

        def _check_phrase(phrases: set, intent: str, weight: int = 3):
            for phrase in phrases:
                # Must be a word boundary match, not substring
                # Check both as whole word or at text boundaries
                if phrase in text_lower:
                    # Verify it's not a substring of another word
                    idx = text_lower.find(phrase)
                    while idx != -1:
                        start_ok = idx == 0 or text_lower[idx-1] in ' \t\n\r.،,'
                        end_ok = idx + len(phrase) >= len(text_lower) or text_lower[idx + len(phrase)] in ' \t\n\r.،,؟?'
                        if start_ok and end_ok:
                            matched_keywords.append(phrase)
                            intents[intent] = intents.get(intent, 0) + weight
                            break
                        idx = text_lower.find(phrase, idx + 1)

        # Check in priority order
        _check_phrase(_URGENCY, "urgent", weight=4)

        # Phrase-level checks (higher weight)
        _check_phrase(_PRICE, "price_inquiry", weight=2)
        _check_phrase(_COMPLAINT, "complaint", weight=3)
        _check_phrase(_GREETING, "greeting", weight=1)
        _check_phrase(_ORDER, "order", weight=2)

        # Word-level checks (stemmed=True for Arabic affix handling)
        _check_set(_NEGATIVE, "negative", stemmed="ar")
        _check_set(_CONTACT, "contact", stemmed="ar")
        _check_set(_QUESTION, "question", stemmed="ar")
        _check_set(_POSITIVE, "praise", stemmed="ar")
        _check_set(_ORDER, "order", stemmed="ar")

        # Check for thanks explicitly
        if "شكر" in text_lower or "thank" in text_lower:
            intents["thanks"] = intents.get("thanks", 0) + 2

        # Determine primary intent by highest priority score
        # First by matched weight, then by defined priority as tiebreaker
        if not intents:
            return {"primary_intent": "neutral", "secondary_intent": None,
                    "sentiment": "neutral", "urgency": 0.0, "matched_keywords": []}

        # Sort: highest weight wins, then highest INTENT_PRIORITY breaks ties
        sorted_intents = sorted(
            intents.items(),
            key=lambda x: (x[1], cls.INTENT_PRIORITY.get(x[0], 0)),
            reverse=True,
        )

        primary = sorted_intents[0][0]
        secondary = sorted_intents[1][0] if len(sorted_intents) > 1 else None

        # Determine sentiment from primary intent, but override if secondary is strongly negative/positive
        sentiment_map = {
            "complaint": "negative", "problem": "negative", "negative": "negative",
            "urgent": "negative", "order": "positive",
            "praise": "positive", "thanks": "positive", "greeting": "positive",
            "price_inquiry": "neutral", "contact": "neutral", "question": "neutral",
            "neutral": "neutral", "collaboration": "positive",
        }
        sentiment = sentiment_map.get(primary, "neutral")
        # Override for compound sentiment
        if sentiment == "neutral" and secondary:
            if secondary in ("complaint", "problem", "negative", "urgent"):
                sentiment = "negative"
            elif secondary in ("praise", "thanks", "order"):
                sentiment = "positive"

        # Urgency score
        urgency = min(1.0, sum(2 for k in matched_keywords if k in _URGENCY) * 0.25)

        return {
            "primary_intent": primary,
            "secondary_intent": secondary,
            "sentiment": sentiment,
            "urgency": urgency,
            "matched_keywords": list(set(matched_keywords))[:10],
        }

    @classmethod
    def requires_immediate_action(cls, result: dict) -> bool:
        """Returns True if this comment needs immediate handling."""
        return result["urgency"] > 0.5 or result["primary_intent"] in ("complaint", "urgent", "problem", "negative")

    @classmethod
    def is_sales_opportunity(cls, result: dict) -> bool:
        """Returns True if this is a sales opportunity."""
        return result["primary_intent"] in ("price_inquiry", "order", "contact")

    @classmethod
    def to_legacy(cls, result: dict) -> str:
        """Convert to legacy intent string for backward compat."""
        legacy_map = {
            "complaint": "negative", "problem": "negative",
            "praise": "positive", "thanks": "positive",
            "greeting": "positive", "order": "positive",
            "urgent": "negative", "negative": "negative",
            "positive": "positive",
        }
        return legacy_map.get(result["primary_intent"], result["primary_intent"])
