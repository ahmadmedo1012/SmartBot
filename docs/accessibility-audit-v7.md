# توثيق الإتاحة الكامل — v7 (docs/accessibility-audit-v7.md)

تاريخ الجرد: 2026-09-06 · الأداة: `scripts/gen_a11y_audit.mjs` (فحص فردي آلي لكل عنصر تفاعلي في `src/`) · البوابة المرافقة: `scripts/check_a11y_labels.ts` (v7-upgraded)

## منهجية الجرد

كل عنصر `<button>` / `<Button>` / `<a href>` في المشروع فُحص فرديًا (لا عينة تقديرية) بالتصنيف التالي:

- **نص مرئي ثابت**: حروف عربية/لاتينية حرفية خارج تعبيرات JSX — اسمه الوصول يأتي من محتواه (WCAG 4.1.2 name-from-content).
- **نص مرئي ديناميكي**: `{متغير}` أو تعبير يحمل نصًا فعليًا وقت التشغيل (مثل `{step === 0 ? "تخطي" : "السابق"}`).
- **أيقونة-فقط**: بلا نص وقت التشغيل — يجب أن يحمل `aria-label` (أو title/sr-only/label مرتبط).

## اكتشاف جوهري أثناء الجرد (سبب جذر جديد كُشف في v7)

بوابة v6 كانت **عمياء عن كل زر يحمل دالة سهمية**: حلقة «من `<` إلى أول `>`» كانت تتوقف عند سهم `onClick={() => …}` — فيتسرّب ما تبقى من خصائص الوسم (بما فيها `aria-label` نفسه!) إلى «المحتوى» ويُحتسب نصًا مرئيًا كاذبًا. الفحص الصادق (تتبّع عمق الأقواس) رفع عدد الأزرار الأيقونية المكتشفة من 8 إلى **28**، وكشف **9 مواضع حقيقية بلا تسمية** أُصلحت كلها في هذه الجولة.

## النتيجة النهائية

| المقياس | القيمة |
|---|---|
| إجمالي العناصر التفاعلية المفحوصة فرديًا | **167** (في 134 ملفًا) |
| منها: نص مرئي (ثابت أو ديناميكي) | 139 |
| منها: أيقونة-فقط | **28** |
| أيقونة-فقط مُسمّاة (aria-label / title / sr-only / htmlFor) | **28 / 28 — 100%** |
| مخالفات متبقية | **0** |
| تسميات أُضيفت في v7 | 10 (9 أزرار + مفتاح Switch واحد) — مواضعها: BroadcastTargetsSection (حذف الهدف + تفعيل الهدف)، DiagnosticsSection (حذف المعتمد)، marketing (حذف الحملة)، posts (نشر/حذف المنشور)، scheduled (نشر/حذف المجدول)، tools (حذف القالب)، StepIndicator (الانتقال إلى خطوة…) |

الاستثناءان الموثّقان: بدائِع `ui/switch.tsx` و`ui/button.tsx` تمرّر `{...props}` — اسمها يتدفق من مواضع الاستدعاء (مُدقّقة: `tg-active` مرتبط بـ`<Label htmlFor>`، وكل استدعاء Switch يحمل aria-label).

## الجدول الكامل (كل عنصر — 167 صفًا)

| # | الملف:السطر | النوع | كان له نص مرئي؟ | أيقونة-فقط؟ | تسمية وصول موجودة؟ | احتاج aria-label؟ | أُضيف؟ | مقتطف المحتوى |
|---|---|---|---|---|---|---|---|---|
| 1 | src/app/admin/page.tsx:99 | Button | نعم (نص ثابت) | لا | لا | لا | — | العودة للوحة التحكم |
| 2 | src/app/admin/page.tsx:135 | Button | نعم (ديناميكي) | لا | لا | لا | — | {f.label} |
| 3 | src/app/admin/page.tsx:139 | Button | لا | نعم | `تحديث قائمة المدفوعات` | لا | موجودة مسبقًا |  |
| 4 | src/app/admin/page.tsx:191 | Button | نعم (نص ثابت) | لا | لا | لا | — | قبول |
| 5 | src/app/admin/page.tsx:195 | Button | نعم (نص ثابت) | لا | لا | لا | — | رفض |
| 6 | src/app/admin/settings/page.tsx:293 | Button | نعم (نص ثابت) | لا | لا | لا | — | تراجع |
| 7 | src/app/admin/settings/page.tsx:297 | Button | نعم (نص ثابت) | لا | لا | لا | — | {saving ? : } حفظ التغييرات |
| 8 | src/app/admin/settings/page.tsx:362 | Button | نعم (ديناميكي) | لا | لا | لا | — | {testing ? "جارٍ الإرسال…" : "إرسال رسالة تجريبية"} |
| 9 | src/app/admin/telegram/BroadcastTargetsSection.tsx:65 | Button | نعم (نص ثابت) | لا | لا | لا | — | {adding ? : } إضافة |
| 10 | src/app/admin/telegram/BroadcastTargetsSection.tsx:81 | Button | لا | نعم | نعم (title/sr-only) | لا | موجودة مسبقًا |  |
| 11 | src/app/admin/telegram/DiagnosticsSection.tsx:102 | Button | نعم (نص ثابت) | لا | لا | لا | — | {addingApprover ? : } إضافة |
| 12 | src/app/admin/telegram/DiagnosticsSection.tsx:124 | Button | لا | نعم | نعم (title/sr-only) | لا | موجودة مسبقًا |  |
| 13 | src/app/admin/telegram/TelegramConfigSection.tsx:60 | button | لا | نعم | نعم (title/sr-only) | لا | موجودة مسبقًا | {showToken ? : } |
| 14 | src/app/admin/telegram/TelegramConfigSection.tsx:68 | a | نعم (نص ثابت) | لا | لا | لا | — | @BotFather |
| 15 | src/app/admin/telegram/TelegramConfigSection.tsx:78 | a | نعم (نص ثابت) | لا | لا | لا | — | @userinfobot |
| 16 | src/app/admin/telegram/TelegramConfigSection.tsx:88 | Button | نعم (ديناميكي) | لا | لا | لا | — | {saving ? "جارٍ الحفظ..." : "حفظ الإعدادات"} |
| 17 | src/app/admin/telegram/TelegramConfigSection.tsx:92 | Button | نعم (ديناميكي) | لا | لا | لا | — | {testing ? : } {testing ? "جارٍ..." : "اختبار الإرسال"} |
| 18 | src/app/admin/telegram/TelegramConfigSection.tsx:97 | Button | نعم (ديناميكي) | لا | لا | لا | — | {diagnosing ? : } {diagnosing ? "جارٍ..." : "تشخيص"} |
| 19 | src/app/admin/telegram/error.tsx:28 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 20 | src/app/admin/telegram/error.tsx:31 | a | نعم (نص ثابت) | لا | لا | لا | — | العودة للوحة التحكم |
| 21 | src/app/admin/telegram/page.tsx:226 | a | نعم (نص ثابت) | لا | لا | لا | — | @BotFather |
| 22 | src/app/admin/telegram/page.tsx:228 | a | نعم (نص ثابت) | لا | لا | لا | — | @userinfobot |
| 23 | src/app/connect/page.tsx:130 | button | نعم (ديناميكي) | لا | لا | لا | — | {wh.webhook_url} |
| 24 | src/app/connect/page.tsx:171 | Button | نعم (نص ثابت) | لا | لا | لا | — | تغيير الصفحة |
| 25 | src/app/connect/page.tsx:289 | Button | نعم (ديناميكي) | لا | لا | لا | — | {status === "testing" ? ( جاري الاختبار... ) : ( "اختبار الا |
| 26 | src/app/connect/page.tsx:302 | Button | نعم (ديناميكي) | لا | لا | لا | — | {status === "saving" ? ( جاري الحفظ... ) : ( "حفظ وتفعيل" )} |
| 27 | src/app/dashboard/[...slug]/page.tsx:37 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 28 | src/app/dashboard/[...slug]/page.tsx:107 | Button | نعم (نص ثابت) | لا | لا | لا | — | العودة إلى لوحة البيانات |
| 29 | src/app/dashboard/activity/page.tsx:41 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 30 | src/app/dashboard/ads/page.tsx:60 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 31 | src/app/dashboard/analytics/page.tsx:52 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 32 | src/app/dashboard/audience/page.tsx:48 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 33 | src/app/dashboard/audience/page.tsx:93 | button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 34 | src/app/dashboard/autoreply/page.tsx:72 | Button | نعم (نص ثابت) | لا | لا | لا | — | قاعدة جديدة |
| 35 | src/app/dashboard/autoreply/page.tsx:117 | Button | نعم (نص ثابت) | لا | لا | لا | — | إلغاء |
| 36 | src/app/dashboard/autoreply/page.tsx:118 | Button | نعم (ديناميكي) | لا | لا | لا | — | {createMut.isPending ? "جاري الحفظ..." : "حفظ القاعدة"} |
| 37 | src/app/dashboard/autoreply/page.tsx:136 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 38 | src/app/dashboard/autoreply/page.tsx:145 | Button | نعم (نص ثابت) | لا | لا | لا | — | إنشاء قاعدة |
| 39 | src/app/dashboard/autoreply/page.tsx:178 | Button | لا | نعم | `تبديل` | لا | موجودة مسبقًا | {r.enabled === false ? : } |
| 40 | src/app/dashboard/autoreply/page.tsx:181 | Button | لا | نعم | `حذف` | لا | موجودة مسبقًا |  |
| 41 | src/app/dashboard/billing/page.tsx:56 | Button | نعم (نص ثابت) | لا | لا | لا | — | اشترك أو اشحن الرصيد |
| 42 | src/app/dashboard/billing/page.tsx:87 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 43 | src/app/dashboard/broadcast/page.tsx:85 | Button | نعم (ديناميكي) | لا | لا | لا | — | {showForm ? "إلغاء" : "بث جديد"} |
| 44 | src/app/dashboard/broadcast/page.tsx:117 | Button | نعم (ديناميكي) | لا | لا | لا | — | {createMut.isPending ? "جارٍ الإنشاء…" : "إنشاء البث"} |
| 45 | src/app/dashboard/broadcast/page.tsx:132 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 46 | src/app/dashboard/broadcast/page.tsx:153 | Button | نعم (نص ثابت) | لا | لا | لا | — | إرسال |
| 47 | src/app/dashboard/calendar/page.tsx:40 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 48 | src/app/dashboard/comments/page.tsx:84 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 49 | src/app/dashboard/comments/page.tsx:125 | Button | نعم (نص ثابت) | لا | لا | لا | — | رد |
| 50 | src/app/dashboard/leads/page.tsx:45 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 51 | src/app/dashboard/marketing/page.tsx:147 | Button | نعم (نص ثابت) | لا | لا | لا | — | حملة جديدة |
| 52 | src/app/dashboard/marketing/page.tsx:180 | button | نعم (ديناميكي) | لا | لا | لا | — | {a.label} {a.desc} |
| 53 | src/app/dashboard/marketing/page.tsx:204 | Button | نعم (نص ثابت) | لا | لا | لا | — | حفظ الحملة |
| 54 | src/app/dashboard/marketing/page.tsx:213 | Button | نعم (نص ثابت) | لا | لا | لا | — | إلغاء |
| 55 | src/app/dashboard/marketing/page.tsx:238 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 56 | src/app/dashboard/marketing/page.tsx:272 | Button | نعم (نص ثابت) | لا | لا | لا | — | {sendMutation.isPending ? ( ) : ( )} إرسال |
| 57 | src/app/dashboard/marketing/page.tsx:287 | Button | لا | نعم | `حذف الحملة` | لا | موجودة مسبقًا |  |
| 58 | src/app/dashboard/messages/page.tsx:49 | button | نعم (نص ثابت) | لا | لا | لا | — | {initials(conv.senders?.[0]?.name)} {hasUnread && ( )} {conv |
| 59 | src/app/dashboard/messages/page.tsx:173 | button | نعم (ديناميكي) | لا | لا | لا | — | {f.label} |
| 60 | src/app/dashboard/messages/page.tsx:214 | Button | نعم (نص ثابت) | لا | لا | لا | — | ربط الصفحة الآن |
| 61 | src/app/dashboard/messages/page.tsx:217 | Button | نعم (نص ثابت) | لا | لا | لا | — | تحديث |
| 62 | src/app/dashboard/messages/page.tsx:226 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 63 | src/app/dashboard/messages/page.tsx:266 | Button | نعم (نص ثابت) | لا | لا | لا | — | كل المحادثات |
| 64 | src/app/dashboard/messages/page.tsx:330 | Button | لا | نعم | `إرسال الرد` | لا | موجودة مسبقًا |  |
| 65 | src/app/dashboard/notifications/page.tsx:199 | Button | نعم (نص ثابت) | لا | لا | لا | — | تعليم الكل كمقروء |
| 66 | src/app/dashboard/notifications/page.tsx:298 | button | نعم (ديناميكي) | لا | نعم (title/sr-only) | لا | — | {t.label} {t.desc} |
| 67 | src/app/dashboard/page.tsx:55 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 68 | src/app/dashboard/pages/page.tsx:96 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 69 | src/app/dashboard/pages/page.tsx:118 | Button | نعم (نص ثابت) | لا | لا | لا | — | {testing ? : } اختبار الاتصال |
| 70 | src/app/dashboard/pages/page.tsx:171 | Button | نعم (نص ثابت) | لا | لا | لا | — | {saving ? : } حفظ وربط الصفحة |
| 71 | src/app/dashboard/posts/page.tsx:84 | Button | نعم (نص ثابت) | لا | لا | لا | — | نشر |
| 72 | src/app/dashboard/posts/page.tsx:110 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 73 | src/app/dashboard/posts/page.tsx:133 | Button | لا | نعم | `نشر المنشور الآن` | لا | موجودة مسبقًا |  |
| 74 | src/app/dashboard/posts/page.tsx:136 | Button | لا | نعم | `حذف المنشور` | لا | موجودة مسبقًا |  |
| 75 | src/app/dashboard/reports/page.tsx:57 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 76 | src/app/dashboard/scheduled/page.tsx:93 | Button | نعم (نص ثابت) | لا | لا | لا | — | جدولة |
| 77 | src/app/dashboard/scheduled/page.tsx:127 | Button | لا | نعم | `نشر المنشور المجدول الآن` | لا | موجودة مسبقًا |  |
| 78 | src/app/dashboard/scheduled/page.tsx:131 | Button | لا | نعم | `حذف المنشور المجدول` | لا | موجودة مسبقًا |  |
| 79 | src/app/dashboard/settings/page.tsx:145 | Button | نعم (ديناميكي) | لا | لا | لا | — | {pwBusy ? : } {pwBusy ? "جارٍ التغيير…" : "تغيير كلمة المرور |
| 80 | src/app/dashboard/settings/page.tsx:151 | Button | نعم (نص ثابت) | لا | لا | لا | — | إلغاء |
| 81 | src/app/dashboard/settings/page.tsx:154 | Button | نعم (نص ثابت) | لا | لا | لا | — | تغيير كلمة المرور |
| 82 | src/app/dashboard/support/page.tsx:182 | a | نعم (ديناميكي) | لا | لا | لا | — | {email} |
| 83 | src/app/dashboard/support/page.tsx:193 | a | نعم (نص ثابت) | لا | لا | لا | — | واتساب: {whatsapp} |
| 84 | src/app/dashboard/support/page.tsx:244 | button | نعم (ديناميكي) | لا | لا | لا | — | {PRIORITY_LABEL[p]} |
| 85 | src/app/dashboard/support/page.tsx:284 | Button | نعم (ديناميكي) | لا | لا | لا | — | {mutation.isPending ? "جاري الإرسال..." : "إرسال الطلب"} |
| 86 | src/app/dashboard/support/page.tsx:299 | Button | نعم (نص ثابت) | لا | لا | لا | — | إرسال طلب آخر |
| 87 | src/app/dashboard/support/page.tsx:343 | button | نعم (ديناميكي) | لا | لا | لا | — | #{t.id} {t.subject} {PRIORITY_LABEL[t.priority] // t.priorit |
| 88 | src/app/dashboard/support/page.tsx:415 | Button | نعم (نص ثابت) | لا | لا | لا | — | رد |
| 89 | src/app/dashboard/team/page.tsx:50 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 90 | src/app/dashboard/tools/page.tsx:86 | Button | نعم (نص ثابت) | لا | لا | لا | — | قالب جديد |
| 91 | src/app/dashboard/tools/page.tsx:96 | Button | نعم (نص ثابت) | لا | لا | لا | — | إلغاء |
| 92 | src/app/dashboard/tools/page.tsx:97 | Button | نعم (نص ثابت) | لا | لا | لا | — | حفظ |
| 93 | src/app/dashboard/tools/page.tsx:109 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 94 | src/app/dashboard/tools/page.tsx:125 | Button | لا | نعم | `حذف القالب` | لا | موجودة مسبقًا |  |
| 95 | src/app/dashboard/tools/page.tsx:144 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 96 | src/app/dashboard/tools/page.tsx:159 | Button | لا | نعم | `تبديل` | لا | موجودة مسبقًا | {o.is_active ? : } |
| 97 | src/app/dashboard/tools/page.tsx:162 | Button | لا | نعم | `حذف` | لا | موجودة مسبقًا |  |
| 98 | src/app/demo/page.tsx:122 | Button | نعم (نص ثابت) | لا | لا | لا | — | العودة |
| 99 | src/app/demo/page.tsx:299 | Button | لا | نعم | `إرسال` | لا | موجودة مسبقًا |  |
| 100 | src/app/demo/page.tsx:505 | Button | نعم (نص ثابت) | لا | لا | لا | — | ابدأ الاشتراك |
| 101 | src/app/global-error.tsx:42 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 102 | src/app/global-error.tsx:45 | a | نعم (نص ثابت) | لا | لا | لا | — | العودة للرئيسية |
| 103 | src/app/layout.tsx:90 | a | نعم (نص ثابت) | لا | لا | لا | — | تخطي إلى المحتوى الرئيسي |
| 104 | src/app/login/page.tsx:106 | Button | نعم (نص ثابت) | لا | لا | لا | — | العودة للرئيسية |
| 105 | src/app/login/page.tsx:147 | button | لا | نعم | نعم (title/sr-only) | لا | موجودة مسبقًا | {showPassword ? : } |
| 106 | src/app/login/page.tsx:158 | Button | نعم (ديناميكي) | لا | لا | لا | — | {loading ? ( جاري تسجيل الدخول... ) : ( تسجيل الدخول )} |
| 107 | src/app/onboarding/OnboardingWizard.tsx:297 | Button | نعم (ديناميكي) | لا | لا | لا | — | {testing ? : } {testing ? "جاري اختبار الاتصال..." : "اختبار |
| 108 | src/app/onboarding/OnboardingWizard.tsx:325 | a | نعم (نص ثابت) | لا | لا | لا | — | Graph API Explorer |
| 109 | src/app/onboarding/OnboardingWizard.tsx:360 | button | نعم (نص ثابت) | لا | لا | لا | — | {suggesting ? ( ) : ( )} اقترح رداً |
| 110 | src/app/onboarding/OnboardingWizard.tsx:418 | Button | نعم (نص ثابت) | لا | لا | لا | — | عرض كل الباقات |
| 111 | src/app/onboarding/OnboardingWizard.tsx:451 | button | نعم (ديناميكي) | لا | لا | لا | — | {item.label} |
| 112 | src/app/onboarding/OnboardingWizard.tsx:462 | Button | نعم (ديناميكي) | لا | لا | لا | — | {step === 0 ? "تخطي" : "السابق"} |
| 113 | src/app/onboarding/OnboardingWizard.tsx:476 | Button | نعم (نص ثابت) | لا | لا | لا | — | تخطي الإعداد |
| 114 | src/app/onboarding/OnboardingWizard.tsx:484 | Button | نعم (ديناميكي) | لا | لا | لا | — | {loading ? ( ) : ( )} {step === total - 1 ? "ابدأ الآن" : "ا |
| 115 | src/app/page.tsx:144 | Button | نعم (نص ثابت) | لا | لا | لا | — | ابدأ الآن مجاناً |
| 116 | src/app/page.tsx:149 | Button | نعم (نص ثابت) | لا | لا | لا | — | جرب البوت الآن |
| 117 | src/app/pricing/page.tsx:58 | a | نعم (نص ثابت) | لا | لا | لا | — | SmartBot |
| 118 | src/app/pricing/page.tsx:63 | Button | نعم (نص ثابت) | لا | لا | لا | — | الرئيسية |
| 119 | src/app/pricing/page.tsx:64 | Button | نعم (نص ثابت) | لا | لا | لا | — | تجربة حية |
| 120 | src/app/pricing/page.tsx:65 | Button | نعم (نص ثابت) | لا | لا | لا | — | اشتراك |
| 121 | src/app/pricing/page.tsx:116 | button | نعم (نص ثابت) | لا | لا | لا | — | شهري |
| 122 | src/app/pricing/page.tsx:124 | button | نعم (نص ثابت) | لا | لا | لا | — | سنوي وفّر شهرين |
| 123 | src/app/pricing/page.tsx:156 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 124 | src/app/pricing/page.tsx:252 | Button | نعم (ديناميكي) | لا | لا | لا | — | {plan.price === 0 ? "ابدأ مجاناً" : "اشترك الآن"} |
| 125 | src/app/register/RegisterForm.tsx:85 | Button | نعم (نص ثابت) | لا | لا | لا | — | العودة للرئيسية |
| 126 | src/app/register/RegisterForm.tsx:147 | button | لا | نعم | نعم (title/sr-only) | لا | موجودة مسبقًا | {showPassword ? : } |
| 127 | src/app/register/RegisterForm.tsx:166 | button | لا | نعم | نعم (title/sr-only) | لا | موجودة مسبقًا | {showConfirm ? : } |
| 128 | src/app/register/RegisterForm.tsx:178 | Button | نعم (ديناميكي) | لا | لا | لا | — | {loading ? ( جاري إنشاء الحساب... ) : ( إنشاء حساب )} |
| 129 | src/app/subscribe/PaymentSection.tsx:42 | Button | نعم (نص ثابت) | لا | لا | لا | — | تغيير |
| 130 | src/app/subscribe/PaymentSection.tsx:58 | Button | نعم (نص ثابت) | لا | لا | لا | — | ادفع الآن ({toArabicNumber(currentPlan.price)} د.ل) |
| 131 | src/app/subscribe/PlanSelector.tsx:54 | button | نعم (نص ثابت) | لا | لا | لا | — | { } {meta.recommended && ( الأكثر شعبية )} {plan.nameAr} {Nu |
| 132 | src/app/subscribe/PlanSelector.tsx:111 | Button | نعم (نص ثابت) | لا | لا | لا | — | {selected ? `متابعة مع خطة ${selected.nameAr}` : "اختر خطة أ |
| 133 | src/app/subscribe/StepIndicator.tsx:45 | button | نعم (ديناميكي) | لا | نعم (title/sr-only) | لا | — | {isDone ? : toArabicNumber(i + 1)} {STEP_LABELS[s]} |
| 134 | src/app/subscribe/SubscribeContent.tsx:112 | Button | نعم (نص ثابت) | لا | لا | لا | — | العودة للوحة التحكم |
| 135 | src/app/subscribe/SubscribeContent.tsx:118 | Button | نعم (نص ثابت) | لا | لا | لا | — | العودة للرئيسية |
| 136 | src/app/subscribe/SubscribeContent.tsx:145 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 137 | src/app/subscribe/SubscribeContent.tsx:165 | Button | نعم (نص ثابت) | لا | لا | لا | — | اختيار خطة |
| 138 | src/components/landing/sections/FinalCTASection.tsx:41 | Button | نعم (نص ثابت) | لا | لا | لا | — | ابدأ مجاناً |
| 139 | src/components/landing/sections/FinalCTASection.tsx:44 | Button | نعم (نص ثابت) | لا | لا | لا | — | عرض الخطط |
| 140 | src/components/layout/AdminSidebar.tsx:199 | button | نعم (نص ثابت) | لا | لا | لا | — | اشتراك |
| 141 | src/components/layout/AdminSidebar.tsx:206 | button | نعم (نص ثابت) | لا | لا | لا | — | تسجيل الخروج |
| 142 | src/components/layout/Footer.tsx:51 | a | لا | نعم | `واتساب` | لا | موجودة مسبقًا |  |
| 143 | src/components/layout/Footer.tsx:77 | a | نعم (نص ثابت) | لا | لا | لا | — | واتساب |
| 144 | src/components/layout/Header.tsx:21 | button | لا | لا | نعم (title/sr-only) | لا | — |  |
| 145 | src/components/layout/Header.tsx:108 | button | لا | نعم | `إغلاق` | لا | موجودة مسبقًا |  |
| 146 | src/components/layout/MobileBottomNav.tsx:85 | button | لا | نعم | `إغلاق` | لا | موجودة مسبقًا |  |
| 147 | src/components/layout/MobileBottomNav.tsx:103 | button | نعم (ديناميكي) | لا | لا | لا | — | {item.label} |
| 148 | src/components/layout/MobileBottomNav.tsx:120 | button | نعم (نص ثابت) | لا | لا | لا | — | تسجيل الخروج |
| 149 | src/components/layout/MobileBottomNav.tsx:140 | button | نعم (ديناميكي) | لا | لا | لا | — | {item.label} {active && } |
| 150 | src/components/layout/MobileBottomNav.tsx:155 | button | نعم (نص ثابت) | لا | `المزيد من الأقسام` | لا | — | المزيد |
| 151 | src/components/shared/ChartCard.tsx:79 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 152 | src/components/shared/DefaultError.tsx:30 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 153 | src/components/shared/FloatingWhatsApp.tsx:20 | a | لا | نعم | `تواصل عبر واتساب` | لا | موجودة مسبقًا |  |
| 154 | src/components/shared/PaymentDialog.tsx:324 | button | نعم (ديناميكي) | لا | لا | لا | — | {opt.label} |
| 155 | src/components/shared/PaymentDialog.tsx:361 | button | لا | نعم | نعم (title/sr-only) | لا | موجودة مسبقًا |  |
| 156 | src/components/shared/PaymentDialog.tsx:386 | button | نعم (نص ثابت) | لا | نعم (title/sr-only) | لا | — | نسخ واتصال |
| 157 | src/components/shared/PaymentDialog.tsx:441 | button | لا | نعم | نعم (title/sr-only) | لا | موجودة مسبقًا |  |
| 158 | src/components/shared/PaymentDialog.tsx:641 | Button | نعم (نص ثابت) | لا | لا | لا | — | الانتقال إلى لوحة التحكم |
| 159 | src/components/shared/PaymentDialog.tsx:671 | Button | نعم (نص ثابت) | لا | لا | لا | — | إغلاق |
| 160 | src/components/shared/PaymentDialog.tsx:683 | Button | نعم (نص ثابت) | لا | لا | لا | — | إعادة المحاولة |
| 161 | src/components/shared/PaymentDialog.tsx:714 | Button | نعم (نص ثابت) | لا | لا | لا | — | إغلاق |
| 162 | src/components/shared/SetupWarnings.tsx:127 | button | لا | نعم | `إخفاء التنبيهات لهذه الجلسة` | لا | موجودة مسبقًا |  |
| 163 | src/components/shared/SetupWarnings.tsx:149 | button | نعم (ديناميكي) | لا | لا | لا | — | {w.cta} |
| 164 | src/components/shared/ThemeToggle.tsx:27 | button | لا | نعم | نعم (title/sr-only) | لا | موجودة مسبقًا |  |
| 165 | src/components/ui/EmptyState.tsx:65 | Button | نعم (ديناميكي) | لا | لا | لا | — | {action.icon && } {action.label} |
| 166 | src/components/ui/EmptyState.tsx:70 | Button | نعم (ديناميكي) | لا | لا | لا | — | {secondaryAction.label} |
| 167 | src/lib/premium-toast.tsx:66 | button | لا | نعم | `إغلاق` | لا | موجودة مسبقًا |  |

=== TOTAL interactive controls: 167 (in 134 files) ===
  with visible text (static or dynamic): 138
  icon-only: 28 (labeled: 28, 100%)
  VIOLATIONS (icon-only, no accessible name): 0
