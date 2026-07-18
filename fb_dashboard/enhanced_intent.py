from __future__ import annotations
"""
Enhanced intent classifier v3 — Smart Link brand awareness, subscription intents,
Libyan dialect coverage, sales pipeline classification.
"""
import logging
import re

log = logging.getLogger("fb-intent")


# ── Expanded Keyword Sets ──────────────────────────────────────

# Smart Menu / Smart Link brand terms
_SMART_MENU = {
    "smart menu", "سمارت منيو", "المنيو", "المنيو الذكي", "المينيو",
    "menu", "منيو", "smart", "سمارت", "لينك", "smart link",
    "المنيو الالكتروني", "المنيو الرقمي", "القائمة الرقمية",
    "كيو ار", "qr", "كود", "كيور كود",
    "واتساب أوردر", "طلب واتساب", "الطلب عبر واتساب",
    "توصيل", "delivery",
}

_SUBSCRIPTION = {
    "اشتراك", "باقة", "الباقة", "الباقات", "خطة", "خطط",
    "شهري", "شهرياً", "سنوي", "سنوياً", "الدفع", "السعر",
    "subscription", "subscribe", "plan", "plans", "pricing",
    "payment", "subscribe", "شراء", "أشتري", "اشتري",
    "مشترك", "المشتركين", "اشتراكي", "جدد", "تجديد",
    "subscription", "فاتورة", "محفظة",
}

_LIBYAN_DIALECT = {
    # Common Libyan words / phrases
    "شنو", "واش", "قداش", "قداه", "شحال", "شكون", "علاش",
    "وين", "فين", "يمباي", "نبغي", "نبغى", "نحنا", "هذولا",
    "هذاك", "هذيك", "باهي", "زين", "قدها", "مبو", "مليح",
    "تو", "دوك", "يسر", "عندك", "عندكم", "عندنا",
    "حنا", "انتو", "هما", "باش", "بس", "حتى", "شوية",
    "دحين", "الحين", "دوكا", "الو", "و", "اي", "اية",
    # Libyan greetings
    "السلام عليكم", "عليكم السلام", "صباح الخير", "مساء الخير",
    "هلا", "هلا والله", "يا هلا", "مرحبتين",
    # Eating/drinking Libyan
    "عزايم", "وليمة", "غدا", "عشاء", "فطور", "عندكم اكل",
    "بغي نطلب", "نبغي نطلب", "ابي اطلب", "ابي", "انا ابغي",
}

_NEGATIVE = {
    "غش", "نصب", "خايس", "فظيع", "سيء", "رديء",
    "weak", "terrible", "scam", "زبالة", "مقرف", "disgusting", "worst",
    "horrible", "broken", "احتيال", "محتال", "fake", "fraud",
    "خسارة", "فاشل", "فشل", "failure", "cheat", "cheated",
    "مظلوم", "حرامية", "نصابين", "نصابة", "مخيس", "مو زين", "زفت",
    "خربان", "تعبان", "مقرف", "مقرفه", "مقرفين", "قرفان",
    "كذاب", "كذابة", "حرامي", "وعود كاذبة",
    "ما يشتغلش", "ما يخدمش",
    "يزعج", "مزعج", "تأخير", "متأخر", "تأخر",
    "مشكلة", "مشاكل", "ضد", "ايقاف", "وقف", "بلوك",
    "مخالفة", "تلاعب", "استغلال", "غير لائق",
    # Libyan negatives
    "مو زين", "ما عليه", "هبل", "خرطي", "تف", "عيب",
    "خايب", "معفن", "بايخ", "فاضي", "فارغ",
    "ماعندكم", "ما عندكم", "نصبوه", "ضحكوا",
    "ماعندهم", "كذاب", "نصب", "خرفان",
    # Price complaints
    "غلاء", "غالي", "غلط في الفاتورة", "صارلي مدة",
    "الخدمة مو قد السعر",
}

_POSITIVE = {
    "جميل", "رائع", "حلو", "nice", "great", "awesome",
    "ممتاز", "excellent", "amazing", "fantastic", "مبدع", "ابداع",
    "love", "loved", "best", "wonderful",
    "زين", "باهي", "فخم", "جيد", "قدها", "تمام", "ممتازة",
    "شكرا", "شكراً", "thank", "thanks", "مشكور",
    "ما شاء الله", "ماشاء الله", "تبارك", "الله يبارك",
    "احسنت", "أحسنت", "bravo", "برافو", "عمل رائع",
    # Smart Menu specific
    "فكرة رائعة", "مشروع جميل", "شغل محترم", "تستاهلون",
    "في القمة", "ممتاز جدا", "روعة",
    "تحفة", "تحفه", "فن", "مبهر", "مذهل",
    "يستاهل", "تستاهل", "بطل", "ابطال", "أسطورة",
    "أكثر من رائع", "منور", "نورتونا", "نورت",
}

_QUESTION = {
    "كم", "سعر", "price", "how", "what", "أين", "وين",
    "متى", "كيف", "question", "query", "سؤال", "استفسار", "help",
    "مساعدة", "when", "where", "why",
    # Libyan
    "شنو", "شحال", "قداش", "قداه", "شكون", "واش",
    "هل", "هل في", "هل عند", "هل يوجد",
    "هل ليك", "عندكم", "عندك", "موجود", "كاين", "كاينة",
    "بش كم", "بقداش", "قديش", "بكام", "إيش", "كم سعر",
    "تفاصيل", "وصف", "معلومات",
    "هل تقوم", "هل تعمل", "هل يشتغل",
    "توفر", "توصيل", "شحن", "التوصيل", "الشحن",
    "الدفع", "طريقة الدفع",
    # Smart Menu specific
    "كيف يشتغل", "كيف شغال", "كيف الخدمة", "كيف تشتغل",
    "وش هي", "وشو", "شنو هي",
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
    "كلمني", "كلموني", "ابعثلي",
}

_URGENCY = {
    "عاجل", "مستعجل", "urgent", "ضروري", "ضرورة",
    "بسرعة", "بأسرع وقت", "أسرع", "بسرعة", "بسرعة الله",
    "طوارئ", "طارئ", "حالة", "حالة طارئة", "مهم جدا",
    "مهم جداً", "تكفى", "تكفون", "الله يخليك", "يا ليت",
    "وينكم", "خلاص", "طفح", "طفح الكيل",
    "انقذونا", "انقذوني",
    # Libyan urgent
    "بسرعة الله", "والله بسرعة", "لازم اليوم", "حارة عليا",
}

_PRICE = {
    "سعر", "السعر", "price", "كم", "التكلفة", "التكلفه",
    "بكام", "بقداش", "قداش", "سعره", "سعرها", "سعرو",
    "الحساب", "الفاتورة", "التسعيرة", "التسعيره",
    "خصم", "عرض", "العرض", "التخفيض", "التخفيضات",
    # Subscription specific
    "الباقة", "الاشتراك", "شهرياً", "سنوي", "الاشتراك الشهري",
    "دفع", "طرق الدفع", "تحويل", "ليبيانا", "مدار",
}

_GREETING = {
    "السلام عليكم", "عليكم السلام", "وعليكم السلام",
    "صباح الخير", "مساء الخير", "صباح النور", "مساء النور",
    "مرحبا", "مرحباً", "اهلا", "أهلا", "اهلين", "أهلين",
    "هلا", "هلا والله", "يا هلا", "يا مرحبا",
    "hello", "hi", "hey", "good morning", "good evening",
    "تحية", "تحياتي", "التحية", "مرحبتين",
}

_ORDER = {
    "طلب", "اطلب", "طلب جديد", "اريد اطلب", "بغي اطلب",
    "شراء", "اشتري", "ابي اشتري", "نبغي", "نبغى",
    "احجز", "حجز", "reservation", "book", "booking",
    "طلب منتج", "طلب سلعة", "طلبية", "أوردر", "order",
    "بايعني", "بيعني", "خليني اشتري",
    # Subscription
    "بغي اشترك", "نبغي نشترك", "ابي اشترك", "كيف اشترك",
    "سجلني", "اشتراك", "جدد", "جدد اشتراكي",
}

_COMPLAINT = {
    "شكوى", "شكوة", "complain", "complaint", "مشتكي", "مشتكية",
    "مظلمة", "ظلم", "تظلم", "تظلمات", "قضية", "قضيه",
    "تبليغ", "ابلاغ", "بلاغ", "إبلاغ",
    # Smart Menu complaints
    "المنيو ما يفتح", "التطبيق يعلق", "الموقع بطيء",
    "ما يشتغل", "عليها مشاكل", "غلط في النظام",
    "الصفحة ما تظهر", "الروابط لا تعمل",
}

# ── Multi-word phrases ────────────────────────────────────────

_URGENCY_PHRASES = {
    "بأسرع وقت", "بسرعة الله", "حالة طارئة", "مهم جدا", "مهم جداً",
    "الله يخليك", "يا ليت", "طفح الكيل", "انقذونا", "انقذوني",
    "لازم اليوم", "ضروري جدا", "والله بسرعة",
}
_PRICE_PHRASES = {
    "كم سعر", "بش كم", "بقداش", "كم التكلفة", "سعر الباقة",
    "كم الاشتراك", "كم الشهر", "شحال الباقة",
}
_GREETING_PHRASES = {
    "السلام عليكم", "عليكم السلام", "وعليكم السلام",
    "صباح الخير", "مساء الخير", "صباح النور", "مساء النور",
    "هلا والله", "يا هلا", "يا مرحبا",
    "good morning", "good evening",
}
_CONTACT_PHRASES = {
    "ع الخاص", "رقم الهاتف", "رقم الجوال", "رقم الموبايل", "رقم التلفون",
    "بص خاص", "تواصل معي", "تواصل معنا", "كلمني خاص",
}
_COMPLAINT_PHRASES = {
    "وعود كاذبة", "المنيو ما يفتح", "الموقع بطيء",
    "الصفحة ما تظهر", "خدمة سيئة",
}
_ORDER_PHRASES = {
    "طلب جديد", "اريد اطلب", "بغي اطلب", "طلب منتج", "طلب سلعة",
    "كيف اشترك", "ابغي اشترك", "بغي نشترك",
}
_POSITIVE_PHRASES = {
    "ما شاء الله", "ماشاء الله", "الله يبارك", "عمل رائع",
    "في القمة", "ممتاز جدا", "ممتاز جداً", "أكثر من رائع",
    "فكرة رائعة", "شغل محترم", "مشروع جميل",
}
_SMART_MENU_PHRASES = {
    "smart menu", "سمارت منيو", "المنيو الذكي", "smart link",
    "المنيو الالكتروني", "القائمة الرقمية",
    "واتساب أوردر", "طلب واتساب",
}


class EnhancedIntentClassifier:
    """
    Multi-dimension intent classifier v3:
    - Primary intent with Smart Menu / subscription awareness
    - Secondary intent
    - Urgency score (0.0-1.0)
    - Sentiment (positive/negative/neutral)
    - Sales pipeline stage
    """

    INTENT_PRIORITY = {
        "complaint": 90,
        "problem": 85,
        "urgent": 80,
        "negative": 75,
        "order": 70,
        "subscription": 68,
        "price_inquiry": 60,
        "contact": 65,
        "question": 40,
        "praise": 30,
        "thanks": 25,
        "smart_menu": 22,
        "greeting": 20,
        "neutral": 10,
    }

    @classmethod
    def _stem_word(cls, word: str) -> str:
        """Strip common Arabic prefixes and suffixes (multi-pass)."""
        prefixes = ("بال", "فل", "وب", "فب", "بل", "ول", "وال", "فال", "ب", "ف", "و", "ل", "ال")
        suffixes = ("هم", "هن", "كما", "كم", "كن", "نا", "ني", "ون", "ين", "ات", "ان")
        while any(word.startswith(p) and len(word) > len(p) + 1 for p in prefixes):
            for p in prefixes:
                if word.startswith(p) and len(word) > len(p) + 1:
                    word = word[len(p):]
                    break
        while any(word.endswith(s) and len(word) > len(s) + 1 for s in suffixes):
            for s in suffixes:
                if word.endswith(s) and len(word) > len(s) + 1:
                    word = word[:-len(s)]
                    break
        return word

    # ponytail: boundary characters for phrase matching (space, tab, newline, return, period, Arabic comma, comma, Arabic ?, ?, !)
    _BOUNDARY = frozenset(' \t\n\r.،,؟?!')

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
            "sales_stage": str | None,
            "is_smart_menu_inquiry": bool,
        }
        """
        if not text or not text.strip():
            return {"primary_intent": "neutral", "secondary_intent": None,
                    "sentiment": "neutral", "urgency": 0.0, "matched_keywords": [],
                    "sales_stage": None, "is_smart_menu_inquiry": False}

        words = text.lower().strip().split()
        word_set = set(words)
        text_lower = text.lower()

        matched_keywords = []
        intents = {}

        def _check_set(s: set, intent: str, weight: int = 1, stemmed: str | None = None):
            found = word_set & s
            if found:
                matched_keywords.extend(found)
                intents[intent] = intents.get(intent, 0) + len(found) * weight
            if stemmed:
                stemmed_set = {cls._stem_word(w) for w in words}
                sfound = stemmed_set & s
                if sfound:
                    matched_keywords.extend(sfound)
                    intents[intent] = intents.get(intent, 0) + len(sfound) * weight

        def _check_phrase(phrases: set, intent: str, weight: int = 3):
            for phrase in phrases:
                if phrase in text_lower:
                    idx = text_lower.find(phrase)
                    while idx != -1:
                        start_ok = idx == 0 or text_lower[idx-1] in cls._BOUNDARY
                        end_ok = idx + len(phrase) >= len(text_lower) or text_lower[idx + len(phrase)] in cls._BOUNDARY
                        if start_ok and end_ok:
                            matched_keywords.append(phrase)
                            intents[intent] = intents.get(intent, 0) + weight
                            break
                        idx = text_lower.find(phrase, idx + 1)

        # Detect Smart Menu inquiry — affects routing even if other intents match
        is_smart = False
        _check_phrase(_SMART_MENU, "smart_menu", weight=2)
        _check_set(_SMART_MENU, "smart_menu", weight=2)
        if "smart_menu" in intents:
            is_smart = True

        # Detect subscription-specific intents
        _check_phrase(_SUBSCRIPTION, "subscription", weight=2)
        _check_set(_SUBSCRIPTION, "subscription", weight=2)

        # Priority checks
        _check_phrase(_URGENCY, "urgent", weight=4)
        _check_phrase(_PRICE, "price_inquiry", weight=2)
        _check_phrase(_COMPLAINT, "complaint", weight=3)
        _check_phrase(_GREETING, "greeting", weight=1)
        _check_phrase(_ORDER, "order", weight=2)

        _check_set(_NEGATIVE, "negative", stemmed="ar")
        _check_set(_CONTACT, "contact", stemmed="ar")
        _check_set(_QUESTION, "question", stemmed="ar")
        _check_set(_POSITIVE, "praise", stemmed="ar")
        _check_set(_ORDER, "order", stemmed="ar")

        # Thanks check
        if "شكر" in text_lower or "thank" in text_lower:
            intents["thanks"] = intents.get("thanks", 0) + 2

        # Determine primary intent
        if not intents:
            return {"primary_intent": "neutral", "secondary_intent": None,
                    "sentiment": "neutral", "urgency": 0.0, "matched_keywords": [],
                    "sales_stage": None, "is_smart_menu_inquiry": is_smart}

        sorted_intents = sorted(
            intents.items(),
            key=lambda x: (x[1], cls.INTENT_PRIORITY.get(x[0], 0)),
            reverse=True,
        )

        primary = sorted_intents[0][0]
        secondary = sorted_intents[1][0] if len(sorted_intents) > 1 else None

        # Sentiment
        sentiment_map = {
            "complaint": "negative", "problem": "negative", "negative": "negative",
            "urgent": "negative",
            "subscription": "positive", "order": "positive",
            "praise": "positive", "thanks": "positive", "greeting": "positive",
            "price_inquiry": "neutral", "contact": "neutral", "question": "neutral",
            "neutral": "neutral", "smart_menu": "positive",
        }
        sentiment = sentiment_map.get(primary, "neutral")
        if sentiment == "neutral" and secondary:
            if secondary in ("complaint", "problem", "negative", "urgent"):
                sentiment = "negative"
            elif secondary in ("praise", "thanks", "order", "subscription"):
                sentiment = "positive"

        # Urgency score
        urgency = min(1.0, sum(2 for k in matched_keywords if k in _URGENCY) * 0.25)

        # Sales pipeline stage
        sales_stage = cls._detect_sales_stage(primary, secondary, is_smart)

        return {
            "primary_intent": primary,
            "secondary_intent": secondary,
            "sentiment": sentiment,
            "urgency": urgency,
            "matched_keywords": list(set(matched_keywords))[:10],
            "sales_stage": sales_stage,
            "is_smart_menu_inquiry": is_smart,
        }

    @classmethod
    def _detect_sales_stage(cls, primary: str, secondary: str | None, is_smart: bool) -> str | None:
        """Map intent to sales pipeline stage."""
        if primary == "subscription" or (primary == "order" and is_smart):
            return "decision"
        if primary == "price_inquiry":
            return "consideration"
        if primary == "question" and is_smart:
            return "awareness"
        if primary == "contact":
            return "consideration"
        if primary in ("praise", "greeting", "thanks") and is_smart:
            return "awareness"
        return None

    @classmethod
    def requires_immediate_action(cls, result: dict) -> bool:
        return result["urgency"] > 0.5 or result["primary_intent"] in ("complaint", "urgent", "problem", "negative")

    @classmethod
    def is_sales_opportunity(cls, result: dict) -> bool:
        return result["primary_intent"] in ("price_inquiry", "order", "subscription", "contact") or result["sales_stage"] is not None

    @classmethod
    def to_legacy(cls, result: dict) -> str:
        legacy_map = {
            "complaint": "negative", "problem": "negative",
            "praise": "positive", "thanks": "positive",
            "greeting": "positive", "order": "positive",
            "subscription": "positive", "urgent": "negative",
            "negative": "negative", "positive": "positive",
            "smart_menu": "positive",
        }
        return legacy_map.get(result["primary_intent"], result["primary_intent"])
