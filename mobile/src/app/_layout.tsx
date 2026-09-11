/**
 * SmartBot Mobile — التخطيط الجذري.
 *
 * - RTL عربي أولًا (I18nManager.forceRTL — التطبيق عربي بالكامل مثل الويب).
 * - الخطوط: Cairo (متن) + Readex Pro (عناوين) — نفس هوية الويب.
 * - المزودات: QueryClient (نفس مكتبة الويب) + AuthProvider.
 */
import { I18nManager } from 'react-native'
import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  useFonts,
  Cairo_400Regular,
  Cairo_600SemiBold,
  Cairo_700Bold,
} from '@expo-google-fonts/cairo'
import {
  ReadexPro_300Light,
  ReadexPro_400Regular,
  ReadexPro_500Medium,
  ReadexPro_600SemiBold,
  ReadexPro_700Bold,
} from '@expo-google-fonts/readex-pro'
import * as SplashScreen from 'expo-splash-screen'
import { dark } from '@/constants/theme'
import { AuthProvider, useAuth } from '@/state/auth'
import { LoadingState } from '@/components/state-views'

// عربي أولًا — قبل أي رسم (يُطبق من الإقلاع الأول)
I18nManager.allowRTL(true)
I18nManager.forceRTL(true)

SplashScreen.preventAutoHideAsync()

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // لا نافذة على الموبايل — polling صريح حيث يلزم (نفس إيقاعات الويب)
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
  },
})

function AppShell() {
  const { status } = useAuth()
  const [fontsLoaded] = useFonts({
    Cairo_400Regular,
    Cairo_600SemiBold,
    Cairo_700Bold,
    ReadexPro_300Light,
    ReadexPro_400Regular,
    ReadexPro_500Medium,
    ReadexPro_600SemiBold,
    ReadexPro_700Bold,
  })

  useEffect(() => {
    if (fontsLoaded && status !== 'loading') {
      SplashScreen.hideAsync().catch(() => undefined)
    }
  }, [fontsLoaded, status])

  if (!fontsLoaded || status === 'loading') {
    return <LoadingState label="جارٍ تجهيز SmartBot…" />
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: dark.background } }}>
      {/* تفويض التنقل: (auth)/(app) تقرران حسب حالة الجلسة */}
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(app)" />
    </Stack>
  )
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <StatusBar style="light" />
        <AppShell />
      </AuthProvider>
    </QueryClientProvider>
  )
}
