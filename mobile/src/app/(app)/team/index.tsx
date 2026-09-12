/**
 * شاشة الفريق (نفس الويب /dashboard/team):
 * GET /api/team/members · /api/team/performance · /api/team/role-summary.
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
import type { TeamMember } from '@/types/api'

export default function TeamScreen() {
  const { colors } = useTheme()
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<TeamMember[]>({
    queryKey: ['team-members'],
    queryFn: () => apiGet<TeamMember[]>('/api/team/members'),
  })

  return (
    <StackScreen title="الفريق" subtitle={`${data?.length ?? 0} عضوًا`} isLoading={isLoading}>
      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="لا أعضاء بعد" hint="أضف أعضاء فريقك من لوحة الويب — خطة Premium وما فوق" />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(m) => String(m.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Row style={{ gap: spacing.md, flex: 1 }}>
                  <View style={[styles.avatar, { backgroundColor: `${colors.accentFg}1a` }]}>
                    <AppText variant="smallBold" style={{ color: colors.accentFg }}>
                      {(item.username ?? '؟').charAt(0).toUpperCase()}
                    </AppText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <AppText variant="smallBold" numberOfLines={1}>
                      {item.username}
                    </AppText>
                    {item.email ? (
                      <AppText variant="caption" color="mutedFg" numberOfLines={1}>
                        {item.email}
                      </AppText>
                    ) : null}
                  </View>
                </Row>
                <Badge tone={item.role === 'admin' ? 'brand' : item.role === 'editor' ? 'info' : 'muted'} text={item.role === 'admin' ? 'مدير' : item.role === 'editor' ? 'محرر' : 'مشاهد'} />
              </Row>
              {item.created_at ? (
                <AppText variant="caption" color="mutedFg" style={{ marginTop: spacing.sm }}>
                  انضم {formatDate(item.created_at)}
                </AppText>
              ) : null}
            </Card>
          )}
        />
      )}
    </StackScreen>
  )
}

const styles = StyleSheet.create({
  avatar: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
})
