from __future__ import annotations

"""SmartBot — auto-reply engine (v2) — thin facade (v11-A2 decomposition).

The implementation moved to the ``bot_engine`` package (text / matching /
cooldown / deps / pipeline / engine — flat-imported, same convention as
``routers``). This module re-exports the public names so every legacy import
(``from bot import BotEngine, TextNormalizer, ws_manager, ...``) keeps
working unchanged.

One legacy seam is preserved on purpose: the engine classes used to live IN
this module, so tests monkeypatch ``bot.AsyncSessionLocal`` to steer the
engine at an isolated test DB (see tests/test_phase_b_payments.py). Attribute
writes therefore propagate into ``bot_engine.engine`` — the real home of that
global since the split.
"""
import sys
import types

from bot_engine import (
    BotEngine,
    CommentContext,
    CooldownManager,
    IntentAwareMatcher,
    IntentClassifier,
    MatchResult,
    ReplyPipeline,
    RuleMatcher,
    TemplateRenderer,
    TextNormalizer,
    ws_manager,
)
from database import AsyncSessionLocal

__all__ = [
    "AsyncSessionLocal",
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


class _BotFacadeModule(types.ModuleType):
    """Legacy patch seam: ``bot.AsyncSessionLocal = <factory>`` propagates to
    ``bot_engine.engine`` (where the moved code now resolves that global)."""

    def __setattr__(self, name: str, value) -> None:
        super().__setattr__(name, value)
        if name == "AsyncSessionLocal":
            import bot_engine.engine as _engine_mod
            _engine_mod.AsyncSessionLocal = value


sys.modules[__name__].__class__ = _BotFacadeModule
