# v17-E-F10 — التحليلات المتقدمة (ADVANCED ANALYTICS) — تسليم

**Task ID:** v17-E-F10 · **الوكيل:** وكيل تنفيذ واجهة · **النطاق:** `fb_dashboard/frontend` (ملكية حصرية: `src/app/dashboard/analytics/page.tsx` + مكونات مخططات جديدة داخل `src/components/charts/`) · **التاريخ:** 2026-09-10
**المصادر:** D6 بند 8 «تحليلات متقدمة» (D6:526 — وعد Premium بلا سطح؛ endpoints جاهزة والصفحة تستهلك overview فقط) · D1 بند analytics (D1:65 — P3: بطاقات KPI تعرض «—» أثناء التحميل بدل سكلتون) · عقد `fb_dashboard/routers/analytics.py` + `fb_dashboard/analytics_engine.py` مقروءين كاملين قبل أي سطر كود.
**الوضع:** منفَّذ كاملًا — 2/2 بنود · جراحي (أقسام جديدة تحت الكل، بنية dashboard/analytics القائمة لم تُهيكَل من جديد) · لا وكلاء فرعيين · لا dependency جديدة (recharts/lucide/react-query الموجودة فقط).

---

## 0) ملفات الملكية الممسوسة (لا شيء خارجها)

| الملف | الحالة | المحتوى |
|---|---|---|
| `src/app/dashboard/analytics/page.tsx` | معدَّل (133 → 512 سطرًا: كل المحتوى الأصلي محفوظ حرفيًا + الإضافات) | D1-P3 سكلتونات KPI + D6-8 القسم الجديد كاملًا |
| `src/components/charts/TrendLineChart.tsx` | **جديد** (116 سطرًا) | مخطط خطي recharts للاتجاه اليومي |
| `src/components/charts/ActivityHeatmap.tsx` | **جديد** (131 سطرًا) | خريطة حرارية CSS grid (بلا recharts) |
| `src/components/charts/TrendLineChart.test.tsx` | **جديد** (101 سطرًا، 5 اختبارات) | عقد المخطط الخطي |
| `src/components/charts/ActivityHeatmap.test.tsx` | **جديد** (99 سطرًا، 9 اختبارات) | عقد الخريطة الحرارية |

ملفات مشتركة **لم تُلمس عن قصد**: `charts/lazy.tsx` (لا يُعدَّل — المخطط الخطي lazy محليًا داخل الصفحة بنفس عقد الملف حرفيًا)، `charts/index.tsx`، `ChartCard.tsx`، `lib/types.ts` (أنواع الـendpoints الجديدة معرَّفة محليًا داخل الصفحة — نمط billing المحلي `PlanRow`).

---

## 1) جرد الـendpoints الجاهزة فعليًا (rg "@router" routers/analytics.py)

| Endpoint | العقد كما قرئته (analytics_engine.py) | مصيره في هذه الموجة |
|---|---|---|
| `GET /api/analytics/daily-trend` | `[{date, replies}]` تصاعديًا (engine:115-127) | ✅ **مُستهلك** — مخطط خطي |
| `GET /api/analytics/hourly-heatmap` | `[{hour, day, count}]` (engine:129-145) | ✅ **مُستهلك** — heatmap CSS grid |
| `GET /api/analytics/peak-hour` | `{peak_hour: int\|null}` (engine:210-225) | ✅ **مُستهلك** — بطاقة ساعة الذروة |
| `GET /api/analytics/top-rules` | `[{rule_id, name, count, percentage}]` — النسبة من المحرك (engine:147-173) | ✅ **مُستهلك** — قائمة بحصص |
| `GET /api/analytics/period-comparison` | `{replies_before, replies_now, change_pct, period_days}` (engine:260-299) | ✅ **مُستهلك** — بطاقة مقارنة |
| `GET /api/analytics/sentiment-trend` | `[{date, positive, negative, neutral}]` (engine:175-208) | ⏸️ **جاهز ولم يُستهلك** — خارج بنود المهمة (المهمة عدّدت 4 أقسام فقط: خطي/خريطة/ذروة+قواعد/مقارنة)؛ الصفحة تعرض توزيع المشاعر من overview أصلًا — راجع §5 |
| `GET /api/analytics/top-commenters` | `[{name, count, last_comment}]` (engine:227-258) | ⏸️ **جاهز ولم يُستهلك** — خارج بنود المهمة؛ صفحة audience/reports تغطي المعلقين — راجع §5 |
| `GET /api/analytics/dashboard` | KPIs مجمعة (engine:43-113) | ⏸️ خارج البنود — البطاقات الرئيسية تستهلك overview (أثقل لكنه العقد القائم) |
| `GET /api/analytics/export` | CSV/JSON — `require_role("admin")` | خارج البنود (تصدير، ليس تحليلًا مرئيًا) |
| `POST /api/analytics/scheduler-check` | platform-admin فقط | خارج البنود (تشغيلي خلفي) |

**ملاحظة عقد الخطة (403):** لا توجد بوابة خطة على أي من هذه المسارات اليوم — `has_analytics_advanced` علم **زخرفي بلا نقطة إنفاذ** (D6 §3:443). فرع الـ403 مع ذلك منفَّذ صادقًا في الواجهة (§3) تحسبًا لأي تقييد مستقبلي؛ اليوم لا يمكن الوصول إليه من الخادم — وهذا موثَّق بصراحة هنا بدل ادعاء تقييد غير موجود.

---

## 2) بند 1 — D1-P3: سكلتونات KPI بنفس الارتفاع ✅

- `page.tsx:392-409` — أثناء `isLoading` تُعرض 4 بطاقات بنفس كروم `Card/CardContent p-4` الحقيقي، لكن بمحتويات `Skeleton` تعكس بنية البطاقة عنصرًا-بعنصر: مربع الأيقونة `size-8 rounded-lg` (مقابل `size-8` الحقيقي) + سطر القيمة `h-7 w-12` + سطر التسمية `h-3 w-16` — نمط `dashboard/page.tsx:45-63` المطلوب حرفيًا (شبكة 2/4 أعمدة نفسها، نفس p-4، CLS≈0).
- الحاوية `aria-busy={isLoading || undefined}` — إعلان تحميل لقارئ الشاشة بلا وميض عند إعادة الجلب (السكلتون على `isLoading` فقط لا `isFetching` — التعتيق يعتمد keepPreviousData من react-query فلا يهتز المحتوى الجاهز).
- علامة «—» بقيت فقط بعد التحميل لقيمة مفقودة فعلًا (`data?.fan_count ?? "—"`) — وهو استخدامها الصادق.
- حالة D1-analytics (جزئي → كامل): بقية أبعاد الصفحة كانت كاملة أصلًا (سكلتون مخطط `:430-431`، 4 EmptyStates، إعادة محاولة `:426-442`) — البعد الوحيد المفقود (KPI) أُغلق.

## 3) بند 2 — D6-8: قسم «تحليلات متقدمة» ✅

البنية (كلها داخل ملكية الصفحة، تحت كل المحتوى القائم):

### 3.1 البنية العامة

- `page.tsx:483-508` — `<section aria-labelledby="advanced-analytics-heading">` بعنوان «تحليلات متقدمة» (Sparkles) + سطر وصف، ثم 5 بطاقات ChartCard.
- **موضعه خارج فرع خطأ الـoverview** (لا داخله): كل بطاقة تدير استعلامها وحالاتها بنفسها — إن فشل استعلام واحد فقط تبقى البطاقات السليمة الأربع ظاهرة بحالتها (أمانة الحالات المستقلة التي طلبها العقد «كل قسم: حالاته الثلاث»).
- **الحركة:** دخول تلقائي عبر غلاف DashboardShell القائم — صفر framer، صفر CSS حركة جديد (كما نصّ العقد).
- **إيقاع الجلب:** كل استعلام `refetchInterval: 60000` (نفس إيقاع overview القائم بالصفحة) + `retry: 1` (سابقة billing) ليظهر الخطأ سريعًا بدل انتظار backoff ثلاثي.

### 3.2 مخطط خطي — الاتجاه اليومي (`page.tsx:107-143`)

- `TrendLineChart` جديد (`charts/TrendLineChart.tsx`): recharts `LineChart/Line` بعقد مرآة `ActivityBarChart` حرفيًا — نفس رموز الألوان (`var(--primary)/var(--muted)/var(--border)`، لا hex خام)، نفس hook `usePrefersReducedMotion` المحلي (v8-C2 — tween 600ms يوقف عند reduced-motion)، نفس sr-only summary (v8-B14)، وبطاقة tooltip عربية بنفس تصميم المنزل.
- **lazy محلي:** `page.tsx:30-37` — `next/dynamic` + `ssr:false` + سكلتون تحميل `h-44` بنفس ارتفاع المخطط — **نفس عقد `charts/lazy.tsx` حرفيًا دون لمس الملف المشترك** (خارج ملكية الموجة). قطعة recharts (~344KB) تبقى مؤجلة حتى أول render.
- بطاقة `ChartCard` (`title="الاتجاه اليومي للردود"`) تُمرر `loading/error/onRetry/empty/summary` — الحالات الثلاث + sr-only إجمالي الردود بالنافذة عبر countPhrase.

### 3.3 خريطة حرارية — النشاط بالساعة (`page.tsx:145-188` + المكون)

- `ActivityHeatmap` جديد (`charts/ActivityHeatmap.tsx`) — **CSS grid خالص بلا recharts** (بند D6-8: «heatmap بسيط grid CSS»): 7 صفوف أيام-الأسبوع × 24 عمود ساعة، خلية `aspect-square` بتشبع `color-mix(in srgb, var(--primary) X%, transparent)` (نفس أسلوب page.tsx/Header.tsx القائم — 22% حد أدنى للرؤية، تصاعد خطي حتى 100%).
- **التجميع client-side:** خلايا الباك-إند (يوم-تقويم × ساعة) تُجمع إلى (يوم-أسبوع × ساعة) بتحليل UTC (`getUTCDay` — الباك-إند يجمّع بتوقيت UTC فاليوم يبقى متطابقًا مع تجميع الخادم) — وصف البطاقة يصرّح «بتوقيت غرينتش (UTC)» صراحةً للأمانة.
- **tooltips عربية لكل خلية:** `title="الثلاثاء 14:00 — 5 ردود"` عبر countPhrase (المثنى: «ردين»).
- **اتجاه LTR للشبكة** (`dir="ltr"`): محور الساعات يقرأ يسار→يمين مثل محور recharts XAxis القائم، وأسماء الأيام العربية في عمود البداية.
- مفتاح قراءة «أقل → أكثر» + صف عناوين ساعات كل 6 ساعات (0/6/12/18) منعًا للازدحام.
- `WEEKDAY_LABELS` مُصدَّر من المكون وتُعيد الصفحة استخدامه لصياغة **summary ذي معنى** (أكثر خلية كثافة: يوم + ساعة + عدد) بدل 168 خلية صمّاء لقارئ الشاشة.

### 3.4 ساعة الذروة (`page.tsx:190-224`)

- بطاقة صغيرة من `/api/analytics/peak-hour`: الساعة الكبرى `text-5xl tabular-nums` بتنسيق `HH:00` (`padStart(2,"0")` — `peak_hour=0` منتصف الليل قيمة صالحة: المقارنة بـ`!= null` لا truthiness، والفراغ فقط عند `null`).
- الوصف يصرّح بتوقيت UTC (الأمانة الزمنية — أوقات الردود مخزنة UTC).

### 3.5 أكثر القواعد تشغيلًا (`page.tsx:226-287`)

- قائمة من `/api/analytics/top-rules?limit=10`: لكل قاعدة — الاسم `dir="auto"` (عزل bidi لأسماء المستخدم) + شريط حصة نسبةً للقاعدة الأولى (`w-28 h-1.5` بخلفية `var(--primary)` — قياس بصري للترتيب، ليس % من الإجمالي — مُعلَّق بالكود) + العدد بـcountPhrase + نسبة المحرك `percentage` بـ`toArabicNumber`.
- **tooltip عربي لكل صف** (title): «الاسم: N ردود (X% من إجمالي الردود)».
- مفتاح الصفوف `rule_id ?? name ?? i` — سابقة v9-B12 (المفاتيح الموضعية تفسد diffing عند تغيّر الترتيب).
- تداخل مُوثَّق بصراحة: الصفحة كانت تعرض «أفضل القواعد» من overview أصلًا (بقيت كما هي — جراحي)؛ بطاقة القسم الجديدة تضيف نسبة الحصة والشريط المرئي من الـendpoint المخصص المطلوب حرفيًا بالمهمة.

### 3.6 مقارنة الفترات (`page.tsx:289-385`)

- ثلاث كتل: الفترة الحالية / الفترة السابقة (countPhrase) / التغيّر (سهم ↑/↓ + `toArabicNumber(Math.abs(pct))%%` ملون success/destructive/muted).
- **أمانة صريحة:** `change_pct=0` عندما لا توجد فترة سابقة للمقارنة (`_pct_change` ترجع 0 عند previous=0) — لا تُعرض «0% بلا تغيير» كذبًا؛ بدلها: «أول فترة نشطة — لا أساس سابق للمقارنة» (`noBaseline`, page.tsx:301-303). والفراغ يظهر فقط عند صفر ردود في الفترتين معًا.

### 3.7 الحالات الثلاث لكل قسم + 403 الخطة

كل بطاقة ChartCard تتلقى:
- **سكلتون:** `loading` (سكلتون ChartCard المدمج `aria-busy` + sr-only «جارٍ التحميل»).
- **فراغ:** `empty` + emptyTitle/emptyDescription عربية موجهة («ستتلون خريطة النشاط هنا فور وصول أول ردود…»).
- **خطأ:** رسالة `ApiError` العربية من الخادم حرفيًا (fallback عربي) + **زر «إعادة المحاولة»** `onRetry={() => q.refetch()}`.
- **403 الخطة:** `isPlanLocked` (page.tsx:82 — `e instanceof ApiError && e.status === 403`) → `PremiumLockBody` (page.tsx:87-105): تاج Crown + «{الميزة} — متاحة في Premium» + شرح + زر «ترقية الخطة» → `/subscribe` (نفس مسار CTA الترقية بbilling). **اليوم غير قابل للوصول** لأن الخادم لا يقيّد هذه المسارات (§1) — موجود للأمانة المستقبلية فقط، ولا يدّعي تقييدًا قائمًا.

---

## 4) البوابات — الناتج الحرفي

```
$ cd /home/z/my-project/SmartBot/fb_dashboard/frontend
$ npx tsc --noEmit && npx vitest run --silent 2>&1 | tail -3 && npm run build 2>&1 | rg "Compiled|Generating static|error" | head -3

   Start at  10:02:01
   Duration  46.58s (transform 1.04s, setup 4.74s, import 4.67s, tests 14.70s, environment 17.30s)

✓ Compiled successfully in 4.9s
  Generating static pages using 1 worker (0/43) ...
  Generating static pages using 1 worker (10/43) ...
```

- **tsc:** صفر أخطاء (لا ناتج).
- **vitest:** 39 ملفًا / **303 اختبارات passed** (289 سابقة + **14 جديدة**: 9 heatmap + 5 خطي — ملفا الاختبار الجديدان co-located بجوار مكوناتهما داخل `src/components/charts/` ضمن الملكية).
- **build:** ✓ Compiled successfully + 43/43 صفحة ثابتة.
- بوابة إضافية اضطرارية: `python3 scripts/check_i18n_calls.py` = **PASS** (صفر استدعاء locale خارج format.ts — كل الأعداد عبر countPhrase/toArabicNumber).
- البوابات أُعيدت مرتين (تشغيل فردي للملفات الجديدة ثم السلسلة الكاملة) — لا اختبار flaky.

## 5) ما لم يُنفَّذ — بصراحة كاملة

1. **`/api/analytics/sentiment-trend`** — endpoint جاهز يعيد توزيع المشاعر يوميًا (positive/negative/neutral لكل يوم). **لم يُستهلك**: بنود المهمة عدّدت الأقسام المطلوبة (خطي/خريطة/ذروة+قواعد/مقارنة) ولم تشمله، والصفحة تعرض توزيع المشاعر الإجمالي من overview أصلًا. تنفيذه المقترح مستقبلًا: منحنيات متعددة الخطوط في نفس `TrendLineChart` أو LineChart جديد بثلاث سلاسل.
2. **`/api/analytics/top-commenters`** — جاهز ولم يُستهلك لنفس السبب (خارج البنود؛ صفحة audience تغطي المعلقين من عقد آخر). بطاقة «أكثر المعلقين» ستكون حوالي 30 سطرًا فوق البنية الجاهزة (ChartCard + قائمة countPhrase).
3. **`/api/analytics/dashboard`** — KPIs مجمعة باستعلام واحد (أخف من overview القائم). استبدال overview به قرار دفعي (backend-perf) وليس واجهيًا — خارج ملكية الواجهة.
4. **إغلاق D1-analytics كليًا** يتطلب أيضًا بند P3 المتبقي على **audience** (KPI «—» + خطأ مشتركين بلا إعادة محاولة — D1:66) — ملكية صفحة أخرى، لم تُمس.

## 6) التوصيات التالية (خارج ملكيتي)

- إن أُريد فرض وعد Premium فعليًا (D6: «has_analytics_advanced زخرفي»): بوابة خلفية على المسارات الخمسة ترمي 403 → الواجهة جاهزة أصلًا (PremiumLockBody ستظهر تلقائيًا، بلا أي تغيير واجهة).
- `analytics_engine.get_hourly_heatmap` يعيد يوم-تقويم×ساعة؛ تجميع يوم-الأسبوع يتم الآن client-side — إن كثُر حجم الخلايا (شهور طويلة) يستحق التجميع نقلة خلفية.

— نهاية تقرير v17-E-F10 —
