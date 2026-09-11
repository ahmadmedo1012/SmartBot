/**
 * ترويسة شاشة موحدة لشاشات الـ stack — زر رجوع (RTL: سهم يمين) + عنوان + فعل اختياري.
 */
import { Pressable, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/hooks/use-theme'
import { spacing, TOUCH_TARGET } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Icon } from '@/components/icon'
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
      <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.backBtn}>
        <Icon name="chevron-right" size={26} color={colors.foreground} />
      </Pressable>
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
