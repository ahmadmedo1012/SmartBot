# v17-S1 — ترحيل PageHeader وتوحيد الهوية البصرية (D4-P1)

> **وكيل تنفيذ واجهة (ترحيل بصري)** — Task ID: v17-S1 · التاريخ: 2026-09-09
> النطاق: `fb_dashboard/frontend/src/app/dashboard` (15 صفحة) + `app/subscribe/PaymentSection.tsx` + `docs/design-system.md` §8.
> المصدر التوجيهي: `audit-reports/v17-D4-visual.md` (§12 بنود 1/2/3/4).

---

## 0. الخلاصة

| المحور | قبل | بعد |
|---|---|---|
| صفحات dashboard على PageHeader | 7/24 (29.2% — F) | **22/24 (91.7% — A)** |
| to-white الخام في الوضع الفاتح | 1 (PaymentSection) | **0** |
| صفحات dashboard بلا سقف عرض | 16 | **3 موثقة** (messages وظيفيًا · analytics مستثناة · [...slug] عاملة 404) |
| designScore المركب | F (38.7/100) | **D (59.0/100)** — structure F→A · color B→A |
| البوابات | — | tsc ✓ · vitest 304/304 ✓ · build ✓ 43 صفحة |

---

## 1. جدول الصفحات المهاجرة (قبل → بعد)

كل صفحة: الهيدر اليدوي (`<header sticky … h1 text-sm font-bold + p text-2xs>` بحدّ صلب
`border-border` و`backdrop-blur-sm` وأيقونة عارية `text-muted-foreground`) استُبدل موضعيًا
بـ`<PageHeader icon={...} title/subtitle نفسها نصًا} compact />` (صندوق أيقونة متدرج، حد
`border-border/60`، `backdrop-blur-md`)، مع سقف عرض موحد على حاوية المحتوى:
`max-w-5xl mx-auto w-full` (نمط settings الحي). أيقونة كل صفحة = أيقونة القسم نفسها في
AdminSidebar (أو أيقونة الصفحة الأصلية وهي نفس سياق القسم).

| # | الصفحة | الأيقونة | الهيدر قبل | الهيدر بعد | actions | السقف قبل → بعد |
|---|---|---|---|---|---|---|
| 1 | leads | UserPlus | يدوي h-14 | PageHeader compact | — | بلا سقف → max-w-5xl |
| 2 | team | Users2 | يدوي h-14 | PageHeader compact | زر «عضو جديد» (نُقل إلى actions) | بلا سقف → max-w-5xl |
| 3 | billing | CreditCard | يدوي h-14 | PageHeader compact | رابط «اشترك أو اشحن الرصيد» (Link>span حرفيًا) | بلا سقف → max-w-5xl |
| 4 | activity | Activity | يدوي h-14 | PageHeader compact | — | بلا سقف → max-w-5xl |
| 5 | scheduled | Clock | يدوي h-14 | PageHeader compact | — | بلا سقف → max-w-5xl |
| 6 | ads | Target | يدوي h-14 | PageHeader compact | — | بلا سقف → max-w-5xl |
| 7 | broadcast | Radio | يدوي h-14 | PageHeader compact | زر «بث جديد» (نُقل إلى actions) | بلا سقف → max-w-5xl |
| 8 | calendar | CalendarDays | يدوي h-14 | PageHeader compact | — | بلا سقف → max-w-5xl |
| 9 | comments | MessageSquare | يدوي h-14 | PageHeader compact | — | بلا سقف → max-w-5xl |
| 10 | tools | Wrench | يدوي h-14 | PageHeader compact | — | بلا سقف → max-w-5xl |
| 11 | posts | Newspaper | يدوي h-14 | PageHeader compact | — | بلا سقف → max-w-5xl |
| 12 | reports | FileBarChart | يدوي h-14 | PageHeader compact | — | بلا سقف → max-w-5xl |
| 13 | audience | Users | يدوي h-14 | PageHeader compact | — | بلا سقف → max-w-5xl |
| 14 | support | HelpCircle | يدوي h-14 | PageHeader compact | — | بلا سقف → max-w-5xl |
| 15 | pages | FileText | يدوي h-14 | PageHeader compact | — | بلا سقف → max-w-5xl |
| + | autoreply | Bot (موجود) | PageHeader (أصلًا) | كما هو | كما هو | **بلا سقف → max-w-5xl** (بند2 فقط) |

**قرار سقف العرض (D4-بند2):** `max-w-5xl (1024px) + mx-auto` مطبَّق عبر غلاف القسم
(نفس صنف settings الحي `max-w-… mx-auto w-full` على حاوية `flex-1 overflow-y-auto p-6`).
- /dashboard الرئيسية بقيت 1220px (SectionContainer) وsettings بقيت 3xl — لم تُمس.
- **messages** تُرك بلا سقف **مقصودًا**: تخطيط master-detail ثلاثي الأعمدة (قائمة w-96 +
خيط) — سقف 1024px يخنقه؛ D4 §8 نفسه يوثّق الميزان الوظيفي.
- **analytics** مستثناة حرفيًا بأمر المهمة («حديثة») — بقيت بلا سقف ولا PageHeader (بند
  قائمة أعمال S4).
- **[...slug]** (catch-all 404) ليست صفحة محتوى — خارج النطاق.

**قواعد جراحية محفوظة:** لا تغيير بنية صفحات (استبدال كتلة الهيدر فقط + صنف على الحاوية
الواحدة) · كل النصوص العربية كما هي حرفيًا (title/subtitle منسوخة نصًا) · أزرار الهيدر
الثلاثة (team/broadcast/billing) انتقلت إلى `actions` بلا أي تغيير منطق أو نص · الحالات
الثلاثية (loading/error/empty) لم تُمس · أيقونة calendar بقيت CalendarDays (أيقونة الصفحة
الأصلية — نفس سياق تقويم AdminSidebar).

## 2. PaymentSection — إصلاح to-white (D4-بند4)

- **قبل:** `app/subscribe/PaymentSection.tsx:34` —
  `bg-gradient-to-r from-accent/80 to-white dark:from-accent/20 dark:to-card` ← بطاقة بيضاء
  خام متدرجة في الوضع الفاتح (الخرق اللوني الوحيد في النظام — D4 §6 «تتمنظر»).
- **بعد:** `bg-gradient-to-r from-accent/15 to-card dark:from-accent/20` — توكني بالكامل،
  بنفس التوصية الحرفية في D4 §12 بند 4 («to-white → to-card مع from-accent/15»).
- ملاحظة: تعليق الإصلاح صيغ بلا الليترال `to-white` حتى لا يسجل مغلوطًا في عدّادات
  `design_baseline.py`/بوابة §8 (جرّب: الطبعة الأولى للتعليق رفعت العداد وهميًا).

## 3. بوابة §8 في docs/design-system.md (D4 §12 بند 3)

أُعيدت كتابة القسم بالكامل:
- **أنماط البوابة موسّعة:** `bg-white · bg-black · text-black · text-white · fill-white ·
  to-white · from-white · via-white`.
- **بنود متقادمة حُذفت:** switch.tsx:32 (السويتش صارت `bg-background`) وdemo:57 (بلا scrim).
- **أسطر صُححت:** notifications:318→381 · MobileBottomNav:56→94.
- **fill-white ×2 أُدرجا:** FeaturesSection:51 (Zap) + pricing:205 (Crown) — فوق أسطح براندية.
- **text-white ×17:** حكم موثق (مقبولة تاريخيًا فوق أسطح براندية، والكود الجديد يفضّل
  `text-primary-foreground`) بدل ثقب الشبكة السابق.
- **PaymentSection أُدرج في «بنود أُغلقت»** كمرجع تاريخي للإصلاح.
- أمر الفحص نفسه صار `rg` (مطابق لأدلة D4 الملحقة) بدل grep القديم.

## 4. الدرجات (design_baseline.py — البوابة الرابعة)

| المقياس | قبل | بعد | الحرف |
|---|---|---|---|
| بنية (PageHeader/24) | 7/24 = 29.2 | **22/24 = 91.7** | F → **A** |
| لون (to-white/bg-white) | 1/1 = 80.0 | **0/1 = 90.0** | B → **A** |
| حقول | 40.0 | 40.0 (خارج نطاق S1) | F = |
| حركة | 25.0 | 25.0 (خارج نطاق S1) | F = |
| aiSlop | 31.0 | 31.0 (خارج نطاق S1) | F = |
| **designScore المركب** | **F (38.7)** | **D (59.0)** | **F → D** |

البنية ارتفعت من 7/24 إلى 22/24 كما طلبت البوابة («PageHeader 7/24 → أعلى»). المتبقي
بلا PageHeader: analytics (مستثناة بأمر المهمة) و[...slug] (صفحة 404).

## 5. البوابات (ناتج حرفي)

```
npx tsc --noEmit                                    → صفر أخطاء (exit 0)
npx vitest run --silent                              → Test Files 39 passed (39) · Tests 304 passed (304)
npm run build | rg Compiled|Generating|error        → ✓ Compiled successfully · Generating static pages (43)
scripts/design_baseline.py | rg PageHeader|designScore
  → designScore: D (59.0/100) · PageHeader 22/24 dashboard pages
    delta: structure F→A · color B→A · designScore F→D
```

## 6. ملاحظات للمنسّق (خارج نطاقي)

- **S4 (D4 §12 بند 7):** صفحة analytics ما زالت على الهيدر اليدوي + بلا سقف — ترحيلها
  يقفل البنية 23/24.
- **KpiCard (بند 7):** موجة KPI لـanalytics/audience/billing ترفع مقياس «الحركة» (25% →
  أعلى) — لم ألمسها (خارج بنود S1).
- **نسخ الزر المنسوخة (بند 8):** billing actions ما زال يحمل نسخة كروم الزر الحرفية
  (Link>span) — نقلتها كما هي احترامًا للقاعدة الجراحية؛ بند D4 §12-8 يعالجها موجة مستقلة.
- مواضع `p-6 space-y-*` للإيقاع الرأسي بقيت متفاوتة (3/4/6/8) عمدًا — بند D4 §8 خارج
  بنود S1 المطلوبة.

*نهاية التقرير — v17-S1 · 16 ملفًا معدلة + وثيقة واحدة · كل البوابات خضراء.*
