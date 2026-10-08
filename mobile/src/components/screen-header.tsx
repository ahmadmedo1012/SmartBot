/**
 * ترويسة شاشة موحدة لشاشات الـ stack — زر رجوع (DirectionalIcon: في RTL
 * يشير يمينًا) + عنوان + فعل اختياري.
 */
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/hooks/use-theme'
import { press, spacing, TOUCH_TARGET } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { DirectionalIcon } from '@/components/directional-icon'
import { PressableScale } from '@/components/pressable-scale'
import { LoadingState } from '@/components/state-views'

export function ScreenHeader({
  title,
  subtitle,
  action,
  loading,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  loading?: boolean
}) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + spacing.sm, borderBottomColor: colors.border },
      ]}
    >
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
  )
}

/** غلاف شاشة stack كامل: ترويسة + محتوى قابل للتمرير. */
export function StackScreen({
  title,
  subtitle,
  action,
  children,
  isLoading,
}: {
  title: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
  isLoading?: boolean
}) {
  const { colors } = useTheme()
  if (isLoading) return <LoadingState />
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader title={title} subtitle={subtitle} action={action} />
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
})
