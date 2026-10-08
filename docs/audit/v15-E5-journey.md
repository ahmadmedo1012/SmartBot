# تقرير E5 — رحلات الواجهة الأمامية (جولة v15)

**الحالة:** مكتمل — وثّقه المنسّق من تحقق التكامل (رسالة الوكيل انتهت بمهلة بعد إنجاز العمل). أصلح المنسّق 3 عيوب في الاختبارات نفسها (لا في التنفيذ).

## ما نُفّذ

| المهمة | الإسناد | الاختبار |
|---|---|---|
| **C-FREE1:** رحلة الخطة المجانية — خطوة تفعيل مجانية مخصصة (بلا طرق دفع/إيصال) → POST /api/subscriptions بـ0 د.ل + إشعار موافقة «الباقة: مجاني» + رسائل انتظار/نجاح عربية | `src/components/shared/payment/index.tsx` | PaymentFreePlan.test.tsx |
| **D4-H1:** skip المعالج عبر fetch واعٍ بـCSRF | `src/components/auth/AuthGuard.tsx` + csrf-client | AuthGuard.test.tsx |
| **D4-H3:** 401 عالمية في المغلف المركزي — توجيه /login?redirect=<الحالي> + حواجز حلقات + نافذة 10s لدمج انفجار الاستعلامات المتوازية + قائمة استثناء دلالية (401 الدخول/التسجيل/كلمة المرور = خطأ محلي لا انتهاء جلسة) | `src/lib/csrf-client.ts` + `src/lib/api.ts` | ApiGlobal401.test.ts |
| **D4-H2:** رمز تليجرام — dirty state: القناع لا يُرسل أبداً | `TelegramConfigSection.tsx` | TelegramSettingsToken.test.tsx |
| **D4-H5:** الأنماط الميتة !res.ok → رسائل detail العربية الحقيقية | `settings/page.tsx` + 3 أخرى | SettingsChangePassword.test.tsx |
| **D4-H4:** تشخيص تليجرام صادق (dry-run فشل = عرض فشل + مطابقة أسماء FE/BE) | `DiagnosticsSection.tsx` | ضمن TelegramSettingsToken |
| **D5-H2:** ترويسة نافذة الدفع AA | payment/index.tsx | check_contrast |

## إصلاحات المنسّق للاختبارات (عيوب اختبارية لا تنفيذية)
1. PaymentFreePlan: `getByText` متعدد المطابقات (h2 + زر) → `getByRole("heading")`
2. SettingsChangePassword: النجاح يغلق النموذج (unmount) —改为 التحقق من الإغلاق ثم إعادة الفتح والتحقق من التفريغ
3. TelegramSettingsToken: regex `/يعمل بشكل صحيح$/` يطابق رسالة الفشل أيضاً → مرساة بادئة النجاح

## البوابات (تحقق المنسّق)
- `npx vitest run src/test/` → **56/56 green**
- `npx tsc --noEmit` → **0 أخطاء**

## الأثر
- قناة التسجيل الأولى (المجانية) فتحت — كانت مسدودة كلياً
- 22 صفحة لوحة تعالج انتهاء الجلسة بتوجيه عربي صادق بدل حلقات «فشل التحميل»
