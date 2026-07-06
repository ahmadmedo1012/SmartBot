import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, JSON
from sqlalchemy.orm import DeclarativeBase


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
