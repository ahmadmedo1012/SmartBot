/**
 * مدخل الجذر — موجّه حسب حالة الجلسة (auth guard واحد، لا مزاوجة screens).
 * M-24: الجلسة المستعادة لمستخدم لم يكمل التهيئة → معالج onboarding مباشرة.
 */
import { Redirect } from 'expo-router'
import { useAuth } from '@/state/auth'
import { LoadingState } from '@/components/state-views'

export default function Index() {
  const { status, user } = useAuth()
  if (status === 'loading') return <LoadingState />
  if (status === 'authenticated') {
    return <Redirect href={user && user.onboardingCompleted === false ? '/(app)/onboarding' : '/(app)/(tabs)/'} />
  }
  return <Redirect href="/(auth)/login" />
}
