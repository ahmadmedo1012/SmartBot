/**
 * شاشة التقارير (نفس الويب /dashboard/reports):
 * GET /api/analytics/dashboard · POST /api/reports/generate (PDF).
 */
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, KpiCard, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { apiGet, apiPost } from '@/services/api'
import { describeError } from '@/components/state-views'
import { formatNumber } from '@/lib/format'

interface DashboardAnalytics {
  total_replies?: number
  total_comments?: number
  total_messages?: number
  subscribers?: number
  top_rule?: string
  [k: string]: unknown
}

export default function ReportsScreen() {
  const { colors } = useTheme()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const { data, isLoading, isError, error } = useQuery<DashboardAnalytics>({
    queryKey: ['analytics-dashboard'],
    queryFn: () => apiGet<DashboardAnalytics>('/api/analytics/dashboard'),
  })

  const generateMutation = useMutation({
    mutationFn: () => apiPost<{ download_url?: string; filename?: string }>('/api/reports/generate', {}),
    onSuccess: (res) => {
      setMsg({
        ok: true,
        text: res?.download_url
          ? 'تم إنشاء تقرير PDF — الرابط متاح من لوحة الويب'
          : 'تم إنشاء تقرير PDF بنجاح',
      })
    },
    onError: (e) => setMsg({ ok: false, text: describeError(e) }),
  })

  return (
    <StackScreen title="التقارير" isLoading={isLoading}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl * 2 }}>
        {isError ? (
          <Card style={{ backgroundColor: colors.destructiveSoft }}>
            <AppText variant="small" style={{ color: colors.destructive }}>
              {describeError(error)}
            </AppText>
          </Card>
        ) : (
          <>
            <Row style={{ gap: spacing.md }}>
              <KpiCard label="إجمالي الردود" value={formatNumber(data?.total_replies as number)} tone="brand" />
              <KpiCard label="التعليقات" value={formatNumber(data?.total_comments as number)} tone="info" />
            </Row>
            <Row style={{ gap: spacing.md }}>
              <KpiCard label="الرسائل" value={formatNumber(data?.total_messages as number)} tone="warning" />
              <KpiCard label="المشتركون" value={formatNumber(data?.subscribers as number)} tone="success" />
            </Row>

            {data?.top_rule ? (
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <AppText variant="subtitle">القاعدة الأنشط</AppText>
                  <Badge tone="brand" text="الأكثر مطابقة" />
                </Row>
                <AppText variant="body" style={{ marginTop: spacing.md }}>
                  {String(data.top_rule)}
                </AppText>
              </Card>
            ) : null}
          </>
        )}

        <Card>
          <AppText variant="subtitle">تقرير PDF شامل</AppText>
          <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.xs }}>
            تقرير أداء شهري جاهز للمشاركة — يصل بريدك أو حمّله من الويب.
          </AppText>
          {msg ? (
            <AppText variant="small" style={{ color: msg.ok ? colors.success : colors.destructive, marginTop: spacing.md }}>
              {msg.text}
            </AppText>
          ) : null}
          <View style={{ marginTop: spacing.lg }}>
            <Button
              title="إنشاء التقرير الآن"
              onPress={() => generateMutation.mutate()}
              loading={generateMutation.isPending}
            />
          </View>
        </Card>
      </ScrollView>
    </StackScreen>
  )
}
