/**
 * SmartBot Mobile — حالات الشاشة الموحدة (قاعدة المرحلة P4):
 * loading / error (+retry) / empty / unauthorized — لا شاشة بيضاء أبدًا.
 *
 * r154 (P6-2-e2): الفراغ والخطأ يستضيفان الروبوت الواحد (RobotMark) —
 * idle للفراغ (الآلة في الخدمة، تنتظر — مرآة EmptyState الويب) وerror
 * (زجاج rose + رجّة) للخطأ — مرآة DefaultError الويب. الدلالات كما هي:
 * العناوين والأوصاف وأزرار إعادة المحاولة لم تُمَس؛ الروبوت زخرفي
 * (accessibilityLabel للبلاطة يحمل المعنى).
 */
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Button } from '@/components/ui'
import { RobotMark } from '@/components/robot-mark'
import { Spinner } from '@/components/spinner'
import { useAuth } from '@/state/auth'
import type { ApiError } from '@/services/api'

export function LoadingState({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return (
    <View
      style={styles.center}
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      /* r131 (A11): الحاويات العاملة تعلن busy — مثل aria-busy في الويب */
      accessibilityState={{ busy: true }}
    >
      {/* r131 (F11): الدوار القانوني 22px/حد 8%/قوس accent/700ms —
          مطابق DefaultLoading (كان ActivityIndicator size="large") */}
      <Spinner />
      <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.md }}>
        {label}
      </AppText>
    </View>
  )
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  const { colors } = useTheme()
  return (
    <View style={styles.center} accessibilityLabel={`خطأ: ${message ?? 'تعذر تحميل البيانات'}`}>
      {/* r154: بلاطة الخطأ = الروبوت في سجل rose (الزجاج والـLED)
          على أرضية destructiveSoft — العنوان/الوصف/الزر يحملون الدلالة */}
      <View style={[styles.iconWrap, { backgroundColor: colors.destructiveSoft }]}>
        <RobotMark state="error" size={56} accessibilityLabel="الروبوت في حالة خطأ" />
      </View>
      <AppText variant="subtitle" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
        {message || 'تعذر تحميل البيانات'}
      </AppText>
      {onRetry ? (
        <View style={{ marginTop: spacing.lg, minWidth: 160 }}>
          <Button title="إعادة المحاولة" variant="secondary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  )
}

export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  const { colors } = useTheme()
  return (
    <View style={styles.center}>
      {/* r154: الروبوت idle — الآلة في الخدمة تنتظر (مرآة الويب: كل حالة
          فراغ بلا أيقونة تحصل على الآلة مجانًا) */}
      <View style={[styles.iconWrap, { backgroundColor: colors.muted }]}>
        <RobotMark state="idle" size={56} accessibilityLabel="الروبوت في الخدمة" />
      </View>
      <AppText variant="subtitle" style={{ marginTop: spacing.lg, textAlign: 'center' }}>
        {message}
      </AppText>
      {hint ? (
        <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
          {hint}
        </AppText>
      ) : null}
    </View>
  )
}

/** خطأ 401 داخل الشاشة (لا يحدث عادة — المعالج المركزي يخرج — شبكة أمان). */
export function UnauthorizedState() {
  const { logout } = useAuth()
  return (
    <ErrorState
      message="انتهت صلاحية الجلسة — يرجى تسجيل الدخول مرة أخرى"
      onRetry={logout}
    />
  )
}

/** رسالة خطأ شبكة صديقة (تُستخدم في catch). */
export function describeError(e: unknown): string {
  const { status, message } = (e ?? {}) as ApiError & { message?: string }
  if (typeof status === 'number' && status === 401) {
    return 'انتهت صلاحية الجلسة — يرجى تسجيل الدخول مرة أخرى'
  }
  if (typeof status === 'number' && status === 429) {
    return 'محاولات كثيرة جداً — حاول بعد قليل'
  }
  return message || 'تعذر الاتصال بالخادم — تحقق من الإنترنت'
}

/** ScrollView مع سحب-للتحديث موحد. */
export function PullToRefresh({
  children,
  refreshing,
  onRefresh,
  contentContainerStyle,
}: {
  children: React.ReactNode
  refreshing: boolean
  onRefresh: () => void
  contentContainerStyle?: object
}) {
  const { colors } = useTheme()
  return (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, contentContainerStyle]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
    >
      {children}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxxl * 2 },
  /* r154: بلاطة r-xl مربعة الشكل (مرآة .state-icon الويب — كانت دائرة) */
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
