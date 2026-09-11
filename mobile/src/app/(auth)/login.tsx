/**
 * شاشة تسجيل الدخول — عقد الويب نفسه (username أو email + كلمة مرور)
 * عبر POST /api/auth/token (المصمم للموبايل: التوكن في الجسم).
 */
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { Link, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/hooks/use-theme'
import { spacing, radius } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Button } from '@/components/ui'
import { AppInput } from '@/components/input'
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
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxxl * 2, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* الشعار */}
        <View style={styles.logoWrap}>
          <View style={[styles.logoCircle, { backgroundColor: colors.primary }]}>
            <AppText variant="title" style={{ color: colors.primaryFg }}>
              SB
            </AppText>
          </View>
          <AppText variant="display" style={{ marginTop: spacing.lg }}>
            {APP_NAME}
          </AppText>
          <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.xs }}>
            بوت فيسبوك ميسنجر لصفحتك — إدارة كاملة من جيبك
          </AppText>
        </View>

        {/* النموذج */}
        <View style={styles.form}>
          <AppInput
            label="اسم المستخدم أو البريد"
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
            <View style={[styles.errorBox, { backgroundColor: colors.destructiveSoft }]}>
              <AppText variant="small" style={{ color: colors.destructive }}>
                {error}
              </AppText>
            </View>
          ) : null}

          <Button title="تسجيل الدخول" onPress={onSubmit} disabled={!canSubmit} loading={busy} />
        </View>

        {/* التسجيل */}
        <View style={styles.footer}>
          <AppText variant="small" color="mutedFg">
            ليس لديك حساب؟
          </AppText>
          <Link href="/(auth)/register" asChild>
            <Button title="إنشاء حساب جديد" variant="ghost" size="sm" />
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, flexGrow: 1 },
  logoWrap: { alignItems: 'center' },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: radius.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: { marginTop: spacing.xxxl * 2, gap: spacing.lg },
  errorBox: { borderRadius: radius.md, padding: spacing.md },
  footer: { marginTop: spacing.xxxl, alignItems: 'center', gap: spacing.sm },
})
