/**
 * شاشة الاشتراك في خطة (نفس الويب /pricing + /subscribe):
 * GET /api/plans (عام) · POST /api/subscriptions.
 * عقد v25 (routers/payments/plans.py — M-11): الطلب JSON
 * {plan_id, amount (= سعر الخطة رقمًا), provider (liyana|madar|bank),
 *  phone (≥7 أرقام — مطلوب لغير البنكي)} — الطلب القديم كان يرسل plan_id
 * فقط → 400 «المبلغ غير مطابق» دائمًا (تدفق ميت).
 */
import { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { AppInput } from '@/components/input'
import { apiGet, apiPost } from '@/services/api'
import { LoadingState, ErrorState, describeError } from '@/components/state-views'
import { formatMoney } from '@/lib/format'
import type { Plan } from '@/types/api'

type Provider = 'liyana' | 'madar' | 'bank'

const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'liyana', label: 'ليبيانا' },
  { id: 'madar', label: 'مدار' },
  { id: 'bank', label: 'تحويل بنكي' },
]

export default function SubscribeScreen() {
  const { colors } = useTheme()
  const [actionError, setActionError] = useState<string | null>(null)
  const [requested, setRequested] = useState<number | null>(null)
  // نموذج إتمام الطلب (M-11): الخطة قيد الاشتراك + المزود + الهاتف
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null)
  const [provider, setProvider] = useState<Provider>('liyana')
  const [phone, setPhone] = useState('')

  const { data: plans, isLoading, isError, error, refetch } = useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: () => apiGet<Plan[]>('/api/plans'),
  })

  const phoneValid = phone.trim().length >= 7

  const subscribeMutation = useMutation({
    mutationFn: (plan: Plan) =>
      apiPost('/api/subscriptions', {
        plan_id: plan.id,
        amount: plan.price, // يجب أن يطابق سعر الخطة رقمًا (شرط الخادم)
        provider,
        phone: phone.trim(),
      }),
    onSuccess: (_data, plan) => {
      setActionError(null)
      setRequested(plan.id)
      setCheckoutPlan(null)
      setPhone('')
    },
    onError: (e) => setActionError(describeError(e)),
  })

  if (isLoading) return <LoadingState label="جارٍ تحميل الخطط…" />

  return (
    <StackScreen title="الاشتراك في خطة">
      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl * 2 }}>
          {actionError ? (
            <Card style={{ backgroundColor: colors.destructiveSoft }}>
              <AppText variant="small" style={{ color: colors.destructive }}>
                {actionError}
              </AppText>
            </Card>
          ) : null}
          {requested ? (
            <Card style={{ backgroundColor: colors.successSoft, borderWidth: 0 }}>
              <Row style={{ gap: spacing.sm }}>
                <AppText variant="smallBold" style={{ color: colors.success, flex: 1 }}>
                  تم إرسال طلب الاشتراك — سيؤكده الأدمن عبر تيليجرام ثم تُفعَّل خطتك.
                </AppText>
              </Row>
            </Card>
          ) : null}

          {(plans ?? [])
            .filter((p) => p.is_active && p.price > 0)
            .map((plan) => (
              <Card key={plan.id}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <AppText variant="title">{plan.name_ar}</AppText>
                  <Badge tone="brand" text={`${formatMoney(plan.price)} / ${plan.period_days} يوم`} />
                </Row>
                <View style={{ marginTop: spacing.md, gap: 6 }}>
                  {plan.features.map((f, i) => (
                    <Row key={i} style={{ gap: spacing.sm }}>
                      <AppText variant="small" style={{ color: colors.success }}>
                        ✓
                      </AppText>
                      <AppText variant="small" style={{ flex: 1 }}>
                        {f}
                      </AppText>
                    </Row>
                  ))}
                </View>
                <View style={{ marginTop: spacing.lg }}>
                  {requested === plan.id ? (
                    <Button title="طلبك قيد المراجعة…" disabled />
                  ) : (
                    <Button
                      title={`اشترك — ${formatMoney(plan.price)}`}
                      onPress={() => {
                        setCheckoutPlan(plan)
                        setProvider('liyana')
                        setPhone('')
                        setActionError(null)
                      }}
                      loading={subscribeMutation.isPending}
                    />
                  )}
                </View>
              </Card>
            ))}

          <AppText variant="caption" color="mutedFg" style={{ textAlign: 'center' }}>
            الدفع: ليبيانا · مدار · تحويل بنكي — التأكيد عبر تيليجرام
          </AppText>
        </ScrollView>
      )}

      {/* Sheet إتمام الاشتراك (M-11): المبلغ + مزود الدفع + الهاتف */}
      <Modal visible={!!checkoutPlan} transparent animationType="slide" onRequestClose={() => setCheckoutPlan(null)}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <Pressable style={{ flex: 1 }} accessibilityLabel="إغلاق" onPress={() => setCheckoutPlan(null)} />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <AppText variant="subtitle" style={{ marginTop: spacing.md }}>
              إتمام الاشتراك — {checkoutPlan?.name_ar}
            </AppText>
            <Row style={{ justifyContent: 'space-between', marginTop: spacing.md }}>
              <AppText variant="small" color="mutedFg">
                المبلغ المطلوب
              </AppText>
              <AppText variant="smallBold" style={{ color: colors.accentFg }}>
                {formatMoney(checkoutPlan?.price ?? 0)}
              </AppText>
            </Row>
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <View>
                <AppText variant="small" color="mutedFg" style={{ marginBottom: spacing.xs }}>
                  مزود الدفع
                </AppText>
                <Row style={{ gap: spacing.sm }}>
                  {PROVIDERS.map((p) => (
                    <Pressable
                      key={p.id}
                      accessibilityRole="button"
                      accessibilityLabel={p.label}
                      onPress={() => setProvider(p.id)}
                      style={[
                        styles.chip,
                        {
                          borderColor: provider === p.id ? colors.primary : colors.border,
                          backgroundColor: provider === p.id ? `${colors.primary}24` : 'transparent',
                        },
                      ]}
                    >
                      <AppText variant="smallBold" style={{ color: provider === p.id ? colors.accentFg : colors.mutedFg }}>
                        {p.label}
                      </AppText>
                    </Pressable>
                  ))}
                </Row>
              </View>
              <AppInput
                label="رقم الهاتف"
                value={phone}
                onChangeText={setPhone}
                placeholder="09xxxxxxxx"
                keyboardType="phone-pad"
                accessibilityLabel="رقم هاتف الدفع"
                hint="مطلوب (7 أرقام على الأقل) لإتمام الحوالة"
              />
              {actionError ? (
                <AppText variant="small" style={{ color: colors.destructive }}>
                  {actionError}
                </AppText>
              ) : null}
              <Row>
                <Button
                  title="إرسال طلب الاشتراك"
                  onPress={() => checkoutPlan && subscribeMutation.mutate(checkoutPlan)}
                  loading={subscribeMutation.isPending}
                  disabled={!phoneValid}
                />
                <Button title="إلغاء" variant="ghost" onPress={() => setCheckoutPlan(null)} />
              </Row>
              <AppText variant="caption" color="mutedFg" style={{ textAlign: 'center' }}>
                يُرسل الطلب للأدمن مع تعليمات الحوالة — التأكيد عبر تيليجرام
              </AppText>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </StackScreen>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 999, marginTop: spacing.sm },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 8 },
})
