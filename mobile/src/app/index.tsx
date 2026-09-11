/**
 * مدخل الجذر — موجّه حسب حالة الجلسة (auth guard واحد، لا مزاوجة screens).
 */
import { Redirect } from 'expo-router'
import { useAuth } from '@/state/auth'
import { LoadingState } from '@/components/state-views'

export default function Index() {
  const { status } = useAuth()
  if (status === 'loading') return <LoadingState />
  return <Redirect href={status === 'authenticated' ? '/(app)/(tabs)/' : '/(auth)/login'} />
}
