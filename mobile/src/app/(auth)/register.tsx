/**
 * شاشة التسجيل — محاذاة بصرية كاملة مع ويب /register: نفس الشعار الحقيقي
 * والخلفية المتدرجة والأشكال العائمة والبطاقة وحركة الدخول scale-in.
 * نفس عقد الويب (/api/register ثم دخول فوري) والتحقق المحلي من المدخلات
 * برسائل عربية.
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

export default function RegisterScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { register } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // حركة الدخول scale-in (مع حارس تقليل الحركة) — مطابقة للويب.
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

  function validate(): string | null {
    if (username.trim().length < 3) return 'اسم المستخدم قصير جداً (3 أحرف على الأقل)'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'البريد الإلكتروني غير صالح'
    if (password.length < 8) return 'كلمة المرور 8 أحرف على الأقل'
    return null
  }

  const canSubmit = username.length > 0 && email.length > 0 && password.length > 0 && !busy

  async function onSubmit() {
    const v = validate()
    if (v) {
      setError(v)
      return
    }
    setBusy(true)
    setError(null)
    try {
      await register(username.trim(), email.trim(), password)
      router.replace('/(app)/onboarding')
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
      {/* الخلفية المتدرجة + الأشكال العائمة + الشريط العلوي — نفس طبقات الويب */}
      <LinearGradient
        colors={[colors.background, 'rgba(225, 87, 0, 0.20)', colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.shapes} pointerEvents="none">
        <View style={[styles.shape, styles.shapeTop, { borderColor: `${colors.border}4d` }]} />
        <View style={[styles.shape, styles.shapeBottom, { borderColor: `${colors.border}33` }]} />
      </View>
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
        <Animated.View style={[styles.card, { backgroundColor: `${colors.card}d9`, borderColor: `${colors.border}99` }, cardStyle]}>
          {/* رأس البطاقة — CardTitle/CardDescription للويب: إنشاء حساب جديد */}
          <View style={styles.cardHeader}>
            <BrandLogo size={64} />
            <AppText variant="title" style={{ marginTop: spacing.lg, letterSpacing: -0.4 }}>
              إنشاء حساب جديد
            </AppText>
            <AppText variant="body" color="mutedFg" style={{ marginTop: spacing.xs }}>
              انضم إلى {APP_NAME}
            </AppText>
          </View>

          <View style={styles.form}>
            <AppInput
              label="اسم المستخدم"
              value={username}
              onChangeText={setUsername}
              placeholder="اسم يظهر في لوحة التحكم"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="username"
              accessibilityLabel="اسم المستخدم"
            />
            <AppInput
              label="البريد الإلكتروني"
              value={email}
              onChangeText={setEmail}
              placeholder="you@mail.ly"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="emailAddress"
              accessibilityLabel="البريد الإلكتروني"
            />
            <AppInput
              label="كلمة المرور"
              value={password}
              onChangeText={setPassword}
              placeholder="8 أحرف على الأقل"
              secureTextEntry
              textContentType="newPassword"
              accessibilityLabel="كلمة المرور"
            />

            {error ? (
              <View style={[styles.errorBox, { backgroundColor: colors.destructiveSoft, borderColor: `${colors.destructive}33` }]}>
                <AppText variant="small" style={{ color: colors.destructive, textAlign: 'center' }}>
                  {error}
                </AppText>
              </View>
            ) : null}

            <Button title="إنشاء الحساب" onPress={onSubmit} disabled={!canSubmit} loading={busy} />
          </View>

          {/* رابط العودة لتسجيل الدخول — نفس نص الويب بلون العلامة */}
          <View style={styles.footerLink}>
            <Link href="/(auth)/login" asChild>
              <Pressable accessibilityRole="link" accessibilityLabel="تسجيل الدخول" hitSlop={12}>
                <AppText variant="small" style={{ color: colors.accentFg }}>
                  لديك حساب بالفعل؟ تسجيل الدخول
                </AppText>
              </Pressable>
            </Link>
          </View>
        </Animated.View>

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
