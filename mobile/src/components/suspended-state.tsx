/**
 * SmartBot Mobile — الحالة الصادقة لإيقاف المنظمة (GAP-BOT-1 · P42-5a).
 *
 * التوأم الجوّالي لصفحة الإيقاف في AuthGuard الويب
 * (fb_dashboard/frontend/src/app/dashboard/AuthGuard.tsx:125-162 — W2-BOT-4):
 * الإيقاف يرفعه حارس الجلسة الخادمي (routers/auth.py:115 «حساب المنظمة
 * موقوف أو محذوف — تواصل مع الدعم») على كل نداء للتاجر الموقوف، فتظهر
 * هنا صفحة كاملة تشرح الإيقاف وتنقض «أعد المحاولة» (إعادة المحاولة لا
 * تنجح أبدًا: الحالة على الخادم) — بدل حلقة الأخطاء المضلِّلة التي كان
 * يدور فيها المستخدم الجوّال على كل شاشة.
 *
 * الفروق المقصودة عن الويب (موثّقة بصدق):
 *   - قناة الدعم بابٌ فعّال هنا: الويب يكتفي بالنسخة، والجوال يجعل
 *     واتساب الدعم/هاتفه قابلين للفتح (expo-linking) — القناة العامة
 *     GET /api/support/info بلا مصادقة فتعمل تحت الإيقاف.
 *   - الاستطلاع: الويب يلتقط رفع الإيقاف عبر useMe (refetchInterval
 *     60s)؛ الجوال يستطلع /api/me كل 60 ثانية + عند العودة إلى الأمام
 *     (سلك focusManager←AppState) — الحالة الصادقة ليست سجنًا دائمًا.
 *
 * يُركَّب من (app)/_layout.tsx (الحارس الجوّالي) — أول 403 إيقاف من أي
 * شاشة يرفعه عبر المعالج المركزي في services/api.ts.
 */
import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import * as Linking from 'expo-linking'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/hooks/use-theme'
import { press, radius, spacing, TOUCH_TARGET } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Button, Card, Row } from '@/components/ui'
import { Icon } from '@/components/icon'
import { DirectionalIcon, RTL_MIRROR_STYLE } from '@/components/directional-icon'
import { PressableScale } from '@/components/pressable-scale'
import { apiGet } from '@/services/api'
import { useAuth } from '@/state/auth'
import type { PublicConfig, User } from '@/types/api'

/** استطلاع رفع الإيقاف — نفس إيقاع useMe الويب (60 ثانية). */
const RECHECK_KEY = ['suspended-recheck'] as const
const RECHECK_INTERVAL_MS = 60_000

/** يحوّل الأرقام العربية الشرقية إلى لاتينية ثم يجرد كل غير الرقمي. */
function onlyDigits(input: string): string {
  return String(input ?? '')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\D/g, '')
}

/**
 * رقم واتساب بالشكل الدولي المجرد الذي يطلبه wa.me (218xxxxxxxxx).
 * عقد الإعداد الخادمي (routers/support.py) يحمل الشكل الدولي أصلًا
 * («218910089975» افتراضيًا) — هنا نحتاط للصيغ المحلية/00 فقط.
 */
function whatsappDigits(raw: string | undefined): string | null {
  const d = onlyDigits(raw ?? '')
  if (!d) return null
  if (d.startsWith('00218')) return d.slice(2)
  if (d.startsWith('218')) return d
  if (d.startsWith('0')) return `218${d.slice(1)}`
  return d
}

export function SuspendedState() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const { logout, clearSuspended } = useAuth()

  /* قناة الدعم — GET /api/support/info عام (بلا مصادقة) فيعمل تحت الإيقاف
   * (نفس مفتاح ذاكرة شاشة الدعم — لا نداء مكرر بعدها). */
  const { data: info } = useQuery<PublicConfig>({
    queryKey: ['support-info'],
    queryFn: () => apiGet<PublicConfig>('/api/support/info'),
  })

  /* التوأم الجوّالي لاستطلاع AuthGuard الويب: كل 60 ثانية + عند العودة
   * إلى الأمام. الفشل المستمر (ما زال موقوفًا/انقطاع) يبقى صامتًا —
   * الحالة نفسها هي الشرح؛ النجاح يرفع الإيقاف فورًا. retry:false: الرفض
   * 403 حاسم ولا يستحق ثلاث محاولات انتقامية. */
  const { data: recheck } = useQuery<{ user: User }>({
    queryKey: [...RECHECK_KEY],
    queryFn: () => apiGet<{ user: User }>('/api/me'),
    refetchInterval: RECHECK_INTERVAL_MS,
    retry: false,
  })

  useEffect(() => {
    if (recheck) {
      /* أزل استعلام النجاح من الذاكرة قبل رفع الحالة — وإلا فبياناته
       * المخزنة قد «تُصعّد» إيقافًا لاحقًا بمجرد إعادة تركيب الحالة. */
      queryClient.removeQueries({ queryKey: [...RECHECK_KEY] })
      clearSuspended()
    }
  }, [recheck, queryClient, clearSuspended])

  const wa = whatsappDigits(info?.support_whatsapp)
  const tel = onlyDigits(info?.support_phone ?? '')

  return (
    <View
      style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top, paddingBottom: insets.bottom }]}
      accessibilityRole="alert"
      accessibilityLabel="حساب منظمتك موقوف"
    >
      <View style={styles.center}>
        <Card style={styles.card}>
          {/* مرآة الويب: بئر دائري 48px أرضه destructive-soft + درع تنبيه */}
          <View style={[styles.iconWell, { backgroundColor: colors.destructiveSoft }]}>
            <Icon name="shield-alert" size={24} color={colors.destructive} />
          </View>
          <AppText variant="subtitle" align="center" style={{ marginTop: spacing.lg }}>
            حساب منظمتك موقوف
          </AppText>
          <AppText variant="small" color="mutedFg" align="center" style={{ marginTop: spacing.sm }}>
            لا يمكنك استخدام التطبيق حتى يُرفع الإيقاف. بياناتك محفوظة كما هي — تواصل مع الدعم لمعرفة السبب وخطوات استعادة الحساب.
          </AppText>
          <AppText variant="caption" color="mutedFg" align="center" style={{ marginTop: spacing.md }}>
            إعادة المحاولة لن تنجح — الإيقاف حالة على الخادم تُرفع من جانب الدعم فقط.
          </AppText>

          {/* قناتا الدعم — بابان فعّالان (النسخة ترشد إليهما والباب يفتحهما) */}
          <View style={{ gap: spacing.sm, marginTop: spacing.lg, alignSelf: 'stretch' }}>
            {wa ? (
              <PressableScale
                accessibilityLabel={`تواصل مع الدعم عبر واتساب ${info?.support_whatsapp}`}
                onPress={() => Linking.openURL(`https://wa.me/${wa}`).catch(() => undefined)}
                style={[styles.door, { borderColor: colors.border }]}
                scaleTo={press.button}
              >
                <Row style={{ gap: spacing.sm }}>
                  <Icon name="message-circle" size={18} color={colors.success} />
                  <AppText variant="small" style={{ flex: 1 }}>
                    واتساب الدعم: {info?.support_whatsapp}
                  </AppText>
                  <DirectionalIcon semanticDirection="forward" variant="chevron" size={16} color={colors.mutedFg} />
                </Row>
              </PressableScale>
            ) : null}
            {tel ? (
              <PressableScale
                accessibilityLabel={`اتصل بالدعم ${info?.support_phone}`}
                onPress={() => Linking.openURL(`tel:${tel}`).catch(() => undefined)}
                style={[styles.door, { borderColor: colors.border }]}
                scaleTo={press.button}
              >
                <Row style={{ gap: spacing.sm }}>
                  <Icon name="phone" size={18} color={colors.info} />
                  <AppText variant="small" style={{ flex: 1 }}>
                    هاتف الدعم: {info?.support_phone}
                  </AppText>
                  <DirectionalIcon semanticDirection="forward" variant="chevron" size={16} color={colors.mutedFg} />
                </Row>
              </PressableScale>
            ) : null}
          </View>

          {/* نفس عقد الخروج في الويب (AuthGuard) — الباب الوحيد المتاح */}
          <View style={{ marginTop: spacing.lg, alignSelf: 'stretch' }}>
            <Button
              title="تسجيل الخروج"
              variant="secondary"
              icon={
                <View style={RTL_MIRROR_STYLE}>
                  <Icon name="log-out" size={14} color={colors.foreground} />
                </View>
              }
              onPress={() => logout()}
            />
          </View>
        </Card>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { alignSelf: 'stretch', maxWidth: 420, alignItems: 'center' },
  /* مرآة الويب: size-12 rounded-full bg-destructive/10 */
  iconWell: { width: 48, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  door: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
  },
})
