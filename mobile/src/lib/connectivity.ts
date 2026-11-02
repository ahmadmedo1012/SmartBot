/**
 * SmartBot Mobile — عقد الاتصال المشترك (GAP-X2 · P42-5b).
 *
 * مسند واحد لسؤال واحد: «هل الجهاز متصل بشبكة تعمل؟» — يستهلكه مصدران:
 *   1. لافتة الانقطاع (components/connectivity-banner.tsx) — عرضٌ فقط.
 *   2. سلك react-query (lib/query-client.ts) — onlineManager يتغذى من
 *      NetInfo فتتوقف الاستعلامات أثناء الانقطاع وتتجدد الفانية عند
 *      العودة (refetchOnReconnect).
 *
 * لماذا ملف مستقل؟ ليبقى مسندًا صافيًا (TS بلا استيراد تشغيلي — استيراد
 * نوع NetInfoState يُمحى عند البناء) تستورده الوحدات الصافية (query-client)
 * دون سحب react-native، ويُختبر سلوكيًا في بيئة node (connectivity.test.ts).
 *
 * دلالة الحقول (عقد @react-native-community/netinfo):
 *   - isConnected = false → لا واجهة شبكة أصلًا → انقطاع مؤكد.
 *   - isInternetReachable = false → واجهة موجودة لكن الإنترنت لا يصل
 *     (بوابة خانقة/DNS ميت) → انقطاع مؤكد كذلك.
 *   - isInternetReachable = null → لم يُحسم بعد (بعض المنصات لا تفحصه) —
 *     نقرّه اتصالًا: اللافتة لا تظهر إلا عند انقطاع مؤكد، والفشل الفعلي
 *     يظل يظهر كخطأ صادق بإعادة محاولة (ErrorState) لا كحالة انقطاع.
 *
 * هذا هو التمييز الصادق بين الانقطاع وفشل الخادم: اللافتة مسؤولة عن
 * الجهاز/الشبكة فقط؛ فشل الخادم (5xx/مهلة) يحدث والجهاز متصل — يظهر
 * كخطأ عام بإعادة محاولة على السطح نفسه، لا كلافتة انقطاع.
 */
import type { NetInfoState } from '@react-native-community/netinfo'

/** هل الحالة اتصال فعلي؟ (انقطاع مؤكد فقط يعيد false — null = غير محسوم = متصل) */
export function isNetReachable(state: NetInfoState): boolean {
  return Boolean(state.isConnected && state.isInternetReachable !== false)
}
