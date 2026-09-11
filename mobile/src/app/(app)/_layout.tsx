/**
 * مجموعة التطبيق الرئيسية — محمية بالمصادقة (حارس واحد).
 * M-24: من لم يكمل onboarding يوجَّه لمعالج ربط الصفحة (نفس رحلة الويب) —
 * الحارس هنا + في app/index.tsx (عند الاستعادة). حماية المسار الحالي
 * تمنع حلقة التوجيه (شاشة onboarding نفسها داخل هذه المجموعة).
 */
import { Redirect, Stack, usePathname } from 'expo-router'
import { useTheme } from '@/hooks/use-theme'
import { useAuth } from '@/state/auth'
import { LoadingState } from '@/components/state-views'

export default function AppLayout() {
  const { colors } = useTheme()
  const { status, user } = useAuth()
  const pathname = usePathname()

  if (status === 'loading') return <LoadingState />
  if (status !== 'authenticated') return <Redirect href="/(auth)/login" />

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
