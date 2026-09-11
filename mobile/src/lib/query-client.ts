/**
 * SmartBot Mobile — QueryClient المفرد.
 *
 * المزود في app/_layout.tsx يغلّف التطبيق به. الحاجة الأهم لملف مستقل:
 * AuthProvider (state/auth.tsx) يستدعي queryClient.clear() عند الخروج
 * وعند 401 المركزي (M-08) — تنقية كاملة لذاكرة React Query حتى لا يرى
 * مستخدم ثانٍ على نفس الجهاز وميض بيانات المستأجر السابق.
 */
import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // لا نافذة على الموبايل — polling صريح حيث يلزم (نفس إيقاعات الويب)
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})
