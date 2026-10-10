from __future__ import annotations

"""r137 (ليبي أولاً) — هواتف الدفع الليبية + قانونية مفتاح المزود.

يمسك هذا الملف ثلاث حقائق دخلت هذا_round:
  1. ``_utils.normalize_libyan_phone`` — التوأم البايثوني لعقد الواجهة
     (طيّ الأرقام الشرقية، شدّ الفواصل، تجريد +218/00218، استعادة جذع 0
     المفقود، ثم التحقق من البادئات الوطنية وطول الـ 10 أرقام). كان
     ``len(phone) < 7`` وحده على الخادم يقبل «1234567» ويخزنها في سجل
     الدفعة. القسم 1b (r138) يثبّت العقد الأوسع الموحّد مع الأسطولة
     (قرار r138-SO): محمول 09 بطول 9-10 خانات + أرضي 0[1-9] بعشر خانات.
  2. ``wallet.canonical_provider`` — المفتاح القانوني «libyana» (التوأمان
     Smart-Order/Smart-Menu)؛ المرادف الإملائي القديم «liyana» يُقبل
     توافقًا مع عملاء الموبايل المنشورين ويُكتب بالقانوني.
  3. مسارات API الثلاثة (topup / subscriptions / subscriptions/upgrade)
     ترفض الآن الهاتف غير الليبي بـ 422 عربي وتطبيع الصحيح قبل التخزين.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), os.pardir, "fb_dashboard"))

from _utils import normalize_libyan_phone  # noqa: E402
from routers.payments.wallet import (  # noqa: E402
    INVALID_PHONE_DETAIL,
    canonical_provider,
)
from test_phase_b_payments import _make_app_fixture, _seed, _teardown  # noqa: E402

# ── 1. التطبيع الخالص (عقد التوأم) ─────────────────────────────────────────

def test_normalize_accepts_local_mask():
    assert normalize_libyan_phone("0912345678") == "0912345678"


def test_normalize_folds_eastern_digits():
    # الزبون الليبي يكتب بالشرقية (٠٩١٢…) — نفس درس r133-A12 M1
    assert normalize_libyan_phone("٠٩١٢٣٤٥٦٧٨") == "0912345678"


def test_normalize_strips_separators_and_plus():
    assert normalize_libyan_phone("+218 91 234 5678") == "0912345678"
    assert normalize_libyan_phone("091-234-5678") == "0912345678"


def test_normalize_strips_double_zero_country_prefix():
    assert normalize_libyan_phone("00218912345678") == "0912345678"


def test_normalize_restores_missing_trunk_zero():
    assert normalize_libyan_phone("912345678") == "0912345678"


def test_normalize_accepts_tripoli_landline():
    # الأرقام الأرضية وطنية أيضًا (021 طرابلس) — ليست المحمول حصرًا
    assert normalize_libyan_phone("0211234567") == "0211234567"


def test_normalize_rejects_garbage_and_foreign():
    # كان «len < 7» وحده يقبل هذه كلها
    assert normalize_libyan_phone("1234567") is None       # بلا بادئة وطنية
    assert normalize_libyan_phone("+201001234567") is None  # مصر
    assert normalize_libyan_phone("") is None
    assert normalize_libyan_phone(None) is None            # type: ignore[arg-type]
    assert normalize_libyan_phone("٠٩١٢٣٤٥٦٧٨٩٠١٢") is None  # أطول من القناع


# ── 1b. العقد الأوسع الموحّد (r138 — قرار r138-SO على مستوى الأسطولة) ──────
# «10 خانات بالضبط + 0[125-9]» كان صرامةً بلا مبرر موثق: «091234567»
# (محمول 9 خانات) يُقبل في Smart-Link ويُرفض هنا — العائلة وحّدت العقد:
# محمول 09 بطول 9-10 + أرضي 0[1-9] بعشر خانات (توثيق r138-SO في
# Smart-Order src/lib/phone.ts — هذا القسم يثبّت نفس القرار على توأم SB).

def test_r138_short_mobile_nine_digits_is_valid():
    # 09 + 7 أرقام — نموذج المشغلين القصار؛ كان مرفوضًا بالعقد القديم
    assert normalize_libyan_phone("091234567") == "091234567"


def test_r138_short_mobile_missing_trunk_zero_is_restored():
    assert normalize_libyan_phone("91234567") == "091234567"


def test_r138_short_mobile_eastern_digits_accepted():
    assert normalize_libyan_phone("٠٩١٢٣٤٥٦٧") == "091234567"


def test_r138_landline_prefixes_widened_to_all_national():
    # 0[125-9] اتسعت إلى 0[1-9] — مساحة الترقيم الوطنية كاملة
    assert normalize_libyan_phone("0412345678") == "0412345678"
    assert normalize_libyan_phone("0612345678") == "0612345678"
    assert normalize_libyan_phone("0712345678") == "0712345678"
    assert normalize_libyan_phone("0812345678") == "0812345678"


def test_r138_short_landline_still_rejected():
    # القصر للمحمول حصرًا — الأرضي يبقى بعشر خانات
    assert normalize_libyan_phone("021123456") is None


def test_r138_zero_then_area_missing_still_rejected():
    assert normalize_libyan_phone("0012345678") is None  # 00 بلا منطقة


def test_r138_dropped_last_digit_tradeoff_is_documented():
    # المقايلة الموثقة (نفس Smart-Link): إسقاط الخانة الأخيرة من محمول
    # 10 خانات يُنتج قصيرًا صالحًا — أولوية القبول على الرفض
    assert normalize_libyan_phone("0912345678"[:-1]) == "091234567"


# ── 2. قانونية المزود ───────────────────────────────────────────────────────

def test_canonical_provider_maps_legacy_spelling():
    assert canonical_provider("liyana") == "libyana"
    assert canonical_provider("libyana") == "libyana"
    assert canonical_provider("madar") == "madar"
    assert canonical_provider("") == ""
    assert canonical_provider(None) == ""  # type: ignore[arg-type]


# ── 3. المسارات: 422 عربي + تطبيع قبل التخزين ──────────────────────────────

async def test_topup_rejects_non_libyan_phone():
    """«1234567» كان يمر على الخادم (len<7 عكسها فقط) — الآن 422 عربي."""
    fixture = await _make_app_fixture()
    try:
        client, _plan_ids, _ = await _seed(fixture)
        r = await client.post("/api/payments/topup", json={
            "amount": 20, "provider": "liyana", "phone": "1234567",
        })
        assert r.status_code == 422, r.text
        assert r.json()["detail"] == INVALID_PHONE_DETAIL
    finally:
        await _teardown(fixture)


async def test_topup_normalizes_eastern_phone_before_storing():
    """٠٩١٢… تُطوى إلى 09… وتُخزّن — لا سجل دفعة بأرقام شرقية."""
    fixture = await _make_app_fixture()
    try:
        client, _plan_ids, _ = await _seed(fixture)
        r = await client.post("/api/payments/topup", json={
            "amount": 20, "provider": "liyana", "phone": "٠٩١٢٣٤٥٦٧٨",
        })
        assert r.status_code == 200, r.text
        pid = r.json()["data"]["payment_id"]
        from models import PaymentRequest

        app, sf, _eng, _restore = fixture
        async with sf() as db:
            pr = await db.get(PaymentRequest, pid)
            assert pr is not None
            assert pr.phone == "0912345678", pr.phone
            # r137: المرادف القديم يُقبل ويُكتب بالقانوني
            assert pr.provider == "libyana", pr.provider
    finally:
        await _teardown(fixture)


async def test_subscription_rejects_foreign_phone():
    fixture = await _make_app_fixture()
    try:
        client, plan_ids, _ = await _seed(fixture)
        r = await client.post("/api/subscriptions", json={
            "plan_id": plan_ids[0], "provider": "libyana", "amount": 50.0,
            "phone": "+201001234567",  # مصري — ليس ليبيًا
        })
        assert r.status_code == 422, r.text
        assert r.json()["detail"] == INVALID_PHONE_DETAIL
    finally:
        await _teardown(fixture)
