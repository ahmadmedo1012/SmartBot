/**
 * شاشة سجل النشاطات (نفس الويب /dashboard/activity):
 * GET /api/logs?limit=100 — خط زمني للأحداث.
 */
import { FlatList, StyleSheet, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { apiGet } from '@/services/api'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { timeAgo } from '@/lib/format'
import type { LogEntry } from '@/types/api'

const LEVEL_TONE: Record<string, 'success' | 'warning' | 'destructive' | 'muted' | 'info'> = {
  info: 'info',
  warning: 'warning',
  error: 'destructive',
  success: 'success',
}

export default function ActivityScreen() {
  const { colors } = useTheme()
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<LogEntry[]>({
    queryKey: ['activity-logs'],
    queryFn: () => apiGet<LogEntry[]>('/api/logs?limit=100'),
    refetchInterval: 30_000,
  })

  return (
    <StackScreen title="سجل النشاطات" subtitle={`${data?.length ?? 0} حدثًا`} isLoading={isLoading}>
      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="لا نشاط بعد" hint="أحداث البوت والردود تُسجَّل هنا لحظة حدوثها" />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(l) => String(l.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          renderItem={({ item }) => {
            const level = (item.level ?? 'info').toLowerCase()
            const tone = LEVEL_TONE[level] ?? 'muted'
            const toneColor =
              tone === 'success' ? colors.success : tone === 'warning' ? colors.warning : tone === 'destructive' ? colors.destructive : tone === 'info' ? colors.info : colors.mutedFg
            return (
              <Card style={{ padding: spacing.md }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row style={{ gap: spacing.sm, flex: 1 }}>
                    <View style={[styles.dot, { backgroundColor: toneColor }]} />
                    <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                      {item.event ?? item.action ?? 'حدث'}
                    </AppText>
                  </Row>
                  <AppText variant="caption" color="mutedFg">
                    {timeAgo(item.created_at ?? item.ts)}
                  </AppText>
                </Row>
                {item.message ?? item.detail ? (
                  <AppText variant="small" color="mutedFg" style={{ marginTop: 4 }} numberOfLines={2}>
                    {item.message ?? item.detail}
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

const styles = StyleSheet.create({
  dot: { width: 10, height: 10, borderRadius: 999 },
})
