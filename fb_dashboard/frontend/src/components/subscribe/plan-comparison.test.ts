/**
 * v11-A5 — unit tests for the /pricing + /subscribe shared plan logic.
 * Pure functions, no React — pins the GET /api/plans mapping contract
 * (snake_case rows, array features — the backend column is JSON
 * default=list — sentinel unlimited caps).
 */
import { describe, expect, it } from "vitest"

import { repliesPhrase, toComparisonPlan, type ComparisonPlanInput } from "./plan-comparison"

function baseInput(overrides: Partial<ComparisonPlanInput> = {}): ComparisonPlanInput {
  return {
    id: 1,
    name: "Starter",
    name_ar: "البداية",
    price: 19,
    features: ["ردود آلية", "تقارير"],
    max_replies: 500,
    max_pages: 3,
    max_rules: 10,
    sort_order: 1,
    ...overrides,
  }
}

describe("toComparisonPlan", () => {
  it("maps a full snake_case API row into the comparison shape", () => {
    expect(toComparisonPlan(baseInput())).toEqual({
      id: 1,
      name: "Starter",
      nameAr: "البداية",
      price: 19,
      features: ["ردود آلية", "تقارير"],
      maxReplies: 500,
      maxPages: 3,
      maxRules: 10,
      sortOrder: 1,
    })
  })

  it("falls back nameAr → name and defaults missing caps/sort to 0", () => {
    const plan = toComparisonPlan({ id: 2, name: "Pro", price: 49 })
    expect(plan.nameAr).toBe("Pro")
    expect(plan.maxReplies).toBe(0)
    expect(plan.maxPages).toBe(0)
    expect(plan.maxRules).toBe(0)
    expect(plan.sortOrder).toBe(0)
    expect(plan.features).toEqual([])
  })

  it("keeps array features as-is and coerces string numerics from the API", () => {
    const plan = toComparisonPlan(
      baseInput({ features: ["أول", "ثانٍ"], max_rules: "50", price: 49.5 }),
    )
    expect(plan.features).toEqual(["أول", "ثانٍ"])
    expect(plan.maxRules).toBe(50)
    expect(plan.price).toBe(49.5)
  })

  /* v16-E4: features is typed string[] — a string input is now a compile
   * error, and the dead split branch is gone (D7 slop-scan). The runtime
   * fallback for a MISSING key stays pinned above (features → []). */
  it("maps an empty features array through unchanged (no string-split path)", () => {
    const plan = toComparisonPlan(baseInput({ features: [] }))
    expect(plan.features).toEqual([])
  })
})

describe("repliesPhrase", () => {
  it("returns the unlimited phrase for sentinel caps (999999 replies)", () => {
    expect(repliesPhrase({ ...toComparisonPlan(baseInput()), maxReplies: 999999 })).toBe(
      "ردود غير محدودة",
    )
  })

  it("pluralizes capped replies: few (3–10) → ردود, many (11+) → singular رد", () => {
    const plan = (maxReplies: number) => ({ ...toComparisonPlan(baseInput()), maxReplies })
    expect(repliesPhrase(plan(5))).toBe("حتى 5 ردود")
    expect(repliesPhrase(plan(500))).toBe("حتى 500 رد")
  })
})
