"""Add tenants table for multi-tenant SaaS.

Revision ID: 003

Stores tenant (organization) metadata. Users belong to a tenant via
`users.tenant_id` (FK). All bot/reply/subscription/flow data is scoped
to `tenant_id` and queries are filtered by it.

Production data without an explicit tenant is reassigned to the
default tenant (id=0, slug='default') so multi-tenant isolation
can be enforced without losing existing rows.

v13 §1 L6 (E4) — إصلاح dec-alembic-003: الإدراج أصبح يطابق شكل
الجدول الفعلي. الترحيل 001 يشغّل Base.metadata.create_all أولًا
فيولد جدول tenants بشكل النموذج (models.py — بلا slug)، ثم كان
الإدراج القديم بعمود slug يفشل على PostgreSQL نظيفة (42703)
فتعلّق السلسلة عند 002 صمتًا (الابتلاع في startup.py أخفاه أسابيع).
الآن يُبنى الإدراج من أعمدة الـ inspector الفعلية: بعمود slug عند
وجوده (الشكل القديم من فرع create_table أدناه)، وبلا slug على شكل
create_all — كلاهما بـ ON CONFLICT (id) DO NOTHING. سلوك SQLite
كما هو (لا بذر)، ولا-op في الإنتاج (alembic_version تجاوز 003 فلا
يُعاد تشغيله هناك)؛ الفائدة: PostgreSQL نظيفة (staging/نسخ محلية)
تمر والسلسلة تكمل، وبيئات عالقة عند 002 تُشفّى ذاتيًا في الإقلاع التالي.

v16 §E5 (D6-VERIFY) — setval صحيح على PG نظيفة: كانت الصيغة
غير المشروطة setval(seq, COALESCE(MAX(id),0)) مع الصف المزروع
الوحيد id=0 تستدعي setval(...,0) وهو خارج النطاق (سلسلة صاعدة
تبدأ من 1) → السلسلة تموت عند 003 على PostgreSQL نظيفة. الآن
يُستدعى setval فقط عند MAX(id) > 0 — انظر _setval_sql (الثابت
المنطقي موثّق هناك: سلسلة عذراء nextval=1 لا تتصادم مع id=0 أصلًا).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine.reflection import Inspector

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def _default_tenant_insert(cols: set[str]) -> str:
    """INSERT بذرة المستأجر الافتراضي (id=0) مطابقًا لشكل الجدول الفعلي.

    فرع create_table أعلاه يعرّف عمود slug NOT NULL (الشكل القديم)،
    بينما يخلق 001 الجدول بشكل النموذج عبر create_all — بلا slug.
    الدالة تعيد إدراجًا بعمود slug عندما يوجد في ``cols`` (أعمدة
    الـ inspector الفعلية) وإدراجًا مطابقًا لشكل النموذج بدونه.
    """
    if "slug" in cols:
        return (
            "INSERT INTO tenants (id, slug, name, plan, is_active) "
            "VALUES (0, 'default', 'Default Tenant', 'free', true) "
            "ON CONFLICT (id) DO NOTHING"
        )
    return (
        "INSERT INTO tenants (id, name, plan, is_active) "
        "VALUES (0, 'Default Tenant', 'free', true) "
        "ON CONFLICT (id) DO NOTHING"
    )


def _setval_sql(max_id: int | None) -> str | None:
    """SQL رفع سلسلة tenants.id فوق الصفوف القائمة، أو None عند تخطّيه.

    الثابت (PG نظيفة، D6): بعد إدراج البذرة مباشرة الصف الوحيد هو
    id=0 → MAX(id)=0 → setval(seq, 0) خارج النطاق (سلسلة PostgreSQL
    صاعدة لا تقبل 0) فكانت السلسلة تموت عند 003. عند MAX=0 السلسلة
    عذراء أصلًا (nextval=1) فلا يمكن أن تتصادم مع الصف المزروع id=0 —
    تخطّي setval هو الصيغة الصحيحة الوحيدة. عند MAX>0 تُرفع السلسلة
    إلى MAX فيأخذ الإدراج التالي MAX+1.
    """
    if not max_id or int(max_id) <= 0:
        return None
    return (
        "SELECT setval("
        "pg_get_serial_sequence('tenants', 'id'), "
        f"{int(max_id)})"
    )


def upgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name
    inspector = Inspector.from_engine(bind)

    # Migration 001 runs Base.metadata.create_all() FIRST, so the tenants
    # table (defined in the models) already exists on every fresh DB. Guard
    # against re-creating it — this unblocked the 001→005 chain silently
    # failing at 003 on both SQLite and PostgreSQL.
    if "tenants" not in inspector.get_table_names():
        op.create_table(
            "tenants",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("slug", sa.String(length=64), nullable=False, unique=True, index=True),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("plan", sa.String(length=32), nullable=False, server_default="free"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("settings", sa.JSON(), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )

    # Seed a default tenant so production data without an explicit
    # tenant_id is still scoped (id=0 keeps the existing convention
    # used throughout the codebase: tenant_id is non-nullable INTEGER
    # defaulting to 0 for legacy rows).
    if dialect == "postgresql":
        # L6: استعمل شكل الجدول الفعلي — الإدراج الثابت بعمود slug كان
        # يفشل على قواعد شكل-create_all (42703) ويعلّق السلسلة عند 002.
        cols = {c["name"] for c in inspector.get_columns("tenants")}
        op.execute(_default_tenant_insert(cols))

        # Bump the sequence past the seeded id so future inserts do not
        # collide with id=0. v16-E5 (D6): skip when MAX(id)=0 — the old
        # unconditional setval(seq, 0) is out of bounds on a fresh
        # PostgreSQL (ascending sequences start at 1) and killed the whole
        # chain at 003 there; a virgin sequence (nextval=1) can never
        # collide with the seeded row id=0 anyway.
        max_id = bind.execute(
            sa.text("SELECT COALESCE(MAX(id), 0) FROM tenants")
        ).scalar()
        setval_sql = _setval_sql(max_id)
        if setval_sql is not None:
            op.execute(setval_sql)


def downgrade() -> None:
    op.drop_table("tenants")
