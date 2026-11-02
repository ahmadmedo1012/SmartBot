/**
 * SmartBot Mobile — مصنِّفا عائلة الـ403 الصادقة (P42-5a).
 *
 * التوأمان الحرفيان لمصنِّفي الويب:
 *   - isPlanLocked  ← fb_dashboard/frontend/src/app/dashboard/analytics/plan-lock.ts
 *     (P21-W5-C1)
 *   - isTenantSuspended ← fb_dashboard/frontend/src/lib/tenant-suspended.ts
 *     (W2-BOT-4)
 *
 * لماذا الآن (فجوتا التكافؤ المسجلتان في تدقيق الموجة 3):
 *   - GAP-X1: رفض بوابة الخطة كان يصل الجوال كخطأ عام عبر describeError
 *     (state-views.tsx) — بلا تصنيف ولا حالة قفل ولا باب ترقية. الويب
 *     يعرض PremiumLockCard الصادقة (W2-BOT-5: commit 3ce58c3).
 *   - GAP-BOT-1: إيقاف المنظمة كان يدور بالمستخدم الجوّال في حلقة
 *     «أعد المحاولة» المضلِّلة — كل نداء API للتاجر الموقوف يرفعه حارس
 *     الجلسة (routers/auth.py:115) بـ403، فإعادة المحاولة لا تنجح أبدًا.
 *
 * العقد (قراءة العقد العائلي الخادمي — لا مطابقة نص هشة):
 *   - عائلة بوابات الخطة (fb_dashboard/_plan_gates.py GATE_MESSAGES —
 *     الخمس كلها + سابقة v22-D4 للتسلسلات + BROADCAST_PLAN_REQUIRED_MSG
 *     بعد انضمامها للحرف العائلي في W2-BOT-5 + حد قواعد rules.py) تنتهي
 *     حصرًا بالواجهة الموثقة «رقِّ خطتك» — مثبتة بعقود الاختبار الخلفية.
 *   - رسالة الإيقاف (auth.py:115 «حساب المنظمة موقوف أو محذوف — تواصل
 *     مع الدعم») تبدأ بـ«حساب المنظمة موقوف» — نفس عائلة عقد «رقِّ خطتك».
 *   - أي 403 آخر (صلاحيات غير كافية، مسؤول منصة) يبقى خطأً حقيقيًا
 *     صادقًا بإعادة محاولة.
 *
 * فرض الخطة خادمي دائمًا — هذا الملف عرضٌ صادق فقط، لا فرضًا إطلاقًا.
 */
import { ApiError, SUSPENDED_MESSAGE_PREFIX } from '@/services/api'

/** لاحقة عائلة بوابات الخطة — نهاية كل GATE_MESSAGES حرفيًا.
 *  (انسخها من _plan_gates.py إن تغيّرت العائلة يومًا.) */
export const GATE_FAMILY_SUFFIX = 'رقِّ خطتك'

/**
 * GAP-X1 — تمييز 403 بوابة الخطة عن بقية عائلة الـ403.
 * مرآة حرفية لـisPlanLocked في analytics/plan-lock.ts (الويب).
 */
export function isPlanLocked(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403 && e.message.endsWith(GATE_FAMILY_SUFFIX)
}

/**
 * GAP-BOT-1 — تمييز إيقاف المنظمة عن بقية عائلة الـ403.
 * مرآة حرفية لـisTenantSuspended في lib/tenant-suspended.ts (الويب).
 */
export function isTenantSuspended(e: unknown): boolean {
  return e instanceof ApiError && e.status === 403 && e.message.includes(SUSPENDED_MESSAGE_PREFIX)
}

/** نص الخادم من خطأ مصنَّف (نص البوابة الحرفي للعرض الصادق) أو null. */
export function planLockedMessage(e: unknown): string | null {
  return isPlanLocked(e) ? (e as ApiError).message : null
}
