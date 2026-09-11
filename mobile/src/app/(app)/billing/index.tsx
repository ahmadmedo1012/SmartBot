/**
 * شاشة الفواتير (نفس الويب /dashboard/billing):
 * GET /api/payments/balance · /api/payments/history · POST /api/payments/topup.
 * الاشتراك عبر /api/plans + /api/subscriptions.
 */
import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { apiGet, apiPost } from '@/services/api'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatDate, formatMoney, formatNumber } from '@/lib/format'
import { useAuth } from '@/state/auth'
import type { PaymentRecord, Plan, WalletBalance } from '@/types/api'

export default function BillingScreen() {
  const { colors } = useTheme()
  const { user } = useAuth()
  const [actionError, setActionError] = useState<string | null>(null)

  const { data: balance, isLoading: balLoading } = useQuery<WalletBalance>({
    queryKey: ['wallet-balance'],
    queryFn: () => apiGet<WalletBalance>('/api/payments/balance'),
  })

  const { data: history, isError, error, refetch } = useQuery<PaymentRecord[]>({
    queryKey: ['payments-history'],
    queryFn: () => apiGet<PaymentRecord[]>('/api/payments/history'),
  })

  const topupMutation = useMutation({
    mutationFn: (amount: number) => apiPost('/api/payments/topup', { amount }),
    onSuccess: () => {
      setActionError(null)
      refetch()
    },
    onError: (e) => setActionError(describeError(e)),
  })

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
            <Button title="شحن 20 د.ل" size="sm" variant="secondary" onPress={() => topupMutation.mutate(20)} loading={topupMutation.isPending} />
            <Button title="شحن 50 د.ل" size="sm" variant="secondary" onPress={() => topupMutation.mutate(50)} loading={topupMutation.isPending} />
          </Row>
          {actionError ? (
            <AppText variant="small" style={{ color: colors.destructive, marginTop: spacing.md }}>
              {actionError}
            </AppText>
          ) : null}
          <AppText variant="caption" color="mutedFg" style={{ marginTop: spacing.md }}>
            الشحن عبر ليبيانا/مدار أو تحويل بنكي — تؤكدها موافقة الأدمن على تيليجرام.
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
            <Button title="ترقية الخطة" size="sm" onPress={() => router.push('/(app)/subscribe' as never)} />
          </Row>
        </Card>

        {/* السجل */}
        <Card>
          <AppText variant="subtitle">سجل العمليات</AppText>
          {isError ? (
            <ErrorState message={describeError(error)} onRetry={() => refetch()} />
          ) : (history ?? []).length === 0 ? (
            <EmptyState message="لا عمليات بعد" hint="شحن رصيدك أو اشترِ خطة لتظهر هنا" />
          ) : (
            <View style={{ marginTop: spacing.md, gap: spacing.md }}>
              {(history ?? []).map((p) => (
                <Row key={p.id} style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="smallBold">{formatMoney(p.amount)}</AppText>
                    <AppText variant="caption" color="mutedFg">
                      {formatDate(p.created_at)} · {p.method ?? p.kind ?? '—'}
                    </AppText>
                  </View>
                  <Badge
                    tone={p.status === 'confirmed' || p.status === 'PAID' ? 'success' : p.status === 'rejected' ? 'destructive' : 'warning'}
                    text={p.status === 'confirmed' || p.status === 'PAID' ? 'مؤكد' : p.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                  />
                </Row>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>
    </StackScreen>
  )
}
