# v17-E-F11 — لوحة التحكم الرئيسية (DASHBOARD-HOME) — تسليم

**Task ID:** v17-E-F11 · **الوكيل:** E-F11 · **النطاق:** `fb_dashboard/frontend` (5 ملفات ملكية حصرية) · **التاريخ:** 2026-09-10
**المصادر:** خطة v17 §E-F11 (بنود 1-3) · D6-9 (بطاقة صحة البوت) · D9 (عدّاد عربي) · D2-P2 (توحيد count-up)
**الوضع:** منفَّذ كاملًا — 3/3 بنود · جراحي (صفر إعادة كتابة) · لا وكلاء فرعيين.

---

## 0) ملفات الملكية الممسوسة (لا شيء خارجها)

| الملف | الحالة | البنود |
|---|---|---|
| `src/app/dashboard/page.tsx` | معدَّل | T1، T2 |
| `src/components/shared/KpiCard.tsx` | معدَّل | T3 |
| `src/components/landing/sections/StatsSection.tsx` | معدَّل | T3 |
| `src/hooks/useCountUp.ts` | **جديد** (101 سطرًا) | T3 |
| `src/hooks/useCountUp.test.tsx` | **جديد** (139 سطرًا) | T3 |

تحقق: `git status --short` على مسارات الملكية → 3 M + 2 ?? فقط؛ البقية تعديلات وكلاء متوازيين في ملفات غير ملكية (لم تُمس).

---

## 1) البنود المنفَّذة (كود + دليل file:line)

### T1 — بطاقة صحة البوت «فحص فوري» (D6-9) ✅

- **قراءة العقد أولًا (كما أمرت الخطة):** `rg "bot-check|health/bot|alerts" fb_dashboard/routers/` → **الـendpoint موجود وصالح**: `routers/health_alerts_routes.py:47` `GET /api/health/bot-check` (يتطلب جلسة `get_current_user`، غلاف `ok()` Track-A). شكل `data`: `{status: "ok"|"warning", running: bool, fan_count: number|null, replies_last_hour: int, rule_count: int, issues: [{type, severity: "warning"|"critical", message}], alerts_count}` — الرسائل عربية جاهزة من الخادم (مثل «توكن الصفحة غير صالح أو منتهي — أعد الربط من صفحة «الصفحات»»). لم يُلجأ إلى بديل `/api/alerts` ولم يُخترع شيء.
- **البطاقة:** `page.tsx:145-244` — `BotHealthCard` داخل ملف الصفحة (يبقى ضمن الملكية):
  - **زر «فحص فوري»** (`page.tsx:238`) — `refetch()` مع `loading={isFetching}` (عجلة الزر + تعطيل)؛ لا polling لأن الفحص حيّ (يضرب `get_page_fan_count` على فيسبوك) — `staleTime: 60_000`.
  - **آخر حالة/تنبيه** — سطر حالة واحد يمرّ بـ`countPhrase` (ردود آخر ساعة عند السلامة: «يعمل بشكل طبيعي · 5 ردود خلال الساعة الأخيرة»)، أو أول `issue` + `· ومشكلتان أخريان` للبقية، مع «البوت غير مشغّل حالياً» إن كان `running=false`.
  - **«آخر فحص»** (`page.tsx:235`) — `timeAgo(dataUpdatedAt)` من react-query (ختم آخر نجاح؛ الخادم لا يعيد وقت الفحص).
  - **المرآة البصرية لـCronHeartbeatCard** (رصد في `src/components/shared/CronHeartbeatCard.tsx` — تستخدمه admin:187): نفس البنية (بلاطة أيقونة 9×9 + عنوان + سطر حالة `truncate` + حافة ملونة بالشدة)؛ الأيقونات `CheckCircle2/AlertTriangle` نفسها؛ أضفت حالة وسطى `warning` (بلاطة `bg-warning/10` + `border-warning/40`) غير موجودة في مرآة الكرون (صفر/خطر فقط) لأن العقد يفرّق warning عن critical.
- **العقود:** `apiFetch` + `unwrapApi<BotCheckData>` (نمط الصفحة نفسه: `page.tsx:148`) · `brandedToast` على نتيجة الزر (نمط زر «اختبار الاتصال» في connect/page.tsx:104): فشل → `error`، مشكلة critical/بوت متوقف → `error` مع رسالة الخادم، تحذير → `warning`، سليم → `success` («البوت يعمل بشكل طبيعي») · العربية حصرًا · **حالات البطاقة الثلاث**: سكلتون مطابق لشكل البطاقة (`page.tsx:173-185`)، بطاقة خطأ بإعادة محاولة (نمط `ErrorState` مقصوصًا على البطاقة: `page.tsx:188-207`)، والنجاح أعلاه.
- **الموضع:** أعلى الصفحة تحت الترويسة مباشرة (`page.tsx:292-296`) — نفس موضع بطاقة الكرون في admin (ترويسة ثم بطاقة الحقيقة ثم المحتوى).

### T2 — «N غير مقروءة» عبر countPhrase (D9) ✅

- `page.tsx:308` — كانت `subtitle={`${toArabicNumber(n)} غير مقروءة`}` خامًا (خطأ نحوي عند 1: «1 غير مقروءة»). الآن: `countPhrase(n, "محادثة غير مقروءة", "محادثتان غير مقروءتان", "محادثات غير مقروءة")` → «لا محادثات غير مقروءة» / «1 محادثة غير مقروءة» / «محادثتان غير مقروءتان» / «5 محادثات غير مقروءة» / «15 محادثة غير مقروءة» (النمط المعمول به في 32 موضعًا؛ المرآة الحرفية الأقرب: notifications/page.tsx:190 «إشعار غير مقروء»). استيراد `toArabicNumber` سقط من الصفحة (لم يعد له استخدام — نظيف).

### T3 — توحيد count-up في useCountUp (D2-P2) ✅

- **النمطان قبل التوحيد (قرآهما كما أمرت الخطة):** KpiCard `AnimatedCounter` (rAF، 800ms، easeOutCubic، يعيد الـtween من القيمة المعروضة الحالية، reduced-motion → القيمة النهائية فورًا — إعادة كتابة v11-A7) · StatsSection `AnimatedNumber` (setInterval ≈30×30ms خطي، يبدأ دائمًا من 0، بوابة in-view عبر IntersectionObserver، reduced-motion منذ v14-E5 فقط).
- **الملف الجديد:** `src/hooks/useCountUp.ts` — منطق واحد: **مدة واحدة** (800ms) + **منحنى واحد** (easeOutCubic) + **قاعدة reduced-motion واحدة** (القيمة النهائية فورًا، صفر ticking) + خيار `paused` لبوابة in-view. يعيد رقمًا لا نصًا (التنسيق يبقى في `lib/format.ts` — الدرزة الواحدة v6 §A: KpiCard يعرض `toArabicNumber`، StatsSection يعرض `formatNumber` «ar-LY»). يعيد الـtween من آخر قيمة معروضة عند تغير الهدف (لا يعود للصفر — عقد KpiCard). `usePrefersReducedMotion` (توأم matchMedia الحي v11-A7) مُصدَّر من الملف نفسه لأن stagger دخول KpiCard ما زال يحتاجه — صار مشتركًا بدل نسختين.
- **الاستهلاك:** KpiCard.tsx:39 (AnimatedCounter صار 3 أسطر: hook + span) و:84 (stagger من الـhook المشترك) · StatsSection.tsx:42 (بوابة in-view محلية تمرر `paused: !inView` — بقيت في ملفها لأنها شأن العرض لا العد). تغيير سلوكي مقصود وموثق: عدّاد الصفحة الرئيسية صار 800ms easeOutCubic بدل ~900ms خطي (الخطة: «مدة/منحنى واحد»).

---

## 2) البوابات (حرفيًا كما وردت)

| البوابة | النتيجة |
|---|---|
| `npx tsc --noEmit` | ✅ صفر أخطاء (لا مخرجات) |
| `npx vitest run --silent` | ✅ Test Files **35 passed (35)** · Tests **276 passed (276)** (271 سابقًا + 5 اختبارات جديدة للـhook) |
| `npm run build` | ✅ `✓ Compiled successfully in 8.8s` · `Generating static pages using 1 worker (…43)` — `/dashboard` ما زال prerender ثابتًا |

ملاحظة تشغيل: أول محاولة build اصطدمت بقفل «Another next build process is already running» (بناء متوازٍ من وكيل آخر) — حسب البروتوكول: انتظار 60s → تلاشى القفل → البناء نجح.

## 3) اختبارات جديدة (useCountUp.test.tsx — 5)

حزام rAF قابل للضبط يدويًا (الإطارات تصطف وتُضخ بـ`pump(dt)` مع ساعة `performance.now` مزيّفة، و`cancelAnimationFrame` يزيل الإطار فعلاً كالمتصفح) + وصفة matchMedia من D8 (KpiCard.test.tsx):

1. **reduced-motion** → القيمة النهائية فورًا + الإطار المجدول قبل علم reduce **أُلغي فعلًا** (صفر إطارات معلقة).
2. **المنحنى الموحد** — عند نصف المدة: `88/100` (easeOutCubic 87.5% وليس خطيًا 50%)، والاكتمال عند 800ms بلا إطارات معلقة.
3. **إعادة tween من القيمة الحالية** — 10 مكتملة → هدف 20 → عند نصف المدة `19` (وليس 15 الخطي ولا 9 من الصفر).
4. **paused** — صفر إطارات مجدولة أثناء الإيقاف، ثم العد عند فتح البوابة (بوابة in-view للـStats).
5. **هدف صفري** — يبقى 0 بلا إطارات (حالة الإحصاءات الفارغة في الصفحة الرئيسية).

اختبارات KpiCard القائمة (11) خضراء بلا تعديل — العقد محفوظ.

---

## 4) ملاحظات للمنسّق

- **`alerts_count` في العقد = 0 ثابتًا** في الخادم (`health_alerts_routes.py:92`) — تجاهلته البطاقة عمدًا؛ إن أريد لاحقًا عدد تنبيهات BotAlert غير المحلولة يجب أن يعيدها الخادم فعليًا (ملكية خلفية، ليست لي).
- **البطاقة تُعرض دائمًا** (حتى غير المتصلين) — مشكلات عدم الربط ستظهر فيها بجانب NotConnectedCard (صدق لا تكرار: الأولى توجّه للربط، البطاقة تعرض نتيجة الفحص الحية). إن رأى المنسّق تشويشًا، تعليق البطاقة على `connected` سطر واحد (`{connected && …}`) — تركتها ظاهرة لأن «صحة البوت» تشمل أيضًا no_rules/no_replies للمستأجر الموصول حديثًا.
- موازاة: البوابات خضرت رغم تعديلات وكلاء آخرين في صفحات غير ملكية (admin/messages/…) — لا تعارض.
