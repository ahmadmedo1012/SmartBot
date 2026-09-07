/**
 * v13-E6 — edge-case expansion for the single i18n seam (lib/format.ts).
 * The base file (format.test.ts) pins the canonical ar-LY conventions; this
 * file pins the UNCOVERED branches D8 flagged:
 *   - real decimal values (ar-LY comma decimal: "1.234,5")
 *   - negative numbers (ICU emits a leading LRM before the minus)
 *   - numeric epoch inputs for every date function + NaN → ""
 *   - timeAgo future (<60s → "الآن") and 13-month deep past
 *   - countPhrase zero with the mechanical masculine plural + RangeError
 *
 * Expected strings are hardcoded (i18n gate: no toLocale* in tests).
 * Epochs are computed as LOCAL time (new Date(y,m,d).getTime()) so the
 * expectations are timezone-independent, like the base file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  countPhrase,
  formatDate,
  formatDateOnly,
  formatMonth,
  formatNumber,
  timeAgo,
  toArabicNumber,
} from "./format"

describe("formatNumber edge branches", () => {
  it("formats real decimals with the ar-LY comma decimal separator", () => {
    // ar-LY: dot thousand grouping + comma decimal → "1.234,5"
    expect(formatNumber(1234.5)).toBe("1.234,5")
    expect(formatNumber(0.5)).toBe("0,5")
  })

  it("prefixes negatives with an LRM before the minus (ICU ar-LY behavior)", () => {
    // Node ICU renders -1234567 as LRM + "-1.234.567" — the LRM keeps the
    // minus visually on the correct side inside RTL text.
    expect(formatNumber(-1234567)).toBe("\u200E-1.234.567")
  })

  it("passes a non-numeric string through verbatim (never 'NaN')", () => {
    // a comma-decimal string is NOT a parseable number → verbatim passthrough
    expect(formatNumber("1.234,5")).toBe("1.234,5")
    expect(formatNumber("abc")).toBe("abc")
  })
})

describe("date functions with numeric epoch input", () => {
  const epoch = new Date(2026, 8, 6, 14, 5).getTime()

  it("accepts epoch numbers in every date form", () => {
    expect(formatDate(epoch)).toBe("6 سبتمبر 2026 14:05")
    expect(formatDateOnly(epoch)).toBe("6 سبتمبر 2026")
    expect(formatMonth(epoch)).toBe("سبتمبر 2026")
  })

  it('returns "" for NaN epochs in every date form', () => {
    expect(formatDate(Number.NaN)).toBe("")
    expect(formatDateOnly(Number.NaN)).toBe("")
    expect(formatMonth(Number.NaN)).toBe("")
  })
})

describe("timeAgo edge branches", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 6, 14, 5))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders "الآن" for future dates closer than 60s (clock skew)', () => {
    expect(timeAgo(new Date(2026, 8, 6, 14, 5, 30))).toBe("الآن")
  })

  it("escalates a 400-day past to months: 400/30 → 13 → \"قبل 13 شهر\"", () => {
    const fourHundredDays = 400 * 24 * 60 * 60 * 1000
    const d = new Date(new Date(2026, 8, 6, 14, 5).getTime() - fourHundredDays)
    expect(timeAgo(d)).toBe("قبل 13 شهر")
  })
})

describe("countPhrase / toArabicNumber edge branches", () => {
  it('derives the mechanical masculine plural for zero: "لا ردون"', () => {
    // "رد" is masculine → sound plural ون (broken plural must be passed
    // explicitly — this caller did not, so the mechanical form is the contract)
    expect(countPhrase(0, "رد")).toBe("لا ردون")
  })

  it("throws RangeError for negative counts (shared with arabicNumberState)", () => {
    expect(() => countPhrase(-1, "رسالة")).toThrow(RangeError)
    expect(() => countPhrase(-10, "رسالة", undefined, "رسائل")).toThrow(RangeError)
  })

  it("never groups digits in toArabicNumber", () => {
    expect(toArabicNumber(123456)).toBe("123456")
    expect(toArabicNumber(0)).toBe("0")
  })
})
