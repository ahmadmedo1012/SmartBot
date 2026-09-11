/**
 * SmartBot Mobile — تأكيد الأفعال المدمّرة (v26 · W-01 parity).
 *
 * درس v25 على الويب (W-01/W-02/W-03/W-04 + معيار v24-C2): كل فعل لا يمكن
 * التراجع عنه — إرسال جماعي، نشر، حذف، إلغاء حملة — يتطلب لمسة ثانية
 * مقصودة (تأكيد صريح) بعد اللمسة الأولى. الويب يطبّق المعيار عبر Dialog؛
 * الموبايل كان يطلق الفعل بلمسة واحدة مباشرة (فجوة تكافؤ W-26).
 *
 * هنا الأداة الموحدة على نمط React Native: Alert.alert بنمط مدمِر
 * (button destructive على iOS) + عناوين عربية متسقة مع الويب.
 */
import { Alert, AlertButton } from 'react-native'

export interface ConfirmOptions {
  /** عنوان الحوار — قصير ومباشر. */
  title: string
  /** شرح العاقبة — ماذا سيحدث فعليًا عند التأكيد. */
  message: string
  /** نص زر التأكيد (افتراضي «تأكيد»). */
  confirmText?: string
  /** نص زر الإلغاء (افتراضي «رجوع»). */
  cancelText?: string
  /** نمط مدمِر (أحمر على iOS) — الافتراضي true للحذف/الإرسال الجماعي. */
  destructive?: boolean
}

/**
 * يعرض حوار تأكيد ويعيد Promise<boolean>:
 *   true  — المستخدم أكّد عمدًا (زر التأكيد)
 *   false — رجوع/إغلاق الحوار
 *
 * الاستخدام:
 *   onPress={async () => {
 *     if (await confirmAction({ title: '…', message: '…' })) sendMutation.mutate(item.id)
 *   }}
 */
export function confirmAction(opts: ConfirmOptions): Promise<boolean> {
  const {
    title,
    message,
    confirmText = 'تأكيد',
    cancelText = 'رجوع',
    destructive = true,
  } = opts

  return new Promise((resolve) => {
    const buttons: AlertButton[] = [
      {
        text: cancelText,
        style: 'cancel',
        onPress: () => resolve(false),
      },
      {
        text: confirmText,
        style: destructive ? 'destructive' : 'default',
        onPress: () => resolve(true),
      },
    ]
    // ترتيب الأزرار: iOS يعرضها من اليمين؛ Android يقلبها — كلاهما مقبول
    Alert.alert(title, message, buttons, { cancelable: true })
  })
}

/** صياغة عدد المستلمين للتأكيد قبل الإرسال الجماعي (W-01 mobile). */
export function recipientCountMessage(count: number | null | undefined): string {
  if (typeof count !== 'number' || !Number.isFinite(count)) {
    return 'سيُرسَل البث إلى جمهورك الآن ولا يمكن التراجع بعد الإرسال.'
  }
  if (count === 0) {
    return 'لا مشتركين مطابقين لشروط هذا البث — لن يصل أحد.'
  }
  return `سيصل هذا البث إلى ${count.toLocaleString('ar-LY')} مشترك الآن ولا يمكن التراجع بعد الإرسال.`
}
