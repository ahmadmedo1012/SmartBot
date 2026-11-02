/**
 * مجموعة التطبيق الرئيسية — محمية بالمصادقة (حارس واحد).
 * M-24: من لم يكمل onboarding يوجَّه لمعالج ربط الصفحة (نفس رحلة الويب) —
 * الحارس هنا + في app/index.tsx (عند الاستعادة). حماية المسار الحالي
 * تمنع حلقة التوجيه (شاشة onboarding نفسها داخل هذه المجموعة).
 *
 * GAP-BOT-1 (P42-5a): هذه المجموعة هي التوأم الجوّالي لبوابة AuthGuard
 * الويب — إيقاف المنظمة يعرض هنا الحالة الكاملة الصادقة (SuspendedState).
 */
import { Redirect, Stack, usePathname } from 'expo-router'
import { useTheme } from '@/hooks/use-theme'
import { useAuth } from '@/state/auth'
import { LoadingState } from '@/components/state-views'
import { SuspendedState } from '@/components/suspended-state'

export default function AppLayout() {
  const { colors } = useTheme()
  const { status, user, suspended } = useAuth()
  const pathname = usePathname()

  if (status === 'loading') return <LoadingState />
  if (status !== 'authenticated') return <Redirect href="/(auth)/login" />

  /* GAP-BOT-1 (P42-5a): الإيقاف يسبق كل شيء داخل الغلاف — صفحة كاملة
   * صادقة (توأم AuthGuard.tsx:125-162 الويب) مكان كل الشاشات: الإيقاف
   * يمنع كل مسارات التطبيق فلا معنى لعرضها، وحلقة «أعد المحاولة»
   * المضلِّلة تنتهي. العلم يرفعه المعالج المركزي (services/api.ts)
 * ويصفّره استطلاع /api/me داخل الحالة عند رفع الدعم للإيقاف. */
  if (suspended) return <SuspendedState />

  // التهيئة غير المكتملة → المعالج (إلا إذا كنا فيه بالفعل — منع حلقة)
  const onOnboarding = pathname === '/onboarding'
  if (user && user.onboardingCompleted === false && !onOnboarding) {
    return <Redirect href="/(app)/onboarding" />
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" />
    </Stack>
  )
}
