"""v15 §E2 — تكامل البيانات: قيود التفرد المفقودة + server_defaults + تنظيفات.

Revision ID: 014

ما الذي يصلحه هذا (D3-H1/H2/M2/M5/M6 + D12-H2/H4 + C-5001 الحي):
- جداول ما قبل إعادة البناء (subscribers/customers/tags/conversation_tags/
  subscriber_tags/sequence_subscriptions/usage_counters) تحمل في النموذج
  قيود تفرد مصرّح بها منذ تعدد المستأجرين، لكن لا ترحيلة ولا reconcile
  ينشئها على قواعد الإنتاج legacy (create_all لا يعدّل جداول قائمة، وSQL
  الإنتاج اليدوي أنشأ قيدين فقط). الكتابة المتزامنة (حدثا webhook لنفس
  المستخدم الجديد) تولّد تكرارًا صامتًا يجمّد scalar_one_or_none كل تحديث
  لاحق ويضخّم العدادات ويضاعف استهداف البث.
- uq_reply_tenant_comment (D12-H2): معلن في النموذج بلا أي ترحيلة تنشئه —
  إعادة تسليم webhook عبر نسخ Vercel تكرر الرد على نفس التعليق (ازدواج
  مرئي للعميل + فوترة). SQL الإنتاج اليدوي (002_saas) أنشأه كقيد إن طُبّق
  — الحارس يكتشف كلا الشكلين (قيدًا أو فهرسًا).
- uq_user_email_lower (D12-H4): البريد بلا أي قيد — تسجيلان متزامنان بنفس
  البريد يصنعان حسابين؛ الدخول بالبريد يلتقط الأقدم حتميًا فيبقى الثاني
  «زومبي» لا يستطيع الدخول أبدًا مع أي دفوعات مرتبطة به.
- server_defaults (D3-M2 → C-5001): reconcile القديم أضاف users.token_ver
  وusers.is_platform_admin بلا DEFAULT فبقيت NULL رغم عقد النموذج —
  int(None) في auth.py:36 هو الـ500 الحي الموثق على /api/login (D14).
- D3-H2: صفوف sequence_subscriptions بـtenant_id=0 (خلل subscribe القديم)
  تُعاد أبوتها من التسلسل المقابل — وإلا تخطّاها وكيل الإرسال per-tenant
  فميزة drip تموت صامتًا.
- تنظيفات ميكانيكية (D3-M5/M6): العمودان الترحيليان الميتان
  (users.onboarding_completed من 004 — النموذج يضعه على Tenant؛
  payment_requests.amount_numeric من 001 — النموذج يستعمل amount) وفهرس
  scheduled_posts الأحادي المكرر ix_schedpost_status_sched (الثلاثي
  tenant_id,status,scheduled_at من 002 يخدم الاستعلام الحي وحده).

الآلية — تفويض إلى _schema_reconcile.reconcile_schema (نمط 007 حرفيًا):
  كل قيود v15 مع backfillsها (خصم المكررات بإبقاء MAX(id)، دمج العدادات
  SUM في الناجي، تحييد تكرارات البريد بإبقاء MIN(id) — الحساب الذي يلتقطه
  الدخول حتميًا؛ لا حذف حسابات) معرفة مرة واحدة في _INDEX_HEAL_V15
  وتشغَّل هنا عبر المفوَّض نفسه الذي يشغّله الإقلاع — السلسلة والشبكة
  الأمينة تتطابقان بالبنية لا بالنسخ. الحارس بالـInspector + كتالوج اللهجة
  (انعكاس SQLAlchemy يتخطى فهارس التعبيرات) يجعل الإعادة no-op: قواعد
  create_all تحمل القيود كقيود جدول، وقواعد legacy تنالها كفهارس فريدة
  مستقلة بنفس الأسماء (نمط 013).

خطوات إضافية خاصة بالسلسلة (لا يعملها reconcile):
  1) تثبيت NOT NULL على PostgreSQL للأعمدة ذات server_default بعد شفاء
     NULL (SQLite يتطلب إعادة بناء الجدول لتعديل NULLability — يُترك
     بقيم مضمونة غير-NULL بعد الشفاء؛ الفجوة توثيقية لا تشغيلية).
  2) إسقاط العمودين الميتين والفهرس المكرر (reconcile لا يُسقط أبدًا —
     المقايضة موثقة في docstring الخاص به).

Idempotent بالكامل: كل خطوة محروسة (Inspector/كتالوج/وجود عمود). لا كاتب
متزامن أثناء الترحيل (lifespan يشغّل alembic قبل مهمة البوت وقبل البذور).

downgrade: يُسقط فهارس v15 المستقلة (لا يمس قيود create_all الجدولية)
ويعيد العمودين الميتين والفهرس المكرر؛ الخصومات/الدمج/التحييد/إعادة
الأبوة/شدّ NOT NULL forward-only (نمط 007/012/013) — البيانات المحذوفة
والمحوَّدة لا تُستعاد.
"""
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

from alembic import op

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None

# D3-M5 — عمودان ترحيليان بلا مقابل في النموذج (انحراف ثلاثي مثبت):
# 004 أضافت users.onboarding_completed بينما النموذج يضعه على Tenant،
# و001 أضافت payment_requests.amount_numeric بينما النموذج يستعمل amount.
_DEAD_COLUMNS = [
    ("users", "onboarding_completed"),
    ("payment_requests", "amount_numeric"),
]

# D3-M6 — الفهرس الأحادي المكرر على scheduled_posts: الثلاثي
# (tenant_id, status, scheduled_at) من 002/SQL اليدوي يخدم الاستعلام
# الحي (analytics.py) وحده؛ الأحادي (status, scheduled_at) تضخيم كتابة
# بلا قيمة. (تعليق 002 "also defined in ScheduledPost.__table_args__" كان
# غير دقيق — صيغة tenant أصبحت الآن في النموذج باسم 002 نفسه.)
_DUP_INDEXES = [
    ("scheduled_posts", "ix_schedpost_status_sched"),
]


def _catalog_has_index(bind, table: str, name: str) -> bool:
    """فحص كتالوج مباشر — انعكاس SQLAlchemy يتخطى فهارس التعبيرات
    (SQLite لا يرجع uq_user_email_lower في get_indexes إطلاقًا)."""
    try:
        if bind.dialect.name == "sqlite":
            row = bind.execute(sa.text(
                "SELECT 1 FROM sqlite_master WHERE type = 'index' "
                "AND tbl_name = :t AND name = :n"
            ).bindparams(sa.bindparam("t", table), sa.bindparam("n", name))).first()
            return row is not None
        if bind.dialect.name == "postgresql":
            row = bind.execute(sa.text(
                "SELECT 1 FROM pg_indexes WHERE indexname = :n"
            ).bindparams(sa.bindparam("n", name))).first()
            return row is not None
    except Exception:
        return False
    return False


def upgrade() -> None:
    bind = op.get_bind()

    # ── 1) القيود + backfills: نفس مواصفات شبكة الإقلاع (نمط 007) ──────
    from _schema_reconcile import _constant_server_default, reconcile_schema

    added = reconcile_schema(bind)
    if added:
        print(f"[014] reconciled {len(added)} items: {', '.join(added)}")

    # Inspector جديد — الخطوة 1 قد أضافت أعمدة/فهارس (معلومات القديم مخبأة)
    inspector = Inspector.from_engine(bind)
    tables = set(inspector.get_table_names())

    # ── 2) تثبيت NOT NULL (PostgreSQL) لأعمدة server_default ───────────
    # بعد شفاء NULL في الخطوة 1، عقود النموذج (nullable=False) تصبح قابلة
    # للتثبيت الدائم على قواعد الإنتاج — SQLite يتطلب إعادة بناء الجدول
    # فتُوثَّق الفجوة فقط (القيم نفسها مضمونة غير-NULL بعد الشفاء).
    from models import Base

    if bind.dialect.name == "postgresql":
        for table in Base.metadata.sorted_tables:
            if table.name not in tables:
                continue
            db_cols = {c["name"]: c for c in inspector.get_columns(table.name)}
            for col in table.columns:
                db_col = db_cols.get(col.name)
                if db_col is None or col.nullable or not db_col.get("nullable", True):
                    continue  # أضيف حديثًا، أو النموذج يقبل NULL، أو القاعدة أصلاً NOT NULL
                if _constant_server_default(col, bind.dialect) is None:
                    continue
                try:
                    op.execute(sa.text(
                        f'ALTER TABLE {table.name} ALTER COLUMN "{col.name}" '
                        f"SET NOT NULL"
                    ))
                    print(f"[014] tightened NOT NULL on {table.name}.{col.name}")
                except Exception as exc:  # noqa: BLE001 — الشدّ تنقيحي لا حرج
                    print(f"[014] could not tighten {table.name}.{col.name}: {exc}")

    # ── 3) التنظيفات الميكانيكية (D3-M5/M6) ────────────────────────────
    # reconcile لا يُسقط أبدًا (فلسفته الجراحية) — هذه خطوات السلسلة وحدها.
    for table, column in _DEAD_COLUMNS:
        if table not in tables:
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        if column in existing:
            op.drop_column(table, column)
            print(f"[014] dropped dead column {table}.{column}")

    for table, name in _DUP_INDEXES:
        if table not in tables:
            continue
        if name in {ix["name"] for ix in inspector.get_indexes(table)} or \
                _catalog_has_index(bind, table, name):
            op.execute(sa.text(f"DROP INDEX IF EXISTS {name}"))
            print(f"[014] dropped duplicate index {name}")


def downgrade() -> None:
    bind = op.get_bind()
    inspector = Inspector.from_engine(bind)
    tables = set(inspector.get_table_names())

    # 1) إسقاط فهارس v15 المستقلة فقط — قيود create_all الجدولية لا تُمس
    #    (نمط 013: التماثل على القواعد النظيفة مضمون).
    from _schema_reconcile import _INDEX_HEAL_V15

    for label, _pre_stmts, _ddl in _INDEX_HEAL_V15:
        table, name = label.split(".", 1)
        if table not in tables:
            continue
        try:
            constraint_names = {uc["name"] for uc in inspector.get_unique_constraints(table)}
        except Exception:
            constraint_names = set()
        if name in constraint_names:
            continue  # قيد جدول من create_all — ليس ملكنا
        op.execute(sa.text(f"DROP INDEX IF EXISTS {name}"))

    # 2) إعادة العمودين الميتين (أنشأهما 001/004 — يعاد شكل ما قبل 014).
    for table, column in _DEAD_COLUMNS:
        if table not in tables:
            continue
        existing = {c["name"] for c in inspector.get_columns(table)}
        if column in existing:
            continue
        if column == "onboarding_completed":
            op.add_column(table, sa.Column(
                column, sa.Boolean(), server_default=sa.text("false"),
                nullable=False))
        else:  # amount_numeric
            op.add_column(table, sa.Column(column, sa.Numeric(10, 3)))

    # 3) الفهرس المكرر يُعاد (شكل ما قبل 014) — best-effort.
    for table, name in _DUP_INDEXES:
        if table not in tables:
            continue
        if not _catalog_has_index(bind, table, name):
            try:
                op.create_index(name, table, ["status", "scheduled_at"])
            except Exception:
                pass  # best-effort — الأحادي كان تكرارًا لا قيمة له

    # الخصومات/الدمج/التحييد/إعادة الأبوة/شدّ NOT NULL — forward-only
    # (نمط 007/012/013): البيانات المحذوفة والمحوَّودة لا تُستعاد.
