/**
 * SmartBot Mobile — لافتة انقطاع الاتصال (GAP-X2 · P42-5b).
 *
 * التوأم الجوّالي لشريط role="status" في صفحة الرسائل الويب
 * (fb_dashboard/frontend/src/app/dashboard/messages/page.tsx:801-812 —
 * v24-R1): تحذير على أرض warning-soft بحبر warning وأيقونة WifiOff
 * والنسخة الحرفية «انقطع الاتصال بالإنترنت — سيتم إعادة المحاولة
 * تلقائياً»، يعلن التغيير بلا سرقة التركيز.
 *
 * ما الذي يجعل وعد «إعادة المحاولة تلقائياً» صادقًا على الجوال:
 * السلك في lib/query-client.ts (onlineManager.setEventListener عبر
 * NetInfo) يجعل react-query يتوقف عن الجلب أثناء الانقطاع ويجدد كل
 * استعلام فانٍ لحظة العودة (refetchOnReconnect) — فالشاشة التي
 * يراها المستخدم تحت اللافتة لا تدّعي أنها حية، وعودتها للشبكة
 * تجددها فعلًا. الطفرات لا تُنجح كذبًا أبدًا: النجاح (onSuccess)
 * لا يُ fired إلا بعد رد الخادم الفعلي.
 *
 * حدود صادقة (مقصودة):
 *   - اللافتة تعلن حالة الجهاز/الشبكة فقط (NetInfo: isConnected +
 *     isInternetReachable≠false) — فشل الخادم (5xx/مهلة) يحدث والجهاز
 *     متصل، فيظهر كخطأ عام بإعادة محاولة على السطح نفسه (ErrorState)،
 *     لا كلافتة انقطاع. هذا هو التمييز بين الانقطاع وفشل الخادم.
 *   - تُركَّب في غلاف المجموعة الموثَّقة (app)/_layout فوق المتنقل —
 *     كل شاشات الدخول ترثها؛ حالة الإيقاف الكاملة (SuspendedState)
 *     تحل محل الشجرة قبلها بعقد GAP-BOT-1 ولا تُزاح (استطلاعها
 *     /api/me يتوقف عند الانقطاع ويتجدد تلقائيًا بنفس السلك).
 *   - الحالة الابتدائية «متصل» — اللافتة تظهر فقط بعد تأكيد NetInfo
 *     الانقطاع، فلا تومض عند كل فتح شاشة.
 */
import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import NetInfo from '@react-native-community/netinfo'

import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Icon } from '@/components/icon'
import { isNetReachable } from '@/lib/connectivity'

/** النسخة الحرفية للويب (messages/page.tsx:810) — لا صياغة جوّالية خاصة. */
export const OFFLINE_BANNER_MESSAGE = 'انقطع الاتصال بالإنترنت — سيتم إعادة المحاولة تلقائياً'

export function ConnectivityBanner() {
  const { colors } = useTheme()
  const [online, setOnline] = useState(true)

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(isNetReachable(state))
    })
    return () => unsubscribe()
  }, [])

  if (online) return null

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: colors.warningSoft, borderBottomColor: colors.warning },
      ]}
      /* مرآة role="status" الويب: إعلان التغيير بلا سرقة التركيز —
       * alert + liveRegion-polite هو أقرب ما تقدمه RN (لا يوجد دور
       * status أصلي). */
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      accessibilityLabel={OFFLINE_BANNER_MESSAGE}
    >
      <Icon name="wifi-off" size={14} color={colors.warning} />
      <AppText variant="caption" style={{ color: colors.warning, fontWeight: '500', flex: 1 }}>
        {OFFLINE_BANNER_MESSAGE}
      </AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  /* مرآة h-9 (36px) gap-2 الويب — شريط رفيع تحت الترويسة */
  banner: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
})
