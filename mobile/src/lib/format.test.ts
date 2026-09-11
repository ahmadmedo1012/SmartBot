/**
 * اختبارات التنسيق العربي (نفس اصطلاحات format.ts في الويب).
 */
import { describe, expect, it } from 'vitest'
import { formatDate, formatDateOnly, formatMoney, formatNumber, formatTime, formatTrend, timeAgo } from './format'

describe('formatNumber (ar-LY — أرقام غربية + تجميع)', () => {
  it('يعيد سلسلة فارغة للقيم المفقودة', () => {
    expect(formatNumber(null)).toBe('')
    expect(formatNumber(undefined)).toBe('')
    expect(formatNumber('')).toBe('')
  })

  it('لا يستخدم الأرقام العربية الهندية أبدًا', () => {
    const out = formatNumber(123456)
    expect(out).toMatch(/^[0-9.,]+$/)
    expect(out).not.toMatch(/[٠-٩]/)
  })

  it('يقبل سلاسل رقمية', () => {
    expect(formatNumber('42')).toBe('42')
  })

  it('يرجع النص كما هو للقيم غير الرقمية', () => {
    expect(formatNumber('abc')).toBe('abc')
  })
})

describe('formatDate — أسماء شهور عربية + ساعة 24', () => {
  it('التاريخ والوقت معًا', () => {
    const d = new Date(2026, 8, 6, 14, 5) // 6 سبتمبر 2026 14:05
    expect(formatDate(d)).toBe('6 سبتمبر 2026 14:05')
  })

  it('التاريخ فقط', () => {
    expect(formatDateOnly(new Date(2026, 0, 12))).toBe('12 يناير 2026')
  })

  it('الوقت فقط بأصفار بادئة', () => {
    expect(formatTime(new Date(2026, 0, 1, 9, 3))).toBe('09:03')
  })

  it('فارغ للقيم غير الصالحة', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate('not-a-date')).toBe('')
    expect(formatDateOnly(undefined)).toBe('')
  })
})

describe('formatMoney — عملة ليبية', () => {
  it('يلحق د.ل', () => {
    expect(formatMoney(19)).toBe('19 د.ل')
  })
  it('فارغ للقيم المفقودة', () => {
    expect(formatMoney(null)).toBe('')
  })
})

describe('formatTrend — نسبة موقعة', () => {
  it('موجبة بإشارة +', () => {
    expect(formatTrend(12.5)).toBe('+12.5%')
  })
  it('سالبة بلا +', () => {
    expect(formatTrend(-3.2)).toBe('-3.2%')
  })
  it('صفر وغير صالح → 0%', () => {
    expect(formatTrend(0)).toBe('0%')
    expect(formatTrend(undefined)).toBe('0%')
  })
})

describe('timeAgo — نسبي عربي', () => {
  it('الآن للحظات', () => {
    expect(timeAgo(new Date())).toBe('الآن')
  })
  it('دقائق', () => {
    expect(timeAgo(new Date(Date.now() - 5 * 60_000))).toBe('قبل 5 دقيقة')
  })
  it('ساعات', () => {
    expect(timeAgo(new Date(Date.now() - 3 * 3600_000))).toBe('قبل 3 ساعة')
  })
})
