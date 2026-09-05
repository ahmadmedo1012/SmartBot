# تقرير تسليم خطة latest_plan.md — 2026-09-05

> **الخطة الحاكمة:** `latest_plan.md` (فحص 2026-09-03) — 8 مسارات، ~36 وكيلًا، بوابات تحقق إلزامية.
> **هذا التقرير:** كل بند × حالته × الدليل الحرفي (ناتج تيرمينال/اختبار/عدد ملفات) — لا وصفًا نثريًا بلا إثبات.
> **قاعدة الخطة §5.3:** «ممنوع الإبلاغ عن اكتمال دون دليل تيرمينال» — مُطبَّقة أدناه حرفيًا.

---

## ملخص تنفيذي

| المسار | الحالة | الالتزام | بوابة التحقق |
|--------|--------|----------|---------------|
| A — توحيد عقد الـ API | ✅ كامل | `d4fd6d65` | pytest 22 response_shape + grep صفر + tsc 0 + build 38/38 |
| B — رحلة العميل | ✅ كامل | `f9c9a7dd` | Playwright 1 passed (رحلة 6 خطوات) + SSE 2 passed |
| C — تنظيف التكرار | ✅ كامل | `6fa0188b` | jscpd: 4.02% → **1.07%** (حد 3%) |
| D — نظام التصميم | ✅ كامل | `c74cdbb3` | grep = 3 استثناءات موثقة فقط + تقرير التوثيق |
| E — اكمال الوظائف | ✅ كامل | `40cf23f3` + `cf16f61d` | 22/22 صفحة × curl مغلف 200 |
| F — تنقل الجوال | ✅ كامل | `3724fa1d` | Playwright 375px ✓ (شريط + لوحة 23 قسمًا) |
| G — أدوات مفتوحة المصدر | ✅ كامل (معزول) | `58bfe9d3` | 8/8 اختبارات مقارنة + عزل صفري |
| H — التحقق النهائي | ✅ هذا التقرير | — | **25/25 E2E + 215 pytest + build ✓** |

**الأرقام النهائية:** `pytest`: **215 passed + 6 skipped** · `npm run build`: **38/38 مسارًا** · `tsc --noEmit`: **0 أخطاء** · Playwright: **25/25** (رحلة كاملة + جوال 375px + 23 فحص صفحة).

---

## Track A — توحيد عقد الـ API (P0)

| البند | الحالة | الدليل |
|-------|--------|--------|
| A.1 مساعد مركزي | ✅ | `fb_dashboard/_responses.py` (ok/fail) — ملف جديد |
| A.2 تغليف 15 راوترًا | ✅ | محوّل AST جراحي (`scripts/wrap_routers.py`) — 154 استجابة لُفّت عبر 25 راوترًا |
| A.3 تغليف الـ14 الباقية | ✅ (مدمجة مع A.2 + إكمال الراوترات الجزئية: dashboard_stats/ai/admin_routes — 16 endpoint خامًا إضافيًا اكتشفتهم بوابة E) | `git show d4fd6d65 --stat`: 25 ملف راوتر معدلة |
| A.4 unwrapApi لكل الاستدعاءات | ✅ | `src/lib/api.ts` + 35 ملفًا هُجرت آليًا + 12 إصلاحًا يدويًا؛ `grep "then(r => r.json())"` = **صفر** |
| البوابة: grep صفر | ✅ | `grep -L '"success"' fb_dashboard/routers/*.py` → **فارغ** |
| البوابة: اختبارات الشكل | ✅ | `pytest -k response_shape` → **22 passed** (26 endpoint موسومًا) |
| البوابة: تشغيل فعلي | ✅ | smoke حي بمصادقة: `/api/analytics/overview` 200 ENVELOPE … (سكربت smoke_envelope.py) |

**إصلاحات إنتاجية اكتشفها التوحيد (كانت مكسورة قبل الخطة):**
1. دور الأدمن من `/api/me` (`admin/page.tsx` قرأت `data.role` من مستوى خاطئ) — **سبب «حقول الاشتراكات الفارغة» (B.4)**
2. `AuthGuard` كان سيرفض كل جلسة بعد الهجرة (authenticated)
3. config الدفع في subscribe (أرقام المحافظ كانت تُفقد)
4. معلومات الدعم، خطط onboarding، إحصاءات الهبوط، testimonials

## Track B — رحلة العميل (P0)

| البند | الحالة | الدليل |
|-------|--------|--------|
| B.1 E2E حقيقي (Playwright) | ✅ | `e2e/journey.spec.ts` — تسجيل→تسعير→اشتراك→دفع→موافقة أدمن→تفعيل→داشبورد: **1 passed (1.0m)** + 12 لقطة |
| B.2 إصلاح الانكسارات | ✅ | إصلاحات A أعلاه + تعبئة حقل تأكيد كلمة المرور (خطأ اختبار لا كود) |
| B.3 rate-limit payments [VERIFY] | ✅ منجز سابقًا | topup/confirm/upload عبر `_payment_rate_limit` + create-subscription داخلي 5/دقيقة (payments.py:216-226) |
| B.4 صفوف اشتراكات الأدمن [VERIFY] | ✅ | السبب دور /api/me — أُصلح؛ E2E يثبت: admin login + approve 200 |
| B.5 SSE فوري | ✅ جديد | `GET /api/subscriptions/status-stream` (text/event-stream، دفقة ≤2s، سقف 10min، عزل مستأجرين) + EventSource أساسي في الواجهة مع polling احتياطي + `test_track_b_sse.py`: **2 passed** |
| البوابة | ✅ | تسجيل Playwright كامل PASS + لقطات لكل خطوة في `e2e_artifacts/` |

## Track C — تنظيف التكرار (شامل)

| البند | الحالة | الدليل |
|-------|--------|--------|
| C.1 مسح TS/TSX | ✅ | jscpd (min-tokens 70): 30 نسخ → بعد التنظيف **11 نسخة / 1.07%** |
| C.2 مسح .py + .bak | ✅ | difflib: **صفر** أزواج >75% تشابهًا؛ `find *.bak/old/orig` = **صفر**؛ payments.py.bak كان محذوفًا سابقًا |
| C.3 تحديد الحي/الميت | ✅ | DashboardPage.tsx: صفر استيرادات (grep) → حُذف؛ public.css: صفر استيرادات → حُذف |
| C.4 حذف الميت + gitignore | ✅ | `*.bak/*.old/*.orig` في .gitignore؛ 5 سكربتات e2e خربشة حُذفت (مسارات /home/ahmed مكسورة أو تستهدف الإنتاج) |
| البوابة: نسبة <3% | ✅ | jscpd بعد التنظيف: **1.07%** + tsc 0 |

## Track D — نظام التصميم

| البند | الحالة | الدليل |
|-------|--------|--------|
| D.1 الاستثناءان | ✅ | 13 لون كونفيتي + 4 ألوان جهاز → `--confetti-*`/`--iphone-*` في globals.css؛ Confetti.tsx/iphone-mockup.tsx تقرأ `var()` فقط (grep: **صفر hex**) |
| D.2 مسح bg-white | ✅ | 3 نتائج فقط = استثناءات موثقة (مقبض switch ×2 + scrim الجوال) |
| D.3 توحيد الأيقونات | ✅ | 56 ملف lucide-react، **صفر** مكتبات أخرى |
| D.4 dir="auto" | ✅ | 14 حقل إدخال (register 4، subscribe 6، login 1، support 2، marketing 1) |
| D.5 التوثيق | ✅ | `docs/design-system.md` كامل (توكنز، أدوار الألوان، سقف خطّين، قائمة رفض) |
| البوابة | ✅ | grep يعيد الاستثناءات الثلاثة الموثقة فقط |

## Track E — اكتمال الوظائف الحقيقي

| البند | الحالة | الدليل |
|-------|--------|--------|
| E.1 الإشعارات [VERIFY] | ✅ منجز سابقًا (مرحلة D) + إثبات | GET/PUT `/api/notifications/settings` عبر react-query — جملة «تُحفظ تلقائيًا» صادقة الآن |
| E.2 الدعم [VERIFY] | ✅ منجز سابقًا | نظام تذاكر حقيقي كامل (8 endpoints) + معلومات تواصل من DB (لا بيانات مخترعة — المالك يضبطها من لوحة الأدمن) |
| E.3 التسع صفحات [VERIFY] | ✅ | خريطة grep لكل صفحة×endpoints ثم `test_track_e_pages_gate.py`: **22/22 passed** (مستخدم مسجل + صفحة مربوطة + 200+غلاف لكل endpoint) |
| E.4 إزالة «قيد التطوير» | ✅ | حالة مصممة بنظام التصميم (حلقة accent + شريحة مسار mono + CTA) في `[...slug]/page.tsx` |
| E.5 تفعيل recharts | ✅ | `components/charts/` جديد (ActivityBarChart/ComparisonBars بألوان التوكنز) — استبدال كل رسم div اليدوي في dashboard/analytics/demo + `react-is` مثبتة |
| E.6 اشتراكات الأدمن | ✅ | مغطى بـ B.4 + بوابة E (billing 200) |
| البوابة curl | ✅ | 22/22 endpoint حي ببيانات حقيقية (اختبار مصادَق يعادل curl) |

## Track F — تجربة الجوال

| البند | الحالة | الدليل |
|-------|--------|--------|
| F.1 مكوّن التنقل | ✅ | `MobileBottomNav.tsx`: شريط سفلي (4 أقسام + المزيد) + لوحة spring بكل الـ23 قسمًا — نفس `defaultNavSections` المصدَّرة (لا تكرار) |
| F.2 الربط في Shell | ✅ | `md:hidden` + `pb-16 md:pb-0` للمحتوى + أداة `safe-area-pb` |
| F.3 اختبار 375px | ✅ | `e2e/mobile-nav.spec.ts`: شريط مرئي + sidebar مخفي + 4 أقسام بضغطة + تقويم بضغطتين + ≥22 زرًا في اللوحة: **1 passed (16.6s)** + 8 لقطات 375px |
| البوابة | ✅ | لقطات 375px تُظهر التنقل بين 5 أقسام |

## Track G — الأدوات مفتوحة المصدر (معزول)

| البند | الحالة | الدليل |
|-------|--------|--------|
| G.1 mcp في بيئة معزولة | ✅ | `mcp>=1.2.0` في requirements (موثَّق standalone-only) + استيراد كسول |
| G.2 تكييف ~34 أداة | ✅ | `facebook_engine/` (client+tools+mcp_server): عقد fb-mcp بنفس الأسماء + فجوات SmartBot (محادثات/إعلانات) + تعدد مستأجرين بالبناء + pagination كامل + retry/backoff + أخطاء مطبَّعة |
| G.3 اختبار مقارن | ✅ | `test_track_g_engine.py` — **8/8**: 4 صفوف تكافؤ مع fb_client القديم (نفس النتائج) + 4 صفوف قدرات (37 عنصرًا حيث يتوقف القديم عند 25، retry على 503×2، عزل مستأجرين) |
| G.4 scroll-craft | ✅ موثَّق | مهارة Claude-Code غير متاحة في بيئة التنفيذ هذه — بديلًا: تدقيق قائمة الرفض على الهبوط/التسعير (صفر عدادات 01/06، صفر تدرجات بنفسجية) + القائمة مطبقة في design-system.md؛ **ممنوع داخل dashboard** (مُطاع) |
| البوابة | ✅ | مقارنة staging-equivalent بلا أي تغيير إنتاجي؛ العزل مفروض باختبار (صفر استيرادات من الكود الحي) |

## Track H — التحقق الشامل

| البند | الحالة | الدليل |
|-------|--------|--------|
| H.1 E2E نظيف من الصفر | ✅ | DB نظيف + بناء جديد + مزامنة static + **25/25 passed (2.5m)**: journey + mobile + 23 فحص صفحة/UI |
| H.2 CLAUDE.md | ✅ | 7 قواعد هندسية جديدة (العقد، unwrapApi، التوكنز، الجوال، الرسوم، عزل المحرك، فخ Playwright `json:`) |
| H.3 هذا التقرير | ✅ | جدول لكل بند بأدلة — أمامك |

**إضافات خارج الخطة بطلب روحها:** إصلاح فساد YAML في ci.yml (`branches: ain]` → `[main]`) + `npm run build` في CI (يمنع انكسار البناء الصامت مستقبلًا).

---

## بنود الخطة التي لم تُنفَّذ حرفيًا (شفافية كاملة)

| البند | السبب | البديل المنفَّذ |
|-------|-------|------------------|
| G.4 تشغيل scroll-craft حرفيًا | مهارة Claude Code — غير قابلة للتثبيت في بيئة التنفيذ | تدقيق قائمة الرفض + التوثيق (أعلاه) |
| B.1 «تقرير HAR لكل خطوة» | Playwright يسجل trace.zip لكل اختبار (أغنى من HAR) | traces في e2e_artifacts/test-results/ |
| تعليق الخطة على 29 راوترًا خامًا | الفحص الفعلي وجد 25 (بعضها لُفّ في إعادة البناء السابقة) | 25 لُفّت + 16 endpoint من الراوترات «الجزئية» اكتُشفت وأُغلقت بوابة E |

## كيف تُعاد البوابات بنفسك (كل دليل قابل للاستنساخ)

```bash
# 1. الاختبارات الخلفية
env -u DATABASE_URL .venv/bin/python -m pytest -q          # → 215 passed + 6 skipped
env -u DATABASE_URL .venv/bin/python -m pytest fb_dashboard/ -k "response_shape" -q   # → 22
# 2. الواجهة
cd fb_dashboard/frontend && npx tsc --noEmit               # → 0
npm run build                                              # → ✓ 38/38
# 3. عقد الـ API
grep -L '"success"' fb_dashboard/routers/*.py | grep -v .bak   # → فارغ
# 4. التكرار
npx jscpd --min-tokens 70 fb_dashboard/frontend/src        # → 1.07%
# 5. الرحلة الكاملة (خادم نظيف)
python3 scripts/sync_next_static.py
env -u DATABASE_URL DATABASE_URL="sqlite+aiosqlite:///$(pwd)/e2e_test.db" SECRET_KEY=… .venv/bin/python -m uvicorn runner:app --app-dir fb_dashboard --port 8000 &
cd fb_dashboard/frontend && npx playwright test            # → 25/25
```
