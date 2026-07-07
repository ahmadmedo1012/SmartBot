import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    pass


class Rule(Base):
    __tablename__ = "rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    keywords = Column(JSON, nullable=False)  # list[str]
    reply_template = Column(Text, nullable=False)
    dm_template = Column(Text, default="")
    enabled = Column(Boolean, default=True)
    description = Column(String(255), default="")
    priority = Column(Integer, default=999)
    bot_type = Column(String(20), default="reply")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class Reply(Base):
    __tablename__ = "replies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fb_comment_id = Column(String(100), nullable=False, unique=True)
    fb_post_id = Column(String(100), nullable=False)
    commenter_name = Column(String(200), default="")
    comment_text = Column(Text, default="")
    reply_text = Column(Text, default="")
    rule_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class BotLog(Base):
    __tablename__ = "bot_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    level = Column(String(20), default="INFO")
    message = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class BotState(Base):
    __tablename__ = "bot_state"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), nullable=False, unique=True)
    value = Column(Text, default="")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="viewer")  # admin, editor, viewer
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


# ── Professional Features ────────────────────────────────────────────────────

class ReplyTemplate(Base):
    """Saved reply templates for quick-access."""
    __tablename__ = "reply_templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    text = Column(Text, nullable=False)
    category = Column(String(50), default="general")  # general, greeting, complaint, pricing
    shortcut = Column(String(20), default="")  # keyboard shortcut like /price
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class AISuggestion(Base):
    """Log of AI-powered suggestion events."""
    __tablename__ = "ai_suggestions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    comment_id = Column(String(100), default="")
    comment_text = Column(Text, default="")
    suggestions = Column(JSON, default=list)  # list of generated suggestions
    chosen = Column(String(500), default="")  # which one was used (if any)
    intent = Column(String(50), default="")
    sentiment = Column(String(50), default="")
    confidence = Column(Integer, default=0)  # 0-100
    latency_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ConversationTag(Base):
    """Tags for categorizing conversations."""
    __tablename__ = "conversation_tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), unique=True, nullable=False)
    color = Column(String(7), default="#6366f1")  # hex color
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ConversationLabel(Base):
    """M:N link between FB conversations and tags."""
    __tablename__ = "conversation_labels"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(String(100), nullable=False, index=True)
    tag_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ScheduledPost(Base):
    """Scheduled Facebook posts."""
    __tablename__ = "scheduled_posts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    message = Column(Text, nullable=False)
    image_url = Column(String(500), default="")
    scheduled_at = Column(DateTime, nullable=True)
    status = Column(String(20), default="draft")  # draft, scheduled, published, failed
    fb_post_id = Column(String(100), default="")
    created_by = Column(String(100), default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    published_at = Column(DateTime, nullable=True)


class AnalyticsEvent(Base):
    """Track granular analytics events."""
    __tablename__ = "analytics_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    event_type = Column(String(50), nullable=False, index=True)  # reply_sent, comment_received, dm_sent, webhook_received
    metadata_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class BotAlert(Base):
    """Bot health alerts — low reply rate, errors, token issues."""
    __tablename__ = "bot_alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    alert_type = Column(String(50), nullable=False)  # low_volume, error_rate, token_expiring, no_comments
    severity = Column(String(20), default="info")  # info, warning, critical
    message = Column(Text, default="")
    resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)


# ── Subscriber Management ──────────────────────────────────────────────────────


class Subscriber(Base):
    """Social platform subscriber/follower."""
    __tablename__ = "subscribers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    fb_user_id = Column(String(100), unique=True, nullable=False)
    name = Column(String(200), default="")
    first_name = Column(String(100), default="")
    username = Column(String(100), default="")
    locale = Column(String(20), default="")
    gender = Column(String(10), default="")
    platform = Column(String(20), default="messenger")  # messenger/instagram/whatsapp
    page_id = Column(String(100), default="")
    status = Column(String(20), default="active")  # active/inactive/blocked
    first_seen_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_interaction_at = Column(DateTime, nullable=True)
    last_comment_text = Column(Text, default="")
    reply_count = Column(Integer, default=0)
    custom_data = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    tags = relationship("Tag", secondary="subscriber_tags", lazy="selectin", back_populates=None)


class Tag(Base):
    """Label/category for subscriber segmentation."""
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), unique=True, nullable=False)
    color = Column(String(7), default="#6366f1")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    subscribers = relationship("Subscriber", secondary="subscriber_tags", lazy="selectin", back_populates=None)


class SubscriberTag(Base):
    """M:N join between subscribers and tags."""
    __tablename__ = "subscriber_tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    subscriber_id = Column(Integer, ForeignKey("subscribers.id", ondelete="CASCADE"), nullable=False, index=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    __table_args__ = (UniqueConstraint("subscriber_id", "tag_id", name="uq_subscriber_tag"),)


# ── Flows (Visual Automation) ──────────────────────────────────────────────────


class Flow(Base):
    """Visual bot flow — nodes and edges."""
    __tablename__ = "flows"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    nodes = Column(JSON, default=list)
    edges = Column(JSON, default=list)
    status = Column(String(20), default="draft")  # draft/active/paused/archived
    version = Column(Integer, default=1)
    created_by = Column(String(100), default="")
    total_replies = Column(Integer, default=0)
    last_triggered_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class FlowExecution(Base):
    """Runtime record of a flow running for a subscriber."""
    __tablename__ = "flow_executions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    flow_id = Column(Integer, ForeignKey("flows.id"), nullable=False, index=True)
    subscriber_id = Column(Integer, ForeignKey("subscribers.id"), nullable=True, index=True)
    trigger_type = Column(String(50), default="")
    trigger_data = Column(JSON, default={})
    current_node_id = Column(String(100), default="")
    status = Column(String(20), default="active")  # active/completed/failed/expired
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    error_log = Column(JSON, default={})


# ── Sequences (Drip Campaigns) ─────────────────────────────────────────────────


class Sequence(Base):
    """Drip campaign — timed message series."""
    __tablename__ = "sequences"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    status = Column(String(20), default="draft")  # draft/active/paused/archived
    created_by = Column(String(100), default="")
    total_subscribers = Column(Integer, default=0)
    total_sent = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class SequenceStep(Base):
    """Individual step within a sequence."""
    __tablename__ = "sequence_steps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    sequence_id = Column(Integer, ForeignKey("sequences.id", ondelete="CASCADE"), nullable=False, index=True)
    step_order = Column(Integer, default=0)
    delay_days = Column(Integer, default=0)
    delay_hours = Column(Integer, default=0)
    message_template = Column(Text, default="")
    message_type = Column(String(20), default="text")  # text/image/carrier
    action_on_complete = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class SequenceSubscription(Base):
    """A subscriber's enrollment in a sequence."""
    __tablename__ = "sequence_subscriptions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    subscriber_id = Column(Integer, ForeignKey("subscribers.id", ondelete="CASCADE"), nullable=False)
    sequence_id = Column(Integer, ForeignKey("sequences.id", ondelete="CASCADE"), nullable=False)
    current_step = Column(Integer, default=0)
    status = Column(String(20), default="active")  # active/completed/unsubscribed
    entered_at = Column(DateTime, default=datetime.datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("subscriber_id", "sequence_id", name="uq_seq_sub"),)


# ── Broadcasts (One-to-Many) ───────────────────────────────────────────────────


class Broadcast(Base):
    """One-time broadcast message to a subscriber segment."""
    __tablename__ = "broadcasts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    message_template = Column(Text, default="")
    platform_filter = Column(JSON, default={})
    segment_filters = Column(JSON, default={})
    status = Column(String(20), default="draft")  # draft/sending/sent/cancelled/partial
    total_recipients = Column(Integer, default=0)
    sent_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    opened_count = Column(Integer, default=0)
    created_by = Column(String(100), default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)


class BroadcastRecipient(Base):
    """Per-subscriber delivery record for a broadcast."""
    __tablename__ = "broadcast_recipients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    broadcast_id = Column(Integer, ForeignKey("broadcasts.id", ondelete="CASCADE"), nullable=False, index=True)
    subscriber_id = Column(Integer, ForeignKey("subscribers.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String(20), default="pending")  # pending/sent/failed/opened
    error_message = Column(Text, default="")
    sent_at = Column(DateTime, nullable=True)


class ConversationNote(Base):
    """Internal notes attached to a conversation (any platform)."""
    __tablename__ = "conversation_notes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(String(100), nullable=False, index=True)
    content = Column(Text, default="")
    created_by = Column(String(100), default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
