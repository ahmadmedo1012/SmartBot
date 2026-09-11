/**
 * معالج التهيئة — نفس رحلة الويب (OnboardingWizard):
 * ترحيب → ربط صفحة فيسبوك → أول قاعدة رد → إتمام.
 * APIs: /api/onboarding/connect-page · /api/onboarding/first-rule · /api/onboarding/complete
 */
import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Button, Card } from '@/components/ui'
import { AppInput } from '@/components/input'
import { Icon } from '@/components/icon'
import { useAuth } from '@/state/auth'
import { apiPost } from '@/services/api'
import { describeError } from '@/components/state-views'

type StepId = 'welcome' | 'connect' | 'first-rule' | 'done'

export default function OnboardingScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { user, markOnboarded } = useAuth()
  const [step, setStep] = useState<StepId>(user?.onboardingCompleted ? 'done' : 'welcome')
  const [pageId, setPageId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [keyword, setKeyword] = useState('سعر')
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function connectPage() {
    if (!pageId.trim() || !accessToken.trim()) {
      setError('أدخل معرف الصفحة ورمز الوصول')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await apiPost('/api/onboarding/connect-page', {
        page_id: pageId.trim(),
        access_token: accessToken.trim(),
      })
      setStep('first-rule')
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  async function saveFirstRule() {
    setBusy(true)
    setError(null)
    try {
      if (keyword.trim() && reply.trim()) {
        await apiPost('/api/onboarding/first-rule', { keyword: keyword.trim(), reply: reply.trim() })
      }
      await apiPost('/api/onboarding/complete')
      markOnboarded()
      setStep('done')
    } catch (e) {
      setError(describeError(e))
    } finally {
      setBusy(false)
    }
  }

  function finish() {
    router.replace('/(app)/(tabs)/')
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* مؤشر الخطوات */}
      <View style={styles.stepsRow}>
        {(['welcome', 'connect', 'first-rule', 'done'] as StepId[]).map((s, i) => (
          <View
            key={s}
            style={[
              styles.stepDot,
              {
                backgroundColor:
                  step === s ? colors.primary : i < (['welcome', 'connect', 'first-rule', 'done'] as StepId[]).indexOf(step) ? colors.success : colors.muted,
              },
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'welcome' ? (
          <Card>
            <View style={styles.stepIconWrap}>
              <Icon name="bot" size={40} color={colors.accentFg} />
            </View>
            <AppText variant="title" style={{ textAlign: 'center', marginTop: spacing.lg }}>
              مرحباً بك في SmartBot!
            </AppText>
            <AppText variant="small" color="mutedFg" style={{ textAlign: 'center', marginTop: spacing.md }}>
              في 3 دقائق فقط، رحلتك تبدأ. يساعدك SmartBot على الرد تلقائياً على تعليقات
              ورسائل فيسبوك وتحليل أداء صفحتك — بدون أي خبرة تقنية.
            </AppText>
            <Button title="لنبدأ" onPress={() => setStep('connect')} />
          </Card>
        ) : null}

        {step === 'connect' ? (
          <Card>
            <AppText variant="title">اربط صفحة فيسبوك</AppText>
            <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.xs }}>
              أدخل معرف صفحتك ورمز وصول الصفحة (Page Access Token) من Meta — هذا يتيح
              للبوت القراءة والرد.
            </AppText>
            <View style={styles.form}>
              <AppInput
                label="معرف الصفحة (Page ID)"
                value={pageId}
                onChangeText={setPageId}
                placeholder="مثال: 100234567890"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="معرف الصفحة"
              />
              <AppInput
                label="رمز وصول الصفحة (Page Access Token)"
                value={accessToken}
                onChangeText={setAccessToken}
                placeholder="EAAG…"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="رمز وصول الصفحة"
              />
              {error ? (
                <View style={[styles.errorBox, { backgroundColor: colors.destructiveSoft }]}>
                  <AppText variant="small" style={{ color: colors.destructive }}>
                    {error}
                  </AppText>
                </View>
              ) : null}
              <Button title="ربط الصفحة" onPress={connectPage} loading={busy} />
              <Button title="تخطي الآن — سأربطها لاحقاً من الإعدادات" variant="ghost" size="sm" onPress={() => setStep('first-rule')} />
            </View>
          </Card>
        ) : null}

        {step === 'first-rule' ? (
          <Card>
            <View style={styles.stepIconWrap}>
              <Icon name="sparkles" size={36} color={colors.saffron} />
            </View>
            <AppText variant="title" style={{ textAlign: 'center', marginTop: spacing.lg }}>
              أول قاعدة رد تلقائي
            </AppText>
            <AppText variant="small" color="mutedFg" style={{ textAlign: 'center', marginTop: spacing.md }}>
              عندما يعلّق أحدهم بكلمة معينة، يرد البوت تلقائياً برسالتك.
            </AppText>
            <View style={styles.form}>
              <AppInput
                label="الكلمة المفتاحية"
                value={keyword}
                onChangeText={setKeyword}
                placeholder="مثال: سعر"
                accessibilityLabel="الكلمة المفتاحية"
              />
              <AppInput
                label="الرد"
                value={reply}
                onChangeText={setReply}
                placeholder="مثال: مرحباً! السعر 50 د.ل — تواصل معنا على واتساب"
                multiline
                accessibilityLabel="نص الرد"
              />
              {error ? (
                <View style={[styles.errorBox, { backgroundColor: colors.destructiveSoft }]}>
                  <AppText variant="small" style={{ color: colors.destructive }}>
                    {error}
                  </AppText>
                </View>
              ) : null}
              <Button title="حفظ وإنهاء التهيئة" onPress={saveFirstRule} loading={busy} />
            </View>
          </Card>
        ) : null}

        {step === 'done' ? (
          <Card>
            <View style={[styles.stepIconWrap, { backgroundColor: colors.successSoft }]}>
              <Icon name="check" size={40} color={colors.success} />
            </View>
            <AppText variant="title" style={{ textAlign: 'center', marginTop: spacing.lg }}>
              جاهز تماماً!
            </AppText>
            <AppText variant="small" color="mutedFg" style={{ textAlign: 'center', marginTop: spacing.md }}>
              بوتك يعمل الآن. لوحة التحكم أمامك — تابع الردود والرسائل والتحليلات
              لحظة بلحظة.
            </AppText>
            <Button title="الدخول إلى لوحة التحكم" onPress={finish} />
          </Card>
        ) : null}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  stepsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, padding: spacing.lg },
  stepDot: { width: 34, height: 5, borderRadius: 999 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl * 2 },
  stepIconWrap: {
    alignSelf: 'center',
    width: 76,
    height: 76,
    borderRadius: radius.xxxl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(197, 60, 0, 0.14)',
  },
  form: { marginTop: spacing.xl, gap: spacing.lg },
  errorBox: { borderRadius: radius.md, padding: spacing.md },
})
