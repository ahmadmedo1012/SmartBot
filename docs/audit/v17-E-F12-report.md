# v17-E-F12 — اقتراح الرد الذكي (AI-SUGGEST) — تسليم

**Task ID:** v17-E-F12 · **الوكيل:** وكيل تنفيذ واجهة · **النطاق:** `fb_dashboard/frontend` (ملكية حصرية: `src/app/dashboard/comments/page.tsx` + مجلد `src/components/ai/` الجديد) · **التاريخ:** 2026-09-10
**المصادر:** خطة v17 §E-F12 (بنود 1-3) · D6 بند 6 «زر اقترح ردًا بالذكاء الاصطناعي» (D6:524) · عقد `fb_dashboard/routers/ai.py` مقروءًا كاملًا قبل أي سطر كود
**الوضع:** منفَّذ كاملًا — 3/3 بنود · جراحي · لا وكلاء فرعيين · لا dependency جديدة.

---

## 0) ملفات الملكية الممسوسة (لا شيء خارجها)

| الملف | الحالة | البنود |
|---|---|---|
| `src/app/dashboard/comments/page.tsx` | معدَّل (+113/-4) | 1، 2، 3 |
| `src/components/ai/AiSuggestDialog.tsx` | **جديد** (155 سطرًا — المجلد أُنشئ بأمر المهمة) | 1، 3 |
| `src/components/ai/AiSuggestDialog.test.tsx` | **جديد** (131 سطرًا، 8 اختبارات) | 3 |
| `src/app/dashboard/comments/page.test.tsx` | **جديد** (277 سطرًا، 5 اختبارات) | 1، 2، 3 |

تحقق: `git status --short` على مسارات الملكية → 1 M + `src/components/ai/` جديد + اختبار صفحة داخل مجلد الملكية نفسه. تعديلات وكلاء متوازيين أخرى في ملفات غير ملكية لم تُمس (موازاة بلا تعارض — البوابات خضرت رغمها).

---

## 1) عقد الـAPI كما قرئته فعلًا (routers/ai.py)

- **`POST /api/ai/suggest`** (ai.py:22-39): جسم **Form وليس JSON** — `comment_text` (مطلوب) + `commenter_name` + `page_context` (اختياريان). الاستجابة `ok({suggestions: string[1..3], intent, sentiment, confidence, latency_ms})`. عند غياب المفاتيح: **HTTP 400 بعربية جاهزة** «AI غير مفعل — قم بتعيين OPENAI_API_KEY أو GEMINI_API_KEY في المتغيرات» (ai.py:32) → `apiFetch` يرميها `ApiError` برسالة عربية تصل الـdialog كما هي. يتحقق الخادم نفسه من المفاتيح عبر `refresh_ai_from_db()` كل نداء.
- **`GET /api/ai/status`** (ai.py:96-102): `ok({available, provider})` — موجود، فاستُخدم لبند الجاهزية.
- (المسارات الأخرى بالملف — analyze/generate-reply/analyze-image/agent/* — خارج نطاق المهمة، لم تُستهلك.)
- الخلفية: `ai_service.suggest_replies` يعيد دائمًا 1-3 اقتراحات (fallback محلي عند فشل المزوّد) — والواجهة لا تثق بذلك: تصفية دفاعية لغير-النصي/الفارغ + حالة «لم يصل أي اقتراح» الصادقة.

## 2) البنود المنفَّذة (كود + دليل file:line)

### بند 1 — زر «اقترح ردًا» → POST → dialog → «إدراج» ✅

- **الزر:** `comments/page.tsx:226-247` — بجانب صندوق الرد في صف التعليق (داخل كتلة `!c.reply_text` — لا معنى للاقتراح بعد الرد)، `variant="outline" size="sm"` بأيقونة **Sparkles** (المطلوب حرفيًا؛ السابقة المنزلية: onboarding:508) `aria-hidden` + **aria-label عربي وصفي**: «اقترح ردًا بالذكاء الاصطناعي على تعليق فلان». الصف صار `flex flex-wrap` + `min-w-[10rem]` للحقل — على الجوال يلتف الزران تحت الحقل بدل الخنق.
- **الطلب:** `suggestMut` (`page.tsx:63-75`) — `useMutation` بنمط `replyMut` المنزلي نفسه: `apiFetch("POST /api/ai/suggest", { body: new URLSearchParams({ comment_text: c.message, commenter_name: c.from_name, page_context: c.post_message }) })` ← **الـForm الفعلي للعقد** (إرسال JSON كان سيرمي 422)، والغلاف يُفك بـ`unwrapApi<AiSuggestResult>` (dec-envelope-prune v13-L3). `page_context` يُغذّى من `post_message` — سياق المنشور الوحيد المتاح واجهةً.
- **الـdialog:** `src/components/ai/AiSuggestDialog.tsx` — **عرضيّ صرف** يستقبل حالة الـmutation كخصائص (لا يملك fetch)؛ بهذا يتشارك زر الصف والـdialog حالة loading نفسها. مبني بالكامل على `dialog.tsx` المشترك (base-ui): `Dialog/DialogContent/DialogTitle/DialogDescription` — **الإغلاق بEscape وزر الإغلاق مجاني من الطبقة المشتركة** (مثبتان باختبار). المحتوى: اقتباس التعليق المصدر `dir="auto"` + رقاقات «النية/النبرة» (Badge info/outline) + قائمة 1-3 اقتراحات، كل واحد بزر **«إدراج»** (TextCursorInput) ينادي `onInsert(النص الحرفي)`.
- **«إدراج» يملأ المسودة:** `handleInsert` (`page.tsx:92-103`) — يكتب في `replyText[target.id]` فقط (نمط مسودة الرد لكل صف الموجود بالصفحة أصلًا؛ لا تسريب للصفوف الأخرى — مثبت باختبار صفّين)، يغلق الـdialog، توست نجاح `brandedToast.success("أُدرج الاقتراح في مسودة الرد", "عدّله كما تريد ثم أرسله")`، ثم **يعيد التركيز لحقل رد الصف نفسه** برصد `requestAnimationFrame` (نمط focusStepTitle v16-E3 — لا سقوط على `<body>` بعد إغلاق الطبقة). أضفت `id={`reply-input-${c.id}`}` للحقل (`page.tsx:201`).

### بند 2 — فحص الجاهزية (GET /api/ai/status) ✅

- `aiStatus` query عند أول تحميل الصفحة (`page.tsx:47-56`): `staleTime: 60s` · `retry: 1` · `refetchOnWindowFocus: false`.
- **الحالة الصادقة عند `available:false` قاطعة** (`aiUnavailable`، `page.tsx:57`): الزر يكتسب `title="الذكاء الاصطناعي غير مفعّل — فعّله من إعدادات المنصة"` + لون نص `text-muted-foreground` (hint مصمم)، والنقر يعرض **توست warning المصمم** `brandedToast.warning("الذكاء الاصطناعي غير مفعّل", "فعّله من إعدادات المنصة")` — **ولا يُطلق أي POST ولا dialog** (لا زر ميّت: الزر يشرح نفسه؛ لا خطأ صامت: كل مسار له ردّ فعل مرئي — مثبت باختبار يؤكد 0 نداء).
- **فشل فحص الجاهزية نفسه ≠ «غير مفعّل»** (صدق): الزر يبقى فعّالًا والـPOST يعرض خطأه العربي الخاص من الخادم إن تعذّر.

### بند 3 — الحالات ✅

- **أثناء الاقتراح:** زر الصف `loading` (خاصية Button المنزلية: سبينر + disabled) والنص يتبدل «جارٍ الاقتراح…» (`page.tsx:229,244-246`)، والـdialog يعرض شريط `role="status"` + Loader2 سبينر «جارٍ توليد الاقتراحات…» (`AiSuggestDialog.tsx:98-106`) — مثبت باختبار وعدٍ مؤجل.
- **الخطأ عربي:** 400 الخادم يمرّ حرفيًا في `role="alert"` داخل الـdialog (`AiSuggestDialog.tsx:107-116`) + زر «إعادة المحاولة» يعيد الـPOST لنفس التعليق (مثبت: نداء ثانٍ ينجح).
- **إغلاق dialog بEscape/زر الإغلاق:** من `dialog.tsx` المشترك — مثبتان باختبار (base-ui ينادي `onOpenChange(false, event)`).
- **reduced-motion:** صفر حركة JS في الميزة؛ كل الحركة CSS صرفة (`animate-spin` + انتقالات الطبقة المشتركة) يحيّدها الـoverride العالمي في globals.css — لا مساس مطلوب.

## 3) البوابات (حرفيًا كما وردت)

| البوابة | النتيجة |
|---|---|
| `npx tsc --noEmit` | ✅ صفر أخطاء (خروج 0، لا مخرجات) |
| `npx vitest run --silent` | ✅ Test Files **37 passed (37)** · Tests **289 passed (289)** (276 سابقًا + **13 جديدة**: 8 للـdialog + 5 للتكامل صفحةً) |
| `npm run build` | ✅ `✓ Compiled successfully in 8.9s` · `Generating static pages using 1 worker (…43/43)` — `/dashboard/comments` ما زال prerender ثابتًا |

بوابة إضافية اختيارية (نمط الجولات السابقة): `node scripts/check_a11y_labels.ts` من جذر المستودع بـcwd=frontend → **PASS، صفر مخالفة (175 ملفًا)**.

## 4) الاختبارات الجديدة (13)

**AiSuggestDialog.test.tsx (8)** — العقد العرضي: pending (سبينر، لا قائمة) · اقتراحات + رقاقات النية/النبرة + «إدراج» يبث النص الحرفي · تصفية دفاعية لغير-النصي/الفارغ · خطأ عربي في role=alert + إعادة محاولة · حالة «لم يصل أي اقتراح» الصادقة + إعادة محاولة · زر الإغلاق → onOpenChange(false) · **Escape → onOpenChange(false)** (base-ui).
*(ملاحظة تعاقدية: base-ui يمرر تفاصيل الحدث وسيطًا ثانيًا لـonOpenChange — التأكيد `toHaveBeenCalledWith(false, expect.anything())`.)*

**comments/page.test.tsx (5)** — التكامل على السلك: بواب الجاهزية (توست warning + **0 نداء POST** + لا dialog + title صادق) · عقد Form الحرفي (`comment_text/commenter_name/page_context` بـURLSearchParams مقابل POST واحد) · pending (زر disabled + «جارٍ الاقتراح…» + سبينر الـdialog عبر وعد مؤجل) · «إدراج» يملأ **صف الهدف فقط** (صفّان، لا تسريب) + إغلاق + توست + إعادة تركيز الحقل · خطأ 400 عربي حرفي + إعادة محاولة تستعيد.

حزمة المحاكاة: نمط MessagesPage.test المنزلي (QueryClientProvider + جاسوس premium-toast + stub fetch موجِّه بالمسار).

## 5) ملاحظات للمنسّق

- **الإدراج يعمل فقط على مسودة الرد** (لا يرسل الرد آليًا) — المستخدم يراجع/يعدّل ثم يضغط «رد» الموجود: مسار المال (v9-B5) محفوظ.
- **الحوار يُفتح لكل تعليق غير مُردود عليه فقط** — بعد الرد يختفي الصف كله (سلوك الصفحة الأصلي)، فلا اقتراح لما لا يمكن ردّه.
- كون الخادم يعيد fallback محليًا عند تعطل المزوّد (بلا علم الواجهة) يجعل اقتراحات «AI» أحيانًا جاهزةً محليًا — إن أُريد تمييز مصدر الاقتراح (ai/fallback) فعلى الخادم إرجاعه (ملكية خلفية؛ العقد الحالي لا يشمله).
- **مفتاح `["ai-status"]` في cache الـreact-query مشترك** — أي صفحة مستقبلية تستعلم بالمفتاح نفسه ستشارك النتيجة 60s (توفير نداءات) دون تعارض.
- D6 كان يذكر «(ai/status موجود للفحص)» — استُخدم فعلًا لا زر ميت.
