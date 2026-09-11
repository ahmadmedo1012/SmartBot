/**
 * شاشة الإشعارات (نفس الويب /dashboard/notifications):
 * GET /api/notifications/ · POST .../{id}/read · POST .../read-all.
 */
import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { apiGet, apiPost } from '@/services/api'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { timeAgo } from '@/lib/format'
import type { NotificationItem } from '@/types/api'

interface NotificationsResponse {
  items: NotificationItem[]
  unread: number
}

export default function NotificationsScreen() {
  const { colors } = useTheme()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<NotificationsResponse>({
    queryKey: ['notifications'],
    queryFn: () => apiGet<NotificationsResponse>('/api/notifications/'),
    refetchInterval: 30_000,
  })

  const readMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/api/notifications/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const readAllMutation = useMutation({
    mutationFn: () => apiPost('/api/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  return (
    <StackScreen
      title="الإشعارات"
      subtitle={`${data?.unread ?? 0} غير مقروء`}
      action={
        (data?.unread ?? 0) > 0 ? (
          <Button title="قراءة الكل" size="sm" variant="secondary" onPress={() => readAllMutation.mutate()} loading={readAllMutation.isPending} />
        ) : undefined
      }
      isLoading={isLoading}
    >
      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : (data?.items ?? []).length === 0 ? (
        <EmptyState message="لا إشعارات" hint="إشعارات الدفع والدعم والحملات تظهر هنا" />
      ) : (
        <FlatList
          data={data?.items ?? []}
          keyExtractor={(n) => String(n.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => {
            const read = item.read ?? item.is_read ?? false
            return (
              <Pressable accessibilityRole="button" accessibilityLabel={item.title ?? 'إشعار'} onPress={() => !read && readMutation.mutate(item.id)}>
                <Card style={{ opacity: read ? 0.65 : 1 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Row style={{ gap: spacing.sm, flex: 1 }}>
                      {!read ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
                      <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                        {item.title ?? 'إشعار'}
                      </AppText>
                    </Row>
                    <AppText variant="caption" color="mutedFg">
                      {timeAgo(item.created_at)}
                    </AppText>
                  </Row>
                  {item.body ?? item.message ? (
                    <AppText variant="small" color="mutedFg" style={{ marginTop: 4 }} numberOfLines={3}>
                      {item.body ?? item.message}
                    </AppText>
                  ) : null}
                </Card>
              </Pressable>
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
