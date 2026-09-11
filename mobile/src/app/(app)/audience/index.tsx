/**
 * شاشة الجمهور — مشتركو الصفحة (نفس الويب /dashboard/audience):
 * GET /api/subscribers?limit=100 + /api/analytics/top-commenters.
 */
import { useState } from 'react'
import { FlatList, StyleSheet, TextInput, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { apiGet } from '@/services/api'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { timeAgo } from '@/lib/format'
import type { Subscriber, TopCommenter } from '@/types/api'

export default function AudienceScreen() {
  const { colors, fontBody } = useTheme()
  const [search, setSearch] = useState('')

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<Subscriber[]>({
    queryKey: ['subscribers'],
    queryFn: () => apiGet<Subscriber[]>('/api/subscribers?limit=100'),
  })

  const { data: top } = useQuery<TopCommenter[]>({
    queryKey: ['top-commenters-full'],
    queryFn: () => apiGet<TopCommenter[]>('/api/analytics/top-commenters?limit=10'),
  })

  const filtered = (data ?? []).filter((s) =>
    !search || (s.name ?? `${s.first_name ?? ''} ${s.last_name ?? ''}`).toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <StackScreen title="الجمهور والمشتركون" subtitle={`${filtered.length} مشترك`} isLoading={isLoading}>
      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="بحث بالاسم…"
            placeholderTextColor={colors.placeholder}
            textAlign="right"
            accessibilityLabel="بحث في المشتركين"
            style={{ flex: 1, color: colors.foreground, fontFamily: fontBody, fontSize: 15 }}
          />
        </View>
      </View>

      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : filtered.length === 0 && !isLoading ? (
        <EmptyState message={search ? 'لا نتائج' : 'لا مشتركين بعد'} hint="المشتركون يضافون تلقائيًا مع أول محادثة" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(s) => String(s.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          ListHeaderComponent={
            (top ?? []).length > 0 ? (
              <Card>
                <AppText variant="subtitle">أكثر المعلقين تفاعلًا</AppText>
                <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                  {(top ?? []).slice(0, 5).map((c, i) => (
                    <Row key={i} style={{ justifyContent: 'space-between' }}>
                      <AppText variant="small" numberOfLines={1} style={{ flex: 1 }}>
                        {c.name ?? 'مستخدم'}
                      </AppText>
                      <Badge tone="brand" text={`${c.comments ?? c.count ?? 0} تعليق`} />
                    </Row>
                  ))}
                </View>
              </Card>
            ) : null
          }
          renderItem={({ item }) => {
            const name = item.name ?? (`${item.first_name ?? ''} ${item.last_name ?? ''}`.trim() || 'مشترك')
            const subscribed = item.subscribed ?? item.is_subscribed ?? true
            return (
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row style={{ gap: spacing.md, flex: 1 }}>
                    <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
                      <AppText variant="smallBold" style={{ color: colors.accentFg }}>
                        {name.charAt(0)}
                      </AppText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <AppText variant="smallBold" numberOfLines={1}>
                        {name}
                      </AppText>
                      <AppText variant="caption" color="mutedFg">
                        انضم {timeAgo(item.created_at)}
                      </AppText>
                    </View>
                  </Row>
                  <Badge tone={subscribed ? 'success' : 'muted'} text={subscribed ? 'مشترك' : 'ملغى'} />
                </Row>
                {item.phone ? (
                  <Row style={{ marginTop: spacing.sm, gap: spacing.sm }}>
                    <AppText variant="caption" color="mutedFg">
                      📞 {item.phone}
                    </AppText>
                  </Row>
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
  searchWrap: { padding: spacing.lg, paddingBottom: 0 },
  searchBox: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    minHeight: 46,
  },
  avatar: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
})
