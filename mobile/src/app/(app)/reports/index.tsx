/**
 * شاشة التقارير (نفس الويب /dashboard/reports):
 * GET /api/analytics/dashboard — عقد v25 (analytics_engine.py — M-15):
 * {total_replies, total_messages, total_subscribers} (المفاتيح الفعلية —
 * لا total_comments/subscribers الوهمية).
 * POST /api/reports/generate يرجع PDF ثنائيًا (بايتات مباشرة لا JSON) —
 * لا يمكن فتحه من الموبايل بمصادقة Bearer: أزلنا زر النجاح الوهمي
 * ووضعنا ملاحظة صادقة (يُنشأ من الواجهة الكاملة).
 */
import { ScrollView, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Card, KpiCard, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { apiGet } from '@/services/api'
import { describeError } from '@/components/state-views'
import { formatNumber } from '@/lib/format'
import type { DashboardAnalytics } from '@/types/api'

export default function ReportsScreen() {
  const { colors } = useTheme()

  const { data, isLoading, isError, error } = useQuery<DashboardAnalytics>({
    queryKey: ['analytics-dashboard'],
    queryFn: () => apiGet<DashboardAnalytics>('/api/analytics/dashboard'),
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
            {/* M-15: المفاتيح الثلاثة الفعلية للعقد */}
            <Row style={{ gap: spacing.md }}>
              <KpiCard label="إجمالي الردود" value={formatNumber(data?.total_replies ?? 0)} tone="brand" />
              <KpiCard label="الرسائل" value={formatNumber(data?.total_messages ?? 0)} tone="info" />
            </Row>
            <Row style={{ gap: spacing.md }}>
              <KpiCard label="المشتركون" value={formatNumber(data?.total_subscribers ?? 0)} tone="success" />
              {data?.today_replies != null ? (
                <KpiCard label="ردود اليوم" value={formatNumber(data.today_replies)} tone="warning" />
              ) : null}
            </Row>
            <View>
              <AppText variant="caption" color="mutedFg" style={{ textAlign: 'center' }}>
                إحصاءات آخر {data?.period_days ?? 30} يومًا
              </AppText>
            </View>
          </>
        )}

        <Card>
          <AppText variant="subtitle">تقرير PDF شامل</AppText>
          <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.xs }}>
            يُنشأ من الواجهة الكاملة (لوحة الويب) — تقارير PDF الجاهزة للمشاركة متاحة من هناك.
          </AppText>
        </Card>
      </ScrollView>
    </StackScreen>
  )
}
