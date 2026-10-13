/**
 * ترويسة شاشة موحدة لشاشات الـ stack — زر رجوع (DirectionalIcon: في RTL
 * يشير يمينًا) + عنوان + فعل اختياري.
 *
 * r154 (P6-2-e2): فاصل المسار (CircuitTrace) تحت الترويسة — علامة غرفة
 * الآلة (مرآة خيار trace في PageHeader الويب: `true` = عقدة لايم حية،
 * "static" = مسار إشاري فقط، false = بلا فاصل). الافتراضي true — كل
 * شاشات الـ stack تتكلم قواعد الدارة مجانًا.
 */
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/hooks/use-theme'
import { press, spacing, TOUCH_TARGET } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { DirectionalIcon } from '@/components/directional-icon'
import { CircuitTrace } from '@/components/circuit-trace'
import { PressableScale } from '@/components/pressable-scale'
import { LoadingState } from '@/components/state-views'

export function ScreenHeader({
  title,
  subtitle,
  action,
  loading,
  trace = true,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  loading?: boolean
  /** الفاصل: true = لايم حية · "static" = إشاري فقط · false = بلا فاصل */
  trace?: boolean | 'static'
}) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View
      style={{
        paddingTop: insets.top + spacing.sm,
        borderBottomColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
      }}
    >
      <View style={styles.header}>
        <PressableScale
          accessibilityLabel="رجوع"
          onPress={() => router.back()}
          style={styles.backBtn}
          scaleTo={press.button}
        >
          {/* r131: أيقونة الاتجاه من الدلالة (لا chevron-right يدويًا) —
              مرآة RTL آلية كالويب، وحجم اللمس 48px كما هو */}
          <DirectionalIcon
            semanticDirection="back"
            variant="chevron"
            size={26}
            color={colors.foreground}
          />
        </PressableScale>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" numberOfLines={1}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="caption" color="mutedFg" numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {action}
      </View>
      {/* فاصل المسار — ترويسة غرفة الآلة (مرآة hr.sb-trace تحت الويب) */}
      {trace ? <CircuitTrace variant={trace === 'static' ? 'divider' : 'live'} /> : null}
    </View>
  )
}

/** غلاف شاشة stack كامل: ترويسة + محتوى قابل للتمرير. */
export function StackScreen({
  title,
  subtitle,
  action,
  children,
  isLoading,
  trace,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  isLoading?: boolean
  trace?: boolean | 'static'
}) {
  const { colors } = useTheme()
  if (isLoading) return <LoadingState />
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={title} subtitle={subtitle} action={action} trace={trace} />
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  backBtn: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
})
