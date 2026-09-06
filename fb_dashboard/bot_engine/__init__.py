from __future__ import annotations

"""SmartBot auto-reply engine package (v11-A2 decomposition of ``bot.py``).

Flat-imported as ``bot_engine`` from the fb_dashboard root — the same
convention as the ``routers`` package. ``bot.py``
stays the public facade so every legacy import keeps working.

Modules:
  text      — TextNormalizer, TemplateRenderer
  matching  — CommentContext, MatchResult, IntentAwareMatcher (+ compat aliases)
  cooldown  — CooldownManager
  deps      — lazy singletons / per-tenant registries (ws_manager, _get_*)
  pipeline  — ReplyPipeline (structured stages with error boundaries)
  engine    — BotEngine (per-tenant cycle + webhook processing)
"""

from bot_engine.cooldown import CooldownManager
from bot_engine.deps import ws_manager
from bot_engine.engine import BotEngine
from bot_engine.matching import (
    CommentContext,
    IntentAwareMatcher,
    IntentClassifier,
    MatchResult,
    RuleMatcher,
)
from bot_engine.pipeline import ReplyPipeline
from bot_engine.text import TemplateRenderer, TextNormalizer

__all__ = [
    "BotEngine",
    "CommentContext",
    "CooldownManager",
    "IntentAwareMatcher",
    "IntentClassifier",
    "MatchResult",
    "ReplyPipeline",
    "RuleMatcher",
    "TemplateRenderer",
    "TextNormalizer",
    "ws_manager",
]
