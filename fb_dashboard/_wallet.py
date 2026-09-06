from __future__ import annotations

"""مساعدات المحفظة — رصيد LYD المخزَّن نصًا في bot_state (v12 E1.6).

المشكلة (D9): رصيد المحفظة نص (BotState.value) ومسار القرض في تلغرام كان
«اقرأ → int(float(...)) → اكتب»:
1. ``int(float(pr.amount))`` يقتطع القروش — الدينار الليبي بثلاث منازل
   عشرية والدفوعات Numeric(10,3)، فمبلغ 0.499 يُضاف صفرًا و10.999 يصبح 10.
2. القراءة-التعديل-الكتابة غير ذرّية — موافقتان متزامنتان على دفعتين
   تقرآن الرصيد نفسه فتضيع إحداهما.

العلاج هنا:
- ``to_wallet_decimal`` — تحويل أي قيمة إلى Decimal بدقة 0.001.
- ``get_wallet_balance`` — قراءة Decimal(str(value)) (لا int() ولا float()).
- ``credit_wallet`` — UPDATE واحد ذرّي على مستوى SQL:
  ``CAST(CAST(value AS NUMERIC(12,3)) + CAST(:amt AS NUMERIC(12,3)) AS TEXT)``
  مع مسار إنشاء الصف عند غيابه (وإعادة محاولة UPDATE واحدة عند سباق
  الإنشاء). لا يفتح commit — المستدعي يملك المعاملة (قرض + تأكيد الدفعة
  في commit واحد).

المفتاح التاريخي ``balance`` (وليس wallet_balance — هذا ما يكتبه
payments.py:233 وtelegram.py فعليًا في الإنتاج).
"""
import logging
from decimal import Decimal, InvalidOperation

from models import BotState
from sqlalchemy import cast, literal, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.types import Numeric, String

log = logging.getLogger("fb-wallet")

WALLET_KEY = "balance"

#: LYD — 3 منازل عشرية (القروش)
_Q3 = Decimal("0.001")


def to_wallet_decimal(value) -> Decimal:
    """حوّل أي قيمة (Decimal/float/str/int) إلى Decimal بدقة المحفظة 0.001.

    يستعمل str() قبل Decimal (وليس Decimal(float) مباشرة) لأن التمثيل
    الثنائي للفواصل يجعل Decimal(0.005) = 0.005000000000000000104…‎
    بينما Decimal(str(0.005)) = 0.005 بالضبط.
    """
    try:
        return Decimal(str(value)).quantize(_Q3)
    except (InvalidOperation, ValueError, TypeError):
        log.warning("wallet amount not numeric: %r — treating as 0", value)
        return Decimal("0.000")


async def get_wallet_balance(db_session, tenant_id: int) -> Decimal:
    """رصيد المستأجر كـ Decimal بدقة 0.001 — الصف الغائب أو القيمة غير
    الرقمية ترجع 0.000 (لا استثناء؛ نفس عقد المسار القديم الذي كان
    يعامل «لا صف» كرصيد صفر).

    تقرأ العمود مباشرة (لا كيان ORM) حتى لا تعيقها نسخة قديمة في
    identity-map بعد UPDATE لم تُزامن بعد."""
    value = await db_session.scalar(
        select(BotState.value).where(
            BotState.tenant_id == tenant_id, BotState.key == WALLET_KEY)
    )
    if not value:
        return Decimal("0.000")
    try:
        return Decimal(str(value)).quantize(_Q3)
    except InvalidOperation:
        log.warning("wallet balance %r not numeric (tenant %s) — treating as 0",
                    value, tenant_id)
        return Decimal("0.000")


async def credit_wallet(db_session, tenant_id: int, amount) -> Decimal:
    """أضف amount لرصيد المستأجر بعملية ذرّية واحدة، وأرجع الرصيد الجديد.

    Arithmetic داخل SQL (وليس في بايثون) حتى لا تخسر موافقتان متزامنتان:
    اقرأ→عدّل→اكتب كان يفقد أحد القرصين. عند غياب الصف (رصيد جديد) يُنشأ
    ثم يعاد تنفيذ UPDATE مرة واحدة إذا سبقنا منشئ آخر (IntegrityError على
    uq_botstate_tenant_key).

    amount: Decimal/float/str/int — يُطبَّع عبر to_wallet_decimal أولًا.
    لا يستدعي commit — المستدعي يملك المعاملة.
    """
    amt = to_wallet_decimal(amount)
    amt_text = str(amt)

    def _atomic_stmt():
        # CAST(:amt AS NUMERIC) بدل تمرير Decimal مباشرة: aiosqlite لا يعتمد
        # Decimal في الربط، والنص يعمل على SQLite وPostgreSQL معًا.
        # synchronize_session="fetch" صريح: قيمة SET تعبير CAST لا يمكن
        # «تقييمها» في بايثون، فنضبط المزامنة بدل الاعتماد على auto.
        return (
            update(BotState)
            .execution_options(synchronize_session="fetch")
            .where(BotState.tenant_id == tenant_id, BotState.key == WALLET_KEY)
            .values(value=cast(
                cast(BotState.value, Numeric(12, 3)) + cast(literal(amt_text), Numeric(12, 3)),
                String,
            ))
        )

    result = await db_session.execute(_atomic_stmt())
    if not result.rowcount:
        # مسار الإنشاء عند الغياب — داخل SAVEPOINT حتى لا يُرجع سباقُ إنشاءٍ
        # متزامن المعاملةَ كلها إلى الوراء (وإلغاء تأكيد الدفعة معها)
        try:
            async with db_session.begin_nested():
                db_session.add(BotState(tenant_id=tenant_id, key=WALLET_KEY, value=amt_text))
                await db_session.flush()
        except IntegrityError:
            # أنشأه أحدٌ آخر بين التحديثين (uq_botstate_tenant_key) — طبّق
            # UPDATE الذرّي الآن على صفّه، والرصيد لا يضيع
            await db_session.execute(_atomic_stmt())
    return await get_wallet_balance(db_session, tenant_id)
