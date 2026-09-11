/**
 * شاشة التسويق (نفس الويب /dashboard/marketing):
 * GET /api/marketing/campaigns · /api/marketing/audience-size.
 */
import { FlatList } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { apiGet } from '@/services/api'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatDate, formatNumber } from '@/lib/format'
import type { MarketingCampaign } from '@/types/api'

export default function MarketingScreen() {
  const { colors } = useTheme()
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<MarketingCampaign[]>({
    queryKey: ['marketing-campaigns'],
    queryFn: () => apiGet<MarketingCampaign[]>('/api/marketing/campaigns'),
  })

  const { data: audience } = useQuery<number | { size?: number }>({
    queryKey: ['audience-size'],
    queryFn: () => apiGet<number | { size?: number }>('/api/marketing/audience-size'),
  })

  const audienceSize = typeof audience === 'number' ? audience : audience?.size

  return (
    <StackScreen
      title="التسويق"
      subtitle={audienceSize != null ? `حجم الجمهور: ${formatNumber(audienceSize)}` : undefined}
      isLoading={isLoading}
    >
      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="لا حملات تسويقية" hint="حملات ترويجية لجمهور صفحتك — أنشئها من لوحة الويب" />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(c) => String(c.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                  {item.name ?? item.title ?? 'حملة'}
                </AppText>
                <Badge
                  tone={item.status === 'sent' ? 'success' : item.status === 'failed' ? 'destructive' : 'warning'}
                  text={item.status === 'sent' ? 'أُرسلت' : item.status === 'failed' ? 'فشلت' : 'مجدولة'}
                />
              </Row>
              <Row style={{ marginTop: spacing.md, gap: spacing.lg }}>
                {item.channel ? <AppText variant="caption" color="mutedFg">القناة: {item.channel}</AppText> : null}
                {item.recipients != null ? <AppText variant="caption" color="mutedFg">{formatNumber(item.recipients)} مستلم</AppText> : null}
                {item.sent != null ? <AppText variant="caption" style={{ color: colors.success }}>{formatNumber(item.sent)} نجح</AppText> : null}
              </Row>
              {item.created_at ? (
                <AppText variant="caption" color="mutedFg" style={{ marginTop: spacing.xs }}>
                  {formatDate(item.created_at)}
                </AppText>
              ) : null}
            </Card>
          )}
        />
      )}
    </StackScreen>
  )
}
