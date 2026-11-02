import { describe, it, expect } from "vitest"
import { ApiError } from "@/lib/csrf-client"
import { isTenantSuspended } from "@/lib/tenant-suspended"

/* W2-BOT-4 (P42-2، تدقيق 3a) — عقد مصنِّف إيقاف المنظمة.
 *
 * العائلة الكاملة لـ403 يجب أن تنفصل نظيفًا:
 *   - إيقاف المنظمة (auth.py:115) → suspended=true (الحالة الصادقة في
 *     بوابة الجلسة، لا حلقة دخول ولا «أعد المحاولة» المضلِّلة).
 *   - بوابة خطة (تنتهي بـ«رقِّ خطتك» — عقد _plan_gates.py) → false
 *     (لها رحلتها الخاصة في التحليلات).
 *   - صلاحيات غير كافية / مسؤول منصة → false (خطأ حقيقي بإعادة محاولة).
 *   - 401/5xx/شبكة → false (رحلة الدخول العالمية كما كانت). */
describe("isTenantSuspended — عائلة الـ403 تنفصل نظيفًا", () => {
  it("رسالة الإيقاف الحرفية (auth.py:115) → true", () => {
    expect(
      isTenantSuspended(
        new ApiError(403, { detail: "حساب المنظمة موقوف أو محذوف — تواصل مع الدعم" }),
      ),
    ).toBe(true)
  })

  it("بوابة الخطة (تنتهي بـ«رقِّ خطتك») → false — لها رحلتها الخاصة", () => {
    expect(
      isTenantSuspended(new ApiError(403, { detail: "هذه الميزة تتطلب باقة أعلى — رقِّ خطتك" })),
    ).toBe(false)
  })

  it("صلاحيات غير كافية → false", () => {
    expect(isTenantSuspended(new ApiError(403, { detail: "صلاحيات غير كافية" }))).toBe(false)
  })

  it("مسؤول المنصة فقط → false", () => {
    expect(
      isTenantSuspended(new ApiError(403, { detail: "هذه العملية تتطلب صلاحيات مسؤول المنصة" })),
    ).toBe(false)
  })

  it("401 انتهاء الجلسة → false (رحلة الدخول العالمية)", () => {
    expect(isTenantSuspended(new ApiError(401, { detail: "انتهت الجلسة" }))).toBe(false)
  })

  it("خطأ شبكة/خادم عام → false", () => {
    expect(isTenantSuspended(new ApiError(503, { detail: "تعذر الاتصال" }))).toBe(false)
    expect(isTenantSuspended(new Error("network"))).toBe(false)
    expect(isTenantSuspended(null)).toBe(false)
  })
})
