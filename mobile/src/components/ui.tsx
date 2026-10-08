/**
 * SmartBot Mobile — عناصر UI أساسية مشتركة (Card/Button/Badge/Row...).
 * كل الألوان من الثيم — لا ألوان ثابتة في الشاشات (قاعدة الويب Track D).
 */
import { StyleSheet, View, type ViewProps } from 'react-native'
import { useTheme } from '@/hooks/use-theme'
import { press, radius, spacing, TOUCH_TARGET } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { PressableScale } from '@/components/pressable-scale'
import { Spinner } from '@/components/spinner'

// ── Card ────────────────────────────────────────────────────────────────
export function Card({ style, ...rest }: ViewProps) {
  const { colors } = useTheme()
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          /* r131 (A4 P2-9 straggler): r-xl 16 — نفس درجة بطاقة الويب
             (rounded-xl بعد حكم r130 D-3)؛ كانت lg 12 درجة أدنى من قواعد
             الويب */
          borderRadius: radius.xl,
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
  /** r131: حالة إضافية للمستدعي (selected للمحولات — تُدمج مع disabled/busy) */
  accessibilityState?: { selected?: boolean; expanded?: boolean; checked?: boolean }
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, size = 'md', accessibilityState }: ButtonProps) {
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
  /* r131 (F11 / A4 P2-9): سجل الضغط القانوني — تحجيم 0.97 @ 80ms على
     منحنى (0.16,1,0.3,1) عبر PressableScale (كان opacity 0.85 فقط —
     سجل r130 لم يهبط قط). شفافية 0.5 تبقى للتعطيل فقط (ليست ضغطًا). */
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={title}
      accessibilityState={{
        disabled: !!disabled || !!loading,
        busy: !!loading,
        selected: accessibilityState?.selected,
        expanded: accessibilityState?.expanded,
        checked: accessibilityState?.checked,
      }}
      scaleTo={press.button}
      style={[
        {
          backgroundColor: bg,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          /* r131: أرضية اللمس 44px حتى للـsm (WCAG — كان 40) */
          minHeight: size === 'md' ? TOUCH_TARGET : 44,
          paddingHorizontal: spacing.xl,
          paddingVertical: size === 'md' ? spacing.md : spacing.sm,
          opacity: disabled ? 0.5 : 1,
        },
        border,
      ]}
    >
      {loading ? (
        /* r131: الدوار القانوني (22px/حد 8%/قوس accent/700ms) — كان
           ActivityIndicator بحجم النظام */
        <Spinner size={18} color={fg} />
      ) : (
        <AppText variant="smallBold" style={{ color: fg }}>
          {title}
        </AppText>
      )}
    </PressableScale>
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
