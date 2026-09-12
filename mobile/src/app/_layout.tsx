/**
 * SmartBot Mobile — التخطيط الجذري.
 *
 * - RTL عربي أولًا: كتابة الإعداد الأصلي قبل أي رسم + بوابة ensureRTL
 *   (نمط المالك) تضمن اتجاه RTL صحيحًا من أول فتح بعد تثبيت نظيف —
 *   ليس من الفتح الثاني كما كان قبل الإصلاح.
 * - الخطوط: Cairo (متن) + Readex Pro (عناوين) — نفس هوية الويب.
 * - المزودات: QueryClient (نفس مكتبة الويب) + AuthProvider.
 */
import { I18nManager } from 'react-native'
import { useEffect, useState } from 'react'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { QueryClientProvider } from '@tanstack/react-query'
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
import { queryClient } from '@/lib/query-client'
import { ensureRTL } from '@/lib/ensure-rtl'
import { AuthProvider, useAuth } from '@/state/auth'
import { LoadingState } from '@/components/state-views'

// عربي أولًا — قبل أي رسم: يُكتب الإعداد الأصلي في كل إقلاع JS (يبقى
// للأبد)، وبوابة ensureRTL أدناه تفرض سريانه فورًا داخل أول فتح.
I18nManager.allowRTL(true)
I18nManager.forceRTL(true)

SplashScreen.preventAutoHideAsync()

function AppShell() {
  const { status } = useAuth()
  const [rtlReady, setRtlReady] = useState(false)
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

  // بوابة RTL: لا نرسم أي شاشة قبل حسم الاتجاه. إن قررت البوابة إعادة
  // التحميل (تثبيت نظيف أول مرة) فستبدأ الجلسة من جديد RTL من أول إطار
  // وشاشة البداية تظل ظاهرة خلالها — المستخدم لا يرى أي وميض LTR.
  useEffect(() => {
    let alive = true
    ensureRTL().then(() => {
      if (alive) setRtlReady(true)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (fontsLoaded && rtlReady && status !== 'loading') {
      SplashScreen.hideAsync().catch(() => undefined)
    }
  }, [fontsLoaded, rtlReady, status])

  if (!fontsLoaded || !rtlReady || status === 'loading') {
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
