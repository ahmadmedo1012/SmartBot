/**
 * شاشة الحملات التسلسلية (نفس الويب /dashboard/sequences):
 * GET /api/sequences — عرض الحملات وعدد الخطوات والمشتركين.
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
import { formatDate } from '@/lib/format'
import type { Sequence } from '@/types/api'

export default function SequencesScreen() {
  const { colors } = useTheme()
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<Sequence[]>({
    queryKey: ['sequences'],
    queryFn: () => apiGet<Sequence[]>('/api/sequences'),
  })

  return (
    <StackScreen title="الحملات التسلسلية" subtitle={`${data?.length ?? 0} حملة`} isLoading={isLoading}>
      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="لا حملات تسلسلية" hint="رسائل متتابعة تلقائية للمشتركين — خطة Pro وما فوق. أنشئها من لوحة الويب" />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(s) => String(s.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => {
            const active = item.is_active ?? item.active ?? false
            return (
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                    {item.name ?? item.title ?? 'حملة'}
                  </AppText>
                  <Badge tone={active ? 'success' : 'muted'} text={active ? 'نشطة' : 'موقوفة'} />
                </Row>
                <Row style={{ marginTop: spacing.md, gap: spacing.lg }}>
                  {item.steps_count != null ? <AppText variant="caption" color="mutedFg">{item.steps_count} خطوة</AppText> : null}
                  {item.subscribers_count != null ? <AppText variant="caption" color="mutedFg">{item.subscribers_count} مشترك</AppText> : null}
                </Row>
                {item.created_at ? (
                  <AppText variant="caption" color="mutedFg" style={{ marginTop: spacing.xs }}>
                    بدأت {formatDate(item.created_at)}
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
