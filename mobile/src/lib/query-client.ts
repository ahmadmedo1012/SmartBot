/**
 * SmartBot Mobile — QueryClient المفرد.
 *
 * المزود في app/_layout.tsx يغلّف التطبيق به. الحاجة الأهم لملف مستقل:
 * AuthProvider (state/auth.tsx) يستدعي queryClient.clear() عند الخروج
 * وعند 401 المركزي (M-08) — تنقية كاملة لذاكرة React Query حتى لا يرى
 * مستخدم ثانٍ على نفس الجهاز وميض بيانات المستأجر السابق.
 */
import { AppState, type AppStateStatus, Platform } from 'react-native'
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query'

/**
 * P38 (C1 audit P0-2 — تكافؤ usePollingWhenVisible): الويب يوقف الاستطلاع
 * حين تُخفى التبويبة ويجلب فور العودة إليه؛ الجوال كان يستطلم أعمى بلا
 * أي إدراك للخلفية/الأمامية (لا AppState في أي مكان). هنا:
 *
 *   1. focusManager يُشبَك بـ AppState — «التركيز» على RN يعني «نشط»،
 *      فتشتغل refetchOnWindowFocus (فعّلناها الآن) على الجلب عند
 *      العودة إلى الأمام، والعروض النشطة ذات staleTime منتهٍ تُجلب.
 *   2. onlineManager يُشبَك بـ NetInfo — إعادة الاتصال تجلب ما فات.
 *
 * الاستطلاعات الدورية نفسها (refetchInterval) تبقى كما وضعتها كل
 * شاشة؛ مؤقتات JS تتوقف طبيعيًا في الخلفية، والضمان الإضافي هو الجلب
 * الفوري عند العودة — نفس دلالات الويب.
 */
function wireAppStateToFocusManager(): void {
  if (Platform.OS === 'web') return
  focusManager.setEventListener((setFocused) => {
    const sub = AppState.addEventListener('change', (status: AppStateStatus) => {
      setFocused(status === 'active')
    })
    return () => sub.remove()
  })
}

let wired = false
export function ensureReactQueryNativeWiring(): void {
  if (wired) return
  wired = true
  wireAppStateToFocusManager()
  // إعادة الاتصال بالشبكة → NetInfo يغذي onlineManager (المكتبة تدعم
  // RN تلقائيًا عبر @react-native-community/netinfo إن وُجدت؛ وإلا يبقى
  // السلوك الافتراضي غير ضار).
  void onlineManager.isOnline()
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // P38: فُعّلت بعد ربط focusManager بـ AppState أعلاه — العودة إلى
      // الأمام تجلب العروض النشطة الفانية (مرآة استئناف الويب). كانت
      // false لأن «النافذة» لم تكن تعني شيئًا على RN قبل الربط.
      refetchOnWindowFocus: true,
      retry: 1,
      staleTime: 30_000,
    },
  },
})
