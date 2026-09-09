"""Self-healing schema reconcile: add missing model columns to existing tables.

Why this exists (root-caused 2026-09-05, evidence in scripts/repro_plans_500.py):
  The production Neon DB predates the September 2026 rebuild. Core tables
  (subscription_plans, users, tenants, ...) were created with the PRE-rebuild
  schema. ``Base.metadata.create_all`` only creates MISSING tables — it never
  ALTERs existing ones — and no Alembic migration covered the pre-rebuild →
  current column gap. Result in production: ``SELECT`` with current model
  columns raised "column does not exist" → 500 on ``/api/plans`` while
  ``/healthz`` (count-only) stayed green.

Invoked from BOTH (belt-and-suspenders, both idempotent):
  - runner lifespan — right after create_all, BEFORE Alembic (heals even if
    the Alembic step is skipped or fails on a legacy DB)
  - Alembic revision 007 — keeps the migration chain the single source of
    truth for fresh/managed environments
  - Alembic revision 014 (v15) — delegates here for the unique-constraint
    family below, so the chain and the safety net share ONE spec

Properties:
  - idempotent: re-running adds nothing
  - cross-dialect: SQLite (dev/E2E) and PostgreSQL (Neon prod)
  - surgical: only ADDS missing columns; never drops/renames. Legacy extra
    columns (e.g. subscription_plans.price_monthly) are left in place —
    harmless to the ORM, kept for data safety.
  - adds columns as NULLABLE (SQLite cannot ADD COLUMN with non-constant
    defaults); Python-side model defaults fill values on new INSERTs, and
    the canonical seed upsert repairs legacy rows. EXCEPTION (v15-E2):
    when the column carries a CONSTANT server_default (users.token_ver
    "0" / users.is_platform_admin "false") the literal is included in the
    ADD COLUMN statement — both dialects support constant defaults, so new
    rows can never be born NULL (D3-M2).

v14-E3 (C-DATA1 + D7-07): INDEX/CONSTRAINT healing. The column pass above
  never covered DB-level constraints/indexes on legacy tables — production
  relied on manual SQL (migrations/002_saas_migration.sql) that added only a
  plain tenant index on bot_state. Without ``uq_botstate_tenant_key`` the
  wallet credit race inserts duplicate balance rows (silent money corruption,
  D7-01) and without ``uq_botstate_key_value`` webhook tenant resolution can
  hit MultipleResultsFound. The heal list below runs the SAME dedup statements
  as migrations 012/013 (keep MAX(id)) and then issues cross-dialect
  ``CREATE [UNIQUE] INDEX IF NOT EXISTS`` for both constraints and the four
  hot-path indexes no migration ever created on legacy tables. DDL failures are
  logged and swallowed — reconcile must never take startup down; the alembic
  chain (012/013) remains the authoritative healer.

v15-E2 (D3-H1/H2/M2 + D12-H2/H4): the same healing extended to the
  pre-rebuild tables whose model-declared unique constraints were never
  created on legacy production (only the manual SQL's two —
  uq_reply_tenant_comment + uq_user_tenant_username — exist there, and even
  the former is not guaranteed). Each entry backfills BEFORE the DDL:
  sequence_subscriptions.tenant_id is re-parented from its sequence (the old
  subscribe() dropped it to tenant 0 → drip steps were silently skipped),
  duplicate rows are removed keeping MAX(id) (newest), counters are SUM-merged
  into the survivor (subscribers.reply_count, customers.total_interactions,
  usage_counters.current_value — split rows froze billing/audience updates),
  and duplicate user emails are "neutralized" keeping MIN(id) — the row the
  deterministic email login (order_by(id)) picks — so the unique
  lower(email) partial index can be created without deleting accounts.
  D3-M2's NULL poisoning of server_default columns is healed by a backfill
  pass over every model column declared NOT NULL + constant server_default
  (users.token_ver / users.is_platform_admin — the live /api/login 500:
  int(None) in routers/auth.py:36).

NOT covered (documented limits): other unique/index/FK drift beyond the
  list below — v16-E5 (D6) أغلق الثغرات التي وجدها D6 في القائمة
  (انظر _INDEX_HEAL_V16) فالباقي هو مجددًا «ما ليس مذكورًا أسفل». App-level checks already guard these paths; see docs/design-system.md
  and CLAUDE.md rules. Reconcile also never DROPS anything — the two dead
  migration columns (users.onboarding_completed from 004,
  payment_requests.amount_numeric from 001) and the duplicate
  ix_schedpost_status_sched index are dropped by migration 014 only
  (documented there); they stay harmless here.
"""
from __future__ import annotations

import logging
import re
import warnings

import sqlalchemy as sa

log = logging.getLogger("smartbot.schema")

# (label, pre-DDL dedup statements, DDL) — label is "<table>.<index>".
# Dedup runs ONLY when the constraint is actually missing (guarded below),
# is idempotent (keeps MAX(id) per group — same SQL as migrations 012/013),
# and both statements work verbatim on SQLite and PostgreSQL.
_INDEX_HEAL: list[tuple[str, tuple[str, ...], str]] = [
    (
        # migration 012 semantics: one page binding per page id value
        "bot_state.uq_botstate_key_value",
        (
            "DELETE FROM bot_state WHERE key = 'fb_page_id' "
            "AND id NOT IN (SELECT MAX(id) FROM bot_state "
            "WHERE key = 'fb_page_id' GROUP BY value)",
        ),
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_botstate_key_value "
        "ON bot_state (key, value) WHERE key = 'fb_page_id'",
    ),
    (
        # migration 013 semantics (C-DATA1): one row per (tenant_id, key)
        "bot_state.uq_botstate_tenant_key",
        (
            "DELETE FROM bot_state WHERE id NOT IN "
            "(SELECT MAX(id) FROM bot_state GROUP BY tenant_id, key)",
        ),
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_botstate_tenant_key "
        "ON bot_state (tenant_id, key)",
    ),
    # D7-07 hot paths — declared in models, never created on legacy tables
    ("bot_logs.ix_botlog_tenant_created", (),
     "CREATE INDEX IF NOT EXISTS ix_botlog_tenant_created "
     "ON bot_logs (tenant_id, created_at)"),
    ("rules.ix_rule_tenant_enabled", (),
     "CREATE INDEX IF NOT EXISTS ix_rule_tenant_enabled "
     "ON rules (tenant_id, enabled)"),
    ("messages.ix_messages_rule_id", (),
     "CREATE INDEX IF NOT EXISTS ix_messages_rule_id ON messages (rule_id)"),
    ("comments.ix_comments_commenter_id", (),
     "CREATE INDEX IF NOT EXISTS ix_comments_commenter_id "
     "ON comments (commenter_id)"),
]

# ── v15-E2 helpers: dedup / counter-merge SQL (SQLite + PostgreSQL) ─────────
# الجداول المشتقة (SELECT ... FROM t) داخل العبارات تجعلها آمنة على كلتا
# اللهجتين: المجموعات تُقيَّم على لقطة قبل التعديل، وNOT IN لا يصطدم
# بـNULL (MAX(id) على مفتاح أساسي غير معدوم أبدًا).


def _dedup_stmt(table: str, *cols: str) -> str:
    """إبقاء الأحدث فقط (MAX(id)) لكل مجموعة أعمدة — نمط 012/013 حرفيًا."""
    group = ", ".join(cols)
    return (
        f"DELETE FROM {table} WHERE id NOT IN "
        f"(SELECT MAX(id) FROM (SELECT id, {group} FROM {table}) t "
        f"GROUP BY {group})"
    )


def _merge_stmt(table: str, counter: str, *cols: str) -> str:
    """دمج عدّاد المجموعة (SUM) في الصف الناجي قبل dedup.

    الناجي الوحيد (MAX(id)) يحمل مجموع قيم المكررين — صفوف usage_counters
    المنقسمة كانت تُقرأ `order_by desc limit(1)` فتضيع الفوترة، وreply_count
    المكرر كان يتجمد مع توقف scalar_one_or_none (D3-H1).
    """
    keys = ", ".join(cols)
    match = " AND ".join(f"d.{c} = {table}.{c}" for c in cols)
    return (
        f"UPDATE {table} SET {counter} = ("
        f"SELECT COALESCE(SUM(COALESCE(d.{counter}, 0)), 0) "
        f"FROM (SELECT {keys}, {counter} FROM {table}) d WHERE {match}) "
        f"WHERE id IN (SELECT MAX(id) FROM (SELECT id, {keys} FROM {table}) t "
        f"GROUP BY {keys} HAVING COUNT(*) > 1)"
    )


# D3-H2: صفوف sequence_subscriptions التي أنشأها subscribe() القديم تسقط في
# المستأجر 0 — وكيل الإرسال per-tenant في _services يتخطاها فميزة drip تموت
# صمتًا. نعيد الأبوة من التسلسل المقابل (شرط EXISTS يحمي اليتامى من NULL).
_SEQSUB_TENANT_BACKFILL = (
    "UPDATE sequence_subscriptions SET tenant_id = ("
    "SELECT s.tenant_id FROM sequences s "
    "WHERE s.id = sequence_subscriptions.sequence_id) "
    "WHERE tenant_id = 0 AND EXISTS ("
    "SELECT 1 FROM sequences s WHERE s.id = sequence_subscriptions.sequence_id "
    "AND s.tenant_id <> 0)"
)

# D12-H4: تحييد تكرارات البريد — إبقاء MIN(id) (الحساب الذي يلتقطه الدخول
# بالبريد حتميًا order_by(id)) وتصفير بريد الأحدث؛ لا حذف حسابات (الدفوعات
# والاشتراكات المرتبطة بها تبقى). Idempotent: المحيَّد email='' يخرج من
# شرط الفهرس الجزئي WHERE email <> ''.
_USERS_EMAIL_NEUTRALIZE = (
    "UPDATE users SET email = '' WHERE id NOT IN ("
    "SELECT keep FROM (SELECT MIN(id) AS keep FROM users "
    "WHERE email <> '' GROUP BY lower(email))) AND email <> ''"
)

# v16-E5 (D6): تحييد تكرارات اسم المستخدم داخل المستأجر — إبقاء MIN(id)
# (الحساب الذي يلتقطه الدخول حتميًا order_by(id).limit(1) في auth.py:145)
# وتلوين الأحدث بلاحقة '#<id>' فريدة (نمط تحييد البريد نفسه — لا حذف
# حسابات: الدفوعات والسجلات المرتبطة بالأحدث تبقى). Idempotent:
# الملون يصبح مفردًا في مجموعته فلا يُعاد تلوينه؛ '#'||id يعمل على
# كلتا اللهجتين (anynonarray||text في PG).
_USERS_USERNAME_NEUTRALIZE = (
    "UPDATE users SET username = username || '#' || id WHERE id NOT IN ("
    "SELECT MIN(id) FROM (SELECT id, tenant_id, username FROM users) t "
    "GROUP BY tenant_id, username)"
)

# v16-E5 (D6): دفعة معلقة واحدة لكل مستخدم (قيد 002 الجزئي — TOCTOU
# payments.py) — قبل إنشاء الفهرس الفريد الجزئي نُسقط «المعلقات
# المتجاوزة» فقط (الأحدث MAX(id) يبقى): لا نمس verified/cancelled
# أبدًا (تاريخ الأموال محفوظ)، ولا صفوف user_id NULL (الفهرس الفريد
# يسمح بتعددها على PostgreSQL — NULLs متمايزة هناك). Idempotent:
# بعد الخصم كل مجموعة = صف واحد فلا يُحذف شيء.
_SUB_PAYMENT_PENDING_DEDUP = (
    "DELETE FROM subscription_payments WHERE status = 'pending' "
    "AND user_id IS NOT NULL AND id NOT IN ("
    "SELECT MAX(id) FROM (SELECT id, user_id FROM subscription_payments "
    "WHERE status = 'pending' AND user_id IS NOT NULL) t "
    "GROUP BY user_id)"
)

# v15-E2 (D3-H1 + D12-H2/H4) — عائلة القيود المفقودة على جداول ما قبل
# إعادة البناء. أسماء مطابقة لقيود النموذج (نمط 013): قواعد create_all
# تحملها كقيود جدول (يكتشفها الحارس) وقواعد legacy تحصل عليها كفهارس
# فريدة مستقلة بنفس الاسم.
_INDEX_HEAL_V15: list[tuple[str, tuple[str, ...], str]] = [
    (
        "subscribers.uq_sub_tenant_fbuser",
        (
            _merge_stmt("subscribers", "reply_count", "tenant_id", "fb_user_id"),
            _dedup_stmt("subscribers", "tenant_id", "fb_user_id"),
        ),
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_sub_tenant_fbuser "
        "ON subscribers (tenant_id, fb_user_id)",
    ),
    (
        "customers.uq_customer_tenant_fbuser",
        (
            _merge_stmt("customers", "total_interactions", "tenant_id", "fb_user_id"),
            _dedup_stmt("customers", "tenant_id", "fb_user_id"),
        ),
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_tenant_fbuser "
        "ON customers (tenant_id, fb_user_id)",
    ),
    (
        "tags.uq_tag_tenant_name",
        (_dedup_stmt("tags", "tenant_id", "name"),),
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_tag_tenant_name "
        "ON tags (tenant_id, name)",
    ),
    (
        "conversation_tags.uq_ctag_tenant_name",
        (_dedup_stmt("conversation_tags", "tenant_id", "name"),),
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_ctag_tenant_name "
        "ON conversation_tags (tenant_id, name)",
    ),
    (
        # D3: مجموعة الخصم (subscriber_id, tag_id) فقط — المفتاح المنطقي
        # الحقيقي (المشترك والتاغ يتبعان مستأجرًا واحدًا)، أعمّ من قيد
        # الأعمدة الثلاثة فيغطي انحراف tenant_id القديم.
        "subscriber_tags.uq_subscriber_tag",
        (_dedup_stmt("subscriber_tags", "subscriber_id", "tag_id"),),
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_subscriber_tag "
        "ON subscriber_tags (tenant_id, subscriber_id, tag_id)",
    ),
    (
        "sequence_subscriptions.uq_seq_sub",
        (
            _SEQSUB_TENANT_BACKFILL,
            _dedup_stmt("sequence_subscriptions", "tenant_id", "subscriber_id", "sequence_id"),
        ),
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_seq_sub "
        "ON sequence_subscriptions (tenant_id, subscriber_id, sequence_id)",
    ),
    (
        "usage_counters.uq_usage_tenant_metric_period",
        (
            _merge_stmt("usage_counters", "current_value", "tenant_id", "metric", "period_start"),
            _dedup_stmt("usage_counters", "tenant_id", "metric", "period_start"),
        ),
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_usage_tenant_metric_period "
        "ON usage_counters (tenant_id, metric, period_start)",
    ),
    (
        # D12-H2: models.py يعلنه منذ البداية ولا ترحيلة تنشئه — ازدواج الرد
        # على التعليق نفسه (إعادة تسليم webhook عبر نسخ Vercel) يكرر الإحصاء
        # والفوترة. SQL اليدوي 002_saas أنشأه كقيد على الإنتاج إن طُبّق —
        # الحارس يكتشف كلا الشكلين.
        "replies.uq_reply_tenant_comment",
        (_dedup_stmt("replies", "tenant_id", "fb_comment_id"),),
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_reply_tenant_comment "
        "ON replies (tenant_id, fb_comment_id)",
    ),
    (
        # D12-H4: فهرس تعبيري — انعكاس SQLAlchemy يتخطى فهارس التعبيرات،
        # لذا يفحصه الحارس في كتالوج اللهجة مباشرة (sqlite_master/pg_indexes).
        "users.uq_user_email_lower",
        (_USERS_EMAIL_NEUTRALIZE,),
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_email_lower "
        "ON users (lower(email)) WHERE email <> ''",
    ),
]

# v16-E5 (D6) — إكمال قائمة الشفاء بما وجده D6 ناقصًا (لو ماتت السلسلة).
# السلسلة تبقى السلطة: 001/create_all يبني معظم هذه الأسماء للقواعد
# الجديدة (النموذج يصرّح بها جميعًا)، و002/010/011/013/015 تشاؤها على
# مسار السلسلة — هذه الشبكة تضمن وجودها على قواعد legacy التي لم تمرّ
# بأي منها. الحارس يتخطى كلا الشكلين (قيد جدول من create_all أو فهرس
# مستقل بنفس الاسم) فالإعادة no-op على القواعد السليمة.
_INDEX_HEAL_V16: list[tuple[str, tuple[str, ...], str]] = [
    # المسار الساخن (ترحيلة 015): اختيار العرض لكل رسالة واردة — بدون
    # الفهرس مسح كامل للجدول لكل رسالة (offer_engine.py:41-43)
    ("offers.ix_offer_tenant_active", (),
     "CREATE INDEX IF NOT EXISTS ix_offer_tenant_active "
     "ON offers (tenant_id, is_active)"),
    # قيد النموذج (models.py:132) — الترحيلات لا تنشئه على قواعد legacy
    # (SQL اليدوي أنشأه على الإنتاج «إن طُبّق»؛ الحارس يكتشف كلا الشكلين)
    ("users.uq_user_tenant_username",
     (_USERS_USERNAME_NEUTRALIZE,),
     "CREATE UNIQUE INDEX IF NOT EXISTS uq_user_tenant_username "
     "ON users (tenant_id, username)"),
    # قيد 002 الجزئي (TOCTOU payments.py) — موجود في النموذج بلا أي
    # إنشاء سلسلي على legacy؛ الخصم أعلاه يحفظ تاريخ الأموال
    ("subscription_payments.ix_sub_payment_user_pending",
     (_SUB_PAYMENT_PENDING_DEDUP,),
     "CREATE UNIQUE INDEX IF NOT EXISTS ix_sub_payment_user_pending "
     "ON subscription_payments (user_id) WHERE status = 'pending'"),
    # عائلة uq_*_tenant_fb (D6): مفتاح dedup إعادة تسليم الويبهوك —
    # حوار الحذف مثل عائلة v15 (إبقاء MAX(id)؛ رسائل النسخة القديمة
    # تُسقط معها عبر CASCADE لأنها تكرار حرفي لنفس المحادثة/الرسالة)
    ("conversations.uq_conversations_tenant_fb",
     (_dedup_stmt("conversations", "tenant_id", "fb_conversation_id"),),
     "CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_tenant_fb "
     "ON conversations (tenant_id, fb_conversation_id)"),
    ("messages.uq_messages_tenant_fb",
     (_dedup_stmt("messages", "tenant_id", "fb_message_id"),),
     "CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_tenant_fb "
     "ON messages (tenant_id, fb_message_id)"),
    ("comments.uq_comments_tenant_fb",
     (_dedup_stmt("comments", "tenant_id", "fb_comment_id"),),
     "CREATE UNIQUE INDEX IF NOT EXISTS uq_comments_tenant_fb "
     "ON comments (tenant_id, fb_comment_id)"),
    # فهارس 010/011 الحارة التي لم تكن في القائمة (D6: 11/15 ناقصة) —
    # معظمها معلن في النموذج فيبنيه create_all؛ الشفاء هنا لقواعد legacy
    ("subscribers.ix_sub_tenant_last_interaction", (),
     "CREATE INDEX IF NOT EXISTS ix_sub_tenant_last_interaction "
     "ON subscribers (tenant_id, last_interaction_at)"),
    ("comments.ix_comment_tenant_created", (),
     "CREATE INDEX IF NOT EXISTS ix_comment_tenant_created "
     "ON comments (tenant_id, created_at)"),
    ("replies.ix_reply_tenant_created", (),
     "CREATE INDEX IF NOT EXISTS ix_reply_tenant_created "
     "ON replies (tenant_id, created_at)"),
    ("bot_state.ix_botstate_key_value", (),
     "CREATE INDEX IF NOT EXISTS ix_botstate_key_value "
     "ON bot_state (key, value)"),
    ("ai_suggestions.ix_ai_suggestion_tenant_created", (),
     "CREATE INDEX IF NOT EXISTS ix_ai_suggestion_tenant_created "
     "ON ai_suggestions (tenant_id, created_at)"),
    ("payment_requests.ix_payment_request_tenant_created", (),
     "CREATE INDEX IF NOT EXISTS ix_payment_request_tenant_created "
     "ON payment_requests (tenant_id, created_at)"),
    ("subscription_payments.ix_sub_payment_tenant_status_created", (),
     "CREATE INDEX IF NOT EXISTS ix_sub_payment_tenant_status_created "
     "ON subscription_payments (tenant_id, status, created_at)"),
    ("broadcasts.ix_broadcast_tenant_created", (),
     "CREATE INDEX IF NOT EXISTS ix_broadcast_tenant_created "
     "ON broadcasts (tenant_id, created_at)"),
    ("bot_alerts.ix_bot_alert_tenant_resolved_created", (),
     "CREATE INDEX IF NOT EXISTS ix_bot_alert_tenant_resolved_created "
     "ON bot_alerts (tenant_id, resolved, created_at)"),
    ("subscribers.ix_sub_tenant_platform_status", (),
     "CREATE INDEX IF NOT EXISTS ix_sub_tenant_platform_status "
     "ON subscribers (tenant_id, platform, status)"),
]

# ثوابت server_default فقط — دوال مثل now() يرفضها SQLite في ADD COLUMN
# وليست "قيمًا افتراضية آمنة" للشفاء.
_CONSTANT_DEFAULT_RE = re.compile(r"^[0-9A-Za-z_.'\-]+$")


def _constant_server_default(col, dialect) -> str | None:
    """نص DEFAULT الثابت للعمود إن وُجد (users.token_ver → "0").

    سلسلة خام (`server_default="draft"`) تُرندر **كمحرف نصي مقتبس**
    `'draft'` — DEFAULT مجرد معرّف سيُرفض نحوياً على SQLite ويُفسَّر
    كمرجع عمود على PostgreSQL. القيم الرقمية/المنطقية (0/false من
    text("...")) تبقى حرفية بلا اقتباس.
    """
    sd = col.server_default
    if sd is None:
        return None
    arg = getattr(sd, "arg", None)
    rendered: str | None = None
    if isinstance(arg, str):
        stripped = arg.strip()
        if stripped and _CONSTANT_DEFAULT_RE.match(stripped):
            return f"'{stripped.replace(chr(39), chr(39) * 2)}'"
        return None
    try:
        rendered = str(arg.compile(dialect=dialect)).strip()
    except Exception:
        return None
    if rendered and _CONSTANT_DEFAULT_RE.match(rendered):
        return rendered
    return None


def _exists_as_index_or_constraint(inspector, table: str, name: str) -> bool:
    """True when `name` is already an index OR a unique constraint.

    Fresh create_all DBs declare uq_botstate_tenant_key as a table-level
    UniqueConstraint (on PostgreSQL it surfaces in get_indexes as the
    constraint-backed index; on SQLite only in get_unique_constraints) —
    either form already guarantees uniqueness, so nothing to heal.
    """
    # v15-E2: الانعكاس يتخطى فهارس التعبيرات ويطلق SAWarning لكل استدعاء
    # (uq_user_email_lower) — تخطٍ مقصود نتولاه بفحص الكتالوج المباشر،
    # فنكتم التحذير المعروف هنا حفاظًا على نظافة سجل الإقلاع.
    try:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore", message=".*unsupported reflection of expression-based.*")
            if name in {ix["name"] for ix in inspector.get_indexes(table)}:
                return True
    except Exception:
        return False
    try:
        if name in {uc["name"] for uc in inspector.get_unique_constraints(table)}:
            return True
    except Exception:
        pass  # dialect without constraint reflection — index check was enough
    return False


def _exists_in_catalog(bind, table: str, name: str) -> bool:
    """فحص كتالوج مباشر — انعكاس SQLAlchemy يتخطى فهارس التعبيرات
    (uq_user_email_lower على SQLite لا يظهر في get_indexes إطلاقًا،
    فيحاول الحارس إنشاءه كل إقلاع؛ IF NOT EXISTS يمنع الخطأ لكن تقرير
    الشفاء يكذب). sqlite_master / pg_indexes يريان كل الفهارس."""
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


def reconcile_schema(bind) -> list[str]:
    """Ensure every Base.metadata column exists on its existing table.

    Args:
        bind: a synchronous SQLAlchemy Connection (e.g. inside
              ``conn.run_sync(...)`` or Alembic's ``op.get_bind()``).

    Returns:
        List of "<table>.<column>" strings for every column added, plus
        "<table>.<index>" labels for every healed index/constraint, plus
        "<table>.<column>~null" labels for server_default columns whose
        legacy NULL values were backfilled
        (empty when the schema already matches — the common case).
    """
    from models import Base  # local import: no circularity (models imports nothing back)

    added: list[str] = []
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue  # fresh table — create_all handles it
        existing_cols = {c["name"] for c in inspector.get_columns(table.name)}
        for col in table.columns:
            if col.name in existing_cols:
                continue
            if col.primary_key:
                # cannot ADD a PK to an existing table; legacy PKs already match
                log.warning("reconcile: skip PK column %s.%s", table.name, col.name)
                continue
            col_type = col.type.compile(bind.dialect)
            stmt = f'ALTER TABLE {table.name} ADD COLUMN "{col.name}" {col_type}'
            # v15-E2 (D3-M2): ثابت server_default يُرفق بالجملة — العمود
            # يولد بقيمة بدل NULL دائم (كلتا اللهجتين تدعمان ثوابت DEFAULT).
            default_lit = _constant_server_default(col, bind.dialect)
            if default_lit is not None:
                stmt += f" DEFAULT {default_lit}"
            bind.execute(sa.text(stmt))
            existing_cols.add(col.name)
            added.append(f"{table.name}.{col.name}")
            log.info("reconcile: added %s.%s", table.name, col.name)

    # v15-E2 (D3-M2): شفاء قيم NULL القائمة — الإنتاج أضافت الأعمدة عبر
    # reconcile القديم بلا DEFAULT فبقيت NULL رغم عقد النموذج (nullable=False).
    # هذا هو جذر الـ500 الحي على /api/login (int(None) على token_ver).
    # Idempotent: بعد الشفاء لا صفوف NULL فلا يُضاف شيء للتقرير.
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        existing_cols = {c["name"] for c in inspector.get_columns(table.name)}
        for col in table.columns:
            if col.name not in existing_cols or col.nullable:
                continue
            default_lit = _constant_server_default(col, bind.dialect)
            if default_lit is None:
                continue
            try:
                result = bind.execute(sa.text(
                    f'UPDATE {table.name} SET "{col.name}" = {default_lit} '
                    f'WHERE "{col.name}" IS NULL'
                ))
                if result.rowcount:
                    added.append(f"{table.name}.{col.name}~null")
                    log.info("reconcile: backfilled NULLs in %s.%s",
                             table.name, col.name)
            except Exception:
                log.warning("reconcile: NULL backfill failed for %s.%s",
                            table.name, col.name, exc_info=True)

    # v14-E3 + v15-E2: constraint/index healing on legacy tables.
    # Defensive by design: a failure logs a warning and moves on — the
    # alembic chain is the authoritative path; this is the safety net.
    for label, pre_stmts, ddl in (*_INDEX_HEAL, *_INDEX_HEAL_V15, *_INDEX_HEAL_V16):
        table, name = label.split(".", 1)
        if table not in existing_tables:
            continue
        try:
            if _exists_as_index_or_constraint(inspector, table, name):
                continue
            if _exists_in_catalog(bind, table, name):
                continue
            for stmt in pre_stmts:
                bind.execute(sa.text(stmt))
            bind.execute(sa.text(ddl))
            added.append(label)
            log.info("reconcile: ensured %s", label)
        except Exception:
            log.warning(
                "reconcile: could not ensure %s — leaving it to the alembic chain",
                label, exc_info=True,
            )

    return added
