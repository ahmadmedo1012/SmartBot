/**
 * شاشة الرئيسية (لوحة التحكم) — نفس بيانات الويب:
 * GET /api/dashboard/bundle (تحديث كل 60 ثانية — إيقاع الويب نفسه).
 * KPIs + رسم 7 أيام + حالة الاتصال + آخر الردود.
 */
import { useCallback, useState } from 'react'
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import Svg, { Line, Path, Circle } from 'react-native-svg'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Card, KpiCard, Row } from '@/components/ui'
import { Icon } from '@/components/icon'
import { apiGet } from '@/services/api'
import { describeError, ErrorState, LoadingState, PullToRefresh } from '@/components/state-views'
import { formatNumber, formatTrend, timeAgo } from '@/lib/format'
import { useAuth } from '@/state/auth'

interface Bundle {
  stats: {
    total_replies: number
    today_replies: number
    fan_count: number | null
    chart: Record<string, number>
    trend: { today: number; week: number }
  }
  connection: { connected: boolean; page_name: string | null; error: string }
  messages: { total_conversations: number; total_messages: number; unread_conversations: number; bot_replies: number }
  rules_count: number
  active_rules_count: number
  bot_status: { running: boolean; interval: number }
  ai_status: { available: boolean; provider_name: string }
  recent_replies: { id: number; commenter_name: string | null; comment_text: string | null; reply_text: string | null; created_at: string | null }[]
}

/** رسم شرائح خطي مصغّر (Sparkline) لآخر 7 أيام — SVG خالص بلا مكتبات رسوم. */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const w = 300
  const h = 72
  const step = w / (data.length - 1)
  const pts = data.map((v, i) => [i * step, h - (v / max) * (h - 8) - 4] as const)
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${d} L${w},${h} L0,${h} Z`
  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
      <Path d={area} fill={color} opacity={0.12} />
      <Path d={d} stroke={color} strokeWidth={2.4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <Circle key={i} cx={x} cy={y} r={2.6} fill={color} />
      ))}
    </Svg>
  )
}

export default function DashboardScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [refreshing, setRefreshing] = useState(false)

  const { data, isLoading, isError, error, refetch } = useQuery<Bundle>({
    queryKey: ['dashboard-bundle'],
    queryFn: () => apiGet<Bundle>('/api/dashboard/bundle'),
    refetchInterval: 60_000, // نفس إيقاع الويب
  })

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refetch().catch(() => undefined)
    setRefreshing(false)
  }, [refetch])

  if (isLoading) return <LoadingState label="جارٍ تحميل لوحة التحكم…" />

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* الترويسة */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="small" color="mutedFg">
            مرحباً {user?.username} 👋
          </AppText>
          <AppText variant="title" style={{ marginTop: 2 }}>
            لوحة التحكم
          </AppText>
        </View>
        <Row style={{ gap: spacing.sm }}>
          <Badge
            tone={data?.connection.connected ? 'success' : 'warning'}
            text={data?.connection.connected ? `متصل · ${data.connection.page_name ?? ''}` : 'غير متصل'}
          />
        </Row>
      </View>

      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : (
        <PullToRefresh refreshing={refreshing} onRefresh={onRefresh}>
          {/* KPIs */}
          <Row style={{ gap: spacing.md }}>
            <KpiCard
              label="ردود البوت اليوم"
              value={formatNumber(data?.stats.today_replies ?? 0)}
              trend={formatTrend(data?.stats.trend.today)}
              tone="brand"
              icon={<Icon name="zap" size={18} color={colors.accentFg} />}
            />
            <KpiCard
              label="إجمالي الردود"
              value={formatNumber(data?.stats.total_replies ?? 0)}
              trend={`أسبوعياً ${formatTrend(data?.stats.trend.week)}`}
              tone="info"
              icon={<Icon name="trending-up" size={18} color={colors.info} />}
            />
          </Row>
          <Row style={{ gap: spacing.md, marginTop: spacing.md }}>
            <KpiCard
              label="محادثات جديدة"
              value={formatNumber(data?.messages.unread_conversations ?? 0)}
              hint={`من ${formatNumber(data?.messages.total_conversations ?? 0)} محادثة`}
              tone="warning"
              icon={<Icon name="message-circle" size={18} color={colors.warning} />}
            />
            <KpiCard
              label="معجبو الصفحة"
              value={data?.stats.fan_count != null ? formatNumber(data.stats.fan_count) : '—'}
              tone="success"
              icon={<Icon name="users" size={18} color={colors.success} />}
            />
          </Row>

          {/* رسم 7 أيام */}
          <Card style={{ marginTop: spacing.lg }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="subtitle">الردود — آخر 7 أيام</AppText>
              <Badge tone="brand" text={`${data?.active_rules_count ?? 0} قاعدة نشطة`} />
            </Row>
            <View style={{ marginTop: spacing.md }}>
              <Sparkline
                data={Object.values(data?.stats.chart ?? {})}
                color={colors.accentFg}
              />
            </View>
            <AppText variant="caption" color="mutedFg" style={{ marginTop: spacing.sm }}>
              حالة البوت: {data?.bot_status.running ? 'يعمل' : 'متوقف'} · الذكاء الاصطناعي:{' '}
              {data?.ai_status.available ? `متاح (${data.ai_status.provider_name})` : 'غير مفعّل'}
            </AppText>
          </Card>

          {/* آخر الردود */}
          <Card style={{ marginTop: spacing.lg }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="subtitle">آخر الردود</AppText>
              <Icon name="chevron-left" size={18} color={colors.mutedFg} />
            </Row>
            {(data?.recent_replies ?? []).length === 0 ? (
              <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.md, textAlign: 'center' }}>
                لا ردود بعد — اربط صفحتك وستظهر الردود هنا فورًا
              </AppText>
            ) : (
              <View style={{ marginTop: spacing.md, gap: spacing.md }}>
                {data?.recent_replies.map((r) => (
                  <View key={r.id}>
                    <Row style={{ justifyContent: 'space-between' }}>
                      <AppText variant="smallBold" numberOfLines={1}>
                        {r.commenter_name ?? 'مستخدم'}
                      </AppText>
                      <AppText variant="caption" color="mutedFg">
                        {timeAgo(r.created_at)}
                      </AppText>
                    </Row>
                    {r.comment_text ? (
                      <AppText variant="small" color="mutedFg" numberOfLines={1} style={{ marginTop: 2 }}>
                        {r.comment_text}
                      </AppText>
                    ) : null}
                    {r.reply_text ? (
                      <AppText variant="small" numberOfLines={2} style={{ marginTop: 2, color: colors.accentFg }}>
                        ↩ {r.reply_text}
                      </AppText>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
          </Card>

          {/* روابط سريعة */}
          <Card style={{ marginTop: spacing.lg }}>
            <AppText variant="subtitle">إجراءات سريعة</AppText>
            <Row style={{ marginTop: spacing.md, gap: spacing.sm }}>
              <QuickAction label="بث جماعي" icon="radio" href="/(app)/broadcast" />
              <QuickAction label="قواعد الرد" icon="bot" href="/(app)/autoreply" />
              <QuickAction label="المجدول" icon="clock" href="/(app)/scheduled" />
            </Row>
            <Row style={{ marginTop: spacing.sm, gap: spacing.sm }}>
              <QuickAction label="الجمهور" icon="users" href="/(app)/audience" />
              <QuickAction label="الدعم" icon="help-circle" href="/(app)/support" />
              <QuickAction label="الإعدادات" icon="settings" href="/(app)/settings" />
            </Row>
          </Card>
        </PullToRefresh>
      )}
    </View>
  )
}

function QuickAction({ label, icon, href }: { label: string; icon: React.ComponentProps<typeof Icon>['name']; href: string }) {
  const { colors } = useTheme()
  return (
    <View style={{ flex: 1 }}>
      <Row
        style={{
          backgroundColor: colors.muted,
          borderRadius: 12,
          padding: spacing.md,
          gap: spacing.sm,
        }}
      >
        <Icon name={icon} size={20} color={colors.accentFg} />
        <AppText
          variant="smallBold"
          numberOfLines={1}
          onPress={() => router.push(href as never)}
          style={{ flex: 1 }}
        >
          {label}
        </AppText>
      </Row>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md },
})
