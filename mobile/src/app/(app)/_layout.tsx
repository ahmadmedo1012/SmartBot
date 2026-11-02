/**
 * مجموعة التطبيق الرئيسية — محمية بالمصادقة (حارس واحد).
 * M-24: من لم يكمل onboarding يوجَّه لمعالج ربط الصفحة (نفس رحلة الويب) —
 * الحارس هنا + في app/index.tsx (عند الاستعادة). حماية المسار الحالي
 * تمنع حلقة التوجيه (شاشة onboarding نفسها داخل هذه المجموعة).
 *
 * GAP-BOT-1 (P42-5a): هذه المجموعة هي التوأم الجوّالي لبوابة AuthGuard
 * الويب — إيقاف المنظمة يعرض هنا الحالة الكاملة الصادقة (SuspendedState).
 *
 * GAP-X2 (P42-5b): لافتة انقطاع الاتصال تُركّب هنا — فوق المتنقل فترثها
 * كل شاشات الدخول (توأم شريط role="status" في messages الويب، لكنه هنا
 * على مستوى الغلاف لا شاشة واحدة). الإيقاف الكامل يسبقها بعقد GAP-BOT-1:
 * حالة كاملة تحل محل الشجرة ولا تُزاح؛ استطلاعها /api/me يتوقف عند
 * الانقطاع ويتجدد تلقائيًا عبر سلك NetInfo←onlineManager
 * (lib/query-client.ts) فلا حاجة للافتة داخل عقدها.
 */
import { Redirect, Stack, usePathname } from 'expo-router'
import { View } from 'react-native'
import { useTheme } from '@/hooks/use-theme'
import { useAuth } from '@/state/auth'
import { LoadingState } from '@/components/state-views'
import { SuspendedState } from '@/components/suspended-state'
import { ConnectivityBanner } from '@/components/connectivity-banner'

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
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* GAP-X2: لافتة الانقطاع أعلى المتنقل — كل شاشة موثّقة ترثها.
          الغلاف شفاف حين الاتصال سليم (اللافتة ترسم null داخلها). */}
      <ConnectivityBanner />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
      </Stack>
    </View>
  )
}
