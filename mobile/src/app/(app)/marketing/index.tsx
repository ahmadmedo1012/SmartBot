/**
 * شاشة التسويق (نفس الويب /dashboard/marketing):
 * GET /api/marketing/campaigns — عقد v25 (routers/marketing.py): مغلّف
 * {items,total} (M-05) — ليس مصفوفة.
 * GET /api/marketing/audience-size → {audience, count} — نقرأ .count.
 */
import { FlatList } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { apiGet } from '@/services/api'
import { extractItems } from '@/lib/envelope'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatDate, formatNumber } from '@/lib/format'
import type { MarketingCampaign } from '@/types/api'

/** عقد /api/marketing/audience-size بعد فك envelope (M-05). */
interface AudienceSizeResponse {
  audience?: string
  count?: number
}

const AUDIENCE_LABEL: Record<string, string> = {
  all: 'كل المشتركين',
  active: 'النشطون (30 يومًا)',
  engaged: 'المتفاعلون',
  new: 'الجدد (14 يومًا)',
}

const STATUS_BADGE: Record<string, { tone: 'success' | 'warning' | 'muted' | 'destructive'; text: string }> = {
  sent: { tone: 'success', text: 'أُرسلت' },
  scheduled: { tone: 'warning', text: 'مجدولة' },
  draft: { tone: 'muted', text: 'مسودة' },
  failed: { tone: 'destructive', text: 'فشلت' },
}

export default function MarketingScreen() {
  const { colors } = useTheme()
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<
    { items: MarketingCampaign[]; total?: number },
    Error,
    MarketingCampaign[]
  >({
    queryKey: ['marketing-campaigns'],
    queryFn: () => apiGet('/api/marketing/campaigns'),
    select: (res) => extractItems<MarketingCampaign>(res),
  })
  const campaigns = data ?? []

  const { data: audience } = useQuery<AudienceSizeResponse>({
    queryKey: ['audience-size'],
    queryFn: () => apiGet<AudienceSizeResponse>('/api/marketing/audience-size'),
  })

  const audienceSize = audience?.count

  return (
    <StackScreen
      title="التسويق"
      subtitle={audienceSize != null ? `حجم الجمهور: ${formatNumber(audienceSize)}` : undefined}
      isLoading={isLoading}
    >
      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : campaigns.length === 0 ? (
        <EmptyState message="لا حملات تسويقية" hint="حملات ترويجية لجمهور صفحتك — أنشئها من لوحة الويب" />
      ) : (
        <FlatList
          data={campaigns}
          keyExtractor={(c) => String(c.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => {
            const badge = STATUS_BADGE[item.status ?? ''] ?? { tone: 'warning' as const, text: item.status ?? '—' }
            return (
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                    {item.name ?? 'حملة'}
                  </AppText>
                  <Badge tone={badge.tone} text={badge.text} />
                </Row>
                {item.message ? (
                  <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.sm }} numberOfLines={2}>
                    {item.message}
                  </AppText>
                ) : null}
                <Row style={{ marginTop: spacing.md, gap: spacing.lg, flexWrap: 'wrap' }}>
                  {item.audience ? (
                    <AppText variant="caption" color="mutedFg">الجمهور: {AUDIENCE_LABEL[item.audience] ?? item.audience}</AppText>
                  ) : null}
                  {typeof item.sent_count === 'number' && item.sent_count > 0 ? (
                    <AppText variant="caption" style={{ color: colors.success }}>{formatNumber(item.sent_count)} نجح</AppText>
                  ) : null}
                </Row>
                {item.scheduled_at || item.created_at ? (
                  <AppText variant="caption" color="mutedFg" style={{ marginTop: spacing.xs }}>
                    {item.scheduled_at ? `مجدولة ${formatDate(item.scheduled_at)}` : formatDate(item.created_at)}
                  </AppText>
                ) : null}
              </Card>
            )
          }}
        />
      )}
    </StackScreen>
  )
}
