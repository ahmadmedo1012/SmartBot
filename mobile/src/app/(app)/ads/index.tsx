/**
 * شاشة الإعلانات (نفس الويب /dashboard/ads):
 * GET /api/ads/accounts — حسابات إعلانية مع الرصيد.
 * (الحملات التفصيلية تُدار من الويب — هنا نظرة سريعة للجيب.)
 */
import { FlatList, StyleSheet, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { apiGet } from '@/services/api'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatMoney } from '@/lib/format'
import type { AdAccount } from '@/types/api'

export default function AdsScreen() {
  const { colors } = useTheme()
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<AdAccount[]>({
    queryKey: ['ads-accounts'],
    queryFn: () => apiGet<AdAccount[]>('/api/ads/accounts'),
  })

  return (
    <StackScreen title="الإعلانات" subtitle={`${data?.length ?? 0} حسابًا`} isLoading={isLoading}>
      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="لا حسابات إعلانية" hint="اربط حسابك الإعلاني من لوحة الويب لمتابعة إنفاقك" />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(a) => String(a.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                  {item.name ?? `حساب ${item.id}`}
                </AppText>
                {item.balance != null ? (
                  <Badge tone={item.balance > 0 ? 'success' : 'destructive'} text={formatMoney(item.balance)} />
                ) : null}
              </Row>
              {item.currency ? (
                <AppText variant="caption" color="mutedFg" style={{ marginTop: spacing.xs }}>
                  العملة: {item.currency}
                </AppText>
              ) : null}
            </Card>
          )}
        />
      )}
    </StackScreen>
  )
}
