/**
 * P21-W5-C1 — عقود تمييز 403 بوابة الخطة (analytics/plan-lock.ts).
 *
 * الخلفية (تقرير W5-A1): كانت الصفحة تعامل أي 403 كقفل Premium،
 * فإيقاف المنظمة كان يظهر كدعوة ترقية. الدالة المستخرجة تقرأ الواجهة
 * العائلية الموثقة «رقِّ خطتك» (GATE_MESSAGES الخمس + سابقة التسلسلات)
 * — وهنا نثبّت العقد من الجهتين: كل رسائل العائلة تُقبل، وكل 403
 * خارج العائلة (إيقاف المنظمة، صلاحيات غير كافية) وغير-403 يُرفض.
 * (رسائل GATE_MESSAGES منسوخة حرفيًا من fb_dashboard/_plan_gates.py —
 * مصدر الحقيقة الخادمي؛ حدّث هذا الملف إذا تغيّرت العائلة.)
 */
import { describe, expect, it } from "vitest"

import { ApiError } from "@/lib/csrf-client"
import { isPlanLocked } from "@/app/dashboard/analytics/plan-lock"

/** GATE_MESSAGES — حرفيًا من fb_dashboard/_plan_gates.py (العائلة). */
const GATE_FAMILY = [
  "جدولة المنشورات متاحة في خطة مميز أو أعلى — رقِّ خطتك",
  "تقارير PDF متاحة في خطة أساسي أو أعلى — رقِّ خطتك",
  "العروض الترويجية متاحة في خطة مميز أو أعلى — رقِّ خطتك",
  "التحليلات المتقدمة متاحة في خطة مميز أو أعلى — رقِّ خطتك",
  "التدفقات متاحة في خطة مميز أو أعلى — رقِّ خطتك",
]

describe("isPlanLocked — عائلة بوابات الخطة (P21-W5-C1)", () => {
  it.each(GATE_FAMILY)("رسالة البوابة «%s» تُقرّ قفلًا", (message) => {
    expect(isPlanLocked(new ApiError(403, { detail: message }))).toBe(true)
  })

  it("إيقاف المنظمة (auth.py:115) ليس قفل خطة — رسالة الإيقاف يجب أن تبقى خطأً حقيقيًا", () => {
    expect(
      isPlanLocked(new ApiError(403, { detail: "حساب المنظمة موقوف أو محذوف — تواصل مع الدعم" })),
    ).toBe(false)
  })

  it("«صلاحيات غير كافية» (auth.py:126) ليست قفل خطة", () => {
    expect(isPlanLocked(new ApiError(403, { detail: "صلاحيات غير كافية" }))).toBe(false)
  })

  it("403 بلا detail عربي (fallback البنية) ليس قفل خطة", () => {
    expect(isPlanLocked(new ApiError(403, { error: "forbidden" }))).toBe(false)
  })

  it("رسالة بوابة بلا اللاحقة العائلية لا تُقبل (حماية من التساهل)", () => {
    expect(isPlanLocked(new ApiError(403, { detail: "متاحة في خطة أعلى" }))).toBe(false)
  })

  it("500 وخطأ الشبكة وأي قيمة غير ApiError ليست قفل خطة", () => {
    expect(isPlanLocked(new ApiError(500, { detail: "خطأ خادم" }))).toBe(false)
    expect(isPlanLocked(new TypeError("fetch failed"))).toBe(false)
    expect(isPlanLocked(undefined)).toBe(false)
    expect(isPlanLocked(null)).toBe(false)
  })
})
