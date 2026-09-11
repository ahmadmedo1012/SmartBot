/**
 * تاب التحليلات — نفس مصدر الويب (/dashboard/analytics):
 * GET /api/analytics/overview?days=30 + daily-trend + sentiment + top-commenters.
 * بطاقات إحصاء + رسم أعمدة SVG (بديل recharts الأصلي) + قائمة أفضل المعلقين.
 */
import { useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import Svg, { Line, Rect } from 'react-native-svg'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Card, KpiCard, Row } from '@/components/ui'
import { apiGet } from '@/services/api'
import { describeError, ErrorState, LoadingState, PullToRefresh } from '@/components/state-views'
import { formatNumber } from '@/lib/format'

interface Overview {
  totals?: {
    messages?: number
    replies?: number
    comments?: number
    subscribers?: number
    [k: string]: unknown
  }
  daily?: { date: string; count: number }[]
  sentiment?: { positive?: number; negative?: number; neutral?: number }
  [k: string]: unknown
}

/** رسم أعمدة SVG خالص — بديل recharts المكتبي (بلا تبعيات ثقيلة). */
function BarChart({ data, color, height = 160 }: { data: { label: string; value: number }[]; color: string; height?: number }) {
  if (data.length === 0) return null
  const w = 320
  const max = Math.max(...data.map((d) => d.value), 1)
  const barW = (w - 8) / data.length - 6
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`}>
      {data.map((d, i) => {
        const x = 4 + i * (barW + 6)
        const barH = Math.max(2, (d.value / max) * (height - 28))
        return (
          <Rect key={i} x={x} y={height - 20 - barH} width={barW} height={barH} rx={3} fill={color} opacity={0.9} />
        )
      })}
      <Line x1={0} x2={w} y1={height - 20} y2={height - 20} stroke="rgba(128,128,128,0.3)" strokeWidth={1} />
    </Svg>
  )
}

export default function AnalyticsScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const [days, setDays] = useState(30)

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<Overview>({
    queryKey: ['analytics-overview', days],
    queryFn: () => apiGet<Overview>(`/api/analytics/overview?days=${days}`),
  })

  const { data: commenters } = useQuery<{ name: string | null; comments: number }[]>({
    queryKey: ['top-commenters'],
    queryFn: () => apiGet<{ name: string | null; comments: number }[]>('/api/analytics/top-commenters?limit=5'),
  })

  const daily = useMemo(() => {
    const d = (data?.daily ?? []) as { date: string; count: number }[]
    return d.slice(-14).map((p) => ({
      label: (p.date ?? '').slice(5),
      value: Number(p.count ?? 0),
    }))
  }, [data])

  const sentiment = data?.sentiment ?? {}
  const sentimentTotal = (sentiment.positive ?? 0) + (sentiment.negative ?? 0) + (sentiment.neutral ?? 0)

  if (isLoading) return <LoadingState label="جارٍ تحميل التحليلات…" />

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppText variant="title">التحليلات</AppText>
        <Row style={{ gap: spacing.sm }}>
          {[7, 30, 90].map((d) => (
            <View key={d}>
              <AppText
                variant="smallBold"
                onPress={() => (setDays(d), refetch())}
                style={{
                  color: days === d ? colors.accentFg : colors.mutedFg,
                  backgroundColor: days === d ? `${colors.primary}24` : 'transparent',
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  overflow: 'hidden',
                }}
              >
                {d} يوم
              </AppText>
            </View>
          ))}
        </Row>
      </View>

      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : (
        <PullToRefresh refreshing={isRefetching} onRefresh={() => refetch()}>
          <Row style={{ gap: spacing.md }}>
            <KpiCard label="الرسائل" value={formatNumber(data?.totals?.messages as number)} tone="brand" />
            <KpiCard label="ردود البوت" value={formatNumber(data?.totals?.replies as number)} tone="success" />
          </Row>
          <Row style={{ gap: spacing.md, marginTop: spacing.md }}>
            <KpiCard label="التعليقات" value={formatNumber(data?.totals?.comments as number)} tone="info" />
            <KpiCard label="المشتركون" value={formatNumber(data?.totals?.subscribers as number)} tone="warning" />
          </Row>

          {/* الاتجاه اليومي */}
          <Card style={{ marginTop: spacing.lg }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="subtitle">النشاط اليومي</AppText>
              <Badge tone="muted" text="آخر 14 يومًا" />
            </Row>
            <View style={{ marginTop: spacing.md }}>
              <BarChart data={daily} color={colors.primary} />
            </View>
          </Card>

          {/* المشاعر */}
          {sentimentTotal > 0 ? (
            <Card style={{ marginTop: spacing.lg }}>
              <AppText variant="subtitle">تحليل المشاعر</AppText>
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {[
                  { label: 'إيجابي', value: sentiment.positive ?? 0, color: colors.success },
                  { label: 'محايد', value: sentiment.neutral ?? 0, color: colors.mutedFg },
                  { label: 'سلبي', value: sentiment.negative ?? 0, color: colors.destructive },
                ].map((s) => (
                  <Row key={s.label} style={{ justifyContent: 'space-between' }}>
                    <AppText variant="small" style={{ width: 56 }}>
                      {s.label}
                    </AppText>
                    <View style={{ flex: 1, height: 10, borderRadius: 999, backgroundColor: colors.muted, overflow: 'hidden', marginHorizontal: spacing.md }}>
                      <View style={{ width: `${Math.round((s.value / sentimentTotal) * 100)}%`, height: '100%', backgroundColor: s.color }} />
                    </View>
                    <AppText variant="caption" color="mutedFg" style={{ width: 60, textAlign: 'left' }}>
                      {Math.round((s.value / sentimentTotal) * 100)}%
                    </AppText>
                  </Row>
                ))}
              </View>
            </Card>
          ) : null}

          {/* أفضل المعلقين */}
          {(commenters ?? []).length > 0 ? (
            <Card style={{ marginTop: spacing.lg }}>
              <AppText variant="subtitle">أكثر المعلقين تفاعلًا</AppText>
              <View style={{ marginTop: spacing.md, gap: spacing.md }}>
                {(commenters ?? []).map((c, i) => (
                  <Row key={i} style={{ justifyContent: 'space-between' }}>
                    <Row style={{ gap: spacing.sm }}>
                      <View style={[styles.rank, { backgroundColor: i === 0 ? colors.primary : colors.muted }]}>
                        <AppText variant="caption" style={{ color: i === 0 ? colors.primaryFg : colors.mutedFg }}>
                          {i + 1}
                        </AppText>
                      </View>
                      <AppText variant="smallBold" numberOfLines={1}>
                        {c.name ?? 'مستخدم'}
                      </AppText>
                    </Row>
                    <AppText variant="small" color="mutedFg">
                      {formatNumber(c.comments)} تعليق
                    </AppText>
                  </Row>
                ))}
              </View>
            </Card>
          ) : null}
        </PullToRefresh>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
  rank: { width: 24, height: 24, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
})
