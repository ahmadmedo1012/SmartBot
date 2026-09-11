/**
 * SmartBot Mobile — إعدادات عامة.
 *
 * EXPO_PUBLIC_API_URL هو المتغير العام الوحيد المسموح به في الـ bundle:
 * عنوان الـ Backend الإنتاجي (لا secrets إطلاقًا — التوكن في SecureStore
 * يُدار وقت التشغيل فقط ولا يُدمج في البناء).
 */
export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? 'https://api.smart-link.ly'

export const APP_NAME = 'SmartBot'
export const APP_VERSION = '1.0.0'

/** مهلة الطلب الافتراضية (ms) — متوافقة مع إيقاع الويب. */
export const REQUEST_TIMEOUT_MS = 20_000

/** إعادة المحاولة على أعطال الشبكة العابرة فقط (GET آمنة). */
export const GET_RETRIES = 2
