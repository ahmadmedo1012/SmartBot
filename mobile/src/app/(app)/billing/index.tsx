/**
 * شاشة الفواتير (نفس الويب /dashboard/billing):
 * GET /api/payments/balance · /api/payments/history · POST /api/payments/topup.
 * عقد v25 (routers/payments/wallet.py — M-12):
 *  - الشحن JSON {provider (liyana|madar)، phone (≥7)، amount} — كان يرسل
 *    amount فقط → 400 «مزود الدفع غير صالح» دائمًا (تدفق ميت).
 *  - السجل مصفوفة مجردة مفاتيحها payment_id (لا id) + provider/kind (M-17).
 */
import { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { AppInput } from '@/components/input'
import { apiGet, apiPost } from '@/services/api'
import { extractItems } from '@/lib/envelope'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatDate, formatMoney } from '@/lib/format'
import { useAuth } from '@/state/auth'
import type { PaymentRecord, WalletBalance } from '@/types/api'

type TopupProvider = 'liyana' | 'madar'

const PROVIDER_LABEL: Record<string, string> = {
  liyana: 'ليبيانا',
  madar: 'مدار',
  bank: 'تحويل بنكي',
}

const STATUS_LABEL: Record<string, { tone: 'success' | 'warning' | 'destructive'; text: string }> = {
  confirmed: { tone: 'success', text: 'مؤكد' },
  approved: { tone: 'success', text: 'مؤكد' },
  PAID: { tone: 'success', text: 'مؤكد' },
  rejected: { tone: 'destructive', text: 'مرفوض' },
  pending: { tone: 'warning', text: 'قيد المراجعة' },
}

export default function BillingScreen() {
  const { colors } = useTheme()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState<string | null>(null)
  // نموذج الشحن (M-12): المبلغ + المزود + الهاتف
  const [showTopup, setShowTopup] = useState(false)
  const [amount, setAmount] = useState('20')
  const [provider, setProvider] = useState<TopupProvider>('liyana')
  const [phone, setPhone] = useState('')

  const { data: balance, isLoading: balLoading } = useQuery<WalletBalance>({
    queryKey: ['wallet-balance'],
    queryFn: () => apiGet<WalletBalance>('/api/payments/balance'),
  })

  const { data: history, isError, error, refetch } = useQuery<unknown, Error, PaymentRecord[]>({
    queryKey: ['payments-history'],
    queryFn: () => apiGet('/api/payments/history'),
    select: (res) => extractItems<PaymentRecord>(res),
  })
  const payments = history ?? []

  const topupMutation = useMutation({
    mutationFn: () =>
      apiPost('/api/payments/topup', {
        provider,
        phone: phone.trim(),
        amount: Number(amount) || 0,
      }),
    onSuccess: () => {
      setActionError(null)
      setShowTopup(false)
      setPhone('')
      queryClient.invalidateQueries({ queryKey: ['payments-history'] })
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] })
    },
    onError: (e) => setActionError(describeError(e)),
  })

  const amountNum = Number(amount)
  const formValid =
    Number.isFinite(amountNum) && amountNum >= 1 && amountNum <= 10000 && phone.trim().length >= 7

  return (
    <StackScreen title="الفواتير والاشتراك" subtitle={user?.subscriptionStatus} isLoading={balLoading}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl * 2 }}>
        {/* المحفظة */}
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText variant="subtitle">رصيد المحفظة</AppText>
            <Badge tone="brand" text={user?.subscriptionStatus === 'free' ? 'خطة مجاني' : user?.subscriptionStatus ?? ''} />
          </Row>
          <AppText variant="display" style={{ marginTop: spacing.md, color: colors.accentFg }}>
            {formatMoney(balance?.balance ?? 0)}
          </AppText>
          <Row style={{ marginTop: spacing.lg, gap: spacing.sm }}>
            <Button
              title="شحن الرصيد"
              size="sm"
              variant="secondary"
              onPress={() => {
                setAmount('20')
                setProvider('liyana')
                setPhone('')
                setActionError(null)
                setShowTopup(true)
              }}
            />
          </Row>
          {actionError ? (
            <AppText variant="small" style={{ color: colors.destructive, marginTop: spacing.md }}>
              {actionError}
            </AppText>
          ) : null}
          <AppText variant="caption" color="mutedFg" style={{ marginTop: spacing.md }}>
            الشحن عبر ليبيانا/مدار — تؤكدها موافقة الأدمن على تيليجرام.
          </AppText>
        </Card>

        {/* ترقية الخطة */}
        <Card>
          <AppText variant="subtitle">خطتك الحالية</AppText>
          <Row style={{ justifyContent: 'space-between', marginTop: spacing.md }}>
            <View style={{ flex: 1 }}>
              <AppText variant="body">
                {user?.hasActiveSubscription ? 'اشتراك نشط' : user?.hasPendingSubscription ? 'اشتراك قيد المراجعة' : 'بدون اشتراك مدفوع'}
              </AppText>
              {user?.subscriptionPlanEnd ? (
                <AppText variant="caption" color="mutedFg">
                  حتى {formatDate(user.subscriptionPlanEnd)}
                </AppText>
              ) : null}
            </View>
            <Button title="ترقية الخطة" size="sm" onPress={() => router.push({ pathname: '/(app)/subscribe' })} />
          </Row>
        </Card>

        {/* السجل — عقد v25 (M-17): payment_id مفتاح + provider */}
        <Card>
          <AppText variant="subtitle">سجل العمليات</AppText>
          {isError ? (
            <ErrorState message={describeError(error)} onRetry={() => refetch()} />
          ) : payments.length === 0 ? (
            <EmptyState message="لا عمليات بعد" hint="شحن رصيدك أو اشترِ خطة لتظهر هنا" />
          ) : (
            <View style={{ marginTop: spacing.md, gap: spacing.md }}>
              {payments.map((p) => {
                const badge = STATUS_LABEL[p.status ?? ''] ?? { tone: 'warning' as const, text: p.status ?? '—' }
                const providerLabel = p.provider ? PROVIDER_LABEL[p.provider] ?? p.provider : ''
                return (
                  <Row key={String(p.payment_id)} style={{ justifyContent: 'space-between' }}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="smallBold">{formatMoney(p.amount ?? 0)}</AppText>
                      <AppText variant="caption" color="mutedFg">
                        {formatDate(p.created_at)}
                        {providerLabel ? ` · ${providerLabel}` : ''}
                        {p.kind === 'subscription' ? ' · اشتراك' : p.kind === 'topup' ? ' · شحن' : ''}
                        {p.note ? ` · ${p.note}` : ''}
                      </AppText>
                    </View>
                    <Badge tone={badge.tone} text={badge.text} />
                  </Row>
                )
              })}
            </View>
          )}
        </Card>
      </ScrollView>

      {/* Sheet شحن المحفظة (M-12): المزود + الهاتف + المبلغ — KAV للـ iOS */}
      <Modal visible={showTopup} transparent animationType="slide" onRequestClose={() => setShowTopup(false)}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <Pressable style={{ flex: 1 }} accessibilityLabel="إغلاق" onPress={() => setShowTopup(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <AppText variant="subtitle" style={{ marginTop: spacing.md }}>
              شحن المحفظة
            </AppText>
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <AppInput
                label="المبلغ (د.ل)"
                value={amount}
                onChangeText={setAmount}
                placeholder="20"
                keyboardType="number-pad"
                accessibilityLabel="مبلغ الشحن"
                hint="من 1 إلى 10000 د.ل"
              />
              <View>
                <AppText variant="small" color="mutedFg" style={{ marginBottom: spacing.xs }}>
                  مزود الدفع
                </AppText>
                <Row style={{ gap: spacing.sm }}>
                  {(['liyana', 'madar'] as const).map((p) => (
                    <Pressable
                      key={p}
                      accessibilityRole="button"
                      accessibilityLabel={PROVIDER_LABEL[p]}
                      onPress={() => setProvider(p)}
                      style={[
                        styles.chip,
                        {
                          borderColor: provider === p ? colors.primary : colors.border,
                          backgroundColor: provider === p ? `${colors.primary}24` : 'transparent',
                        },
                      ]}
                    >
                      <AppText variant="smallBold" style={{ color: provider === p ? colors.accentFg : colors.mutedFg }}>
                        {PROVIDER_LABEL[p]}
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
                accessibilityLabel="رقم هاتف الشحن"
                hint="مطلوب (7 أرقام على الأقل) لإتمام الحوالة"
              />
              {actionError ? (
                <AppText variant="small" style={{ color: colors.destructive }}>
                  {actionError}
                </AppText>
              ) : null}
              <Row>
                <Button title="طلب الشحن" onPress={() => topupMutation.mutate()} loading={topupMutation.isPending} disabled={!formValid} />
                <Button title="إلغاء" variant="ghost" onPress={() => setShowTopup(false)} />
              </Row>
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
