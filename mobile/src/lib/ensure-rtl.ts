/**
 * SmartBot Mobile — إقلاع RTL المضمون من أول فتح بعد تثبيت نظيف.
 *
 * السبب الجذري (مؤكد بالاختبار الفعلي): I18nManager.forceRTL يكتب إعدادًا
 * أصليًا (Android SharedPreferences / iOS UserDefaults) يُقرأ عند إنشاء جسر
 * React فقط — استدعاؤه داخل الجلسة الحالية لا يغير اتجاه أي شاشة مرسومة.
 * لذلك: التثبيت النظيف → أول فتح LTR (عربي بترتيب أعمدة أوروبي = مكسور
 * بصريًا) → الفتح الثاني فقط RTL. وهذا ما رآه المالك على جهازه الحقيقي.
 *
 * النمط المعتمد من المالك:
 *   if (I18nManager.isRTL !== true) {
 *     I18nManager.allowRTL(true)
 *     I18nManager.forceRTL(true)
 *     await Updates.reloadAsync()   // DevSettings.reload() في التطوير
 *   }
 *
 * تشديدات إضافية فوق النمط (مغطاة بـ ensure-rtl.test.ts):
 *   1. حارس AsyncStorage «مرة واحدة لكل تثبيت» — يستحيل وقوع حلقة إعادة
 *      تحميل لا نهائية إذا رفضت البيئة تطبيق RTL بعد إعادة التحميل.
 *   2. مساران حسب البيئة: __DEV__ → DevSettings.reload() (Expo Go وبنيات
 *      التطوير)، الإنتاج → Updates.reloadAsync() (يعيد إنشاء الجسر الأصلي
 *      في بنيات EAS ويقرأ الإsetting الجديد فورًا).
 *   3. أي فشل/تعطل تخزين → "deferred": الإعداد الأصلي المكتوب سلفًا
 *      يلتقطه الإقلاع البارد التالي حتمًا — لا سيناريو بلا مخرج.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import { DevSettings, I18nManager } from 'react-native'
import * as Updates from 'expo-updates'

const BOOTSTRAP_KEY = 'smartbot.rtl_bootstrapped_v1'

export type RtlBootstrapResult = 'already-rtl' | 'reloaded' | 'deferred'

/**
 * بوابة الإقلاع — تُستدعى من _layout.tsx قبل رسم أي محتوى (شاشة البداية
 * ما زالت ظاهرة). إن قررت إعادة التحميل فتبدأ الجلسة من جديد والاتجاه
 * RTL من أول إطار: المستخدم يرى «شاشة البداية ثم التطبيق RTL كاملًا»
 * كله داخل أول فتح بعد التثبيت النظيف.
 */
export async function ensureRTL(): Promise<RtlBootstrapResult> {
  // 1) المسار السريع — الاتجاه مفعل (كل الإقلاعات بعد الأول، وأي جهاز
  //    لغته عربية مع supportsRTL). صفر عمليات تخزين، صفر إعادة تحميل.
  if (I18nManager.isRTL === true) return 'already-rtl'

  // 2) اكتب الإعداد الأصلي فورًا (متزامن) — يبقى للأبد: أي إقلاع بارد
  //    لاحق لهذا التثبيت يبدأ RTL من أول إطار بلا أي منطق إضافي.
  I18nManager.allowRTL(true)
  I18nManager.forceRTL(true)

  // 3) حارس المرة الواحدة — اقرأ/سجّل العلم بأمان، وأي خلل تخزين يعني
  //    تأجيلًا (لا نعيد التحميل عمياء: الخطر الوحيد هنا هو حلقة لا نهائية).
  try {
    const flagged = await AsyncStorage.getItem(BOOTSTRAP_KEY)
    if (flagged === '1') {
      // أعدنا التحميل سابقًا وisRTL ما زال false — البيئة لا تقرأ
      // الإعداد عبر إعادة التحميل (مثل react-native-web/معاينة). توقف
      // بأمان؛ الإقلاع البارد التالي يلتقط الإعداد المكتوب في (2).
      return 'deferred'
    }
    await AsyncStorage.setItem(BOOTSTRAP_KEY, '1')
  } catch {
    // تخزين معطوب/غير متاح — تأجيل آمن، الإقلاع البارد التالي يسري.
    return 'deferred'
  }

  // 4) أعد إنشاء الجسر الأصلي ليقرأ forceRTL الآن.
  try {
    if (__DEV__) {
      // Expo Go وبنيات التطوير: يعيد تشغيل وقت JS الأصلي كاملًا.
      DevSettings?.reload?.()
      return 'reloaded'
    }
    // بنيات الإنتاج (EAS): يعيد بناء الجسر من الحزمة المضمّنة.
    await Updates.reloadAsync()
    return 'reloaded'
  } catch {
    // بيئة بلا دعم إعادة التحميل (Expo Go القديمة مثلًا) — الإقلاع
    // البارد التالي يبدأ RTL حتمًا بسبب (2).
    return 'deferred'
  }
}
