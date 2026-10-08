# خطة SmartBot العالمية v12 — الجولة الأعمق والأضخم والأكثر تفصيلا على كل المستويات

**التاريخ:** 2026-09-07 · **الأساس:** main @ 273565e7 (v11) · **الطلب:** «اعمل جولة اعمق واضخم واكثر تفصيلا وعلى كل المستويات»
**البنية:** 12 وكيل تشخيص متواز (منهجيات gstack: cso/red-team/canary/specialists×8) → 8 وكلاء تنفيذ → بوابات → commit واحد → تحقق إنتاجي حي.

## 0) اكتشافات معمارية حاسمة (D8 — تصحيح فرضية الجولات السابقة)

1. **bot.smart-link.ly = نشر Vercel Next.js مستقل** (server middleware.ts يعمل حيًا: 307→login، CSP خاص). api.smart-link.ly = FastAPI + SPA ثابت.
2. **انحراف بناء بين النطاقين:** bot يقدّم بناء جديدًا؛ api يقدّم بناء قديمًا (منسوخ عبر scripts/sync_next_static.py) → **يجب إعادة المزامنة بعد كل بناء** (سنفعلها في هذه الجولة).
3. **Sentry الواجهة مؤكد منشور في الإنتاج** (DSN + SDK + init بيئة production في الحزم الحية) — تُسوى مسألة v7 المؤجلة. `canary=boot` خلفي فقط (يتحقق من لوحة Sentry).
4. اجتياز المسار path traversal في spa.py **غير قابل للاستغلال عبر Vercel edge** (حجب 400) لكنه كامن في الكود → إصلاح دفاعي.
5. ترويسات الأمان في الإنتاج **مطابقة للكود بايت-بايت**؛ عقد الأخطاء العربي (404/405/401) حي بالكامل.

## 1) المسار E1 — محركات البيانات والأمان (backend engines/models/alembic)

| # | الإصلاح | الملف:السطر |
|---|---|---|
| E1.1 | **BOLA عابر للمستأجرين في وسوم المشتركين**: `add_tag`/`remove_tag` يتجاهلان `tenant_id` — تحقق من ملكية Subscriber وTag قبل insert/delete + فلترة `Tag.tenant_id` في `get_detail` | subscriber_engine.py:229-257, 167-171؛ routers/subscribers_tags_routes.py:40,46 |
| E1.2 | **find-or-create بلا نطاق مستأجر**: `get_or_create` بحث fb_user_id عالمي → فلتر tenant؛ CRM upsert في pipeline بحث عالمي → فلتر؛ `create_tag` فحص اسم عالمي → فلتر | subscriber_engine.py:33-54, 283-297؛ bot_engine/pipeline.py:285-302 |
| E1.3 | **SSRF في نشر الصور**: `post_to_page_with_image` يجلب image_url بلا فحص → استدعاء `_assert_safe_image_url` (موجود في ai_service) | fb_client.py:96-103 |
| E1.4 | **SSRF + حقن CSS في PDF**: logo_url يجلبها WeasyPrint بلا فحص + `primary_color` يدخل CSS بلا تحقق → فحص URL + `re.fullmatch(r"#[0-9a-fA-F]{3,8}")` | pdf_reports_engine.py:75-150,158؛ routers/reports_routes.py:47-51 |
| E1.5 | **اعتمادات X/LinkedIn نص صريح**: تشفير Fernet عند الحفظ وفك عند القراءة (نمط fb_access_token) | publisher_engine.py:165-180 |
| E1.6 | **المحفظة: اقتطاع قروش + فقد تحديثات**: الرصيد TEXT في BotState؛ `int(float(...))` يقتطع LYD (3 منازل)؛ القرض read-modify-write غير ذري → قراءة `Decimal(str(...))` + تحديث SQL ذري `CAST(CAST(value AS NUMERIC(12,3)) + :amt AS TEXT)` | app/telegram.py:140-148؛ routers/payments.py:236 |
| E1.7 | **فهارس المسارات الساخنة (alembic 011 + models)**: `bot_state(key,value)` UNIQUE (كل حدث webhook يمسح تسلسليًا الآن!)؛ ai_suggestions(tenant_id,created_at)؛ payment_requests(tenant_id,created_at)؛ subscription_payments(tenant_id,status,created_at)؛ broadcasts(tenant_id,created_at)؛ bot_alerts(tenant_id,resolved,created_at)؛ subscribers(tenant_id,platform,status) | models.py:87-101,158-172,285-288,726-740؛ ملف جديد alembic/versions/011_*.py |
| E1.8 | حدود引擎: تحويل commerce limit إلى Query مقيّد | commerce_engine.py:119-136 |

## 2) المسار E2 — الراوترات (أمن + عقد + تعريب)

**أمن:**
- E2.1 **حدود مالك المنصة**: bot.py stop/restart/interval/trigger + scheduler-check → `require_platform_admin`؛ تحويل scheduler-check إلى POST؛ agent_engine `_ADMIN_ONLY_TOOLS` يفحص is_platform_admin لا role (routers/bot.py:82-100,195-208؛ agent_engine.py:198-200)
- E2.2 **Shopify عالمي**: products/orders → require_platform_admin + limit مقيّد (commerce_routes.py:58-65)
- E2.3 **نشر عبر عميل المنصة**: publisher_routes.py:74-80 + analytics.py:193-208 → get_tenant_fb_client
- E2.4 **token_ver**: عمود + إصدار/رفض في make_token/get_current_user + زيادة عند change_password/admin_reset_password (auth.py:25-53,301-356 + models.py)
- E2.5 حذف تسريب error من healthz (plans_config.py:164-169)؛ detail لتلغرام 404 (telegram_config.py:163)؛ بادئة cron secret عبر ترويسة Authorization فقط (bot.py:104,120)
- E2.6 **إتمام حذف المستأجر (GDPR)**: إضافة 15+ جدولًا ناقصًا (admin_routes.py:336-341)
- E2.7 حصر حدود: webhook/events + widgets/recent-activity (webhooks.py:34-44؛ widgets_routes.py:18)
- E2.8 حذف مسارات ميتة مؤكدة: `/api/debug` + `/api/debug/fb-reply` (128 سطرًا) + `/api/env` + `/api/stats` القديم + `/api/stats/hourly` + إصلاح hook الإبطال الميت في api_cache.py:51 (القائمة الكاملة → سجل القرارات)

**عقد (خطة D4 حرفيًا):**
- E2.9 تحويلات ميكانيكية ok() ×9: admin_routes.py:138,224,257؛ dashboard_stats.py:236,273,297؛ alerts_routes.py:96,98-103,135
- E2.10 `/api/me` → ok() وإسقاط `authenticated` (auth.py:236-247) + حذف MeEnvelope (types.ts:69-74)
- E2.11 onboarding test-connection ×3 → ok({connected,error}) (onboarding.py:122-148) — سابقة facebook_routes.py:197-225
- E2.12 campaigns → ok({items,total}) + حارس dual-shape في marketing/page.tsx:135 (الزوج الوحيد الكاسر)
- E2.13 `/healthz` إعفاء بنية تحتية موثق دائم (docs فقط — «6 استثناءات» تصبح 5)
- E2.14 **خلل iso_z**: `last_heartbeat` بلا Z يزيح نص «آخر نبض» ساعتين (admin_routes.py:284 → iso_z)
- E2.15 page_size→per_page (auth.py:297,375؛ admin_routes.py:432)

**تعريب (D10):**
- E2.16 **تعريب ~25 رسالة إنجليزية تصدر للواجهة**: broadcasts.py:45-82، sequences.py:43-96، flows.py:55-117، users.py:51-72، subscribers_tags_routes.py:33-71، calendar_routes.py:51-67، facebook_routes.py:262-280، publisher_routes.py:40-60، telegram_config.py:124-152، ai.py:76، bot.py:119-179، plans_config.py:223، admin_routes.py:157، reports_routes.py:65
- E2.17 «الأدمن»→«الإدارة» (payments.py:206-354 ×4 + admin_routes.py:308)؛ توحيد تنوين «اً» (25 موقعًا)؛ تصحيحات: «إنتظارك»→«انتظارك» (ai_service.py:387)، «نأسفون»→«نأسف» (:396)، مسافة قبل «!» (:411)

## 3) المسار E3 — نواة التطبيق والمراقبة (app/ + observability)

- E3.1 **تطبيع المسار في spa_catch_all** (دفاع عمق): رفض `..` والمقاطع الفارغة (spa.py:57-60)
- E3.2 **ربط request_id الميت**: `request.state.request_id = request_id` (middleware.py:147) + إدخاله في traceback الأخطاء (errors.py:31) — يجعل rid في إنذارات تلغرام وSentry يعمل
- E3.3 **CSRF مزدوج**: إصدار كوكي `csrf_token` (SameSite=Strict، غير HttpOnly) على مسارات GET آمنة + ترويسة X-CSRF-Token في apiFetch + تحقق الوسيط على الطرق المتغيرة (إعفاء: /api/telegram/، /api/webhook/، /api/cron/، /healthz، login/register قبل الجلسة)
- E3.4 **تضييق CSP**: إسقاط https://connect.facebook.net + *.facebook.com من script-src في api-domain (لا يوجد FB SDK)، تضييق connect-src إلى المضيفين الفعليين (self + api.smart-link.ly + ingest.de.sentry.io)، محاذاة CSP بين middleware.ts وapp/middleware.py
- E3.5 **التقاط أخطاء الخلفية**: startup.py:279-280 → capture_exception + إعادة رفع RuntimeError الأمني؛ حلقة البوت telegram.py:179 exc_info+capture؛ spawn() callback يسجل الاستثناءات (_async.py:21-31)؛ ws.py:93-98 تسجيل؛ bot_health إحصاء لكل مستأجر (startup.py:262-278)
- E3.6 **نبض القلب 503 عند الفشل**: bot.py heartbeat يعيد 503 إذا فشل record_heartbeat أو أخطأت المسوح → cron-job.org ينذر فعليًا عند تعطل DB (يسد فجوة «انقطاع DB غير مرئي»)
- E3.7 قبل_الإرسال PII scrubber في _observability + وثيقة أسطر المتغيرات في docs/deployment.md (سجل تنبيهات Sentry + مسار تصعيد)

## 4) المسار E4 — الواجهة: a11y + i18n + أمن UX (صفحات)

- E4.1 **[P1] أزرار إظهار كلمة المرور `tabIndex={-1}`** → إزالة (login/page.tsx:172-174؛ RegisterForm.tsx:161-163,180-182) — فشل المستوى A الوحيد
- E4.2 `html{scroll-padding-top:5rem}` (globals.css) — 2.4.11 ضد الأشرطة اللاصقة
- E4.3 **ربط أخطاء النماذج**: aria-invalid/aria-describedby عبر API الموجود في Input (login/register؛ نموذج support سليم بالفعل)
- E4.4 **توستات**: فصل role=status (نجاح) / role=alert (خطأ) وإسقاط aria-live الصريح (premium-toast.tsx:55-56؛ support:302)
- E4.5 **radiogroup الأولوية** بأسهم لوحة المفاتيح (support/page.tsx:265-282 — نمط MobileBottomNav.tsx:69-79)
- E4.6 **دفعة الخصائص المنطقية**: badge.tsx:11 (pl/pr → ps/pe — الخطأ الفعلي الوحيد)؛ messages border-s؛ connect ml-2؛ AdminSidebar border-l؛ DashboardShell/demo md:ps-60... (قائمة D5-F7)
- E4.7 جداول: scope="col" + aria-labelledby (dashboard/page.tsx:253-258؛ demo:261-268)
- E4.8 **النقر 429 UX**: فرع 429 مع عدّاد تنازلي في login/register (زر معطل + ثوانٍ)
- E4.9 كلمة المرور 6→8 حرفًا في RegisterForm:37 + نص التلميح
- E4.10 AuthGuard 401 → `/login?redirect=` (AuthGuard.tsx:88)
- E4.11 USSD encodeURIComponent + تحقق نمط الخادم (payment/index.tsx:114-119)
- E4.12 **مساعدة 3.2.6 على مسار الأموال**: FloatingWhatsApp في pricing/subscribe/demo/connect
- E4.13 i18n مواقع: formatNumber/countPhrase (connect:68، marketing:115، reports:147، notifications:182، payment prices ×4، CronHeartbeatCard:80-81)؛ توحيد تنوين الواجهة؛ حزمة الصقل: «والتابعين»→«والمتابعين» (OnboardingTour:39)، «وقع»→«حدث» (DefaultError:38)، «ميسنجر»→«ماسنجر» (6 og:alt)، «منذ»→«قبل» (demo:79-82)، إسقاط «5 د»، توحيد «…»
- E4.14 أيقونات التحقق مسجلة صوتيًا (RegisterForm validity)؛ required على رسالة support؛ type=text inputMode=decimal للمبلغ؛ ترويسات أمان على 307 (middleware.ts setHeaders في فرع redirect)

## 5) المسار E5 — الواجهة: الأداء + البنية (ملكية ملفات منفصلة عن E4)

- E5.1 **إخراج framer-motion من كل المسارات**: حذف MotionConfig من providers.tsx:4,25 + de-framer admin/page.tsx + admin/settings (twins عبر .sb-fade-up + animationDelay) + MotionConfig داخل OnboardingWizard الديناميكي → 674→~558KB
- E5.2 **QueryClientProvider → تخطيطات dashboard/admin فقط** (providers.tsx:3,17-26 + dashboard/layout.tsx + admin/layout.tsx) → −45KB للمسارات العامة
- E5.3 AppToaster ديناميكي بعد أول طلاء (layout.tsx:108) → الأساس المشترك ≈485-500KB
- E5.4 **ترويسات تخزين vercel.json + next.config headers()**: /fonts/* + الأيقونات + og-image → immutable/max-age=31536000؛ SWR للمانيفست
- E5.5 OnboardingWizard → unwrapApi (مع E2.11)؛ marketing/page.tsx:135 حارس items + countPhrase + توحيد مصطلح البث
- E5.6 حزمة sentry-config: بيئة `?? NODE_ENV ?? "production"` (instrumentation-client.ts:22) + حقن RELEASE في build script (`SENTRY_RELEASE=$(git rev-parse --short HEAD)`)

## 6) المسار E6/E7 — الاختبارات (بعد التنفيذ — موجة 2)

- E6 (خلفي، هدف ≥63%): test_v12_ws (مصافحة + عزل مستأجر + jti)؛ test_v12_payments_confirm_upgrade (تأكيد/ترقية/موافقة مزدوجة)؛ test_v12_pipeline (فروع الأخطاء)؛ test_v12_middleware (dedup + 429 + CSRF)؛ test_v12_alembic (upgrade head == Base.metadata)؛ test_v12_crud_edges (~20 حذف/تحديث عابر للمستأجرين)؛ test_v12_security_v12 (BOLA الوسوم + platform gates + SSRF + token_ver)؛ تحويل test_qa_scenarios + test_bot_logic القاتلة للجمع؛ رفع أرضية CI 50→60
- E7 (أمامي): AuthGuard.test.tsx (401/إعادة توجيه/دور/onboarding)؛ payment components (آلة حالات الدفع + CopyRow)؛ directional-icon.test.tsx؛ premium-toast.test — توصيلها ببوابة gate 3.5

## 7) سجل القرارات المؤجلة (جديد — docs/decisions-ledger.md)

توثيق بأسلوب gstack-shortcut (سقف + محفز ترقية): حزمة agent stack بلا واجهة (~3,400 سطر)؛ ميزانية JS الخطوة التالية؛ مغلفات pruned v13؛ تدوير Neon/SECRET_KEY/FERNET (مالك)؛ قواعد تنبيه Sentry (API)؛ شاشة uptime خارجية.

## 8) معايير القبول

1. كل إصلاحات P1 الأمنية مغلقة باختبارات انحدار عابرة للمستأجرين
2. البوابات: ruff · pytest (أرضية 60%) · tsc 0 · build 41/41 · vitest · css/i18n/a11y/contrast — كلها خضراء
3. JS الأساس المشترك <500KB (قياس post-build)
4. صفر رسالة إنجليزية تصدر للمستخدم في الواجهة
5. commit واحد + إعادة مزامنة static للـapi-domain (إغلاق الانحراف) + تحقق حي بنهج canary (مقارنة قبل/بعد)
6. تقرير v12 + سجل قرارات + worklog + إبطال الرموز
