/**
 * شاشة تسجيل الدخول — محاذاة بصرية كاملة مع ويب bot.smart-link.ly/login:
 * نفس الشعار الحقيقي (brand-icon.png عبر expo-image)، خلفية متدرجة
 * from-background via-accent/20، أشكال عائمة محدودة بحدود شفافة، شريط
 * لون علوي، بطاقة بحد border/60 وخلفية card/85 وظل عميق، حركة دخول
 * scale-in (نفس animate-scale-in للويب، عبر Reanimated مع احترام
 * تقليل الحركة).
 * عقد الويب نفسه (username أو email + كلمة مرور) عبر POST /api/auth/token.
 */
import { useEffect, useState } from 'react'
import { AccessibilityInfo, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Link, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Button } from '@/components/ui'
import { AppInput } from '@/components/input'
import { BrandLogo } from '@/components/brand-logo'
import { useAuth } from '@/state/auth'
import { describeError } from '@/components/state-views'
import { APP_NAME } from '@/constants/config'

export default function LoginScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // حركة الدخول — scale-in مطابقة للويب (0.96→1 + ظهور)، تُتعطل عند
  // تفضيل «تقليل الحركة» (نفس حارس prefers-reduced-motion في globals.css).
  const intro = useSharedValue(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled?.()
      ?.then(setReducedMotion)
      .catch(() => undefined)
  }, [])
  useEffect(() => {
    intro.value = withTiming(1, {
      duration: reducedMotion ? 0 : 380,
      easing: Easing.out(Easing.cubic),
    })
  }, [reducedMotion, intro])
  const cardStyle = useAnimatedStyle(() => ({
    opacity: intro.value,
    transform: [{ scale: 0.96 + 0.04 * intro.value }],
  }))

  const canSubmit = username.trim().length > 0 && password.length > 0 && !busy

  async function onSubmit() {
    if (!canSubmit) return
    setBusy(true)
    setError(null)
    try {
      await login(username.trim(), password)
      router.replace('/(app)/(tabs)/')
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* الخلفية المتدرجة — from-background via-accent/20 to-background */}
      <LinearGradient
        colors={[colors.background, 'rgba(225, 87, 0, 0.20)', colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* الأشكال العائمة — نفس FloatingShapes للويب (حدود border/30 و border/20 بلا تعبئة) */}
      <View style={styles.shapes} pointerEvents="none">
        <View style={[styles.shape, styles.shapeTop, { borderColor: `${colors.border}4d` }]} />
        <View style={[styles.shape, styles.shapeBottom, { borderColor: `${colors.border}33` }]} />
      </View>

      {/* الشريط اللوني العلوي — h-1 متدرج accentFg → 60% */}
      <LinearGradient
        colors={[colors.accentFg, `${colors.accentFg}cc`, `${colors.accentFg}99`]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.topBar, { top: insets.top }]}
        pointerEvents="none"
      />

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* البطاقة — border/60 + card/85 + shadow-2xl (نفس Card الويب) */}
        <Animated.View style={[styles.card, { backgroundColor: `${colors.card}d9`, borderColor: `${colors.border}99` }, cardStyle]}>
          {/* رأس البطاقة: الشعار الحقيقي + العنوان — نفس بنية CardHeader */}
          <View style={styles.cardHeader}>
            <BrandLogo size={64} />
            <AppText variant="title" style={{ marginTop: spacing.lg, letterSpacing: -0.4 }}>
              {APP_NAME}
            </AppText>
            <AppText variant="body" color="mutedFg" style={{ marginTop: spacing.xs }}>
              لوحة التحكم الذكية
            </AppText>
          </View>

          {/* النموذج */}
          <View style={styles.form}>
            <AppInput
              label="اسم المستخدم أو البريد الإلكتروني"
              value={username}
              onChangeText={setUsername}
              placeholder="مثال: ahmed أو you@mail.ly"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="username"
              accessibilityLabel="اسم المستخدم أو البريد الإلكتروني"
            />
            <AppInput
              label="كلمة المرور"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              textContentType="password"
              accessibilityLabel="كلمة المرور"
            />

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: colors.destructiveSoft, borderColor: `${colors.destructive}33` }]}>
                <AppText variant="small" style={{ color: colors.destructive, textAlign: 'center' }}>
                  {error}
                </AppText>
              </View>
            ) : null}

            <Button title="تسجيل الدخول" onPress={onSubmit} disabled={!canSubmit} loading={busy} />
          </View>

          {/* رابط التسجيل — نفس نص الويب بلون العلامة */}
          <View style={styles.footerLink}>
            <Link href="/(auth)/register" asChild>
              <Pressable accessibilityRole="link" accessibilityLabel="إنشاء حساب جديد" hitSlop={12}>
                <AppText variant="small" style={{ color: colors.accentFg }}>
                  ليس لديك حساب؟ إنشاء حساب جديد
                </AppText>
              </Pressable>
            </Link>
          </View>
        </Animated.View>

        {/* السطر الختامي الصغير — نفس تذييل الويب */}
        <AppText variant="caption" color="mutedFg" style={styles.smallPrint}>
          SmartBot - منصة إدارة التفاعل الذكية
        </AppText>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, flexGrow: 1, justifyContent: 'center' },
  shapes: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  shape: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  shapeTop: { width: 288, height: 288, top: -80, right: -80 },
  shapeBottom: { width: 384, height: 384, bottom: -128, left: -128 },
  topBar: { position: 'absolute', left: 0, right: 0, height: 4 },
  card: {
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxl,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.45,
    shadowRadius: 32,
    elevation: 12,
  },
  cardHeader: { alignItems: 'center', paddingBottom: spacing.sm },
  form: { marginTop: spacing.xl, gap: spacing.lg },
  errorBox: { borderRadius: radius.md, borderWidth: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  footerLink: { marginTop: spacing.xxl, alignItems: 'center' },
  smallPrint: { textAlign: 'center', marginTop: spacing.xl },
})
