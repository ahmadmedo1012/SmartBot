# SmartBot Engine Architecture

## Pipeline Flow
```
Event (FB Webhook / Poll) 
  → EventBus (batch, dedup) 
    → BotEngine.cycle() 
      → RuleCache.get_rules() 
      → EnhancedIntentClassifier.classify() 
      → RuleMatcher.match() 
      → ResponseScorer.score() 
      → TemplateRenderer.render() 
      → FBClient.reply_to_comment() 
      → ContextEngine.record() 
      → OfferEngine.get_best_offer() (for sales intents)
      → StructuredLogger.log_all()
```

## Module Map
| File | Purpose |
|------|---------|
| bot.py | Core engine (other agent's domain) |
| fb_client.py | Facebook Graph API client (other agent's domain) |
| runner.py | FastAPI server + all routes |
| monitor.py | Structured JSON logging engine |
| cache_layer.py | TTL caching (rules, dedup) |
| enhanced_intent.py | Fuzzy + multi-aspect intent classifier |
| context_engine.py | User conversation context tracker |
| offer_engine.py | Smart offer selection engine |
| diagnostics.py | Health monitoring + cycle stats |
| migration.py | DB schema migration |

## Architecture Decisions
- **ponytail**: single-process in-memory caches. Multi-worker Redis when horizontal scaling.
- **ponytail**: basic TTL eviction. LRU/second-level when >10K users.
- **ponytail**: set-based intent matching. ML classifier when rules >100 or accuracy <90%.
