# تقرير v17-D11 — منهجية gstack: ما لم يُستورد بعد وينفع جولة v17 (UX/تأثيرات/أيقونات/شكل/وظائف كاملة)

**الوكيل:** D11 (مراجعة منهجية gstack) · **التاريخ:** 2026-09-10 · **الطبيعة:** READ-ONLY — لا كود طُبِّق.
**ما قُرئ:** gstack (README, AGENTS, ETHOS, DESIGN, BROWSER, CLAUDE, ARCHITECTURE) + design-review/SKILL.md (1898 سطرًا كاملة) + review/design-checklist.md + lib/design-catalog.ts (740) + bin/gstack-design-detect.ts (بنية) + design/src/{check,diff,variants,compare}.ts + benchmark/SKILL.md + qa/SKILL.md + qa/sections/qa-patterns.md + ios-design-review/SKILL.md (الأبعاد العشرة) + plan-design-review/sections/review-sections.md + design-shotgun/doctrine + docs/SLOP_SCAN.md + scripts/{jargon-list,capture-baseline,one-way-doors}.ts + agents/ وautoplan/ وbenchmark/.
**مقارنة مع:** SmartBot scripts/ كلها (slop_scan, round_metrics, check_careful, gate_all, check_contrast, gen_a11y_audit, check_a11y_labels) + frontend/e2e (visual-regression, viewport-sweep, v9-dashboard-shot, sim p01–p14, axe/a11y sweeps) + docs/design-system.md.

---

## 0) قاعدة الاستبعاد — ما استُورد فعلًا (لا يُعاد اقتراحه)

| ما استُورد | الأصل gstack | الدليل في SmartBot |
|---|---|---|
| slop-scan **للكود** (حراس مزدوجة/ابتلاع/فك مركزي — تشخيصي exit 0) | docs/SLOP_SCAN.md + scripts/slop-diff.ts | scripts/slop_scan.py (بوابة 1.5) |
| careful-mode | careful/SKILL.md | check_careful.sh + .githooks |
| round-metrics JSONL | retro/metrics | round_metrics.py + docs/evidence/round-metrics.jsonl |
| مرور canary (console مقابل baseline) | canary/SKILL.md | قسم P في بطاريات post-deploy + baseline-console.json |
| بصمة الأدلة + بوابة الجاهزية | evidence + readiness-gate | gate-run.json + gate §6 |
| شخصيات QA (14) + بطارية sim | qa/SKILL.md | sim-p01..p14 |
| سجل القرارات المؤجلة + الأسرار (NFKC) + معايرة الثقة/الاقتباس الحافز | TODOS/redact/review-army | decisions-ledger.md + secret_scan.py + قاعدة (confidence: N/10) |

**وأُجِّل صراحةً في v15-D11 §4:** «`ios-qa/`, `ios-fix/`, `make-pdf/`, `design-*` — نطاقات لا تمس منتج Next.js/FastAPI». **هذا التأجيل انتهت صلاحيته:** جولة v17 هي حرفيًا نطاق عائلة `design-*`. هذا التقرير يعيد فتح ما أُغلق بحجة نطاق خاطئ.

---

## 1) إجابات أسئلة المهمة الأربعة (بالأدلة)

**أ) فحص UX البصري / مراجعات تصميم / checklist جودة واجهة — هل لدى gstack؟**
نعم، وأقوى ما في المستودع لهذه الجولة تحديدًا:
- `design-review/SKILL.md`: منهجية 11 مرحلة كاملة — انطباع أول مسرود بضمير المتكلم (سطور 1026-1036)، **استخراج النظام المصيَّر من الصفحة الحية** عبر `getComputedStyle` (خطوط/ألوان/سلّم العناوين/أهداف اللمس <44px — سطور 1044-1066)، تدقيق **10 فئات ≈80 بندًا** (سطور 1165-1311)، اختبار الجذع بأسئلة 6 (1152-1163)، مراجعة تدفق التفاعل + **خزان النوايا 70/100** بجدول خصم/إضافة رقمي (1349-1382)، درجات **A-F بأوزان فئات** (1433-1462)، وضع انحدار بملف `design-baseline.json` + دلتا لكل فئة ولقواعد الكاشف (1464-1471)، حلقة إصلاح: **التزام ذرّي لكل إصلاح + لقطات قبل/بعد + revert عند الانحدار + توقف ذاتي كل 5 إصلاحات (مخاطر >20%) + سقف 30** (1703-1807)، وقواعد تصميم صلبة بمصنِّف سطح (PERSUADE/OPERATE/READ/EXPERIENCE) + 7 فحوص محكّ + «الانعكاسات التي لا يمسكها كاشف» (1500-1583).
- `review/design-checklist.md`: نسخة grep-able خفيفة بـ27 بند slop + طبقات ثقة HIGH/MEDIUM/LOW + تصنيف AUTO-FIX/ASK + **قاعدة المعايرة: الأنماط المباركة في DESIGN.md لا تُعلَّم** (سطر 27).
- `ios-design-review/SKILL.md` (سطور 418-448): قالب الأبعاد العشرة بتقييم 0-10 مع «ما الذي يرفعها إلى 10» — قابل للاستخدام كما هو للمتصفح باستبدال مراجع HIG.
- `plan-design-review/sections/review-sections.md`: 7 مسارات لتصميم الخطة نفسها — أبرزها **جدول تغطية حالات التفاعل LOADING/EMPTY/ERROR/SUCCESS/PARTIAL لكل ميزة** (سطور 52-57) ولوحة الرحلة العاطفية (65-69) ومواصفة responsive/44px لكل مقاس (192-194).

**ب) لقطات مرجعية (visual regression) — ماذا يملك كل طرف؟**
- gstack: لقطات استجابة **375/768/1440 لكل صفحة** (design-review Phase 3، سطور 1092-1105) + لقطات diff **بعد كل فعل** في تدفق (Phase 4) + أساس درجات بصرية JSON للمقارنة بين الجولات.
- SmartBot: `visual-regression.mjs` — **7 صفحات عامة فقط، سطح مكتب 1440×900 فقط، تحميل ساكن فقط** (التعليق في الملف نفسه: «the dashboard funnel needs cookies»)، و`viewport-sweep.mjs` يفحص overflow فقط بلا لقطات. صفر أساس مرجعي لـ22 صفحة dashboard التي ستتغير كلها في v17.

**ج) سكربتات قياس؟**
- `benchmark/SKILL.md` (Phase 3: TTFB/FCP/LCP/DOM/نقل/حزم من `performance.getEntries()`؛ عتبات انحدار نسبية: >50% أو >500ms = REGRESSION، حزمة >25% = REGRESSION؛ اتجاه عبر الزمن). SmartBot تغطي الحزمة (بوابة 4.6) وLighthouse كسجل v6 وثائقي — **LCP/CLS غير مقيسان في أي بوابة**.
- `design/src/check.ts`: بوابة رؤية (GPT-4o) بثلاثة أسئلة (قابلية قراءة/اكتمال تخطيط/تماسك بصري → PASS/FAIL)، و`design/src/diff.ts`: فرق بصري بـ matchScore≥70 + صفر فروق high-severity.

**د) README/جودة نصوص + منع slop في الواجهة + الحالات الحدية للتفاعلات؟**
- **نصوص الواجهة:** نعم — فئة copy في الكتالوج (marketing-buzzword، theater-slop-phrase، aphoristic-cadence) + كشف happy-talk بعدّ كلمات («هذه الصفحة X كلمة، Y منها Z% ثرثرة» — checklist فئة 8، سطور 1255-1266). الأنماط إنجليزية؛ تحتاج تعريبًا قبل النقل (نصوص SmartBot عربية).
- **README/وثائق:** آليات gstack هنا خاصة به (gen-llms-txt، update-readme-throughput، أبواب make-pdf: emoji/format/diagram) — SmartBot تغطيها بمراسي DOCS في بوابة 6c. لا فجوة.
- **منع slop في الواجهة:** **نعم — غير مستورد إطلاقًا.** slop_scan.py الحالي 3 قواعد للكود الخلفي/العقود فقط؛ صفر قواعد CSS/TSX. لدى gstack: كتالوج 60+ مدخلًا + كاشف 1008 سطور (`gstack-design-detect.ts`).
- **الحالات الحدية للتفاعلات:** قواعد qa الأرقام 1-13 (نماذج فارغة/غير صالبة/حدية، **console بعد كل تفاعل**، «أعد إعادة المحاولة قبل التوثيق — قد يكون وميضًا»، عمق لا عرض) + قرينة «السعيدة فقط مصممة» (checklist فئة 9). SmartBot تغطي الشخصيات والحالات (D1) لكن بلا قاعدة إعادة-المحاولة-قبل-التوثيق في بروتوكول sim.

---

## 2) جدول المقارنة الكامل (المطلوب)

| العنصر | مصدره في gstack | هل مستورد سابقًا | القيمة لـ v17 | خطوة التنفيذ |
|---|---|---|---|---|
| **1. ماسح AI-slop للواجهة (grep)** — 27 بندًا قابلًا للكشف آليًا: transition:all، bounce-easing (bezier>1)، dark-glow، gradient-text، oversized-h1، tracking<-0.04em، outline:none، !important، tiny-text، border-left ملون، pulsing-dot، hover-scale على صور، تجميع uniform-radius،… | review/design-checklist.md (فئات 1-4) + lib/design-catalog.ts | ❌ لا (slop_scan للكود فقط) | **عالية جدًا** — موجة E ستلمس ~كل الواجهة؛ هذا هو ratchet الواجهة الذي منع «إضافة slop جديد أثناء الإصلاح» في v16 للكود | قسم D جديد في scripts/slop_scan.py (قواعد regex على fb_dashboard/frontend/src فقط) — تشخيصي exit 0 بنفس العقيدة + مفتاح `ui_slop` جديد في round_metrics.jsonl |
| **2. درجات تصميم + خط أساس انحدار** — designScore/aiSlopScore بحرف A-F، categoryGrades لـ10 فئات، findings بمعرّفات، دلتا بين الجولات | design-review/SKILL.md Phase 6 + 1464-1471 | ❌ لا | **عالية** — تقارير D1-D4 اليدوية بلا رقم مركب يتتبع؛ v18 تحتاج «هل تحسّن الشكل فعلًا؟» | المكتّب يكتب docs/evidence/design-baseline.json عند إغلاق v17 (قالب من سطور 1409-1429 معدّلًا)؛ round_metrics.py يمرره للمقارنة |
| **3. ماسح النظام المصيَّر من الصفحة الحية** — fonts/الألوان الفعلية/سلّم العناوين/أهداف <44px/أسطح متصفح غير مضمّنة (::selection، caret، scrollbar، tabular-nums) | design-review Phase 2 (1044-1066) + checklist فئة 5 بند 12 | ❌ جزئي (check_contrast يقرأ توكنات globals.css فقط — لا المصيَّر) | **عالية** — D4 أثبت فجوة «توثيق ≠ واقع» (بوابة §8 متقادمة، الاستثناءات محذوفة) | سكربت e2e/design-extract.mjs (Playwright، getComputedStyle، JSON لكل صفحة) يُقارن تلقائيًا مع design-system.md |
| **4. ترقية الانحدار البصري: 3 مقاسات × صفحات موثقة** | design-review Phase 3 (1092-1105) + qa-patterns | 🔶 جزئي (7 عامة سطح-مكتب فقط) | **عالية** — v17 تغيّر حركة/أيقونات 22 صفحة dashboard بلا أساس مرجعي واحد | توسيع PAGES في visual-regression.mjs + حلقة 375/768/1440 + storageState للمصادقة (نمط دخول v9-dashboard-shot) + إعادة --update للأساس قبل موجة E وبعدها |
| **5. بروتوكول UX: اختبار الجذع + خزان النوايا + السرد المُسمَّى** | design-review 898-982 + 1152-1163 + 1349-1382 | ❌ لا | **متوسطة–عالية** — يحوّل مراجعة UX من «تعمل؟» إلى «تشعر صحيحة؟» بأرقام؛ صفر كلفة كود | بنود إلزامية في قالب تقارير/تنفيذ D/E: أسئلة الجذع الستة لكل صفحة، جدول نوايا 70/100 لكل تدفق، وقاعدة «سمِّ العنصر وموضعه ووزنه البصري أو أنت تولّد عموميات» |
| **6. قياس أداء حي LCP/FCP/CLS بعتبات نسبية** | benchmark/SKILL.md Phase 3/5/7 | ❌ لا (مؤجل v15 §4؛ bundle gate يغطي KB فقط) | متوسطة — «الأداء كتصميم» فئة 10 من checklist؛ فئات الحركة الجديدة (D2) تُقاس بالأثر الحقيقي لا بالملفات | دمج `performance.getEntries()` في بطارية post-deploy القائمة (المرور P) بدل سكربت جديد؛ عتبات gstack حرفيًا |
| **7. فحص VLM للقطات + فرق دلالي** | design/src/check.ts (PASS/FAIL بثلاثة أسئلة) + diff.ts (matchScore) | ❌ لا | متوسطة (اختياري/مدفوع) — «عين مصمم آلية» فوق pixelmatch تفسر «ماذا تغير» لا «كم بكسلًا» | scripts/vlm_design_check.mjs عبر مهارة VLM المتاحة في البيئة — تجريبي على 5 صفحات أولًا |
| **8. قوالب تصميم الخطة (7 مسارات)** — جدول الحالات، الرحلة العاطفية، responsive لكل مقاس، القرارات غير المحسومة بـ STOP | plan-design-review/sections/review-sections.md (52-57, 65-69, 192-194) | ❌ لا | متوسطة — ترفع قالب بنود خطة v17 قبل التنفيذ | إلحاق جدول LOADING/EMPTY/ERROR/SUCCESS/PARTIAL إلزاميًا بكل بند E يمس UI + صياغة «FIX TO 10» |
| **9. سجل استثناءات التصميم المقصودة (Decisions Log)** | DESIGN.md (134-143) + قاعدة المعايرة (checklist سطر 27) | ❌ لا | متوسطة — يجعل إيجادات الكاشف «مقررة لا مفتوحة» ويغلق تناقض توثيق D4 | قسم جديد في docs/design-system.md يوثق الاستثناءات المقصودة (theme-color الموحد، z-[60]/[100]، الـrounded العارية ×22…) |
| **10. قواعد نصوص عربية مضادة للثرثرة** | فئة copy في design-catalog + happy-talk count | ❌ لا (الأنماط إنجليزية) | منخفضة–متوسطة | توسيع مستقبلي للقسم D بقائمة عبارات عربية ركيكة — بعد جولة |
| **11. درجة صحة QA الموزونة** | qa/sections/qa-patterns.md (238-273) | ❌ (الشخصيات مستوردة) | منخفضة | حساب الدرجة من مخرجات sim عند إغلاق الجولة — اختياري |
| **12. أبواب جودة الوثائق المصيَّرة (emoji/format/diagram-gate)** | make-pdf/test/e2e/*gate* | ❌ | منخفضة — SmartBot md لا pdf | لا يستحق الاستيراد |

---

## 3) أعلى 5 توصيات لجولة v17 — مرتبة بالأثر (مع خطوة ملموسة لكل واحدة)

### v17-G1 — ماسح slop للواجهة داخل slop_scan.py (S/HIGH) — «التوصية الأولى بلا منافس»
**التبرير:** جولة v17 ستنفّذ أكبر موجة تعديل واجهة في تاريخ المشروع (D1: حالات، D2: حركة، D3: أيقونات، D4: شكل، D6: صفحات جديدة كاملة). slop-scan في v16 أثبت أن رatchet تشخيصيًا يمنع موجة الإصلاح من إضافة دينًا جديدًا — لكنه أعمى عن الواجهة. gstack يملك 27 قاعدة grep-able جاهزة (confidence HIGH في معظمها) تتقاطع مع إيجادات v17 بالحرف: `transition: all` (D2: 18 صيغة transition-*)، bounce-easing، dark-glow، uniform-radius aggregation (D4: full 131/lg 90/xl 74/md 27)، outline:none بلا بديل، tiny-text. **الأقدر على الترجمة الآلية من أي شيء آخر في gstack.**
**الخطوة:** إضافة `scan_ui_rules()` إلى scripts/slop_scan.py: قواعد regex على `fb_dashboard/frontend/src` فقط (تخطي *.test.*) — مجموعة أولى من 12 قاعدة HIGH/MEDIUM من فئات 1-4 في design-checklist.md، مع **قائمة مباركة** تُقرأ من design-system.md (قاعدة المعايرة: المبارك لا يُعلَّم). مفتاح `ui_slop_findings` في round_metrics.py. عقيدة slop-scan نفسها: exit 0 دائمًا، عدّادات + بؤر + ترند. ~150 سطرًا، ساعة عمل.

### v17-G2 — خط أساس تصميم قابل للانحدار + درجات A-F (S/HIGH)
**التبرير:** الجولات تنتج تقارير D نصية غنية ثم تختفي. gstack يحوّل نفس التدقيق إلى `design-baseline.json` {designScore, aiSlopScore, categoryGrades، findings بمعرّفات مستقرة} ويقارن بين الجولات (id ظهر/اختفى هو الإشارة، الأعداد advisory). هذا يحل سؤال إغلاق v17 الذي لا جواب له اليوم: «هل تحسّن الشكل من 76% اكتمال D4 إلى رقم قابل للمقارنة؟» — ويتكامل مع round-metrics المستوردة (نفس JSONL).
**الخطوة:** عند إغلاق الجولة (أو بعد موجة E): المكتّب يشتق 10 درجات فئات من تقارير D1-D4 (الأوزان من gstack حرفيًا: hierarchy/typography/spacing 15% لكل…) + درجتا العنوان، ويكتب `docs/evidence/design-baseline.json` + سطر round-metrics بمفتاح design_score. قالب JSON من سطور 1409-1429 في design-review/SKILL.md.

### v17-G3 — استخراج النظام المصيَّر من الصفحة الحية (S–M/HIGH)
**التبرير:** بوابات SmartBot كلها **ثابتة المصدر** (تقرأ globals.css/TSX): check_contrast، token-duplication، a11y_labels. فجوة D4 المركزية كانت **«المصيَّر ≠ الموثَّق»** (بوابة §8 استثناءاتها محذوفة من الكود، to-white خارج نطاق البوابة، تناقض §5 مع globals.css). مسبار gstack (Phase 2) يقرأ الحقيقة من `getComputedStyle` في المتصفح: عدد الخطوط الفعلية، >12 لون غير رمادي، سلّم العناوين والمستويات المتخطاة، عناصر تفاعلية <44px، وأسطح المتصفح غير المضمّنة (::selection/caret/scrollbar/tabular-nums — بند يكشف «صفحة مجمَّعة لا مصمَّمة»). Playwright متوفر، والصرامة العربية (locale: ar) موجودة أصلًا في v9-dashboard-shot.
**الخطوة:** `frontend/e2e/design-extract.mjs` (~120 سطرًا): دخول موثق (نمط v9) → لكل صفحة: طباعة JSON المسبار → مقارنة آلية مع توكنات globals.css (انحراف = سطر تحذير). يُشغَّل قبل خطة E وبعدها كدليل.

### v17-G4 — أساس بصري 3×مقاس لكل الصفحات الجوهرية (S–M/HIGH)
**التبرير:** موجة E ستغيّر حركة/أيقونات/هيدرات في ~25 صفحة. الأساس المرجعي اليوم يغطي 7 صفحات عامة بمقاس واحد — أي انحدار بصري في dashboard/subscribe/onboarding (قلب مسار المال) **غير قابل للكشف**. gstack يمسح 375/768/1440 لكل صفحة + يوثّق قاعدة استقرار الحركة (انتظار تسوية الدخول — SmartBot لديه 600ms جاهزة، تُرفع مع v17 الحركات إلى fonts.ready + 900ms).
**الخطوة:** توسيع `visual-regression.mjs`: PAGES تشمل 22 صفحة dashboard عبر storageState للمصادقة + حلقة viewport الثلاثية + قاعدة `--update` الموثقة («تغيير مقصود؟ أعد التسجيل») تبقى كما هي. تشغيل مرتين: قبل E (أساس) وبعد E (بوابة سابقة للدفع). ~ساعتان.

### v17-G5 — بروتوكول UX النصي: الجذع + النوايا + «سمِّ أو اسكت» (S/MED-HIGH — صفر كود)
**التبرير:** أثمن ما في design-review ليس السكربتات بل **صقل صياغة المراجعة نفسها**: اختبار الجذع (6 أسئلة، FAIL = إيجاد HIGH مهما بدا الشكل مصقولًا)، خزان النوايا (70/100 بخصومات رقمية معلنة: إخفاء تسعير −15، عقاب تنسيق −10، جولة إجبارية −15) الذي يقيس مسار المال العربي الحالي، وقاعدة نحت السرد: «إن لم تستطع تسمية العنصر وموضعه ووزنه البصري فأنت تولّد عموميات لا تراجع». هذه القواعد تُرفع جودة كل تقارير E ومراجعات القبول فورًا.
**الخطوة:** ثلاثة بنود إلزامية في قالب تقرير/تنفيذ وكيل v17 (وثيقة بروتوكول الجولة): (1) الجذع لكل صفحة تُلمس؛ (2) جدول نوايا لكل تدفق يُراجع؛ (3) كل نقد بصري يفتتح بـ«لاحظت [عنصر محدد بموضع ووزن]». تُستخدم فورًا في مراجعة نتائج موجة E.

*(ممتد اختياري: v17-G6 — فحص VLM عبر المهارة المتاحة على 5 صفحات كتجربة مدفوعة محدودة؛ وv17-G7 — دمج LCP/CLS في بطارية post-deploy. كلاهما موثق في الجدول أعلاه.)*

---

## 4) ما لا يستحق الاستيراد في v17 (منع إهدار الجهد)

| القدرة | لماذا لا |
|---|---|
| design-consultation + design-shotgun + design-html (توليد) | توليد أنظمة/موك أب من الصفر — SmartBot لها نظام تصميم قائم وتطوره، لا تنشئه |
| المحرك البصري OpenAI في design/src (كما هو) | يعتمد مفتاح OpenAI — البديل المحلي هو مهارة VLM في البيئة (v17-G6) |
| ios-design-review (آليات الاتصال) | لا أجهزة iOS؛ **يبقى قالب الأبعاد العشرة فقط** كمصدر صياغة لدرجات G2 |
| browse/$B daemon كامل | Playwright مملوك ومشغّل؛ قيمة gstack هنا منهجية لا محرك |
| jargon-list + أبواب make-pdf | إنجليزي/PDF — لا فجوة مقابلة في SmartBot |
| health composite (G11 من v15) | مقياس جودة كود عام — v17 جولة UX؛ امتُص جوهره (الاتجاه) عبر round-metrics |
| freeze/diff-scope (G14) | لا وكلاء متوازيين بموجة E هذه الجولة على نفس الملفات كما في v15 |

---

## 5) الخلاصة التنفيذية

جرّب SmartBot من gstack على مراحل ثلاث: **تشغيل** (شخصيات/بوابات/سجل قرارات — v12/v14)، **ضمان ميكانيكي** (أدلة/ثوابت/أسرار — v15)، ثم **صدق الجولة** (slop-scan للكود/مقاييس/بصمة — v16). الطبقة الرابعة التي لم تُلمس هي **طبقة «الذوق القابل للقياس»** — عائلة design-* التي أجّلتها v15 بحجة النطاق، وجاءت v17 لتجعلها النطاق نفسه: ماسح slop للواجهة (G1)، خط أساس درجات يتتبع عبر الجولات (G2)، مسبار «المصيَّر ≠ الموثَّق» (G3)، أساس بصري متعدد المقاسات للصفحات الموثقة (G4)، وصقل صياغة المراجعة بجذع/نوايا/تسمية (G5). كلها S–M جهدًا، وكل واحدة تسد فجوة أثبتتها موجات D لهذه الجولة بالتحديد (D2: transition-*، D4: بوابة متقادمة وتناقض توثيق، D1: تدفقات بلا مراجعة إحساس، D6: صفحات جديدة ستُبنى بلا ratchet).

— نهاية تقرير D11 (v17).
