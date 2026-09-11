/**
 * شاشة سجل النشاطات (نفس الويب /dashboard/activity):
 * GET /api/logs?limit=100 — عقد v25 (routers/bot.py — M-16): مصفوفة مجردة
 * من صفوف {level, message, created_at} — لا حقل id (مفتاح القائمة = index)
 * والرسالة هي العنوان ومستواها شارة.
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
import { timeAgo } from '@/lib/format'
import type { LogEntry } from '@/types/api'

const LEVEL_TONE: Record<string, 'success' | 'warning' | 'destructive' | 'muted' | 'info'> = {
  info: 'info',
  warning: 'warning',
  error: 'destructive',
  success: 'success',
}

const LEVEL_LABEL: Record<string, string> = {
  info: 'معلومة',
  warning: 'تنبيه',
  error: 'خطأ',
  success: 'نجاح',
}

export default function ActivityScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<unknown, Error, LogEntry[]>({
    queryKey: ['activity-logs'],
    queryFn: () => apiGet('/api/logs?limit=100'),
    select: (res) => extractItems<LogEntry>(res),
    refetchInterval: 30_000,
  })
  const logs = data ?? []

  return (
    <StackScreen title="سجل النشاطات" subtitle={`${logs.length} حدثًا`} isLoading={isLoading}>
      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : logs.length === 0 ? (
        <EmptyState message="لا نشاط بعد" hint="أحداث البوت والردود تُسجَّل هنا لحظة حدوثها" />
      ) : (
        <FlatList
          data={logs}
          // M-16: صفوف السجل بلا id — مفتاح موضعي مستقر
          keyExtractor={(_, index) => String(index)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm }}
          renderItem={({ item }) => {
            const level = (item.level ?? 'info').toLowerCase()
            const tone = LEVEL_TONE[level] ?? 'muted'
            return (
              <Card style={{ padding: spacing.md }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row style={{ gap: spacing.sm, flex: 1 }}>
                    {/* M-16: المستوى شارة والرسالة عنوان */}
                    <Badge tone={tone} text={LEVEL_LABEL[level] ?? level} />
                    <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                      {item.message ?? 'حدث'}
                    </AppText>
                  </Row>
                  <AppText variant="caption" color="mutedFg">
                    {timeAgo(item.created_at)}
                  </AppText>
                </Row>
              </Card>
            )
          }}
        />
      )}
    </StackScreen>
  )
}
