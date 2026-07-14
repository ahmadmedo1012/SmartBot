from _utils import utcnow
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON, ForeignKey, UniqueConstraint, Index, Numeric, BigInteger
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Rule(Base):
    __tablename__ = "rules"
    __table_args__ = (Index("ix_rule_tenant_id", "tenant_id", "id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    name = Column(String(100), nullable=False)
    keywords = Column(JSON, nullable=False)  # list[str]
    reply_template = Column(Text, nullable=False)
    dm_template = Column(Text, default="")
    enabled = Column(Boolean, default=True)
    description = Column(String(255), default="")
    priority = Column(Integer, default=999)
    bot_type = Column(String(20), default="reply")
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class Reply(Base):
    __tablename__ = "replies"
    __table_args__ = (
        Index("ix_reply_rule_created", "rule_id", "created_at"),
        UniqueConstraint('tenant_id', 'fb_comment_id', name='uq_reply_tenant_comment'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    fb_comment_id = Column(String(100), nullable=False)
    fb_post_id = Column(String(100), nullable=False)
    commenter_name = Column(String(200), default="")
    comment_text = Column(Text, default="")
    reply_text = Column(Text, default="")
    rule_id = Column(Integer, nullable=True, index=True)
    created_at = Column(DateTime, default=utcnow, index=True)


class BotLog(Base):
    __tablename__ = "bot_logs"
    __table_args__ = (Index("ix_botlog_tenant_created", "tenant_id", "created_at"), Index("ix_botlog_level_created", "level", "created_at"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    level = Column(String(20), default="INFO")
    message = Column(Text, default="")
    created_at = Column(DateTime, default=utcnow, index=True)


class BotState(Base):
    __tablename__ = "bot_state"
    __table_args__ = (UniqueConstraint('tenant_id', 'key', name='uq_botstate_tenant_key'),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    key = Column(String(100), nullable=False)
    value = Column(Text, default="")


class Tenant(Base):
    """Multi-tenant organization — each tenant is a Facebook page account."""
    __tablename__ = "tenants"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), default="")
    plan = Column(String(50), default="free")  # legacy: free/basic/pro/enterprise
    # subscription fields (new)
    plan_id = Column(Integer, nullable=True)  # FK → subscription_plans.id
    subscription_status = Column(String(20), default="UNPAID")  # UNPAID/PAID/REJECTED/FREE
    plan_start = Column(DateTime, nullable=True)
    plan_end = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)


# ponytail: TenantConfig model removed — Sprint 3 will add config storage per tenant
# along with the Settings UI that actually needs it

class User(Base):
    __tablename__ = "users"
    __table_args__ = (Index("ix_user_tenant_id", "tenant_id", "id"), UniqueConstraint('tenant_id', 'username', name='uq_user_tenant_username'),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    username = Column(String(100), nullable=False)
    email = Column(String(200), default="")
    plan = Column(String(50), default="free")
    email_verified = Column(Boolean, default=False)
    reset_token = Column(String(100), default="")
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="viewer")  # admin, editor, viewer
    created_at = Column(DateTime, default=utcnow)


# ── Professional Features ────────────────────────────────────────────────────

class ReplyTemplate(Base):
    """Saved reply templates for quick-access."""
    __tablename__ = "reply_templates"
    __table_args__ = (Index("ix_replytmpl_tenant_id", "tenant_id", "id"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    name = Column(String(100), nullable=False)
    text = Column(Text, nullable=False)
    category = Column(String(50), default="general")  # general, greeting, complaint, pricing
    shortcut = Column(String(20), default="")  # keyboard shortcut like /price
    created_at = Column(DateTime, default=utcnow)


class AISuggestion(Base):
    """Log of AI-powered suggestion events."""
    __tablename__ = "ai_suggestions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    comment_id = Column(String(100), default="")
    comment_text = Column(Text, default="")
    suggestions = Column(JSON, default=list)  # list of generated suggestions
    chosen = Column(String(500), default="")  # which one was used (if any)
    intent = Column(String(50), default="")
    sentiment = Column(String(50), default="")
    confidence = Column(Integer, default=0)  # 0-100
    latency_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)


class ConversationTag(Base):
    """Tags for categorizing conversations."""
    __tablename__ = "conversation_tags"
    __table_args__ = (UniqueConstraint('tenant_id', 'name', name='uq_ctag_tenant_name'),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    name = Column(String(50), nullable=False)
    color = Column(String(7), default="#6366f1")  # hex color
    created_at = Column(DateTime, default=utcnow)


class ConversationLabel(Base):
    """M:N link between FB conversations and tags."""
    __tablename__ = "conversation_labels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    conversation_id = Column(String(100), nullable=False, index=True)
    tag_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=utcnow)


class ScheduledPost(Base):
    """Scheduled posts for any platform."""
    __tablename__ = "scheduled_posts"
    __table_args__ = (Index("ix_schedpost_status_sched", "status", "scheduled_at"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    message = Column(Text, nullable=False)
    image_url = Column(String(500), default="")
    platform = Column(String(20), default="facebook")  # facebook, x, linkedin, instagram
    scheduled_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="draft")  # draft, scheduled, published, failed
    fb_post_id = Column(String(100), default="")
    created_by = Column(String(100), default="")
    created_at = Column(DateTime, default=utcnow)
    published_at = Column(DateTime, nullable=True)


class AnalyticsEvent(Base):
    """Track granular analytics events."""
    __tablename__ = "analytics_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    event_type = Column(String(50), nullable=False, index=True)  # reply_sent, comment_received, dm_sent, webhook_received
    metadata_json = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)


class BotAlert(Base):
    """Bot health alerts — low reply rate, errors, token issues."""
    __tablename__ = "bot_alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    alert_type = Column(String(50), nullable=False)  # low_volume, error_rate, token_expiring, no_comments
    severity = Column(String(20), default="info")  # info, warning, critical
    message = Column(Text, default="")
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)
    resolved_at = Column(DateTime, nullable=True)


# ── Offers / Coupons ──────────────────────────────────────────────────────────


class Offer(Base):
    """Special offers and coupons for customer engagement."""
    __tablename__ = "offers"
    __table_args__ = (Index("ix_offer_active_expires", "is_active", "expires_at"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    title = Column(String(200), nullable=False)
    code = Column(String(50), default="")
    description = Column(Text, default="")
    discount_type = Column(String(20), default="percentage")  # percentage, fixed_amount, free_shipping
    discount_value = Column(Integer, default=0)
    min_purchase = Column(Integer, default=0)
    max_uses = Column(Integer, default=0)
    used_count = Column(Integer, default=0)
    auto_reply_rule_id = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True)
    starts_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class OfferClaim(Base):
    """Track who claimed each offer."""
    __tablename__ = "offer_claims"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    offer_id = Column(Integer, nullable=False, index=True)
    fb_user_id = Column(String(100), nullable=False)
    user_name = Column(String(200), default="")
    claimed_at = Column(DateTime, default=utcnow)


# ── Subscriber Management ──────────────────────────────────────────────────────


class Subscriber(Base):
    """Social platform subscriber/follower."""
    __tablename__ = "subscribers"
    __table_args__ = (Index("ix_sub_tenant_id", "tenant_id", "id"), UniqueConstraint('tenant_id', 'fb_user_id', name='uq_sub_tenant_fbuser'),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    fb_user_id = Column(String(100), nullable=False)
    name = Column(String(200), default="")
    first_name = Column(String(100), default="")
    username = Column(String(100), default="")
    locale = Column(String(20), default="")
    gender = Column(String(10), default="")
    platform = Column(String(20), default="messenger")  # messenger/instagram/whatsapp
    page_id = Column(String(100), default="")
    status = Column(String(20), default="active")  # active/inactive/blocked
    first_seen_at = Column(DateTime, default=utcnow)
    last_interaction_at = Column(DateTime, nullable=True)
    last_comment_text = Column(Text, default="")
    reply_count = Column(Integer, default=0)
    custom_data = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)

    tags = relationship("Tag", secondary="subscriber_tags", lazy="selectin", back_populates="subscribers")


class Tag(Base):
    """Label/category for subscriber segmentation."""
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint('tenant_id', 'name', name='uq_tag_tenant_name'),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    name = Column(String(50), nullable=False)
    color = Column(String(7), default="#6366f1")
    created_at = Column(DateTime, default=utcnow)

    subscribers = relationship("Subscriber", secondary="subscriber_tags", lazy="selectin", back_populates="tags", overlaps="subscriber_tags")


class SubscriberTag(Base):
    """M:N join between subscribers and tags."""
    __tablename__ = "subscriber_tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    subscriber_id = Column(Integer, ForeignKey("subscribers.id", ondelete="CASCADE"), nullable=False, index=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "subscriber_id", "tag_id", name="uq_subscriber_tag"),)


# ── Flows (Visual Automation) ──────────────────────────────────────────────────


class Flow(Base):
    """Visual bot flow — nodes and edges."""
    __tablename__ = "flows"
    __table_args__ = (Index("ix_flow_tenant_status", "tenant_id", "status"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    nodes = Column(JSON, default=list)
    edges = Column(JSON, default=list)
    status = Column(String(20), default="draft")  # draft/active/paused/archived
    version = Column(Integer, default=1)
    created_by = Column(String(100), default="")
    total_replies = Column(Integer, default=0)
    last_triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class FlowExecution(Base):
    """Runtime record of a flow running for a subscriber."""
    __tablename__ = "flow_executions"
    __table_args__ = (Index("ix_flowexec_tenant_status", "tenant_id", "status"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    flow_id = Column(Integer, ForeignKey("flows.id"), nullable=False, index=True)
    subscriber_id = Column(Integer, ForeignKey("subscribers.id"), nullable=True, index=True)
    trigger_type = Column(String(50), default="")
    trigger_data = Column(JSON, default=dict)
    current_node_id = Column(String(100), default="")
    status = Column(String(20), default="active")  # active/completed/failed/expired
    started_at = Column(DateTime, default=utcnow)
    completed_at = Column(DateTime, nullable=True)
    error_log = Column(JSON, default=dict)


# ── Sequences (Drip Campaigns) ─────────────────────────────────────────────────


class Sequence(Base):
    """Drip campaign — timed message series."""
    __tablename__ = "sequences"
    __table_args__ = (Index("ix_seq_tenant_status", "tenant_id", "status"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    status = Column(String(20), default="draft")  # draft/active/paused/archived
    created_by = Column(String(100), default="")
    total_subscribers = Column(Integer, default=0)
    total_sent = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class SequenceStep(Base):
    """Individual step within a sequence."""
    __tablename__ = "sequence_steps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    sequence_id = Column(Integer, ForeignKey("sequences.id", ondelete="CASCADE"), nullable=False, index=True)
    step_order = Column(Integer, default=0)
    delay_days = Column(Integer, default=0)
    delay_hours = Column(Integer, default=0)
    message_template = Column(Text, default="")
    message_type = Column(String(20), default="text")  # text/image/carrier
    action_on_complete = Column(JSON, default=dict)
    created_at = Column(DateTime, default=utcnow)


class SequenceSubscription(Base):
    """A subscriber's enrollment in a sequence."""
    __tablename__ = "sequence_subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    subscriber_id = Column(Integer, ForeignKey("subscribers.id", ondelete="CASCADE"), nullable=False, index=True)
    sequence_id = Column(Integer, ForeignKey("sequences.id", ondelete="CASCADE"), nullable=False, index=True)
    current_step = Column(Integer, default=0)
    status = Column(String(20), default="active")  # active/completed/unsubscribed
    entered_at = Column(DateTime, default=utcnow)
    completed_at = Column(DateTime, nullable=True)

    __table_args__ = (Index("ix_seqsub_tenant_status", "tenant_id", "status"), UniqueConstraint("tenant_id", "subscriber_id", "sequence_id", name="uq_seq_sub"),)


# ── Broadcasts (One-to-Many) ───────────────────────────────────────────────────


class Broadcast(Base):
    """One-time broadcast message to a subscriber segment."""
    __tablename__ = "broadcasts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    name = Column(String(200), nullable=False)
    message_template = Column(Text, default="")
    platform_filter = Column(JSON, default=dict)
    segment_filters = Column(JSON, default=dict)
    status = Column(String(20), default="draft")  # draft/sending/sent/cancelled/partial
    total_recipients = Column(Integer, default=0)
    sent_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    opened_count = Column(Integer, default=0)
    created_by = Column(String(100), default="")
    created_at = Column(DateTime, default=utcnow)
    sent_at = Column(DateTime, nullable=True)


class BroadcastRecipient(Base):
    """Per-subscriber delivery record for a broadcast."""
    __tablename__ = "broadcast_recipients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    broadcast_id = Column(Integer, ForeignKey("broadcasts.id", ondelete="CASCADE"), nullable=False, index=True)
    subscriber_id = Column(Integer, ForeignKey("subscribers.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), default="pending")  # pending/sent/failed/opened
    error_message = Column(Text, default="")
    sent_at = Column(DateTime, nullable=True)


class ConversationNote(Base):
    """Internal notes attached to a conversation (any platform)."""
    __tablename__ = "conversation_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    conversation_id = Column(String(100), nullable=False, index=True)
    content = Column(Text, default="")
    created_by = Column(String(100), default="")
    created_at = Column(DateTime, default=utcnow)


class ConversationAssignee(Base):
    """User assigned to a conversation."""
    __tablename__ = "conversation_assignees"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    conversation_id = Column(String(100), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_at = Column(DateTime, default=utcnow)


class BrandConfig(Base):
    """Brand identity and copyright configuration for Smart Link."""
    __tablename__ = "brand_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    brand_name = Column(String(100), default="Smart Link")
    tagline = Column(String(300), default="اللي يواكب التطور يسبق الجميع")
    copyright_text = Column(String(500), default="© 2025 Smart Link. جميع الحقوق محفوظة.")
    website = Column(String(200), default="https://smart-menu-sigma.vercel.app")
    whatsapp = Column(String(50), default="+218910089975")
    projects = Column(JSON, default=list)  # ["Smart Menu", "Smart Bot", "Smart POS", ...]
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


# ── Subscription System ──────────────────────────────────────────────────────


class SubscriptionPlan(Base):
    """Pricing tiers — DB-driven, matching Smart-Menu model."""
    __tablename__ = "subscription_plans"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), unique=True, nullable=False)  # Free, Basic, Premium, Pro, Enterprise
    name_ar = Column(String(100), nullable=False)            # مجاني, أساسي, مميز, احترافي, مؤسسي
    price = Column(Numeric(10, 2), default=0)
    period_days = Column(Integer, default=30)
    # Limits
    max_replies = Column(Integer, default=100)       # monthly auto-reply limit
    max_pages = Column(Integer, default=1)            # Facebook pages count
    max_rules = Column(Integer, default=5)            # auto-reply rules
    max_team = Column(Integer, default=0)             # team members (0 = none)
    # Feature flags
    has_dm = Column(Boolean, default=False)            # private reply to comments
    has_ai = Column(Boolean, default=False)            # AI-powered replies
    has_broadcast = Column(Boolean, default=False)     # mass messaging
    has_scheduling = Column(Boolean, default=False)    # post scheduling
    has_reports = Column(Boolean, default=False)       # PDF reports
    has_flows = Column(Boolean, default=False)         # visual flows
    has_offers = Column(Boolean, default=False)        # offer engine
    has_sequences = Column(Boolean, default=False)     # drip campaigns
    has_analytics_advanced = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    features = Column(JSON, default=list)  # feature checklist for UI
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class SubscriptionPayment(Base):
    """Payment transaction with Telegram admin approval."""
    __tablename__ = "subscription_payments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, nullable=True)              # FK → users.id (nullable for pre-registration)
    tenant_id = Column(Integer, nullable=True)             # FK → tenants.id
    phone = Column(String(50), nullable=False)             # payer phone number
    amount = Column(Numeric(10, 2), nullable=False)
    provider = Column(String(20), default="libyana")       # libyana, madar
    plan_id = Column(Integer, nullable=False)              # FK → subscription_plans.id
    plan_name = Column(String(100), default="")            # snapshot at time of payment
    status = Column(String(20), default="pending")         # pending, verified, cancelled
    extra_data = Column(JSON, default=dict)                # extra data (receipt ref, temp username/slug)
    upgraded_from = Column(Integer, nullable=True)         # plan_id upgrading FROM (for upgrades)
    created_at = Column(DateTime, default=utcnow)


class UsageCounter(Base):
    """Monthly usage tracking per tenant for plan enforcement."""
    __tablename__ = "usage_counters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, index=True)
    metric = Column(String(50), nullable=False)           # replies_used, dms_used, broadcasts_used
    period_start = Column(DateTime, nullable=False)        # start of current billing period
    current_value = Column(Integer, default=0)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    __table_args__ = (UniqueConstraint("tenant_id", "metric", "period_start", name="uq_usage_tenant_metric_period"),)


class SystemConfig(Base):
    """Admin-configurable platform settings (payment details, limits, etc.)."""
    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, nullable=False)
    category = Column(String(50), default="general")
    is_secret = Column(Boolean, default=False)
    description = Column(String(300), default="")
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class Customer(Base):
    """CRM — customers and leads from social interactions."""
    __tablename__ = "customers"
    __table_args__ = (
        Index("ix_customer_tenant_stage", "tenant_id", "stage"),
        Index("ix_customer_stage_contacted", "stage", "last_contacted_at"),
        UniqueConstraint('tenant_id', 'fb_user_id', name='uq_customer_tenant_fbuser'),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    fb_user_id = Column(String(100), nullable=False)
    name = Column(String(200), default="")
    phone = Column(String(50), default="")
    email = Column(String(200), default="")
    source = Column(String(50), default="facebook")  # facebook, whatsapp, instagram, website
    stage = Column(String(30), default="lead")  # lead, prospect, trial, active, churned
    notes = Column(Text, default="")
    total_interactions = Column(Integer, default=0)
    last_intent = Column(String(50), default="")
    interested_in = Column(String(200), default="")  # product/category interested
    custom_fields = Column(JSON, default=dict)
    first_seen_at = Column(DateTime, default=utcnow)
    last_contacted_at = Column(DateTime, nullable=True)
    converted_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class PaymentRequest(Base):
    """Subscription/topup payment with Telegram admin approval."""
    __tablename__ = "payment_requests"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    username = Column(String(100), default="")
    amount = Column(Numeric(10, 3), nullable=False, default=0)
    provider = Column(String(20), default="liyana")  # liyana, madar
    phone = Column(String(50), default="")
    reference = Column(String(100), default="")
    status = Column(String(20), default="pending")  # pending, confirmed, cancelled
    note = Column(String(500), default="")
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


# ── Auth Infrastructure ─────────────────────────────────────────────
class AuditLog(Base):
    """Immutable audit trail for auth and sensitive operations."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0, index=True)
    action = Column(String(50), nullable=False)
    actor_id = Column(Integer, nullable=True)
    target_type = Column(String(50), default="")
    target_id = Column(Integer, nullable=True)
    data = Column(JSON, default=dict)  # ponytail: named "data" not "metadata" — "metadata" is a SQLAlchemy reserved attr
    ip = Column(String(50), default="")
    created_at = Column(DateTime, default=utcnow)


class BlacklistedToken(Base):
    """JWT tokens revoked before expiry (password reset, logout all)."""
    __tablename__ = "blacklisted_tokens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    jti = Column(String(100), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=utcnow)


class RateLimitEntry(Base):
    """DB-backed rate limit counter — works across Vercel serverless instances."""
    __tablename__ = "rate_limit_entries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), nullable=False, index=True)
    window_end = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=utcnow)


class ReportSchedule(Base):
    """Scheduled report delivery configuration."""
    __tablename__ = "report_schedules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    tenant_id = Column(Integer, nullable=False, default=0)
    report_type = Column(String(50), nullable=False, default="monthly")
    email = Column(String(200), default="")
    enabled = Column(Boolean, default=True)
    schedule = Column(String(50), default="monthly")  # daily, weekly, monthly
    last_sent = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)
