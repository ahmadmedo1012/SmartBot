/**
 * SmartBot Mobile — QueryClient المفرد.
 *
 * المزود في app/_layout.tsx يغلّف التطبيق به. الحاجة الأهم لملف مستقل:
 * AuthProvider (state/auth.tsx) يستدعي queryClient.clear() عند الخروج
 * وعند 401 المركزي (M-08) — تنقية كاملة لذاكرة React Query حتى لا يرى
 * مستخدم ثانٍ على نفس الجهاز وميض بيانات المستأجر السابق.
 */
import { AppState, type AppStateStatus, Platform } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query'

import { isNetReachable } from '@/lib/connectivity'

/**
 * P38 (C1 audit P0-2 — تكافؤ usePollingWhenVisible): الويب يوقف الاستطلاع
 * حين تُخفى التبويبة ويجلب فور العودة إليه؛ الجوال كان يستطلم أعمى بلا
 * أي إدراك للخلفية/الأمامية (لا AppState في أي مكان). هنا:
 *
 *   1. focusManager يُشبَك بـ AppState — «التركيز» على RN يعني «نشط»،
 *      فتشتغل refetchOnWindowFocus (فعّلناها الآن) على الجلب عند
 *      العودة إلى الأمام، والعروض النشطة ذات staleTime منتهٍ تُجلب.
 *   2. onlineManager يُشبَك بـ NetInfo — إعادة الاتصال تجلب ما فات.
 *      (وُعد بها P38 ونُفذت فعلًا في GAP-X2 · P42-5b — انظر السلك أدناه.)
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

/**
 * GAP-X2 (P42-5b): سلك NetInfo ← onlineManager — سابقًا كان السطر هنا
 * `void onlineManager.isOnline()` (قراءة بلا أثر) بتعليق يوهم أن المكتبة
 * «تدعم RN تلقائيًا» — وهذا غير صحيح: onlineManager في react-query v5
 * يسجّل مستمع window online/offline افتراضيًا، وwindow على RN لا يطلق
 * هذين الحدثين أبدًا، فتبقى الحالة «متصل» للأبد مهما انقطعت الشبكة —
 * لا إيقاف جلب أثناء الانقطاع ولا تجديد (refetchOnReconnect) عند
 * العودة. العقد الموثّق للمكتبة نفسها (onlineManager.js — مثال
 * setEventListener) هو هذا السلك حرفيًا:
 *
 *   onlineManager.setEventListener((setOnline) =>
 *     NetInfo.addEventListener((state) => setOnline(!!state.isConnected)))
 *
 * نستخدم isNetReachable (المسند المشترك مع لافتة الانقطاع) بدل
 * isConnected وحده: البوابة الخانقة (isInternetReachable=false) انقطاع
 * فعلي كذلك. الأثر الصادق: الاستعلامات تتوقف (pause) أثناء الانقطاع
 * بدل رمي أخطاء وهمية، وكل استعلام فانٍ يتجدد لحظة العودة — وهذا ما
 * يجعل نسخة اللافتة «سيتم إعادة المحاولة تلقائياً» صادقة. الطفرات
 * (networkMode الافتراضي) تتوقف كذلك ولا يُنجح onSuccess إلا برد
 * الخادم الفعلي — لا شاشة قديمة تدّعي أن حفظًا حدث.
 *
 * السباق البنائي غير مؤثر: setEventListener يستبدل المستمع وينظف
 * القديم، فحتى لو اشتركت استعلامات قبل سلكنا (تأثيرات الأبناء تجري
 * أولًا) فالتسجيل اللاحق يحوّلها لمستمع NetInfo، وأول حدث NetInfo
 * يصل فور الاشتراك بحالة الشبكة الحالية فيصحح القراءة خلال أجزاء
 * من الثانية.
 */
function wireNetInfoToOnlineManager(): void {
  if (Platform.OS === 'web') return // الويب: مستمع window الافتراضي (نفس تطبيق الويب)
  onlineManager.setEventListener((setOnline) => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(isNetReachable(state))
    })
    return () => unsubscribe()
  })
}

let wired = false
export function ensureReactQueryNativeWiring(): void {
  if (wired) return
  wired = true
  wireAppStateToFocusManager()
  wireNetInfoToOnlineManager()
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
