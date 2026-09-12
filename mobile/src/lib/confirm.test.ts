/**
 * اختبارات أداة تأكيد الأفعال المدمرة (v26 · W-26).
 *
 * confirmAction يجب أن:
 *  - تحل true فقط عند الضغط على زر التأكيد
 *  - تحل false عند زر الإلغاء أو الإغلاق القابل للإلغاء
 *  - تمرر style: destructive لزر التأكيد افتراضيًا (iOS أحمر)
 *  - recipientCountMessage تصوغ عدد المستلمين بصدق (0 = لا أحد)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { confirmAction, recipientCountMessage } from './confirm'

let lastCall: { title: string; message: string; buttons: { text: string; style?: string; onPress?: () => void }[]; options?: { cancelable?: boolean } } | null = null

vi.mock('react-native', () => ({
  Alert: {
    alert: (title: string, message: string, buttons?: any, options?: any) => {
      lastCall = { title, message, buttons: buttons ?? [], options }
    },
  },
}))

function press(text: string) {
  const btn = lastCall?.buttons.find((b) => b.text === text)
  expect(btn, `زر «${text}» غير موجود`).toBeTruthy()
  btn!.onPress!()
}

beforeEach(() => {
  lastCall = null
})

describe('confirmAction', () => {
  it('تؤكد فقط بضغط زر التأكيد', async () => {
    const p = confirmAction({ title: 'حذف؟', message: 'نهائي' })
    press('تأكيد')
    await expect(p).resolves.toBe(true)
  })

  it('ترجع false عند الرجوع', async () => {
    const p = confirmAction({ title: 'حذف؟', message: 'نهائي' })
    press('رجوع')
    await expect(p).resolves.toBe(false)
  })

  it('زر التأكيد مدمِر افتراضيًا (iOS red)', () => {
    confirmAction({ title: 't', message: 'm' })
    const confirm = lastCall!.buttons.find((b) => b.text === 'تأكيد')
    expect(confirm?.style).toBe('destructive')
  })

  it('destructive: false يجعل زر التأكيد افتراضيًا', () => {
    confirmAction({ title: 't', message: 'm', destructive: false })
    const confirm = lastCall!.buttons.find((b) => b.text === 'تأكيد')
    expect(confirm?.style).toBe('default')
  })

  it('نصوص الأزرار قابلة للتخصيص', () => {
    confirmAction({ title: 't', message: 'm', confirmText: 'إرسال الآن', cancelText: 'تراجع' })
    const texts = lastCall!.buttons.map((b) => b.text)
    expect(texts).toContain('إرسال الآن')
    expect(texts).toContain('تراجع')
  })

  it('زر الإلغاء style=cancel والحوار قابل للإغلاق', () => {
    confirmAction({ title: 't', message: 'm' })
    const cancel = lastCall!.buttons.find((b) => b.text === 'رجوع')
    expect(cancel?.style).toBe('cancel')
    expect(lastCall!.options?.cancelable).toBe(true)
  })
})

describe('recipientCountMessage', () => {
  it('عدد موجب يظهر في الرسالة مع تحذير عدم التراجع', () => {
    const msg = recipientCountMessage(1250)
    // اصطلاح ar-LY: فاصل الآلاف النقطي (1.250) — نفس بوابة i18n
    expect(msg).toContain('1.250')
    expect(msg).toContain('لا يمكن التراجع')
  })

  it('صفر = صراحة «لن يصل أحد»', () => {
    expect(recipientCountMessage(0)).toContain('لن يصل أحد')
  })

  it('null/undefined = تحذير عام بلا رقم', () => {
    const msg = recipientCountMessage(null)
    expect(msg).not.toContain('NaN')
    expect(msg).toContain('جمهورك')
  })
})
