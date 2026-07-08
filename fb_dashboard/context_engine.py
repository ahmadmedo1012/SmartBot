"""
Conversation context engine for SmartBot.
Tracks user interaction history across comments within sessions.
"""
import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class UserContext:
    """Conversation state for a single user."""
    user_id: str
    name: str = ""
    comment_count: int = 0
    reply_count: int = 0
    last_intent: str = ""
    last_rule_id: int | None = None
    previous_comments: list[str] = field(default_factory=list)
    previous_replies: list[str] = field(default_factory=list)
    first_seen: float = field(default_factory=time.time)
    last_seen: float = field(default_factory=time.time)
    tags: set[str] = field(default_factory=set)
    # Flow state
    in_conversation: bool = False
    conversation_step: int = 0
    flow_data: dict = field(default_factory=dict)

    def is_new(self) -> bool:
        return self.comment_count <= 1

    def is_returning(self) -> bool:
        return 2 <= self.comment_count <= 5

    def is_frequent(self) -> bool:
        return self.comment_count > 5

    def add_comment(self, text: str, intent: str = "", rule_id: int | None = None):
        self.comment_count += 1
        self.last_seen = time.time()
        self.last_intent = intent
        self.last_rule_id = rule_id
        self.previous_comments.append(text[:200])
        # Keep window manageable
        if len(self.previous_comments) > 20:
            self.previous_comments.pop(0)

    def add_reply(self, text: str):
        self.reply_count += 1
        self.previous_replies.append(text[:200])
        if len(self.previous_replies) > 10:
            self.previous_replies.pop(0)


class ContextEngine:
    """In-memory conversation context with TTL eviction."""

    def __init__(self, ttl_seconds: int = 3600):
        self._users: dict[str, UserContext] = {}
        self._ttl = ttl_seconds

    def get(self, user_id: str) -> UserContext:
        now = time.time()
        # Evict stale entries periodically
        if len(self._users) > 1000:
            self._evict(now)
        if user_id not in self._users:
            self._users[user_id] = UserContext(user_id=user_id)
        return self._users[user_id]

    def _evict(self, now: float):
        stale = [uid for uid, ctx in self._users.items()
                 if (now - ctx.last_seen) > self._ttl]
        for uid in stale:
            del self._users[uid]

    def tag_user(self, user_id: str, tag: str):
        ctx = self.get(user_id)
        ctx.tags.add(tag)

    def get_user_tags(self, user_id: str) -> set[str]:
        return self.get(user_id).tags

    @property
    def active_users(self) -> int:
        return len(self._users)

    def clear(self):
        self._users.clear()
