# سجل القرارات المؤجلة — SmartBot Deferred Decisions Ledger

> **لغة الآلة:** كل بند يحمل معرّفًا ثابتًا `dec-*` قابلًا للبحث (`grep -rn "dec-" .`) على نمط
> gstack `gstack-shortcut(dec-<id>): <ceiling>, upgrade when <trigger>` — أي مُعلّق دَين قائم
> يُقرّ بسقفه ومحفّز ترقيته هنا، ويُرقّى أو يُغلق عندما ينطلق المحفز. تحديث السجل: append-only
> (بند جديد أو `--supersede` بمعرّف أحدث)، لا يُحذف بند إلا عند إغلاقه بإسناد إلى الالتزام الذي أنجزه.
>
> الحقول الإلزامية لكل بند: **الحالة** · **السقف/الكلفة** · **محفز الترقية** · **المالك**.
>
> الأصل: خطة v12 §7 (2026-09-07) + مخرجات الوكلاء التشخيصيين D4 (العقود) وD5 (الترحيلات) وD11 (التبسيط).

---

## dec-agent-stack — حزمة الوكيل وراوترات بلا واجهة

`gstack-shortcut(dec-agent-stack): سقف ~3,400 سطرًا بلا مستهلك واجهة، upgrade when قرار منتج: بناء الواجهة أو الإيقاف`

- **الحالة:** مؤجل — ينتظر قرار منتج من المالك (لا حذف أعمى: الاختبارات موجودة وتغطي الحزمة)
- **السقف/الكلفة:** حزمة الوكيل ~794 سطرًا (`agent_engine.py` 320 + `agent_brain.py` 211 + `agent_tools.py` 141 + `agent_memory.py` 122) لا يوصلها سوى `/api/agent/*` التي لا تستدعيها أي صفحة؛ + راوترات بلا واجهة flows/sequences/widgets/publisher/commerce/brand/users/reports مع محركاتها (flow_engine 570 / sequence_engine 516 / pdf_reports_engine 520 / publisher_engine 190 / commerce_engine 147) ≈2,600 سطر من ميزات مرحلة v4. تبعيتا `tenacity` و`jsonschema` في requirements.txt تعيشان فقط في هذه الحزمة (D11).
- **محفز الترقية:** قرار المنتج بإحدى جهتين — (أ) بناء واجهة تستهلك الحزمة (تفعيل القيمة المدفوعة)، أو (ب) الإيقاف: حذف ~3,400 سطرًا + التبعيتين + اختباراتها مقابل ~17% من حجم الخلفية.
- **المالك:** المالك (قرار منتج) · التنفيذ: فريق الخلفية

## dec-js-budget — ميزانية الأساس المشترك JS

`gstack-shortcut(dec-js-budget): سقف الأساس المشترك ~485-500KB بعد v12، upgrade when أي قياس post-build فوق 500KB → تقليم حتى <450KB`

- **الحالة:** مفتوح — v12 يُنزل الأرضية من 562KB (v11) إلى ~485-500KB (إخراج MotionConfig من providers الجذرية + تقييد QueryClientProvider على تخطيطات dashboard/admin + AppToaster ديناميكي بعد أول طلاء)؛ معيار القبول v12 §8-3: <500KB قياسًا بعد البناء
- **السقف/الكلفة:** كل مسار عام (landing/pricing/demo/login…) يدفع الأساس المشترك كاملًا — كل KB فيه يُحمل قبل أول تفاعل
- **محفز الترقية:** الأساس المشترك يظل ≥500KB أو يرتفع فوقها في أي جولة → الخطوة التالية: تقليم الأرضية 562KB → تحت 450KB (تفكيك مزودي الصفحات العامة، تقسيم الحزم المشتركة، مراجعة مشتريات dependencies)
- **المالك:** فريق أداء الواجهة
- **أُغلق بإعادة تعريف في جولة v13 (2026-09-07):** القياس الأمين بعد خروج framer-motion وجد الأساس المشترك **مُهيمنًا عليه من إطار العمل لا من كود التطبيق**: الأرضية ~541.4KB خامًا (تشمل ~110KB خام / ~38.5KB مضغوطًا مقطع polyfill من core-js يُحمّل في كل مسار — لا `browserslist` في المستودع فيستهدف Next 16 المدى الافتراضي الواسع)، وكود التطبيق المتحكَّم به ≈64KB خامًا فقط؛ الأساس المضغوط 187.3KB gz. هدف <450KB خامًا **غير قابل للبلوغ على مستوى التطبيق** → الميزانية مُعادة تعريفها: **الأساس المشترك المضغوط ≤190KB gz + كود التطبيق ≤80KB** (كلاهما مُستوفى في v13). ذراع المستقبل الموثق: تحديث browserslist عند توفر مصفوفة أجهزة ليبية تبرر استهدافات حديثة — بند جديد `dec-browserslist`. جولة v13 — الإسناد الكامل في docs/reports/v13-world-class-report.md

## dec-envelope-prune — حراس dual-shape الأمامية بعد تثبيت v12

`gstack-shortcut(dec-envelope-prune): سقف ~12 حارس شكل مزدوج للتوافق مع انحراف نشر Vercel/BE، upgrade when v12 مستقر في الإنتاج + E2E خضراء أسبوعًا كاملًا`

- **الحالة:** مؤجل — الحراس أُبقيت عمدًا (تسامح تقارب النشر بين الواجهة والخلفية على نطاقين منفصلين: bot.smart-link.ly / api.smart-link.ly)؛ السابقة: E2.11+E5.5 في v12 أقعدت نمط التقليم بالفعل في test-connection (unwrapApi بدل `d?.data ?? d`)
- **السقف/الكلفة:** كل حارس سطران-ثلاثة تُبطئ قراءة الكود وتُخفي العقد الحقيقي `{success, data}` خلف احتمالات شكلية
- **محفز الترقية:** تثبيت v12 بالاختبارات (بوابات §8 خضراء) + مزامنة static للـapi-domain تُغلق انحراف النشر D8-2 → حذف كل الحرس وإبقاء unwrapping المركزي فقط (نمط OnboardingWizard:159-165)
- **المالك:** فريق الواجهة
- **قائمة الملفات (D4 §4.5 — كماستقرت بعد هبوط v12):**
  - `src/lib/api.ts` — `unwrapBody` (غلاف unwrapApi المركزي؛ يبقى دائمًا — ليس حرسًا موضعيًا)
  - `src/components/landing/LandingIslands.tsx:70` — `Array.isArray(d) ? d : (d?.data ?? [])`
  - `src/app/pricing/page.tsx:44` — `Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : [])`
  - `src/app/dashboard/leads/page.tsx:23` — `Array.isArray(d) ? d : (d?.items ?? [])`
  - `src/app/subscribe/SubscribeContent.tsx:47` — فحص ثلاثي للقائمة
  - `src/app/subscribe/SubscribeContent.tsx:82` — `data?.data ?? data ?? []`
  - `src/app/onboarding/OnboardingWizard.tsx:110` — `Array.isArray(d) ? d : (…d.data…)` (تحميل القوائم)
  - `src/app/dashboard/settings/page.tsx:22` — `raw?.user ?? raw?.data?.user ?? raw`
  - `src/app/dashboard/marketing/page.tsx:121` — `d?.data?.sent_count ?? 0`
  - `src/app/dashboard/marketing/page.tsx:144` — حارس E2.12 (v12): `Array.isArray(data) ? data : (data?.items ?? [])` — الزوج الوحيد الكاسر عند نشر متقارب
  - ✅ أُقعد بالفعل في v12 (سابقة التقليم): `src/app/onboarding/OnboardingWizard.tsx:143-174` — test-connection صار unwrapApi خالصًا (`E2.11+E5.5`)
- **أُغلق في جولة v13 (2026-09-07):** استُبدلت الحراس الثمانية المتبقية في السجل (`LandingIslands:70` · `pricing:44` · `leads:23` · `SubscribeContent:47+82` · `settings:22` · `marketing:121+144`) بـ unwrapApi المركزي الخالص (E5)؛ وحارسا OnboardingWizard (تحميل القوائم + الخطط) أغلقهما المنسّق بعد هبوط E1 وفق خريطة الملكية §4. صار العقد `{success, data}` هو الشكل الوحيد المفترض أماميًا — لا حراس شكل مزدوج بعد اليوم. `unwrapBody` في `src/lib/api.ts` يبقى **بتصميم** (الغلاف المركزي، ليس حرسًا موضعيًا). جولة v13 — الإسناد الكامل في docs/reports/v13-world-class-report.md

## dec-owner-rotations — تدوير مفاتيح واعتمادات المالك

`gstack-shortcut(dec-owner-rotations): سقف مفاتيح غير مدارة منذ الإنشاء الأول، upgrade when فورًا — باب أحادي الاتجاه يتطلب تأكيدًا مطبوعًا من المالك`

- **الحالة:** عاجل — إجراء مالك، غير قابل للإغلاق برمجيًا
- **السقف/الكلفة:** ثلاث دورات مطلوبة: اعتمادات Neon (DATABASE_* روابط) · `SECRET_KEY` (توقيع JWT) · `FERNET_KEY` (تشفير توكنات فيسبوك وأسرار 2FA)
- **محفز الترقية:** فوري — كلها أبواب أحادية الاتجاه: تدوير Neon يقطع الاتصال حتى تحديث المتغيرات؛ تدوير FERNET يبطل كل توكن مخزن مشفر في القاعدة (يتطلب إعادة ربط كل مستأجر)؛ تدوير SECRET_KEY يسقط كل جلسات JWT دفعة واحدة. **لا يُنفّذ إلا بتأكيد مطبوع من المالك** يذكر الأثر الثلاثي صراحة
- **المالك:** المالك
- **إعادة تصعيد 2026-09-07 (جولة v13 — D10):** المسح الأمني المنعش أعاد تأكيد أن كتلة `fb_dashboard/.env` التاريخية (كلمة مرور Neon + قيمة SECRET_KEY القديمة — blob `2e6a618a` عند commit `d7e5d8db`، 2026-07-06) **لا تزال قابلة للوصول من origin/main العام** والمستودع عام — التدوير لم يُنفّذ بعد؛ الإلحاح مُعاد تصعيده. البند يبقى مفتوحًا (إجراء مالك — باب أحادي الاتجاه).

## dec-bot-state-unique — قيد فريد على bot_state(key,value)

`gstack-shortcut(dec-bot-state-unique): سقف فهرس bot_state(key,value) غير فريد في v12، upgrade when تكرار صفوف يسبب MultipleResultsFound → dedup ثم UNIQUE`

- **الحالة:** مؤجل — ينتظر نظافة بيانات الإنتاج (فريد مباشر سيفشل على الصفوف المكررة القائمة)
- **السقف/الكلفة:** كل حدث webhook يمسح bot_state تسلسليًا؛ القيود الفريدة الموجودة على (tenant_id,key) لا تمنع تكرار (key,value) عبر المستأجرين/التاريخ
- **محفز الترقية:** ظهور `MultipleResultsFound` من قراءة bot_state (حافة D5-P3) أو أي تقرير تكرار → الترقية على خطوتين: (1) dedup صفوف المفتاح الواحد (إبقاء الأحدث)، (2) `CREATE UNIQUE INDEX` على (key,value)
- **المالك:** فريق البيانات
- **أُغلق في جولة v13 (2026-09-07):** الترحيل 012 (E4): dedup صفوف `key='fb_page_id'` المكررة (إبقاء `MAX(id)` — لا عمود زمني في الجدول) ثم فهرس فريد **جزئي** `uq_botstate_key_value` على (key,value) بشرط `WHERE key='fb_page_id'` (لهجتَي PostgreSQL وSQLite معًا). الجزئية **مقصودة**: قيم `balance` و`fb_fan_count` (وغيرهما) تتكرر عبر المستأجرين بشكل مشروع — فريد جدولي كامل يفسد مسار الأموال (وديعة تضيع صمتًا في مسار السباق في `_wallet`) ويحذف صفوفًا مشروعة في dedup. السلوك الجديد المقصود: مستأجر ثانٍ يربط صفحة مربوطة → `IntegrityError` عند الـcommit (تظهر 500 حتى صقل اختياري إلى 409). حافة `MultipleResultsFound` في webhook أُغلقت من جذرها. جولة v13 — الإسناد الكامل في docs/reports/v13-world-class-report.md

## dec-sentry-alerts — قاعدة تنبيه Sentry

`gstack-shortcut(dec-sentry-alerts): سقف أحداث بلا تنبيه (اكتشاف يدوي)، upgrade when فورًا — قاعدة new-issue in production لكل مشروع`

- **الحالة:** إجراء مالك — عبر API أو اللوحة (Sentry Dashboard → Alerts)
- **السقف/الكلفة:** الخلفية والواجهة ترسلان إلى مشروعي `smartbot-api` و`smartbot-web` (منشور في الإنتاج منذ v6، مؤكد D8-3) لكن **لا قواعد تنبيه**: مشكلة جديدة أول مرة تُكتشف فقط بتصفح يدوي للوحة
- **محفز الترقية:** فورًا — قاعدة واحدة لكل مشروع: «مشكلة جديدة في بيئة production → بريد/تريقام (PagerDuty)»؛ الارتباط عبر `request_id` (ترويسة X-Request-Id منذ v12) يربط حدث الواجهة بالخلفية
- **المالك:** المالك · المرجع: [deployment.md «التنبيهات والمراقبة»](deployment.md)
- **أُغلق في جولة v13 (2026-09-07):** القاعدتان أُنشئتا فعلًا في v12 عبر API: smartbot-api (id=776237) وsmartbot-web (id=776238) — production، new-issue، بريد، تهدئة 30د — والدليل الحي: `docs/evidence/v12/sentry-canary-and-alerts.txt`. هذه الجولة تسجّل الإغلاق الكتابي في السجل فقط (لا عمل برمجيًا جديدًا). جولة v13 — الإسناد الكامل في docs/reports/v13-world-class-report.md

## dec-uptime-monitor — مراقب uptime خارجي

`gstack-shortcut(dec-uptime-monitor): سقف مسارات فحص حية بلا مراقب خارجي، upgrade when فورًا — إعداد مراقب على المسارين`

- **الحالة:** إجراء مالك — أدوات مثل UptimeRobot/Checkly (لا يتطلب كودًا)
- **السقف/الكلفة:** `/healthz` يعيد 503 عند فشل القاعدة و`/api/health/ready` يفحص الاتصال + الجدول المحوري، لكن لا أحد خارج Vercel يطلبهما دوريًا — انقطاع DB يعرفه الأدمن فقط إن صادف فتح اللوحة
- **محفز الترقية:** فورًا — مراقب خارجي على المسارين (فاصل 5 دقائق) يبريد المالك عند 503 متتاليتين؛ يكمل قناة `/api/cron/heartbeat` (503 عند فشل المسح منذ v12 → cron-job.org ينذر)
- **المالك:** المالك · المرجع: [deployment.md «التنبيهات والمراقبة»](deployment.md)

## dec-payments-decompose — تفكيك payments.py

`gstack-shortcut(dec-payments-decompose): سقف راوتر واحد 593 سطرًا لمسار الأموال، upgrade when أي تغيير جديد يصعب مراجعته → تفكيك إلى حزمة`

- **الحالة:** مؤجل — جولة قادمة (v12 أجرى إصلاحات عميقة داخله: محفظة عشرية ذرية، حدود، عزل مستأجر — البنية لم تُفكك)
- **السقف/الكلفة:** `routers/payments.py` أكبر راوتر في المستودع (593 سطرًا): محافظ ليبيانا/مدار + تحويل بنكي + موافقات تلغرام + رفع إيصالات + SSE + ترقية الباقات — مسارات أموال متراكبة في ملف واحد يصعب مراجعته أمنيًا
- **محفز الترقية:** أول تغيير جوهري بعده (مزود دفع جديد/تغيير الموافقات) يتعذر مراجعته → تفكيك إلى حزمة `routers/payments/` (wallet.py · bank.py · approvals.py · sse.py · plans.py) بعقد ok() لكل ملف
- **المالك:** فريق الخلفية
- **أُغلق في جولة v13 (2026-09-07):** فُكّك `routers/payments.py` (594 سطرًا) إلى حزمة `routers/payments/`: `wallet.py` (محافظ ليبيانا/مدار: الإيداع والتأكيد والرصيد والسجل) · `bank.py` (التحويل البنكي ورفع الإيصالات) · `approvals.py` (موافقات تلغرام) · `sse.py` (بث حالة الدفع الحي) · `plans.py` (إنشاء/ترقية الاشتراكات) + `__init__.py` مُجمّع يُبقي سطح الاستيراد `fb_dashboard.routers.payments` كما هو (E3). **نقل حرفي للأجسام لا إعادة كتابة** — تحرسه اختبارات pytest القائمة على مسار الأموال. الإيصالات تظل تهبط في `fb_dashboard/static/uploads/receipts` (المسار نفسه قبل التفكيك). جولة v13 — الإسناد الكامل في docs/reports/v13-world-class-report.md

## dec-alembic-003 — سلسلة 003 INSERT على قواعد شكل-create_all

`gstack-shortcut(dec-alembic-003): سقف ترحيل 003 يفترض شكلًا يغاير ما يخلقه create_all، upgrade when بيئة PostgreSQL جديدة تعلق في 002 بصمت`

- **الحالة:** مؤجل — خيارات إصلاح مطروحة (D5-P1)
- **السقف/الكلفة:** الترحيل 001 يشغّل `Base.metadata.create_all` أولًا فيولد جدول tenants بشكل النموذج (models.py:87-101 — بلا `slug`)، ثم يدرج 003 صف default بعمود `slug` (003_tenants.py:49-53) → `INSERT` يفشل على PostgreSQL نظيفة والسلسلة تعلق عند 002، والخطأ يُبتلع صامتًا في startup (يُسجّل ولا يوقف) — `_schema_reconcile` يبقى السلطة الفعلية للمخطط في الإنتاج
- **محفز الترقية:** أي بيئة جديدة (staging/نسخة محلية من الإنتاج) يُرى فيها `alembic current` = 002 — خيارات الإصلاح: (أ) حارس يفحص وجود عمود `slug` قبل INSERT ويستعمل إدراجًا مطابقًا لشكل النموذج، (ب) جعل INSERT يعمل على الشكلين معًا، (ج) ترحيل 011+ موحد يوافق الشكلين ويصحح الأعمدة المتبقية (slug/settings/updated_at)، (د) قرار معماري: الاعتماد النهائي على create_all+reconcle وإسقاط السلسلة المكسورة توثيقيًا
- **المالك:** فريق البيانات
- **أُغلق في جولة v13 (2026-09-07):** الخيار (أ): صار إدراج 003 **مطابقًا للشكل** (shape-adaptive) — حارس يفحص أعمدة جدول tenants الفعلية (وجود `slug` قبل الإدراج) + `ON CONFLICT DO NOTHING` + `setval` (E4)؛ قاعدة PostgreSQL نظيفة تكمل السلسلة حتى head (012) بدل أن تعلق صامتة عند 002، وبيئة معلقة تُشفى ذاتيًا في الإقلاع التالي. no-op في الإنتاج (`alembic_version` تجاوز 003 فلا يُعاد تشغيله). جولة v13 — الإسناد الكامل في docs/reports/v13-world-class-report.md

## dec-framer-wizard — آخر مستهلك framer-motion: OnboardingWizard

`gstack-shortcut(dec-framer-wizard): سقف framer-motion باقٍ في مسار واحد معتمد بعد v12، upgrade when إعادة كتابة OnboardingWizard → استبدال CSS كامل`

- **الحالة:** مؤجل — v12 أخرج MotionConfig من providers الجذرية وde-framer لصفحات /admin (توأمات CSS)؛ تحويل test-connection إلى unwrapApi هبط فعلًا (E2.11+E5.5) — المتبقي: جسد المعالج نفسه
- **السقف/الكلفة:** حزمة framer-motion (محرك ~116KB) تبقى في dependencies لأجل معالج واحد ديناميكي (OnboardingWizard.tsx ~585 سطرًا) — تقيم في مقطعه الكسول لا في الأساس المشترك (dec-js-budget)، لكنها تعني صيانة مسار حركة JS كامل لأجل شاشة واحدة
- **محفز الترقية:** إعادة كتابة OnboardingWizard بـ CSS (انتقالات + `prefers-reduced-motion`) → إزالة framer-motion كاملة؛ عندها يُسقط من `dependencies` إن خلت المسارات العامة منه أيضًا
- **المالك:** فريق الواجهة
- **أُغلق في جولة v13 (2026-09-07):** أُعيدت كتابة OnboardingWizard بحركة CSS خالصة — توائم `ob-*` (`ob-step-enter`/`ob-icon-pop`/`ob-fade-in`) بتوقيتات مطابقة للـmotion props القديمة حرفيًا (0.25s ease-out للوحة، 0.3s cubic-bezier(0.25,0.1,0.35,1) للتلاشيات، تأخير 100ms للأيقونة)، تُحقن بوسم `<style>` واحد من ثابت module-level `WIZARD_MOTION_CSS` مع إيقاف كامل تحت `prefers-reduced-motion` (E1)؛ ثم أُسقط `framer-motion` من `dependencies` نهائيًا (E2) — صفر استيراد حي في `src/` كله. جولة v13 — الإسناد الكامل في docs/reports/v13-world-class-report.md

## dec-browserslist — مقطع polyfill من core-js يُحمَّل في كل مسار

`gstack-shortcut(dec-browserslist): سقف ~110KB خام / ~38.5KB gz مقطع polyfill في الأساس المشترك لكل مسار، upgrade when مصفوفة أجهزة ليبية تبرر استهدافات حديثة`

- **الحالة:** مؤجل — لا `browserslist` في المستودع → Next 16 يبني بالمدى الافتراضي الواسع (خارج دافع الجولة: لا تبرير لاستهدافات حديثة بلا بيانات أجهزة فعلية من زوار ليبيا)
- **السقف/الكلفة:** مقطع core-js polyfill ~110KB خام (~38.5KB مضغوطًا) داخل الأساس المشترك لكل مسار عام (قياس v13 الأمين: الأساس 541.4KB خام / 187.3KB gz) — ثمن توافق المتصفحات القديمة يدفعه كل زائر مرة واحدة، ويُقلّصه تحديث browserslist وحده دون أي تغيير في كود التطبيق
- **محفز الترقية:** مصفوفة أجهزة ليبية (الحصة الفعلية لمتصفحات حديثة من الزيارات — Chrome/WebView/Safari) تُظهر أن الاستهدافات الحديثة آمنة → إضافة `browserslist` بأهداف حديثة تُسقط معظم الـpolyfill من البناء دفعة واحدة
- **المالك:** فريق أداء الواجهة · **الأصل:** إعادة تعريف `dec-js-budget` في جولة v13 (2026-09-07)

---

> صيانة السجل: عند إغلاق بند أضف سطر «أُغلق بـ <commit/التزام>» تحت بابه بدل حذفه؛ عند تغيير قرار أضف بندًا جديدًا يذكر `dec-<old>` في مقدمته (نمط supersede).
