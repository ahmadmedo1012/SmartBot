# تقرير تسليم خطة التطابق v2 — مطابقة Smart-Menu الكاملة + تصليب الإنتاج

> **المرجع:** `smartbot-parity-plan-v2-2026-09-05.md` (رفع المالك، commit `158c52dc`)
> **التنفيذ:** التزامات `e7930070` + `7718bc99` + `5fac5274` — منشورة كلها على main/develop ومتحقق منها حيًا
> **التاريخ:** 2026-09-05 | كل بند أدناه مدعوم بأدلة تيرمينال فعلية

---

## القسم 1 — المرحلة 1 (P0): جذر تضارب `--accent` (§2.3 من الخطة)

### 1.1 الجراحة على التوكنز (`globals.css` — داكن + فاتح)

| التوكن | قبل (SmartBot) | بعد (SmartBot) | مرجع Smart-Menu | الحالة |
|---|---|---|---|---|
| `--accent` (داكن) | `oklch(0.55 0.19 45)` صلب | `oklch(0.55 0.19 45 / .15)` تلميح | نفسه | ✅ متطابق |
| `--accent` (فاتح) | `oklch(0.40 0.19 45)` | `oklch(0.55 0.19 45 / .12)` | نفسه | ✅ متطابق |
| `--primary` | `var(--accent)` إحالة | `oklch(0.55 0.19 45)` داكن / `0.40` فاتح مباشر | نفس البنية | ✅ متطابق |
| `--orange` | `var(--accent)` | `oklch(0.55 0.19 45)` في الوضعين (سطوع مزدوج) | نفسه | ✅ متطابق |
| `--orange-muted` | `var(--accent-soft)` | `/.15` داكن / `/.12` فاتح مباشر | نفسه | ✅ متطابق |
| `--ring` | `var(--accent)` | `oklch(0.55 0.19 45)` مباشر | نفسه | ✅ متطابق |

### 1.2 مسح الاستخدامات (مراجعة يدوية لكل حالة — §1.2 من الخطة)

| الملف | قبل | بعد | المنطق |
|---|---|---|---|
| `NavLink.tsx` | `hover:bg-accent/50` (ومضة 50%) + تدرّج نشط | `hover:bg-orange/8` + `bg-orange/12` + `bg-orange` مؤشر h-6 + `min-h-11` + `ring-orange/60` | نسخ حرفي من NavLink المرجعي |
| `MobileBottomNav.tsx` | `text-accent`/`bg-accent` (بعد التغيير كان سيختفي) | `text-orange` + `bg-orange-muted` + `bg-orange` | أيقونة/نص نشط صلب — نفس معجم Smart-Menu |
| `dashboard/[...slug]/page.tsx` | `border-accent/40` (كان سيصبح 6%) | `border-orange/40` + `text-orange` | حلقة الزخرفة المرئية |
| `PaymentDialog.tsx` (×3) | `hover:bg-accent` | **بقي كما هو** — منقول حرفيًا من Smart-Menu (سطرًا بسطر) | بعد التوحيد يُنتج التلميح 15% الصحيح — الإصلاح يعمل كما قُصد |
| `connect/page.tsx` | `hover:bg-accent` | **بقي كما هو** | نفس النمط المرجعي |

### 1.3 بوابة التحقق (الحاسمة)

**أ. التطابق بالقيم المصرّفة** (بناء محلي مقابل Smart-Menu الحي):

| التوكن | SmartBot (المصحح) | Smart-Menu (الحي) |
|---|---|---|
| `--accent` فاتح | `#bc47001f` (12%) | `#bc47001f` (12%) |
| `--accent` داكن | `#bc470026` (15%) | `#bc470026` (15%) |
| `--primary` فاتح | `#792c00` | `#792c00` |
| `--primary` داكن | `#bc4700` | `#bc4700` |
| `--orange` / `--ring` | `#bc4700` | `#bc4700` |

**ب. التطابق الحي بعد النشر** (getComputedStyle من كلا الموقعين): جدول `download/parity-gate1/parity-report.json` — قيم lab متطابقة لكل وضع.

**ج. التحقق البصري بلقطات فعلية** (بوابة الخطة §1): `download/parity-gate1/` — لقطات لنافذة الدفع + شريط الجوال + لوحة التحكم بعد النشر، فحصها VLM:
- نافذة الدفع: «No visual deformities or layout overlaps detected — orange consistent, high contrast»
- شريط الجوال: «الرئيسية tab displays solid orange text and icon with orange indicator line — no cutoff»
- لوحة التحكم: «active item highlighted with soft orange tint and vertical orange bar — no overlap»

**د.** `docs/design-system.md` حُدّث **في نفس الالتزام** (قاعدة §5.3 من الخطة): الجدول الدلالي الجديد + تحذير التضارب القديم.

---

## القسم 2 — المرحلة 2 (§3.1): معلومات الدعم — إنذار كاذب + ترقية حقيقية

**ادّعاء الخطة:** «لا يوجد أي تعريف لـ `/api/support/info` في أي راوتر».
**الحقيقة:** الـendpoint موجود ويعمل حيًا منذ قبل `86bfaa59` — `curl https://api.smart-link.ly/api/support/info` → 200. سبب خطأ التدقيق: المسار مركّب من `prefix="/api/support"` + `@router.get("/info")`، فالبحث النصي عن المسار الكامل يصيب الـdocstring فقط لا التعريف (فخّ grep موثّق في docstring الراوتر لمنع تكراره).

**الترقيات المنفذة رغم ذلك:**
1. دمج SystemConfig (تفوز) فوق env — الأدمن يحدّث بيانات التواصل من لوحة التحكم بدون إعادة نشر (نفس نمط `/api/config`).
2. تحويل `fetch(` الخام في الصفحة إلى `apiFetch` (مطلب الخطة).
3. اختبار انحدار `test_support_info_config_merge`: env → SystemConfig تفوز (pytest 222).

**بيانات التواصل الحقيقية:** تنتظر المالك — تُضبط من واجهة الأدمن (مفاتيح `support_email/support_phone/support_whatsapp/support_working_hours`) أو متغيرات Vercel. لم تُخترع بيانات بديلة (التزامًا بالخطة).

---

## القسم 3 — المرحلة 3 (§3.2–3.4): مطابقة العناصر المشتركة

| العنصر | الفجوة المكتشفة | الإصلاح (المرجع = Smart-Menu) |
|---|---|---|
| `Button` (§3.2) | أحجام أصغر خطوة كاملة (h-8/10/12 vs h-10/12/14، أيقونة size-8 vs 12) + بلا تأثير اللمعان | نقل حرفي: أحجام المرجع + `rounded-lg` + `min-h-11` + تمرير اللمعان (before/after) + `outline:hover:border-orange/40` + متغيرات داكنة |
| `AdminSidebar` (§3.1) | ألفا وفراغات شعار مختلفة | `bg-card/80` + `border-border/50` + شعار `gap-3 px-5 py-5` + ترجمة 11px + `px-3 py-5` — عناصر التنقل كانت متطابقة (bg-orange/12 + مؤشر) |
| `SectionHeader` (§3.4) | font-extrabold/tracking-tighter + حبّة pill | نقل حرفي: `font-semibold` + `leading-[1.25]` + `text-balance` + كشف متدرج staggerChildren + مكوّن Eyebrow |
| `Eyebrow` (§3.4) | حبّة pill بحدود | تسمية uppercase بتباعد 0.18em + نقطة نابضة — حرفيًا من Smart-Menu |
| `pricing` (§3.3) | حساب سنوي مختلف: خصم 20% | حساب Smart-Menu: **×10 (شهران مجانًا)** + «وفر شهرين عند الاشتراك السنوي» + تسمية «سنوياً» — والتحقق: نافذة الدفع عند المشروعين تحاسب الشهري (سلوك متطابق) |
| كود ميت | `SectionHeader.jsx` + `Eyebrow.jsx` (بلا أي استيراد) + صنف `.eyebrow` CSS | حُذفا + حُوّلت الاستخدامات الثلاثة المباشرة إلى نمط المرجع |

**منهجية §3.2 من الخطة** (نسخ → مقارنة كل توكن → توحيد → مسح شامل → لقطة) طُبقت على كل عنصر أعلاه.

---

## القسم 4 — المرحلة 4: التحقق النهائي الشامل

### 4.1 الأرقام (كلها من هذه الجلسة، بعد كل التغييرات)

| البوابة | النتيجة | الدليل |
|---|---|---|
| pytest | **222 passed** + 6 skipped | تشغيل كامل بعد كل مرحلة |
| tsc | **0 أخطاء** | بعد كل مرحلة |
| next build | **38/38 صفحة** | بعد كل مرحلة |
| تدفقات API الحية (إنتاج) | **31/31** | `scripts/live_flow_test.py` ضد api/bot.smart-link.ly |
| رحلة UI الحية (متصفح حقيقي → إنتاج) | **9/9** — بما فيها «لا أخطاء console» | `scripts/live_ui_flow.js`: تسجيل→دخول→خطط→معالج→نافذة→إرسال→SSE انتظار |
| E2E محلي (journey + mobile) | **2/2** (33.2s + 16.7s) | Playwright ضد الخادم المحلي |
| E2E محلي (22 قسمًا + حارس) | **25/25 بصفر سجلات لينة** | بعد إصلاح بيئة الاختبار (انظر 4.2) |
| healthz الإنتاج | `env: production` (كان development) | إصلاح DEBUG=false في Vercel |

### 4.2 اكتشاف جانبي: عدم استقرار قاعدة :memory: في E2E

أول تشغيل للاختبار الشامل أظهر إخفاقين (صفحة الأدوات + الحارس). السبب الجذري بالدليل: `sqlite+aiosqlite:///:memory:` مع connection pool — عند فتح اتصال ثانٍ تحت الحمل تظهر قاعدة فارغة («no such table: rate_limit_entries/scheduled_posts» أول ظهور 13:57:49 في سجل uvicorn). **ليست علّة كود** — الحل: تشغيل خادم E2E على SQLite ملفية → 25/25 بصفر سجلات. (بيئة اختبار فقط؛ الإنتاج Neon).

### 4.3 إصلاحات إنتاجية إضافية من هذه الجلسة (قبل الخطة)

| المشكلة | الإصلاح | الدليل الحي |
|---|---|---|
| 4 نشرات واجهة Vercel فاشلة صامتة (منذ `3742f811`) | `@playwright/test` لم يُصرّح قط في package.json — أُعيد إنتاج الفشل في غرفة نظيفة ثم أُصلح | النشرات الأربعة success + توكنز اللهب حية على bot |
| `<Analytics />` يطلب سكربتًا 404 (ضجيج console لكل زائر) | حُذف المكوّن + التبعية (Web Analytics غير مفعل في المشروع وAPI تفعيله غير متاح) — SpeedInsights بقي (200 حيًا) | «no page/console errors» في 9/9 |
| `DEBUG=true` في بيئة Vercel | DEBUG=false عبر Vercel CLI/API + إعادة نشر | healthz: `env: production` |
| اختبار `test_config_env_fallbacks` غير حتمي (يعتمد على .env محيط) | يضبط القيم بنفسه (monkeypatch) | يمر في استنساخ نظيف بلا .env |

---

## القسم 5 — خريطة الأدلة

| الأثر | الموقع |
|---|---|
| لقطات البوابة البصرية + جدول التوكنز الحي | `download/parity-gate1/` |
| سكربت تدفقات API الحية (31 فحصًا) | `scripts/live_flow_test.py` |
| سكربت رحلة UI الحية (9 فحوص) | `scripts/live_ui_flow.js` |
| سكربت البوابة البصرية | `scripts/gate1_visual.js` + `gate1b_dash.js` |
| التوثيق المحدّث | `docs/design-system.md` (§2 معاد كتابته) |

## ما ينتظر المالك (خارج نطاق الوكيل)

1. **بيانات التواصل الحقيقية** للدعم — من واجهة الأدمن أو متغيرات Vercel (`SUPPORT_EMAIL/SUPPORT_PHONE/SUPPORT_WHATSAPP/SUPPORT_WORKING_HOURS`).
2. **تفاصيل الحساب البنكي** للدفع — من واجهة الأدمن (مفاتيح `bank_transfer_*`)؛ أرقام المحافظ تعمل حاليًا بالافتراضات المشتركة مع Smart-Menu (0942119637 ليبيانا / 0910089975 مدار).
3. حذف التوكنات (GitHub/Vercel) التي مرّت عبر المحادثة.
