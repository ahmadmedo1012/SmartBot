# خطة الإطلاق العالمي v3 — التطابق الحرفي مع Smart-Menu + تشغيل كامل للمنصة

> **التاريخ:** 2026-09-06 | **المرجع الحي:** استنساخ فعلي لـ `github.com/ahmadmedo1012/Smart-Menu` (خاصة) بجوار `SmartBot`
> **الحكم:** هذه الخطة مبنية على فحص مباشر بالكود لكلا المشروعين — كل بند أدناه إما مُقتبس من سطر كود موجود أو نتيجة grep فعلي. لا بنود تخمينية.
> **قاعدة الوكيل الإلزامية:** أي بند `[VERIFY]` يتطلب فحصًا مباشرًا قبل الإصلاح. أي إصلاح بدون دليل = مرفوض.

---

## الديباجة — ما كشفه الفحص الممل فعليًا (الأدلة الحرفية)

### أ. اكتشافات وظيفية حرجة (سبب «كل شيء أصفار بعد الربط»)

| # | الاكتشاف | الدليل الحرفي | الأثر |
|---|---|---|---|
| F1 | **لا يوجد أي معالج لرسائل الماسنجر في الويبهوك** — `POST /webhook` في `runner.py:935-981` يعالج `changes[].field == "feed"` و `value.item == "comment"` فقط، ويتجاهل تمامًا `entry[].messaging[]` (رسائل الماسنجر/postbacks/reads/deliveries) | `if change.get("field") != "feed": continue` ثم `if value.get("item") != "comment": continue` | رسائل الصفحة لا تصل أبدًا للنظام — لا تخزين، لا ردود تلقائية للرسائل، لا إحصاءات رسائل. رسائل المستخدم تظهر فقط عبر سحب Graph API المباشر (ويطلب صلاحيات قد لا تتوفر) |
| F2 | **نقاط نهاية البيانات تستخدم client البيئة العامة وليس توكن المستأجر المتصل** — `/api/messages`, `/api/posts`, `/api/posts/{id}`, `/api/publish`, `/api/messages/{id}/reply`, `/api/ads/accounts`, `/api/ads/campaigns/*`, `/api/ads/ads/*` كلها تستورد `fb` من `_services` وهو `lazy(FBClient(settings.FACEBOOK_ACCESS_TOKEN, settings.FACEBOOK_PAGE_ID))` | `facebook_routes.py:8` `from _services import fb` + `_services.py:24-25` | بعد ربط الصفحة من /connect (يخزن التوكن في BotState للمستأجر) تظل كل هذه النقاط تستخدم توكن البيئة (فارغ في الإنتاج) → أصفار/فراغ دائم — **هذا هو جذر شكوى المالك** |
| F3 | **fan_count في لوحة البيانات يستخدم نفس الـ client العام** — `dashboard_stats.py:43` `fan_count = await fb.get_page_fan_count()` داخل `try/except: pass` | `dashboard_stats.py:41-45` | بطاقة «عدد المعجبين» صفر دائمًا للمستأجر المتصل (الاستثناء يُبتلع بصمت) |
| F4 | **توكن تليجرام ومدراؤه من متغيرات البيئة فقط** — `telegram_bot.py:9-10` يقرأ `TELEGRAM_BOT_TOKEN` و `TELEGRAM_ADMIN_IDS` من os.environ فقط، والجدولان `TelegramApprover`/`TelegramBroadcastTarget` موجودان في القاعدة ويُداران من `telegram_config.py` لكن **telegram_bot.py لا يستشيرهما أبدًا** | `telegram_bot.py:9-10` vs `telegram-admin.ts` في Smart-Menu (`env ∪ DB approvers`) | إن لم تُضبط متغيرات البيئة في Vercel (وهي غير مضبوطة) → **صفر إشعارات تليجرام بصمت** — جذر شكوى المالك الثانية |
| F5 | **`POST /api/telegram/config` دالة وهمية** — تعيد `{"updated": True}` دون حفظ أي شيء | `telegram_config.py:34-36` | لا يمكن للمالك ضبط تليجرام من الواجهة إطلاقًا |
| F6 | جدول المحادثات/الرسائل غير موجود أصلًا في الاستقبال — الرسائل تُسحب live من Graph API في كل مرة دون تخزين | `inbox.py:35-91` | لا سجل رسائل تاريخي، لا إحصاءات رسائل في الداشبورد |

### ب. اكتشافات هوية بصرية (سبب «الشعار لا يظهر والخطوط مختلفة»)

| # | الاكتشاف | الدليل الحرفي | الأثر |
|---|---|---|---|
| V1 | **`--font-heading` في SmartBot يبدأ بـ Cairo** بينما Smart-Menu يبدأ بـ **Readex Pro** (خط العرض للعناوين) + يعلّم layout تعليقًا صريحًا «Readex Pro (display headings)» ويـ preload ملفه | SmartBot `globals.css` vs Smart-Menu `@theme inline --font-heading: "Readex Pro", ...` | كل العناوين في SmartBot بخط Cairo — مختلفة بصريًا عن Smart-Menu — **جذر شكوى الخطوط** |
| V2 | **عدم اكتمال حزمة الأيقونات**: SmartBot لديه `brand-icon.png` + `favicon.png` فقط في public، ويعلن للـ manifest أن الشعار `160x160` (بينما الحجم الفعلي مختلف). لا يوجد `icon-192.png`/`icon-512.png`/`apple-touch-icon.png`/`favicon.ico` | `ls public/` + `manifest.ts:15-16` | متصفحات/PWA تطلب `/favicon.ico` افتراضيًا وتجد 404 → أيقونة التبويب قد لا تظهر؛ عدم وجود أحجام رسمية يُضعف الأيقونة التطبيقية |
| V3 | **الشعار في OG غير متطابق**: `opengraph-image.png` موجودة في app/ لكن metadata يعلن `/brand-icon.png` 512×512 كصورة OG | `layout.tsx:28` | مشاركة الرابط تظهر أيقونة صغيرة بدل بطاقة 1200×630 |
| V4 | **Toaster مختلف**: SmartBot `position="top-left"` بلا تنسيق؛ Smart-Menu `top-center` + richColors + closeButton + أنيميشن slide-up + border/backdrop-blur + radius 12px | `layout.tsx` لكلا المشروعين | إحساس مختلف في الإشعارات |
| V5 | **الشبكة الخلفية مكتوبة inline** بـ color-mix يدوي بدل مكوّن GridPattern بتوكنات `--grid-line/--grid-fill/--grid-square` | SmartBot `layout.tsx:73-75` vs Smart-Menu GridPattern | اختلاف بصري دقيق في الخلفية + كود غير موحد |
| V6 | skip-link بأسلوب مختلف (bg-card بدل bg-orange + ring)، لا preload لخطوط readex-pro وcairo-arabic، defaultTheme="dark" بدل "system" | layout.tsx لكلا المشروعين | فروق تفصيلية تتراكم |
| V7 | القائمة الجانبية للداشبورد/الأدمن + البطاقات + الأزرار + الجداول تحتاج مطابقة نمط Smart-Menu (sidebar-owner pattern, KpiCard, ChartCard, EmptyState, SectionHeader) | مقارنة مكونات المشروعين | مظهر «لوحة تحكم Smart-Menu» الذي يطلبه المالك |

---

## المرحلة 1 — الأصول البصرية الكاملة (الشعار والأيقونات) 🎯 حل «الشعار لا يظهر»

1.1. توليد حزمة أيقونات كاملة من `brand-icon.png` بـ Pillow (سكربت يحفظ في scripts/):
   - `icon-192.png` و `icon-512.png` (purpose any + maskable — maskable بمساحة أمان 80%)
   - `apple-touch-icon.png` (180×180, lanczos3)
   - `favicon.ico` متعدد الأحجام (16/32/48) في `app/` + `favicon.png` في public
   - التحقق: md5 للأحجام، فحص alpha، فحص أن الشعار ليس شفافًا بالكامل
1.2. `manifest.ts`: أيقونات بأحجام حقيقية (192/512 + maskable) + `theme_color` موحد + `background_color` داكن مطابق للثيم الداكن الفعلي
1.3. `layout.tsx`: `icons: { icon: [favicon.png, icon-192, icon-512], apple: apple-touch-icon }` + روابط `<link rel="manifest">` + `apple-touch-icon` في `<head>` مثل Smart-Menu تمامًا
1.4. عرض الشعار: التحقق من ظهوره في Header (سطح مكتب/جوال)، Footer، login، register، DashboardShell، AdminSidebar، صفحة /connect، وواتساب العائم — أي مرجع ناقص يُصلح
1.5. OG: استخدام البطاقة الحقيقية 1200×630 في metadata بدل brand-icon 512
1.6. **بوابة المرحلة:** `curl -sI` محليًا لكل ملف أيقونة = 200، وبعد النشر حيًّا على bot.smart-link.ly + فحص متصفح (naturalWidth > 0 + أيقونة التبويب)

## المرحلة 2 — الخطوط: مطابقة حرفية لـ Smart-Menu 🎯 حل «الخطوط مختلفة»

2.1. `--font-heading: "Readex Pro", var(--font-cairo, "Cairo"), "Noto Sans Arabic", system-ui, sans-serif` — حرفيًا كما في Smart-Menu (Readex أولًا)
2.2. preload لـ `/fonts/readex-pro.woff2` و`/fonts/cairo-arabic.woff2` في head (LCP) مثل Smart-Menu
2.3. التأكد من أن `fonts.css` المحلي يُخدَّم على Vercel (رابط + ملفات woff2 من public — تحقق حي)
2.4. مراجعة كل استخدام `font-heading`/`font-sans` في المكونات وإزالة أي weight خارج نطاق الخطوط المتوفرة (Cairo 400-800, Readex 300-700)
2.5. **بوابة المرحلة:** فحص متصفح حي — `document.fonts.check('600 1em "Readex Pro"')` = true + computed font-family للعناوين يحوي Readex Pro أولًا

## المرحلة 3 — الثيمات والألوان والتداخلات 🎯 حل «التداخلات والتشوهات»

3.1. Toaster مطابق لـ Smart-Menu: top-center + richColors + closeButton + slide-up + border-border/30 + backdrop-blur + radius 12
3.2. استبدال الشبكة inline بمكوّن `GridPattern` بتوكنات `--grid-*` من Smart-Menu (نفس opacity 0.14 وأبعاد 60×60)
3.3. سجل z-index موثق في globals.css (نفس مراتب Smart-Menu: sticky 10-20, dropdown 30-40, drawer 40-50, modal 50-60, toast 60-70, popover 70-80, overlay 90-100) + مسح كل z-* الرقمية الحرفية في المكونات وتوحيد حسب السجل
3.4. skip-link بأسلوب Smart-Menu (bg-orange + ring + radius) + defaultTheme system (مع dark كافتراضي HTML لأن المنصة داشبورد)
3.5. مطابقة القيم الناقصة من Smart-Menu globals.css غير المنقولة بعد (glass tokens, surface variants, shadow tiers إن وجدت فروق) — diff حرفي مقطعي
3.6. **بوابة المرحلة:** فحص متصفح للصفحات الرئيسية بلا عنصر مقصوص/متداخل (scrollWidth ≤ clientWidth في كل الصفحات، لقطات VLM)

## المرحلة 4 — تدفق بيانات فيسبوك (الإصلاح الوظيفي الأكبر) 🎯 حل «كلها أصفار بعد الربط»

4.1. **tenant-scoping شامل**: كل نقاط النهاية في `facebook_routes.py` تُحوَّل من `fb` العام إلى `get_tenant_fb_client(current_user._tenant_id)` مع رسالة عربية واضحة عند غياب الربط (نمط `_get_inbox_fb`)، مع إبطال cache عند تحديث الإعدادات (موجود جزئيًا)
4.2. `dashboard_stats.py`: fan_count من client المستأجر (مع fallback 0 صامت فقط عند غياب الربط) + إضافة إحصاءات الرسائل المخزنة (عدد المحادثات/الرسائل/غير المقروءة) إلى bundle
4.3. **معالج messaging في الويبهوك**: `POST /webhook` يعالج `entry[].messaging[]`:
   - رسائل واردة → تخزين في جدول `Message`/`Conversation` (إنشاء الجداول والنماذج + alembic migration)
   - postbacks/referrals → تسجيل
   - توجيه لمحرك الرد التلقائي للرسائل
4.4. **محرك الرد التلقائي للرسائل**: قواعد الرد نفسها (Rule engine) تعمل على الرسائل الخاصة، مع احترام آلية الإيقاف/cooldown، ووضع علامة `replied_by_bot`، وإرسال عبر Graph API `send_conversation_message` — مع الحفاظ على عدم الرد المزدوج (dedup)
4.5. **مزامنة أولية بعد الربط**: عند PUT /api/facebook/settings الناجح — جلب اسم الصفحة وعدد المعجبين وتخزينهما في BotState (page_name) + سحب أولي للمحادثات والمنشورات
4.6. `/api/webhook/check` يعرض الحالة الحقيقية (endpoint حي + الحقول المشترك بها فعلًا عبر Graph API `/app/subscriptions` + `/page/subscribed_fields`) بدل التعليمات النصية فقط
4.7. **بوابة المرحلة (اختبارات pytest جديدة):** محاكاة كاملة — POST /webhook بـ signature صحيح → رسالة تُخزن → رد تلقائي يُرسل → dashboard bundle يعيد أرقامًا ≠ 0 → inbox يعرض المحادثة

## المرحلة 5 — إشعارات تليجرام (الإصلاح الوظيفي الثاني) 🎯 حل «لا تصل إشعارات التليجرام»

5.1. `telegram_bot.py` يعيد التصميم على نمط Smart-Menu: توكن من `SystemConfig` (DB) مع fallback إلى env، والمدراء = `TELEGRAM_ADMIN_IDS` (env) ∪ صفوف `TelegramApprover` (DB) — دالة `get_admin_ids()` async تُستدعى في كل notify
5.2. `POST /api/telegram/config` حقيقي: يحفظ bot_token وchat_id في SystemConfig (قائمة بيضاء) + GET يعيدها masked — مع require_platform_admin
5.3. واجهة `/admin/settings` (الصفحة الموجودة): قسم تليجرام جديد (توكن البوت + معرف المدراء + زر «إرسال رسالة تجريبية» يستدعي diagnose حقيقي)
5.4. Webhook الويبهوك لتليجرام: `/api/telegram/webhook` يظل يعالج approve/reject (موجود) — لكن التحقق من المدير يصبح عبر get_admin_ids() الجديدة (env ∪ DB)
5.5. إشعارات أحداث إضافية: طلب دعم جديد (notify_admins_support_ticket موجود لكن [VERIFY] من يستدعيه) + تأكيد للمستخدم عبر SSE (موجود)
5.6. **بوابة المرحلة (pytest):** توكن من DB يُستخدم، approver من DB يستقبل الإشعار (mock httpx)، callback من مدير DB يوافق على اشتراك

## المرحلة 6 — مطابقة مكونات لوحة التحكم مع Smart-Menu (الشكل والأزرار)

6.1. مكتبة المكونات الأساسية: مطابقة حرفية لـ Smart-Menu في `button.tsx` (تم جزئيًا — مراجعة glow/ variants)، `card.tsx`, `input.tsx`, `label.tsx`, `badge.tsx`, `dialog.tsx`, `empty-state.tsx`, `SectionHeader/Eyebrow` (منقولة)
6.2. أنماط لوحة المالك في Smart-Menu (sidebar-owner, KpiCard, ChartCard, ChartBarIcon...) → تكييفها لبطاقات إحصاءات SmartBot (مع الحفاظ على بيانات SmartBot)
6.3. الجداول والنماذج: توحيد أنماط الجداول (صفوف hover, حدود border/40, رؤوس muted) والنماذج (Labels + Inputs + رسائل تحقق) مع نمط Smart-Menu
6.4. Empty states موحدة بمكوّن واحد (أيقونة + عنوان + وصف + زر إجراء) — إحلال كل الحالات الفارغة المتناثرة
6.5. حالات التحميل: skeletons بنفس نمط Smart-Menu (pulse بنفس الشكل) لكل بطاقات الداشبورد
6.6. الرسوم البيانية: مطابقة chart-tokens (ألوان/محاور/خطوط شبكة) لمخططات الداشبورد، والتحقق من recharts [VERIFY: هل تُستخدم فعلًا الآن؟]

## المرحلة 7 — التدقيق الوكيلي المتوازي (وقت تشغيل الوكلاء بالتوازي مع التنفيذ)

7.1. وكيل A — تدقيق تطابق التصميم: يقارن مكون-بمكون Smart-Menu مع SmartBot ويعيد جدول فروق بأرقام أسطر (يُحدَّث المرحلة 6 بنتائجه)
7.2. وكيل B — تدقيق جودة الواجهة: كل صفحات dashboard/* (25 صفحة) + admin/* — يرصد التداخلات، النصوص المقصوصة، الأزرار غير المتسقة، RTL issues، أخطاء console محتملة، حالات فراغ كاذبة («0» بدل حالة «غير متصل»)
7.3. كل ملاحظات الوكيلين تُصنَّف P0/P1/P2 وتُطبَّق — لا ملاحظة تبقى مفتوحة

## المرحلة 8 — البوابات الكاملة قبل الدفع

8.1. pytest كامل (236 الحالية + الجديدة للمراحل 4-5، الهدف ≥ 250) مرتين متتاليتين
8.2. tsc --strict صفر أخطاء + next build (38+ مسارات) صفر أخطاء
8.3. محاكاة E2E محلية بالسكربت: تسجيل → ربط صفحة (توكن وهمي + mock Graph) → ويبهوك تعليق + رسالة → إحصاءات ≠ 0 → إشعار تليجرام mock → اشتراك → موافقة تليجرام
8.4. تنظيف: إزالة أي كود ميت أضافته المراحل، تحديث design-system.md بالتوكنز الجديدة

## المرحلة 9 — الدفع والنشر والتحقق الحي بالمتصفح

9.1. دفع main + develop بالـ PAT
9.2. مراقبة نشر Vercel (polling healthz حتى 200 × النسختين frontend/api)
9.3. متصفح حقيقي (agent-browser): تسجيل دخول المالك → فحص الشعار/الخط/الألوان بالقياس (getComputedStyle) → كل صفحات البوت 200 بلا أخطاء console → تدفق الرسائل (إن توفرت بيانات)
9.4. لقطات + VLM للحكم البصري النهائي
9.5. تقرير تسليم نهائي + تحديث worklog + تذكير المالك بإبطال التوكنات وإدخال بيانات الدعم وتليجرام من /admin/settings

---

## قواعد الإنفاذ الذاتي للوكيل (بلا توقف حتى النتيجة المثالية)

1. **ممنوع الاكتفاء بالحد الأدنى** — كل مرحلة تُغلق ببوابتها المقيسة، لا بـ«تم» اللفظية.
2. **ممنوع الإصلاح التخميني** — كل تعديل يسبقه فحص الكود المعني.
3. أي فشل بوابة → إصلاح فوري وإعادة تشغيل البوابة — لا تجاوز مرحلة ناقصة.
4. النتيجة النهائية: منصة تبدو كـ Smart-Menu (نفس الخطوط/الألوان/الأزرار/الأيقونات/الشعار) وتعمل من طرف لطرف (ربط → استقبال → ردود → إحصاءات → اشتراك → تليجرام) وجاهزة للإطلاق.
