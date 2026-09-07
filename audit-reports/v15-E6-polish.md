# تقرير v15-E6 — صقل الواجهة: تباين ودلالات وإصدار Sentry

**الوكيل:** E6 (FRONTEND-POLISH) · **الأساس:** main @ 558623b3 (شجرة عمل جولة v15) · **التاريخ:** 2026-09-08
**النطاق:** `fb_dashboard/frontend/` — الملكية الصارمة حصراً: login/page.tsx · register/RegisterForm.tsx · dashboard/messages/page.tsx · dashboard/notifications/page.tsx · ui/badge.tsx · lib/sentry-config.ts · next.config.ts + ملفات قائمة D5 غير المملوكة لE5 (autoreply · tools · support · comments · onboarding/OnboardingWizard · admin/page.tsx · team · FinalCTASection) + sentry-config.test.ts (اختبار وحدتي).
**المنهج:** تنفيذ حرفي لمهام الخطة §E6 السبع على قائمة D5/D14 — كل قياس تباين أعيد حسابه فعلياً (hsl→sRGB→WCAG) لا نقلاً عن التقرير، وآلية إصدار Sentry أُثبتت بدليل بناء حي (.next).

---

## 1) ما نُفّذ (مهمة بمهمة)

### المهمة 1 — D5-H1 + D5-H5: زوجا /80 في مساري المصادقة (4 أسطر)
| الموضع | قبل | بعد | القياس (أعيد حسابه) |
|---|---|---|---|
| login:178 (زر العودة) | `text-muted-foreground/80` | `text-muted-foreground` | 3.89→**5.59:1** داكن / 4.08→**6.54:1** فاتح |
| RegisterForm:134 (زر العودة) | `text-muted-foreground/80` | `text-muted-foreground` | نفس الزوج أعلاه |
| login:263 (رابط «إنشاء حساب») | `text-accent-foreground/80` | `text-accent-foreground` | 3.76→**5.41:1** داكن / 4.53→**6.47:1** فاتح |
| RegisterForm:263 (رابط «تسجيل الدخول») | `text-accent-foreground/80` | `text-accent-foreground` | نفس الزوج أعلاه |

- حذف `hover:text-accent-foreground` المرافق للرابطين (صار تكراراً للون الأساسي نفسه — لا تغيير بصري).
- تعليق قياس مضمّن عند كل موضع (نمط v14-E4 الموثق في السطر المجاور نفسه).

### المهمة 2 — D5-H3: أفاتار المحادثات (messages:60)
`hsl(hash, 55%, 45%)` → **`hsl(hash, 45%, 32%)`** (حل «غمّق الخلفية»):
- **القياس الشامل (كل الـ360 درجة لوناً، أبيض 14px عريض):** الأسوأ درجة 60 = **4.75:1** (كانت 2.26:1) · أفضل درجة 240 = 12.02:1 · عينات: 0→9.61 · 90→5.25 · 120→5.59 · 200→7.07 · 300→8.71.
- **لماذا ليس توكناً ثابتاً (سُئل في المهمة «توكن إن أمكن»):** التدرّج التوكني المقترح في D5 (accent-foreground/…) مع `text-white` يقيس **3.77:1 داكن** — فشل نص عادي؛ والهوية اللونية لكل محادثة هي قصد التصميم (تمييز المرسل بصرياً). تثبيت الإضاءة عند 32% يحقق AA لكل تدرج ممكن مع إبقاء الهوية — وهو الخيار الأول في تقرير D5 نفسه. القيمة حسابية مضمّنة (لا لون جديد بالمعنى الدلالي — نفس الخلفية بأرضية WCAG آمنة) وموثقة بالتعليق مع الأرقام.
- `ring-2 ring-card` أبقي كما هو (فصل الأفاتار عن السطح في الوضعين).

### المهمة 3 — D5-H4: الإشعارات المقروءة (notifications:268)
- `n.read ? "opacity-70 border-border/40" : …` → **`n.read ? "border-border/40" : …`** — إزالة تعتيم الحاوية كلها؛ التمييز يبقى بالحدّ الهادئ + بئر الأيقونة `bg-muted` + نقطة غير المقروء. النص (muted-foreground للمتن) عاد من 3.20:1 إلى 5.59/6.54:1.
- **امتداد موثّق لنفس الفئة في نفس الملف/الصفحة:** بطاقات مفاتيح التنبيه عند `off` (السطر ~335) كانت تحمل `opacity-70` نفسه وتُسقط وصف muted إلى 3.20:1 — أزيلتها أيضاً (التمييز محفوظ: حدّ هادئ + `bg-muted` للأيقونة + موضع المفتاح). حالة `isPending && opacity-60` (عابرة ~1 ثانية مع pointer-events-none) أُبقيت كما هي — ليست من قائمة D5.

### المهمة 4 — دفعة D5-M (دلالة الحالة + bidi) — قائمة D5 كاملة
| الإيجاد | الموضع | التغيير |
|---|---|---|
| **M2** aria-pressed | autoreply:193 | `aria-pressed={r.enabled !== false}` + `aria-label={`تبديل حالة قاعدة ${r.name}`}` (ReplyRule.name موجود في types.ts) |
| **M2** تسمية الحذف | autoreply:196 | `aria-label={`حذف قاعدة ${r.name}`}` (كان «حذف») |
| **M2** aria-pressed | tools:168 | `aria-pressed={!!o.is_active}` + `aria-label={`تبديل حالة العرض ${o.title}`}` |
| **M2** تسمية الحذف | tools:171 | `aria-label={`حذف العرض ${o.title}`}` (كان «حذف») |
| **M3** الكشف | support:413-414 + 440 | `aria-expanded={openTicketId === t.id}` + `aria-controls={`ticket-thread-${t.id}`}` + `id` مطابق على خيط التذكرة |
| **M7** dir="auto" | comments:121 | نص التعليق `c.message` (from_name كان معزولاً أصلاً) |
| **M7** dir="auto" | messages:348 | متن الفقاعة `msg.message` |
| **M7** dir="auto" | OnboardingWizard:409 | `testResult.page_name` داخل منطقة aria-live — أُعيدت صياغة الجملة إلى JSX Fragment سليم (`<span dir="auto">`) بدل سلسلة نصية ملتصقة؛ يصلح عرض «undefined» الكامن عند غياب page_name (نوعه `page_name?: string`) |
| **M7** dir="auto" | admin:262 | `p.username` في جدول المدفوعات |
| **M7** dir="auto" | team:71 | `m.email` |
| **L10 (من دفعة D5 الدلالية E-D5-4)** | autoreply:192 | `group-focus-visible:opacity-100` — إظهار أزرار الإجراءات لمستخدمي لوحة المفاتيح (كان hover-only؛ نفس السطر الذي عدّلته لM2) |

ملاحظة حدود: tools:129 (`حذف القالب`) أبقيته — D5 صنّف صيغة «اسم الفعل + نوع الكائن» هذه كصحيحة (قياساً على posts:143)، وقائمة D5 لم تشمله.

### المهمة 5 — D14-H2: إصدار الواجهة الحقيقي (الإصلاح الحاسم)
**الجذر (كما شخّصه D14):** أمر البناء يمرر `SENTRY_RELEASE=$r NEXT_PUBLIC_SENTRY_RELEASE=$r` (r = git rev-parse --short HEAD) — لكن متغيرات بيئة زمن البناء **لا تُحفظ في بيئة تشغيل serverless** → `src/instrumentation.ts:37` يقرأ runtime-env فارغاً → 100% من أحداث الواجهة بلا release (والإصدار `541b7585` المزعوم في v14 غير موجود في Sentry أصلاً).

**الحل (في ملكيّيَ الحرفيَين فقط — instrumentation.ts لم يُمسّ):**
1. **`src/lib/sentry-config.ts`** — دالة نقية واحدة كمصدر حقيقة: `resolveSentryRelease(env)`:
   `NEXT_PUBLIC_SENTRY_RELEASE → SENTRY_RELEASE (تمرير حرفي بعد trim) → VERCEL_GIT_COMMIT_SHA.slice(0,7) → undefined` — قصّ SHA المنصة إلى اصطلاح `git rev-parse --short`، والوسوم المسماة تُمرَّر كما هي بلا تشويه.
2. **`next.config.ts`** — بوابة `env`: القيمة المحسوبة تُخبز **حرفياً داخل الحزمتين عند البناء** — كل مرجع `process.env.SENTRY_RELEASE` / `process.env.NEXT_PUBLIC_SENTRY_RELEASE` (instrumentation.ts + instrumentation-client.ts) يُستبدل بالقيمة الحرفية لهذا البناء بعينه. سلوك مطابق في محلي (`npm run build` يمرر r) وعلى Vercel (البنية نفسها + VERCEL_GIT_COMMIT_SHA fallback يغطي حتى `next build` مجرداً).
3. **اختبارات وحدة (sentry-config.test.ts):** 3 حالات جديدة تثبّت السلسلة كاملة (تمرير حرفي/أولوية NEXT_PUBLIC/عدم تشويه الوسوم المسماة · قصّ SHA/كسب على الفراغات · undefined عند غياب أي مصدر).

**الدليل الحي (بناء فعلي على شجرة العمل، r=558623b3):**
```
.next/server/chunks/_0mb8oow._.js   : …,release:"558623b3",tracesSampleRate:…        ← SSR (كانت قراءة runtime)
.next/server/chunks/*.js            : c.getSentryRelease=function(a){return"558623b3"}
.next/static/chunks/3713ie57wb6se.js: …NEXT_PUBLIC_SENTRY_ENVIRONMENT…,release:"558623b3" ← client init
```
الأحداث SSR والعميل سترتبط الآن بإصدار SHA الفعلي لكل نشر. **مقايضة موثقة:** ضبط SENTRY_RELEASE من لوحة Vercel وقت التشغيل لم يعد يتغلب على القيمة المخبوزة — وهذا هو المراد (الإصدار == الالتزام الذي شُحن). الكناري الأمامي المُتحكَّم به (اقتراح D14) للمنسّق عند النشر.

### المهمة 6 — D5-L7 + D5-M6(النصف غير المملوك لE5)
- **badge.tsx:** حذف المتغيرات الميتة `gold`/`saffron`/`gradient` (تحقق grep شامل src/e2e: صفر مستهلكين؛ المتغيرات الحية: default/secondary/destructive/outline/ghost/link/success/warning/danger/info/orange فقط) + توثيق في تعليق التصدير. ملاحظة: `orange` ثبت موته أيضاً بفحصي لكن D5 لم يذكره — أُبقي تحفظاً على حدود القائمة (قرار للمنسّق).
- **FinalCTASection.tsx:59** (D5-M6 الأول): `text-muted-foreground/60` → التوكن الكامل (2.62:1 → 5.59/6.54:1 في الوضعين). **M6 الثاني (DiagnosticsSection:121) ملك E5 ولم أقربه** (E5 عدّل الملف في موجهته أصلاً).

---

## 2) البوابات (كلها خضراء)

| البوابة | النتيجة |
|---|---|
| `npx tsc --noEmit` | **0 أخطاء** (أصلحت مشكلة weak-type بين ProcessEnv والنوع الجديد بتوقيع فهرسة) |
| `node ../../scripts/check_contrast.mjs` (cwd=frontend، بنمط gate_all.sh:164) | **PASS** — كل الأزواج الأساسية ≥4.5:1 في الوضعين (28/28 AA ✓) |
| `node ../../scripts/gen_a11y_audit.mjs` | **exit 0** — 178 عنصراً تفاعلياً، icon-only 29/29 مسماة (100%)، **0 انتهاكات** |
| `node ../../scripts/check_a11y_labels.ts` (بوابة CI المحافظة، إضافية) | **PASS** — 0 عناصر أيقونية بلا اسم (160 ملفاً) |
| `npx vitest run` على ملفاتي (RegisterForm · OnboardingWizard · sentry-config) | **35/35 ✓** |
| `npm run build` | **نجح** — وأُستخدم كدليل إثبات لآلية D14-H2 (انظر أعلاه) |

## 3) تعارضات وملاحظات للمنسّق

1. **اختبارات E5 حمراء (ليست لي):** `PaymentFreePlan.test.tsx` · `SettingsChangePassword.test.tsx` · `TelegramSettingsToken.test.tsx` — ثلاثتها في ملفات/اختبارات E5 (payment/index.tsx · settings · telegram). شغّلتها على شجرة فيها تغييراتي فقط في مناطق أخرى وأثبتت ملفاتي (35/35)؛ الفشل سابق لتغييراتي وموقعه ملكية E5 — **يُحسم مع E5**.
2. **admin/page.tsx ملف مشترك مع E5:** تعديلاتي (dir=auto على خلية المستخدم:260-262) في منطقة مختلفة تماماً عن منطقة E5 (handleAction:105-120) — لا تداخل أسطر؛ diff الملف يحمل تغييرَي الوكيلين معاً بلا صراع.
3. **امتدادات موثقة فوق قائمة D5 (كلها داخل ملكيتي):** (أ) opacity-70 الثانية في notifications (بطاقات toggle-off — نفس الفئة/الملف/الصفحة) · (ب) `group-focus-visible:opacity-100` في autoreply (L10 — من الدفعة الدلالية D5 E-D5-4 نفسها «M2+M3+L10») · (ج) FinalCTASection /60 (M6-الأول). الثلاثة قابلة للإلغاء سطراً واحداً إن رأيت خلاف ذلك.
4. **`npm run build` شغّلته للتحقق فقط** (إثبات خبز الإصدار في .next) — البناء النهائي عندك كما في الخطة.
5. **سطر واحد خارج جولتي بقي كما هو عمداً:** PlanSelector.tsx فيه `from-muted-foreground/60 to-muted-foreground/80` — لكنه **خلفية تدرّج لأيقونة** (ليس نصاً) وليس في قائمة D5 ولا ملكيتي — أُبلّغ هنا فقط.
6. **D5-M1 (connect أخطاء صامتة) وD5-M5/L9 (نماذج الدفع) لم تُسنَد لي في مهامي** (M1 خارج دفعة M المحددة لي؛ M5/L9 ملك E5) — متروكة لقرارك.
7. الحسابات الخمسة الكاملة للتباين أعيد إجراؤها من الصفر (oklch/hsl→sRGB→WCAG) وتطابقت أرقام تقرير D5 — لا نقل أعمى.

## 4) الحصيلة

- **7/7 مهام** الخطة §E6 نُفّذت + 3 امتدادات موثقة داخل الملكية.
- 16 ملفاً عدّلت (15 ملكية خالصة + admin مشترك بمنطقة منفصلة).
- D5 في v15: **H1+H3+H4+H5 مغلقة** · M2+M3+M7 مغلقة · M6(نصف) · L7 مغلقة · L10(سطر autoreply).
- D14-H2: مغلق بكود + اختبار + **دليل بناء حي** — أحداث الواجهة ستحمل إصدار SHA الفعلي من أول نشر بعد الدفع.
