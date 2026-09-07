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
        # collide with id=0.
        op.execute(
            "SELECT setval("
            "pg_get_serial_sequence('tenants', 'id'), "
            "(SELECT COALESCE(MAX(id), 0) FROM tenants))"
        )


def downgrade() -> None:
    op.drop_table("tenants")
