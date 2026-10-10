/**
 * r138 — تثبيت عقد التوأم (mobile/src/lib/phone.ts): نفس الحالات التي
 * يثبّتها الخادم في tests/test_r137_phone_provider.py — القناع المحلي،
 * طيّ الشرقية، شدّ الفواصل، تجريد +218/00218، استعادة جذع 0، الأرضي
 * الوطني، ورفض المهملات والأرقام الأجنبية. قسم r138 يثبّت العقد الأوسع
 * الموحّد مع الأسطولة (قرار r138-SO): المحمول القصير 9 خانات + جذعه
 * المفقود + الأرضي 0[1-9].
 */
import { describe, expect, it } from 'vitest'

import { normalizeLibyanPhone } from './phone'

describe('normalizeLibyanPhone (توأم الموبايل r138)', () => {
  it('يقبل القناع المحلي كما هو', () => {
    expect(normalizeLibyanPhone('0912345678')).toBe('0912345678')
  })

  it('يطوي الأرقام الشرقية قبل التحقق (درس r133-A12 M1)', () => {
    expect(normalizeLibyanPhone('٠٩١٢٣٤٥٦٧٨')).toBe('0912345678')
  })

  it('يشدّ الفواصل والزائد', () => {
    expect(normalizeLibyanPhone('+218 91 234 5678')).toBe('0912345678')
    expect(normalizeLibyanPhone('091-234-5678')).toBe('0912345678')
  })

  it('يجرد بادئة الدولة المزدوجة والمفردة', () => {
    expect(normalizeLibyanPhone('00218912345678')).toBe('0912345678')
    expect(normalizeLibyanPhone('218912345678')).toBe('0912345678')
  })

  it('يستعيد جذع 0 المفقود', () => {
    expect(normalizeLibyanPhone('912345678')).toBe('0912345678')
  })

  it('يقبل الأرضي الوطني (021 طرابلس) — ليست المحمول حصرًا', () => {
    expect(normalizeLibyanPhone('0211234567')).toBe('0211234567')
  })

  it('يرفض المهملات والأرقام الأجنبية (كانت تمر ببوابة ≥7)', () => {
    expect(normalizeLibyanPhone('1234567')).toBeNull() // بلا بادئة وطنية
    expect(normalizeLibyanPhone('+201001234567')).toBeNull() // مصر
    expect(normalizeLibyanPhone('')).toBeNull()
    expect(normalizeLibyanPhone('٠٩١٢٣٤٥٦٧٨٩٠١٢')).toBeNull() // أطول من القناع
  })
})

describe('normalizeLibyanPhone — العقد الأوسع الموحّد (r138-SO)', () => {
  it('المحمول القصير 9 خانات (09 + 7 أرقام) صالح — كان مرفوضًا بالعقد القديم', () => {
    expect(normalizeLibyanPhone('091234567')).toBe('091234567')
  })

  it('المحمول القصير بجذع 0 مفقود (9xxxxxxx) يُستعاد جذعه', () => {
    expect(normalizeLibyanPhone('91234567')).toBe('091234567')
  })

  it('المحمول القصير شرقيًا يُقبل كذلك', () => {
    expect(normalizeLibyanPhone('٠٩١٢٣٤٥٦٧')).toBe('091234567')
  })

  it('الأرضي اتسع إلى 0[1-9] كاملة (04/06/07/08 لم تعد مرفوضة)', () => {
    expect(normalizeLibyanPhone('0412345678')).toBe('0412345678')
    expect(normalizeLibyanPhone('0712345678')).toBe('0712345678')
  })

  it('الأرضي القصير 9 خانات يبقى مرفوضًا — القصر للمحمول حصرًا', () => {
    expect(normalizeLibyanPhone('021123456')).toBeNull()
  })

  it('الأرضي 0 بادئةً بلا رقم منطقة يبقى مرفوضًا', () => {
    expect(normalizeLibyanPhone('0012345678')).toBeNull()
  })
})
