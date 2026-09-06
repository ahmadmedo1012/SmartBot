/**
 * v11-A5 — unit tests for THE single i18n formatting seam (v6 §A).
 *
 * Pinning the canonical conventions decided once in lib/format.ts:
 *   - numbers: "ar-LY" — Western digits 0-9 + dot thousand separators
 *   - dates: Arabic month names + Western digits + day-month-year + 24h clock
 *   - relative time & count phrases: the ONE v8-E5/E6 format
 *
 * NOTE: this file must never call toLocale* directly — the i18n CI gate
 * (scripts/check_i18n_calls.py) forbids it outside the seam itself, so all
 * expected strings below are hardcoded.
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

describe("toArabicNumber", () => {
  it("renders numbers with Western digits only and passes strings through", () => {
    expect(toArabicNumber(123456)).toBe("123456")
    expect(toArabicNumber(12.5)).toBe("12.5")
    expect(toArabicNumber(0)).toBe("0")
    expect(toArabicNumber("45.2")).toBe("45.2")
  })
})

describe("formatNumber", () => {
  it("formats with ar-LY grouping: Western digits + dot thousand separators", () => {
    expect(formatNumber(1234567)).toBe("1.234.567")
    expect(formatNumber(987654)).toBe("987.654")
    expect(formatNumber(123)).toBe("123")
    expect(formatNumber(0)).toBe("0")
  })

  it('returns "" for missing API fields (null/undefined/"") so callers can pass them directly', () => {
    expect(formatNumber(null)).toBe("")
    expect(formatNumber(undefined)).toBe("")
    expect(formatNumber("")).toBe("")
  })

  it("accepts numeric strings from the API and passes non-finite values through", () => {
    expect(formatNumber("987654")).toBe("987.654")
    expect(formatNumber("42")).toBe("42")
    // non-finite input is returned verbatim, never rendered as "NaN"
    expect(formatNumber("abc")).toBe("abc")
  })
})

describe("formatDate / formatDateOnly / formatMonth", () => {
  it('renders full dates as "D month YYYY HH:MM" with Arabic months + 24h clock', () => {
    // local-time construction → timezone-independent expectations
    expect(formatDate(new Date(2026, 8, 6, 14, 5))).toBe("6 سبتمبر 2026 14:05")
    expect(formatDate(new Date(2026, 0, 2, 9, 7))).toBe("2 يناير 2026 09:07")
    // API ISO strings (no timezone suffix) are parsed as local time
    expect(formatDate("2026-09-06T14:05:00")).toBe("6 سبتمبر 2026 14:05")
  })

  it('renders date-only "D month YYYY" and month-year "month YYYY" forms', () => {
    const d = new Date(2026, 8, 6, 14, 5)
    expect(formatDateOnly(d)).toBe("6 سبتمبر 2026")
    expect(formatMonth(d)).toBe("سبتمبر 2026")
  })

  it('returns "" for invalid or missing dates in every form', () => {
    expect(formatDate("not-a-date")).toBe("")
    expect(formatDate(null)).toBe("")
    expect(formatDateOnly("")).toBe("")
    expect(formatMonth(undefined)).toBe("")
  })
})

describe("timeAgo", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 6, 14, 5))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders "الآن" under 60s and the singular/dual/few/many minute forms', () => {
    expect(timeAgo(new Date(2026, 8, 6, 14, 4, 30))).toBe("الآن")
    expect(timeAgo(new Date(2026, 8, 6, 14, 4))).toBe("قبل دقيقة")
    expect(timeAgo(new Date(2026, 8, 6, 14, 3))).toBe("قبل دقيقتين")
    expect(timeAgo(new Date(2026, 8, 6, 14, 0))).toBe("قبل 5 دقائق")
    expect(timeAgo(new Date(2026, 8, 6, 13, 54))).toBe("قبل 11 دقيقة")
  })

  it("escalates through hours, days and months with correct dual/plural", () => {
    expect(timeAgo(new Date(2026, 8, 6, 13, 5))).toBe("قبل ساعة")
    expect(timeAgo(new Date(2026, 8, 6, 12, 5))).toBe("قبل ساعتين")
    expect(timeAgo(new Date(2026, 8, 6, 11, 5))).toBe("قبل 3 ساعات")
    expect(timeAgo(new Date(2026, 8, 5, 14, 5))).toBe("قبل يوم")
    expect(timeAgo(new Date(2026, 8, 4, 14, 5))).toBe("قبل يومين")
    expect(timeAgo(new Date(2026, 8, 2, 14, 5))).toBe("قبل 4 أيام")
    expect(timeAgo(new Date(2026, 7, 6, 14, 5))).toBe("قبل شهر")
    expect(timeAgo(new Date(2026, 6, 6, 14, 5))).toBe("قبل شهرين")
    expect(timeAgo(new Date(2026, 2, 6, 14, 5))).toBe("قبل 6 أشهر")
  })

  it('returns "" for invalid dates', () => {
    expect(timeAgo("not-a-date")).toBe("")
    expect(timeAgo(null)).toBe("")
  })
})

describe("countPhrase", () => {
  it("produces the v8-E5 unified count phrases: zero/dual bare, others numbered", () => {
    expect(countPhrase(0, "رسالة", undefined, "رسائل")).toBe("لا رسائل")
    expect(countPhrase(1, "رسالة")).toBe("1 رسالة")
    expect(countPhrase(2, "رسالة")).toBe("رسالتان")
    expect(countPhrase(5, "رسالة", { few: "رسائل" })).toBe("5 رسائل")
    expect(countPhrase(15, "رسالة")).toBe("15 رسالة")
  })

  it("supports the positional dual/plural signature used across the app", () => {
    expect(countPhrase(2, "طلب", "طلبين", "طلبات")).toBe("طلبين")
    expect(countPhrase(7, "طلب", "طلبين", "طلبات")).toBe("7 طلبات")
  })
})
