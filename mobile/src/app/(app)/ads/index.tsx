/**
 * شاشة الإعلانات (نفس الويب /dashboard/ads):
 * GET /api/ads/accounts — عقد v25 (routers/facebook_routes.py): مغلّف
 * {items, source, synced, sync_error?, ads_unavailable?} (M-02) — ليس مصفوفة.
 * الرصيد يصل سلسلة ("12.5") — المقارنة والتنسيق على Number.
 * (الحملات التفصيلية تُدار من الويب — هنا نظرة سريعة للجيب.)
 */
import { FlatList } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { apiGet } from '@/services/api'
import { extractItems } from '@/lib/envelope'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatMoney } from '@/lib/format'
import type { AdAccount } from '@/types/api'

/** عقد GET /api/ads/accounts بعد فك envelope {success,data} (M-02). */
interface AdAccountsResponse {
  items: AdAccount[]
  source?: string
  synced?: boolean
  sync_error?: string
  ads_unavailable?: boolean
  ads_unavailable_reason?: string
}

export default function AdsScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<AdAccountsResponse, Error, AdAccount[]>({
    queryKey: ['ads-accounts'],
    queryFn: () => apiGet<AdAccountsResponse>('/api/ads/accounts'),
    select: (res) => extractItems<AdAccount>(res),
  })
  const accounts = data ?? []

  return (
    <StackScreen title="الإعلانات" subtitle={`${accounts.length} حسابًا`} isLoading={isLoading}>
      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : accounts.length === 0 ? (
        <EmptyState message="لا حسابات إعلانية" hint="اربط حسابك الإعلاني من لوحة الويب لمتابعة إنفاقك" />
      ) : (
        <FlatList
          data={accounts}
          keyExtractor={(a) => String(a.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => {
            // الرصيد سلسلة من الباكند — القيمة الرقمية للمقارنة والعرض
            const balance = item.balance != null ? Number(item.balance) : null
            return (
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                    {item.name || `حساب ${item.id}`}
                  </AppText>
                  {balance != null && Number.isFinite(balance) ? (
                    <Badge tone={balance > 0 ? 'success' : 'destructive'} text={formatMoney(balance)} />
                  ) : null}
                </Row>
                <Row style={{ marginTop: spacing.xs, gap: spacing.lg }}>
                  {item.currency ? (
                    <AppText variant="caption" color="mutedFg">
                      العملة: {item.currency}
                    </AppText>
                  ) : null}
                  {item.amount_spent != null ? (
                    <AppText variant="caption" color="mutedFg">
                      الإنفاق: {formatMoney(Number(item.amount_spent) || 0)}
                    </AppText>
                  ) : null}
                </Row>
              </Card>
            )
          }}
        />
      )}
    </StackScreen>
  )
}
