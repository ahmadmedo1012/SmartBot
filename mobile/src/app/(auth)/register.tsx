/**
 * شاشة التسجيل — نفس عقد الويب (/api/register ثم دخول فوري).
 * التحقق من صحة المدخلات محليًا أولًا (رسائل عربية).
 */
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { Link, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Button } from '@/components/ui'
import { AppInput } from '@/components/input'
import { useAuth } from '@/state/auth'
import { describeError } from '@/components/state-views'

export default function RegisterScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { register } = useAuth()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <AppText variant="display">إنشاء حساب</AppText>
        <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.xs }}>
          ابدأ تجربتك المجانية — خطة مجاني 100 رد شهريًا
        </AppText>

        <View style={styles.form}>
          <AppInput
            label="اسم المستخدم"
            value={username}
            onChangeText={setUsername}
            placeholder="اسم يظهر في لوحة التحكم"
            autoCapitalize="none"
            autoCorrect={false}
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
            <View style={[styles.errorBox, { backgroundColor: colors.destructiveSoft }]}>
              <AppText variant="small" style={{ color: colors.destructive }}>
                {error}
              </AppText>
            </View>
          ) : null}

          <Button title="إنشاء الحساب" onPress={onSubmit} disabled={!canSubmit} loading={busy} />
        </View>

        <View style={styles.footer}>
          <AppText variant="small" color="mutedFg">
            لديك حساب بالفعل؟
          </AppText>
          <Link href="/(auth)/login" asChild>
            <Button title="تسجيل الدخول" variant="ghost" size="sm" />
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.xl, flexGrow: 1 },
  form: { marginTop: spacing.xxxl, gap: spacing.lg },
  errorBox: { borderRadius: 12, padding: spacing.md },
  footer: { marginTop: spacing.xxxl, alignItems: 'center', gap: spacing.sm },
})
