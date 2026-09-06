/**
 * v11-A5 — unit tests for the Arabic pluralization engine (v8-E6).
 * Ported-verbatim contract from Smart-Menu: both projects must pluralize
 * Arabic identically, so these rules are pinned here.
 */
import { describe, expect, it } from "vitest"

import { arabicNumberState, getArabicPlural } from "./arabic-plural"

describe("arabicNumberState", () => {
  it("classifies counts into the six Arabic number states", () => {
    expect(arabicNumberState(0)).toBe("zero")
    expect(arabicNumberState(1)).toBe("one")
    expect(arabicNumberState(2)).toBe("two")
    expect(arabicNumberState(3)).toBe("few")
    expect(arabicNumberState(10)).toBe("few")
    expect(arabicNumberState(11)).toBe("many")
    expect(arabicNumberState(999)).toBe("many")
  })

  it("throws RangeError for negative or non-integer counts", () => {
    expect(() => arabicNumberState(-1)).toThrow(RangeError)
    expect(() => arabicNumberState(1.5)).toThrow(RangeError)
    expect(() => arabicNumberState(Number.NaN)).toThrow(RangeError)
  })
})

describe("getArabicPlural", () => {
  it("one and many (11+) use the singular — the Arabic 'eleven rule'", () => {
    expect(getArabicPlural(1, "صنف")).toBe("صنف")
    expect(getArabicPlural(11, "صنف", undefined, "أصناف")).toBe("صنف")
    expect(getArabicPlural(15, "رسالة")).toBe("رسالة")
  })

  it("two derives the mechanical sound dual, dropping feminine ة", () => {
    expect(getArabicPlural(2, "صنف")).toBe("صنفان")
    expect(getArabicPlural(2, "قائمة")).toBe("قائمتان")
    expect(getArabicPlural(2, "مطعم")).toBe("مطعمان")
  })

  it("few (3–10) uses an explicit plural when given, else the mechanical sound plural", () => {
    // explicit broken plural via the positional signature
    expect(getArabicPlural(5, "صنف", undefined, "أصناف")).toBe("أصناف")
    // feminine ة → ات
    expect(getArabicPlural(5, "طبقة")).toBe("طبقات")
    // masculine → ون
    expect(getArabicPlural(5, "رد")).toBe("ردون")
  })

  it("zero defaults to 'لا ' + plural and honors an explicit zero form", () => {
    expect(getArabicPlural(0, "طلب", undefined, "طلبات")).toBe("لا طلبات")
    expect(getArabicPlural(0, "طلب", { zero: "لا طلبات حالياً" })).toBe("لا طلبات حالياً")
  })

  it("object signature merges with the positional plural without mutating the caller's object", () => {
    const forms = { two: "رسالتان" }
    expect(getArabicPlural(2, "رسالة", forms)).toBe("رسالتان")
    expect(getArabicPlural(3, "رسالة", forms, "رسائل")).toBe("رسائل")
    // the caller-supplied object must never gain a `few` key
    expect(forms).toEqual({ two: "رسالتان" })
  })
})
