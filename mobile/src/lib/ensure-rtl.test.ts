/**
 * اختبارات بوابة إقلاع RTL (v27 · جذر مشكلة «أول فتح LTR»).
 *
 * العقود المختبرة:
 *  1. isRTL مفعل مسبقًا → لا كتابة إعدادات ولا إعادة تحميل (إقلاعات
 *     ما بعد الأول تبقى فورية بلا أي عمل إضافي).
 *  2. تثبيت نظيف (isRTL=false، لا علم) → يكتب allowRTL/forceRTL، يسجل
 *     علم المرة الواحدة، ويعيد التحميل مرة واحدة فقط.
 *  3. العلم مسجل لكن isRTL ما زال false (بيئة لا تطبق عبر إعادة
 *     التحميل) → «deferred» بلا إعادة تحميل — استحالة الحلقة اللانهائية.
 *  4. تخزين معطوب → «deferred» بلا إعادة تحميل.
 *  5. reloadAsync يرفض → «deferred» (الإقلاع البارد التالي يسري حتمًا).
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ensureRTL } from './ensure-rtl'

const state = {
  isRTL: false,
  allowRTL: vi.fn(),
  forceRTL: vi.fn(),
  devReload: vi.fn(),
  updatesReload: vi.fn(),
  store: new Map<string, string>(),
  storageBroken: false,
}

vi.mock('react-native', () => ({
  I18nManager: {
    get isRTL() {
      return state.isRTL
    },
    allowRTL: (v: boolean) => state.allowRTL(v),
    forceRTL: (v: boolean) => state.forceRTL(v),
  },
  DevSettings: {
    reload: () => state.devReload(),
  },
}))

vi.mock('expo-updates', () => ({
  reloadAsync: () => state.updatesReload(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (k: string) => {
      if (state.storageBroken) throw new Error('storage unavailable')
      return state.store.get(k) ?? null
    },
    setItem: async (k: string, v: string) => {
      if (state.storageBroken) throw new Error('storage unavailable')
      state.store.set(k, v)
    },
  },
}))

beforeEach(() => {
  state.isRTL = false
  state.allowRTL.mockClear()
  state.forceRTL.mockClear()
  state.devReload.mockClear()
  state.updatesReload.mockClear()
  state.store.clear()
  state.storageBroken = false
})

describe('ensureRTL — بوابة إقلاع RTL', () => {
  it('isRTL مفعل مسبقًا → لا عمل إطلاقًا', async () => {
    state.isRTL = true
    await expect(ensureRTL()).resolves.toBe('already-rtl')
    expect(state.allowRTL).not.toHaveBeenCalled()
    expect(state.forceRTL).not.toHaveBeenCalled()
    expect(state.updatesReload).not.toHaveBeenCalled()
  })

  it('تثبيت نظيف → كتابة الإعداد + إعادة تحميل واحدة + تسجيل العلم', async () => {
    const r = await ensureRTL()
    expect(r).toBe('reloaded')
    expect(state.allowRTL).toHaveBeenCalledWith(true)
    expect(state.forceRTL).toHaveBeenCalledWith(true)
    expect(state.updatesReload).toHaveBeenCalledTimes(1)
    expect(state.store.get('smartbot.rtl_bootstrapped_v1')).toBe('1')
  })

  it('العلم مسجل وisRTL ما زال false → تأجيل بلا إعادة تحميل (لا حلقة)', async () => {
    state.store.set('smartbot.rtl_bootstrapped_v1', '1')
    await expect(ensureRTL()).resolves.toBe('deferred')
    expect(state.updatesReload).not.toHaveBeenCalled()
    // لكن الإعداد الأصلي أعيدت كتابته — الإقلاع البارد التالي يلتقطه.
    expect(state.forceRTL).toHaveBeenCalledWith(true)
  })

  it('تخزين معطوب → تأجيل آمن بلا إعادة تحميل عمياء', async () => {
    state.storageBroken = true
    await expect(ensureRTL()).resolves.toBe('deferred')
    expect(state.updatesReload).not.toHaveBeenCalled()
    expect(state.forceRTL).toHaveBeenCalledWith(true)
  })

  it('رفض reloadAsync → تأجيل (المخرج: الإقلاع البارد التالي)', async () => {
    state.updatesReload.mockImplementation(() => {
      throw new Error('unsupported in this environment')
    })
    await expect(ensureRTL()).resolves.toBe('deferred')
    expect(state.forceRTL).toHaveBeenCalledWith(true)
    // العلم سُجل رغم فشل إعادة التحميل — لن تُكرر المحاولة في نفس التثبيت.
    expect(state.store.get('smartbot.rtl_bootstrapped_v1')).toBe('1')
  })

  it('بعد سريان RTL (كأن إعادة التحميل نفذت) → إقلاع لاحق يمر فورًا', async () => {
    await ensureRTL() // التثبيت النظيف: إعادة تحميل واحدة
    state.isRTL = true // الجسر أعيد إنشاؤه وقرأ forceRTL
    await expect(ensureRTL()).resolves.toBe('already-rtl')
    expect(state.updatesReload).toHaveBeenCalledTimes(1) // لم تتكرر
  })
})
