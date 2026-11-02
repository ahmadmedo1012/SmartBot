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

  it("كل باقة تعلن «صفحة فيسبوك واحدة» (P13-2c: عمارة صفحة واحدة لكل مستأجر)", () => {
    // P13-2c honest re-pin: the backend binds ONE Facebook page per tenant
    // (models.py uq_botstate_tenant_key — one 'fb_page_id' key row per
    // tenant; webhook resolves tenant by that single page) and max_pages
    // is enforced nowhere. The old Premium/Pro/Enterprise claims
    // («صفحتين»/«5 صفحات»/«صفحات غير محدودة») were fiction — every tier
    // now states the architectural truth.
    for (const p of DEFAULT_PLANS) {
      expect(p.features).toContain("صفحة فيسبوك واحدة")
    }
  })

  /* P40-5b (P1-2/P2-2/P3-5 claims honesty): the seed strings moved to the
   * honest wording — these pins hold the lockstep (mirror == seed ==
   * /api/plans) and ban the retired claims from ever shipping again. */
  it("P40: Basic تبيع «تقارير PDF عند الطلب» لا «تقارير أسبوعية» (لا مجدول تسليم موجود)", () => {
    expect(DEFAULT_PLANS[1].features).toContain("تقارير PDF عند الطلب")
  })

  it("P40: Enterprise تحمل الصياغة الصادقة — بلا حد عملي ودعم أولوية خلال أيام العمل (r144: لا وعد 24/7)", () => {
    expect(DEFAULT_PLANS[4].features).toContain("ردود بلا حد عملي (999,999 شهريًا)")
    expect(DEFAULT_PLANS[4].features).toContain("دعم أولوية خلال أيام العمل")
  })

  /* P42-2c (F2 claims honesty): the last two support superlatives
   * retired — the only support surface is the WhatsApp line (working
   * days 9ص–9م, routers/support.py r144), so no tier may promise
   * instant/excellent support. These pins hold the lockstep
   * (mirror == seed == /api/plans) like the P40 family above. */
  it("P42: Basic تبيع «دعم واتساب خلال أيام العمل» لا «دعم فوري» (لا خط دعم لحظي موجود)", () => {
    expect(DEFAULT_PLANS[1].features).toContain("دعم واتساب خلال أيام العمل")
  })

  it("P42: Pro تبيع «دعم أولوية عبر واتساب» لا «دعم فني ممتاز» (صياغة عائلة الصدق r144)", () => {
    expect(DEFAULT_PLANS[3].features).toContain("دعم أولوية عبر واتساب")
  })

  it("P42: لا وعود دعم مضخّمة في أي باقة — دعم فوري · دعم فني ممتاز", () => {
    for (const p of DEFAULT_PLANS) {
      for (const f of p.features ?? []) {
        expect(f).not.toMatch(/دعم فوري|دعم فني ممتاز/)
      }
    }
  })

  it("P40: لا وعود محظورة في أي باقة — 24/7 · مدار الساعة · أسبوعية · غير محدود", () => {
    for (const p of DEFAULT_PLANS) {
      for (const f of p.features ?? []) {
        expect(f).not.toMatch(/24\/7|مدار الساعة|أسبوعية|غير محدود/)
      }
    }
  })

  it("max_pages = 1 في كل باقة (P14-P0A: مطابقة العقد المسلَّك للعمارة المفروضة)", () => {
    // P14-P0A regression: the wire contract must agree with the enforced
    // architecture and the rendered feature string. Before P14 the mirror
    // carried Premium=2 / Pro=5 / Enterprise=999 — contradicting the same
    // cards' «صفحة فيسبوك واحدة» feature text.
    for (const p of DEFAULT_PLANS) {
      expect(p.max_pages).toBe(1)
    }
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
