/**
 * مجموعة التطبيق الرئيسية — محمية بالمصادقة (حارس واحد).
 * من لم يكمل onboarding يوجَّه لمعالج ربط الصفحة (نفس رحلة الويب).
 */
import { Redirect, Stack } from 'expo-router'
import { useTheme } from '@/hooks/use-theme'
import { useAuth } from '@/state/auth'
import { LoadingState } from '@/components/state-views'

export default function AppLayout() {
  const { colors } = useTheme()
  const { status } = useAuth()

  if (status === 'loading') return <LoadingState />
  if (status !== 'authenticated') return <Redirect href="/(auth)/login" />

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
