/**
 * v18-1-c — عقد الخطط الافتراضية (مصدر الرسم الفوري لـ /subscribe و /pricing).
 *
 * يثبّت أن DEFAULT_PLANS مرآة صادقة لبذرة الخادم (ids/أسعار/ترتيب/حرّيات
 * «غير محدود») وأن plansEqual يحقق عقد التبديل الصامت: نفس الشكل يبقي
 * مرجع المصفوفة (لا وميض)، وأي انحراف في id/سعر/ترتيب/طول يفرض التحديث.
 */
import { describe, expect, it } from "vitest"

import { DEFAULT_COMPARISON_PLANS, DEFAULT_PLANS, plansEqual } from "./default-plans"
import { toComparisonPlan } from "@/components/subscribe/plan-comparison"

describe("DEFAULT_PLANS — مرآة بذرة الخادم", () => {
  it("خمس باقات بمعرفات 1-5 مرتبة بـ sort_order", () => {
    expect(DEFAULT_PLANS).toHaveLength(5)
    expect(DEFAULT_PLANS.map((p) => p.id)).toEqual([1, 2, 3, 4, 5])
    expect(DEFAULT_PLANS.map((p) => p.sort_order)).toEqual([1, 2, 3, 4, 5])
  })

  it("أسعار الإنتاج الحية: 0 / 19 / 29 / 129 / 299", () => {
    expect(DEFAULT_PLANS.map((p) => p.price)).toEqual([0, 19, 29, 129, 299])
  })

  it("الأسماء العربية الكانونية بالترتيب", () => {
    expect(DEFAULT_PLANS.map((p) => p.name_ar)).toEqual(["مجاني", "أساسي", "مميز", "احترافي", "مؤسسي"])
  })

  it("حدود الردود مطابقة للبذرة (ومؤسسي تحمل رمز غير المحدود 999999)", () => {
    expect(DEFAULT_PLANS.map((p) => p.max_replies)).toEqual([100, 2000, 10000, 50000, 999999])
  })

  it("تُحوَّل نظيفة إلى عقد الرسم ComparisonPlan", () => {
    expect(DEFAULT_COMPARISON_PLANS).toHaveLength(5)
    expect(DEFAULT_COMPARISON_PLANS[0]).toMatchObject({ id: 1, nameAr: "مجاني", price: 0, maxReplies: 100 })
    expect(DEFAULT_COMPARISON_PLANS[4]).toMatchObject({ nameAr: "مؤسسي", price: 299, maxReplies: 999999 })
  })

  it("عدد الميزات مطابق للبذرة (4/7/10/7/6)", () => {
    expect(DEFAULT_PLANS.map((p) => (p.features ?? []).length)).toEqual([4, 7, 10, 7, 6])
  })
})

describe("plansEqual — عقد التبديل الصامت", () => {
  it("بيانات الـAPI المطابقة للبذرة = متساوية → لا إعادة رسم ولا وميض", () => {
    const apiShape = DEFAULT_PLANS.map(toComparisonPlan)
    expect(plansEqual(DEFAULT_COMPARISON_PLANS, apiShape)).toBe(true)
  })

  it("انحراف نصوص الميزات بنفس الطول لا يكسر المساواة (المقارنة سعر/ترتيب/id)", () => {
    const edited = DEFAULT_COMPARISON_PLANS.map((p) => ({
      ...p,
      features: p.features.map(() => "نص مختلف تماماً"),
    }))
    expect(plansEqual(DEFAULT_COMPARISON_PLANS, edited)).toBe(true)
  })

  it("تغيير سعر واحد يفرض التبديل", () => {
    const repriced = DEFAULT_COMPARISON_PLANS.map((p) => (p.id === 2 ? { ...p, price: 25 } : p))
    expect(plansEqual(DEFAULT_COMPARISON_PLANS, repriced)).toBe(false)
  })

  it("تغيير الترتيب (sort_order) يفرض التبديل", () => {
    const reordered = [...DEFAULT_COMPARISON_PLANS].reverse()
    expect(plansEqual(DEFAULT_COMPARISON_PLANS, reordered)).toBe(false)
  })

  it("إضافة/حذف خطة من الخادم (طول مختلف) يفرض التبديل", () => {
    expect(plansEqual(DEFAULT_COMPARISON_PLANS, DEFAULT_COMPARISON_PLANS.slice(0, 4))).toBe(false)
    expect(plansEqual(DEFAULT_COMPARISON_PLANS, [...DEFAULT_COMPARISON_PLANS, DEFAULT_COMPARISON_PLANS[0]])).toBe(false)
  })

  it("عدد ميزات مختلف يفرض التبديل (سطر +N ميزات أخرى يتغير)", () => {
    const trimmed = DEFAULT_COMPARISON_PLANS.map((p) =>
      p.id === 3 ? { ...p, features: p.features.slice(0, 6) } : p,
    )
    expect(plansEqual(DEFAULT_COMPARISON_PLANS, trimmed)).toBe(false)
  })
})
