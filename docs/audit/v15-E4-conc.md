# تقرير E4 — التزامن وSSRF وعائلة 409 (جولة v15)

**الحالة:** مكتمل — وثّقه المنسّق من تحقق التكامل (رسالة الوكيل انتهت بمهلة بعد إنجاز العمل).

## ما نُفّذ (مُثبت بالاختبارات والفحص)

| المهمة | الإسناد | الاختبار |
|---|---|---|
| D12-H1: نشر مجدول مزدوج → claim ذرّي `UPDATE ... SET status='publishing' WHERE status='scheduled' RETURNING` + استعادة claims قديمة عبر طوابع زمنية في bot_state | `fb_dashboard/routers/bot.py` (نبضان heartbeat §1) | test_v15_concurrency.py |
| D12-H5: upsert المشترك/المحادثة — SAVEPOINT flush + retry عند IntegrityError + stored بعد الالتزام | `fb_dashboard/messenger_service.py` (_get_or_create_conversation) | test_v15_concurrency.py |
| D13-F1: عائلة 409 العربية — الربط المزدوج للصفحة + عملاء CRM المكررون + وسوم inbox | `fb_dashboard/routers/facebook_routes.py` · `routers/crm_routes.py` · `routers/inbox.py` | test_v15_concurrency.py |
| D6-H2: حارس SSRF بحل DNS — `_resolve_host_ips` + رفض RFC1918/link-local(169.254.169.254)/loopback/IPv6 ULA + مهلة 10s + سقف 5MB | `fb_dashboard/ai_service.py` | test_v15_concurrency.py |
| D2-H2: فعل webhook في flow_engine بنفس الحارس | `fb_dashboard/flow_engine.py` | test_v15_concurrency.py |
| D2-H4: agent_engine بعميل per-tenant + تعطيل آمن عربي | `fb_dashboard/agent_engine.py` | test_v15_concurrency.py |
| D12-M2/D6-M3: إزالة _cron_lock الميت + Bearer أولاً في مسارات cron | `fb_dashboard/routers/bot.py` | — |

## البوابات (تحقق المنسّق)
- `pytest tests/test_v15_concurrency.py tests/test_v8_security.py -q` → **49 passed**
- `ruff check` على الملفات التسعة → **All checks passed**

## الأثر
- **D13-F1 مُغلق نهائياً** — البطارية تقلب `SIM_STRICT_409=1` (نفذها E8)
- ازدواج النشر على صفحات العملاء صار مستحيلاً بنيوياً (نبضان Vercel + cron-job.org)
- قناة SSRF الثانية (flow-webhook) مغلقة والحارس الأول صار يفحص DNS
