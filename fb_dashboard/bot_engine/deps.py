from __future__ import annotations

"""Shared lazy-singleton + per-tenant registry layer for the bot engine package.

Extracted verbatim from the old monolithic ``bot.py`` (v11-A2 decomposition).
``bot_engine.pipeline`` and ``bot_engine.engine`` import these accessors from
here instead of owning private copies, so the singletons/registries stay
process-global. The lazy/local-import patterns are kept as-is to avoid import
cycles with engines/services (context_engine, offer_engine, diagnostics,
monitor, enhanced_intent, cache_layer, ws_manager).
"""

# ── Per-tenant engine registries (instead of module-level singletons) ──
try:
    from ws_manager import ws_manager
except ImportError:
    ws_manager = None  # ponytail: WS disabled when module absent (e.g. some tests)
_enhanced_intent = None
_cache_layer = None
_monitor = None

# ponytail: per-tenant state dicts. Replace with Redis-backed registry when multi-worker.
_tenant_context_engines: dict[int, object] = {}
_tenant_offer_engines: dict[int, object] = {}
_tenant_diag_engines: dict[int, object] = {}
_lock = __import__('threading').RLock()

def _get_ei():
    global _enhanced_intent
    if _enhanced_intent is None:
        from enhanced_intent import EnhancedIntentClassifier
        _enhanced_intent = EnhancedIntentClassifier
    return _enhanced_intent

def _get_cache():
    global _cache_layer
    if _cache_layer is None:
        import cache_layer as _cache_layer
    return _cache_layer

def _get_ctx(tenant_id: int = 0):
    global _tenant_context_engines
    with _lock:
        if tenant_id not in _tenant_context_engines:
            from context_engine import ContextEngine
            _tenant_context_engines[tenant_id] = ContextEngine(ttl_seconds=3600)
        return _tenant_context_engines[tenant_id]

def _get_offer(tenant_id: int = 0):
    global _tenant_offer_engines
    with _lock:
        if tenant_id not in _tenant_offer_engines:
            from offer_engine import OfferEngine
            _tenant_offer_engines[tenant_id] = OfferEngine()
        return _tenant_offer_engines[tenant_id]

def _get_diag(tenant_id: int = 0):
    global _tenant_diag_engines
    with _lock:
        if tenant_id not in _tenant_diag_engines:
            from diagnostics import DiagnosticsEngine
            _tenant_diag_engines[tenant_id] = DiagnosticsEngine()
        return _tenant_diag_engines[tenant_id]

def _get_monitor():
    global _monitor
    if _monitor is None:
        from monitor import get_logger
        _monitor = get_logger()
    return _monitor
