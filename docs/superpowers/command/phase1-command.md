# SmartBot Army Command Structure — Phase 1

**Commander-in-Chief:** Claude Opus 4.8 (this session)
**Date:** 2026-07-07
**Goal:** Build ManyChat-class Visual Flow Builder + Sequences + Broadcast onto existing SmartBot

## Launch Sequence

### Wave 1 — Foundation (parallel, zero dependencies)
| Agent | Input | Output | Tokens |
|-------|-------|--------|--------|
| **1. Models Architect** | Existing models.py | Extended models.py (+10 models) | Read+Write |
| **2. FBClient Extender** | Existing fb_client.py | Extended fb_client.py (+8 methods) | Read+Write |
| **3. App Integrator** | App.jsx + topbar.jsx + api.js | Extended all 3 files | Read+Edit |

### Wave 2 — Engines (parallel, depend on Wave 1)
| Agent | Input | Output | Tokens |
|-------|-------|--------|--------|
| **4. Flow Engine Core** | bot.py + fb_client.py | flow_engine.py (500+ lines) | Read+Write |
| **5. Subscriber Engine** | models.py | subscriber_engine.py (250+ lines) | Read+Write |
| **6. Sequence Engine** | fb_client.py | sequence_engine.py (300+ lines) | Read+Write |
| **7. Broadcast Engine** | fb_client.py | broadcast_engine.py (300+ lines) | Read+Write |
| **8. Flow Builder UI** | api.js patterns | flows.jsx (600+ lines) | Write |

### Wave 3 — API + remaining UI (depend on Wave 2)
| Agent | Input | Output |
|-------|-------|--------|
| **9. API Integrator** | runner.py + all engines | Extended runner.py (+32 endpoints) |
| **10. Sequences UI** | api.js patterns | sequences.jsx (400+ lines) |
| **11. Broadcast UI** | api.js patterns | broadcast.jsx (400+ lines) |
| **12. Subscribers UI** | api.js patterns | subscribers.jsx (450+ lines) |

### Wave 4 — Review & Integration
| Agent | Input | Output |
|-------|-------|--------|
| **13. Python Reviewer** | All new .py files | Review report + fixes |
| **14. Frontend Reviewer** | All new .jsx files | Review report + fixes |
| **15. Integration Tester** | bot.py + engines + runner.py + API | E2E test report |

## Agent Launch Rules
1. هر Agent يقرأ ملفات الإدخال أولاً قبل الكتابة
2. كل Agent يكتب COMPLETE working code — لا stubs ولا placeholders
3. كل Agent يستخدم Opus 4.8 (النموذج الافتراضي الحالي)
4. Wave 2 تبدأ فور انتهاء Wave 1 (ما نحتاجش انتظار بشري)
