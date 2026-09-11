/**
 * مجموعة شاشات المصادقة — تظهر فقط لغير المسجلين (حارس المجموعة).
 */
import { Redirect, Stack } from 'expo-router'
import { useAuth } from '@/state/auth'
import { useTheme } from '@/hooks/use-theme'
import { LoadingState } from '@/components/state-views'

export default function AuthLayout() {
  const { status } = useAuth()
  const { colors } = useTheme()

  if (status === 'loading') return <LoadingState />
  if (status === 'authenticated') return <Redirect href="/(app)/(tabs)/" />

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  )
}
