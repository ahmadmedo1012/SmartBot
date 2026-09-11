/**
 * SmartBot Mobile — عناصر UI أساسية مشتركة (Card/Button/Badge/Row...).
 * كل الألوان من الثيم — لا ألوان ثابتة في الشاشات (قاعدة الويب Track D).
 */
import { ActivityIndicator, Pressable, StyleSheet, View, type ViewProps } from 'react-native'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing, TOUCH_TARGET } from '@/constants/theme'
import { AppText } from '@/components/themed-text'

// ── Card ────────────────────────────────────────────────────────────────
export function Card({ style, ...rest }: ViewProps) {
  const { colors } = useTheme()
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderRadius: radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: spacing.lg,
        },
        style,
      ]}
      {...rest}
    />
  )
}

// ── Button ──────────────────────────────────────────────────────────────
export interface ButtonProps {
  title: string
  onPress?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
  loading?: boolean
  size?: 'md' | 'sm'
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, size = 'md' }: ButtonProps) {
  const { colors } = useTheme()
  const bg =
    variant === 'primary' ? colors.primary : variant === 'danger' ? colors.destructive : 'transparent'
  const fg =
    variant === 'primary' || variant === 'danger'
      ? colors.primaryFg
      : variant === 'secondary'
        ? colors.foreground
        : colors.accentFg
  const border = variant === 'secondary' ? { borderWidth: 1, borderColor: colors.border } : undefined
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: size === 'md' ? TOUCH_TARGET : 40,
          paddingHorizontal: spacing.xl,
          paddingVertical: size === 'md' ? spacing.md : spacing.sm,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        border,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <AppText variant="smallBold" style={{ color: fg }}>
          {title}
        </AppText>
      )}
    </Pressable>
  )
}

// ── Badge ───────────────────────────────────────────────────────────────
export function Badge({
  text,
  tone = 'muted',
}: {
  text: string
  tone?: 'success' | 'warning' | 'info' | 'destructive' | 'muted' | 'brand'
}) {
  const { colors } = useTheme()
  const map: Record<string, { bg: string; fg: string }> = {
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    info: { bg: colors.infoSoft, fg: colors.info },
    destructive: { bg: colors.destructiveSoft, fg: colors.destructive },
    brand: { bg: `${colors.primary}24`, fg: colors.accentFg },
    muted: { bg: colors.muted, fg: colors.mutedFg },
  }
  const { bg, fg } = map[tone]
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <AppText variant="caption" style={{ color: fg, fontWeight: '700' }}>
        {text}
      </AppText>
    </View>
  )
}

// ── Divider ─────────────────────────────────────────────────────────────
export function Divider() {
  const { colors } = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
}

// ── Row ─────────────────────────────────────────────────────────────────
export function Row({ style, ...rest }: ViewProps) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }, style]} {...rest} />
}

// ── Screen container (خلفية + padding) ─────────────────────────────────
export function Screen({ style, ...rest }: ViewProps) {
  const { colors } = useTheme()
  return <View style={[{ flex: 1, backgroundColor: colors.background }, style]} {...rest} />
}

// ── KpiCard — بطاقة إحصاء للوحة ────────────────────────────────────────
export function KpiCard({
  label,
  value,
  trend,
  hint,
  tone = 'brand',
  icon,
}: {
  label: string
  value: string
  trend?: string
  hint?: string
  tone?: 'brand' | 'success' | 'info' | 'warning'
  icon?: React.ReactNode
}) {
  const { colors } = useTheme()
  const toneColor =
    tone === 'success' ? colors.success : tone === 'info' ? colors.info : tone === 'warning' ? colors.warning : colors.accentFg
  return (
    <Card style={{ flex: 1, minWidth: '48%' }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <AppText variant="caption" color="mutedFg">
          {label}
        </AppText>
        {icon}
      </Row>
      <AppText variant="title" style={{ color: toneColor, marginTop: spacing.xs }}>
        {value}
      </AppText>
      {trend ? (
        <AppText variant="caption" color="mutedFg" style={{ marginTop: 2 }}>
          {trend}
        </AppText>
      ) : null}
      {hint ? (
        <AppText variant="caption" color="mutedFg" style={{ marginTop: 2 }}>
          {hint}
        </AppText>
      ) : null}
    </Card>
  )
}
