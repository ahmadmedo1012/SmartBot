/**
 * شاشة الاشتراك في خطة (نفس الويب /pricing + /subscribe):
 * GET /api/plans (عام) · POST /api/subscriptions (طلب اشتراك).
 */
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { apiGet, apiPost } from '@/services/api'
import { LoadingState, ErrorState, describeError } from '@/components/state-views'
import { formatMoney } from '@/lib/format'
import type { Plan } from '@/types/api'

export default function SubscribeScreen() {
  const { colors } = useTheme()
  const [actionError, setActionError] = useState<string | null>(null)
  const [requested, setRequested] = useState<number | null>(null)

  const { data: plans, isLoading, isError, error, refetch } = useQuery<Plan[]>({
    queryKey: ['plans'],
    queryFn: () => apiGet<Plan[]>('/api/plans'),
  })

  const subscribeMutation = useMutation({
    mutationFn: (planId: number) => apiPost('/api/subscriptions', { plan_id: planId }),
    onSuccess: (_data, planId) => {
      setActionError(null)
      setRequested(planId)
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
                      onPress={() => subscribeMutation.mutate(plan.id)}
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
    </StackScreen>
  )
}
