/**
 * تاب الرسائل — صندوق الوارد (نفس مصدر الويب):
 * GET /api/inbox/conversations — قائمة محادثات DB-first مع مزامنة حية.
 * قائمة FlatList مع بحث + فلتر غير المقروء، والدخول لمحادثة عبر stack.
 */
import { useCallback, useMemo, useState } from 'react'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing, TOUCH_TARGET } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Row } from '@/components/ui'
import { Icon } from '@/components/icon'
import { apiGet } from '@/services/api'
import { describeError, EmptyState, ErrorState, LoadingState } from '@/components/state-views'
import { timeAgo } from '@/lib/format'

interface InboxItem {
  id: string
  subject: string
  senders: { name: string }[]
  message_count: number
  unread_count: number
  updated_time: string | null
  tags: { id: number; name: string; color: string | null }[]
}

interface InboxResponse {
  items: InboxItem[]
  total: number
  page: number
  per_page: number
}

export default function MessagesScreen() {
  const { colors, fontBody } = useTheme()
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<InboxResponse>({
    queryKey: ['inbox-conversations', search, unreadOnly],
    queryFn: () =>
      apiGet<InboxResponse>(
        `/api/inbox/conversations?per_page=50${search ? `&search=${encodeURIComponent(search)}` : ''}${unreadOnly ? '&status=unread' : ''}`,
      ),
    refetchInterval: 15_000, // إيقاع الويب نفسه (10-15s)
  })

  const items = useMemo(() => data?.items ?? [], [data])

  const renderItem = useCallback(
    ({ item }: { item: InboxItem }) => (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`محادثة ${item.senders[0]?.name ?? ''} — ${item.subject}`}
        onPress={() => router.push({ pathname: '/(app)/messages/[id]', params: { id: item.id, name: item.senders[0]?.name ?? '' } })}
        style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
      >
        {/* صورة رمزية بالحرف الأول */}
        <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
          <AppText variant="subtitle" style={{ color: colors.accentFg }}>
            {(item.senders[0]?.name ?? '؟').charAt(0)}
          </AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
              {item.senders[0]?.name ?? 'مستخدم غير معروف'}
            </AppText>
            <AppText variant="caption" color="mutedFg">
              {timeAgo(item.updated_time)}
            </AppText>
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText variant="small" color="mutedFg" numberOfLines={1} style={{ flex: 1 }}>
              {item.subject}
            </AppText>
            {item.unread_count > 0 ? <Badge tone="brand" text={`${item.unread_count} جديدة`} /> : null}
          </Row>
        </View>
      </Pressable>
    ),
    [colors],
  )

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppText variant="title">الرسائل</AppText>
        <AppText variant="caption" color="mutedFg">
          {data ? `${data.total} محادثة` : '…'}
        </AppText>
      </View>

      {/* بحث + فلتر */}
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Icon name="search" size={16} color={colors.placeholder} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="بحث في المحادثات…"
            placeholderTextColor={colors.placeholder}
            textAlign="right"
            style={{ flex: 1, color: colors.foreground, fontFamily: fontBody, fontSize: 15 }}
            accessibilityLabel="بحث في المحادثات"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="فلتر غير المقروء"
          onPress={() => setUnreadOnly((v) => !v)}
          style={[
            styles.filterBtn,
            { backgroundColor: unreadOnly ? colors.primary : colors.surface, borderColor: unreadOnly ? colors.primary : colors.border },
          ]}
        >
          <AppText variant="smallBold" style={{ color: unreadOnly ? colors.primaryFg : colors.mutedFg }}>
            غير المقروء
          </AppText>
        </Pressable>
      </View>

      {isLoading ? (
        <LoadingState label="جارٍ تحميل المحادثات…" />
      ) : isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          message={search || unreadOnly ? 'لا نتائج مطابقة' : 'لا محادثات بعد'}
          hint="عندما يراسلك زبائن صفحتك ستظهر محادثاتهم هنا فورًا"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl }}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          ItemSeparatorComponent={() => (
            <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs }} />
          )}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.sm },
  searchRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 46,
  },
  filterBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 46,
  },
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, minHeight: TOUCH_TARGET + 16 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
