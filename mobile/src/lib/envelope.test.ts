/**
 * اختبارات فك مغلفات القوائم (extractItems) — عقد الباكند الفعلي
 * بعد فك envelope {success,data} المركزي في services/api.ts.
 */
import { describe, expect, it } from 'vitest'
import { extractItems } from './envelope'

describe('extractItems — مغلّف {items} (عقد v25)', () => {
  it('يفك مغلّف القوائم المقسّمة ويعيد العناصر', () => {
    const payload = { items: [{ id: 1 }, { id: 2 }], total: 2, page: 1, per_page: 25 }
    expect(extractItems(payload)).toEqual([{ id: 1 }, { id: 2 }])
  })

  it('يعيد المصفوفة الفارغة داخل مغلّف فارغ', () => {
    expect(extractItems({ items: [], total: 0, page: 1, per_page: 25 })).toEqual([])
  })

  it('يجرد مفتاح items فقط (لا data/rows/results)', () => {
    const payload = { data: [{ id: 1 }], rows: [{ id: 2 }], items: [{ id: 3 }] }
    expect(extractItems(payload)).toEqual([{ id: 3 }])
  })
})

describe('extractItems — توافق المصفوفة المجردة (عقد القوائم القديمة)', () => {
  it('يعيد المصفوفة كما هي (broadcasts/offers/templates/logs)', () => {
    const legacy = [{ id: 'a' }, { id: 'b' }]
    expect(extractItems(legacy)).toBe(legacy)
  })

  it('يعيد مصفوفة فارغة لمصفوفة فارغة', () => {
    expect(extractItems([])).toEqual([])
  })
})

describe('extractItems — أشكال غير متوقعة لا تكسر الشاشة', () => {
  it('null/undefined → []', () => {
    expect(extractItems(null)).toEqual([])
    expect(extractItems(undefined)).toEqual([])
  })

  it('كائن بلا items → []', () => {
    expect(extractItems({ total: 5 })).toEqual([])
  })

  it('items غير مصفوفة → []', () => {
    expect(extractItems({ items: 'oops' })).toEqual([])
    expect(extractItems({ items: null })).toEqual([])
  })

  it('قيمة أولية (سلسلة/رقم) → []', () => {
    expect(extractItems('items')).toEqual([])
    expect(extractItems(42)).toEqual([])
  })

  it('يعيد عناصر بالعقد الحقيقي للتعليقات كما هي (pass-through)', () => {
    const comments = {
      items: [
        { id: 'c1', message: 'سعر؟', from_name: 'أحمد', reply_text: null, replied_at: null },
        { id: 'c2', message: 'شكراً', from_name: 'سالم', reply_text: 'عفواً', replied_at: '2026-09-11T10:00:00Z' },
      ],
      source: 'db',
      synced: true,
    }
    const items = extractItems<typeof comments.items[number]>(comments)
    expect(items).toHaveLength(2)
    expect(items[1].reply_text).toBe('عفواً')
    expect(!!(items[0].reply_text ?? items[0].replied_at)).toBe(false)
    expect(!!(items[1].reply_text ?? items[1].replied_at)).toBe(true)
  })
})
