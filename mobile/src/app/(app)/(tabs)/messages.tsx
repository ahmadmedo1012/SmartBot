/**
 * تاب الرسائل — صندوق الوارد (نفس مصدر الويب):
 * GET /api/inbox/conversations — قائمة محادثات DB-first مع مزامنة حية.
 * قائمة FlatList مع بحث + فلتر غير المقروء، والدخول لمحادثة عبر stack.
 *
 * r154 (P6-2-e2 — قواعد غرفة الآلة): كل صف غير مقروء يحمل عقدة إشارية
 * (خط عمودي 2px على حافة البداية — مرآة نبض غير المقروء في الويب)،
 * والطابع الزمني: محدّث اليوم = ختم mono HH:MM (LTR مثبت — سجل الدارة)،
 * وقديم = العبارة العربية (timeAgo بجمعها الصحيح) كما هي.
 * NOTE: عقدة لايم «غير مقروء + رد آلي» غير قابلة للاشتقاق من عقد قائمة
 * المحادثات الحالي (لا علم آلي لكل محادثة فيه — الشارة تعيش في الخيط
 * حيث from.name="SmartBot")؛ إضافة العلم للـAPI = وكلاء لاحقون.
 */
import { useCallback, useMemo, useState } from 'react'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { FlatList, StyleSheet, TextInput, View } from 'react-native'
import { useTheme } from '@/hooks/use-theme'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { press, radius, spacing, TOUCH_TARGET } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, MonoStamp, Row } from '@/components/ui'
import { Icon } from '@/components/icon'
import { PressableScale } from '@/components/pressable-scale'
import { ListSkeleton } from '@/components/skeleton'
import { apiGet } from '@/services/api'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatTime, timeAgo } from '@/lib/format'

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
  // M-20: تأخير البحث 400ms قبل دخوله queryKey — كل ضغطة مفتاح كانت
  // تطلق طلب API جديدًا (مع refetchInterval 15s = إغراق).
  const debouncedSearch = useDebouncedValue(search, 400)

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<InboxResponse>({
    queryKey: ['inbox-conversations', debouncedSearch, unreadOnly],
    queryFn: () =>
      apiGet<InboxResponse>(
        `/api/inbox/conversations?per_page=50${debouncedSearch ? `&search=${encodeURIComponent(debouncedSearch)}` : ''}${unreadOnly ? '&status=unread' : ''}`,
      ),
    refetchInterval: 15_000, // إيقاع الويب نفسه (10-15s)
  })

  const items = useMemo(() => data?.items ?? [], [data])

  /* r154: سجل الختم — محادثة مُحدّثة اليوم = ختم mono HH:MM (LTR)؛
   * الأقدم تبقى عبارة timeAgo العربية (لا نحرف دلالة الجمع الصحيح). */
  const isToday = useCallback((t: string | null) => {
    if (!t) return false
    const d = new Date(t)
    if (Number.isNaN(d.getTime())) return false
    const now = new Date()
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    )
  }, [])

  const renderItem = useCallback(
    ({ item }: { item: InboxItem }) => (
      /* r131: سجل الضغط للصفوف = بطاقة 0.99 (كان opacity 0.7 فقط) */
      <PressableScale
        accessibilityLabel={`محادثة ${item.senders[0]?.name ?? ''} — ${item.subject}`}
        onPress={() => router.push({ pathname: '/(app)/messages/[id]', params: { id: item.id, name: item.senders[0]?.name ?? '' } })}
        style={styles.row}
        scaleTo={press.card}
      >
        {/* r154: عقدة غير المقروء — خط إشاري 2×20 على حافة البداية
            (النظير الجوالي لعلامة النبض في الويب؛ الصف يُبقي البطاقة) */}
        {item.unread_count > 0 ? (
          <View style={[styles.unreadNode, { backgroundColor: colors.primary }]} />
        ) : (
          <View style={styles.readSpacer} />
        )}
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
            {/* r154: ختم الدارة — HH:MM mono لليوم، وعبارة عربية للأقدم */}
            {isToday(item.updated_time) ? (
              <MonoStamp
                value={formatTime(item.updated_time)}
                size={11}
                weight={400}
                accessibilityLabel={timeAgo(item.updated_time)}
              />
            ) : (
              <AppText variant="caption" color="mutedFg">
                {timeAgo(item.updated_time)}
              </AppText>
            )}
          </Row>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText variant="small" color="mutedFg" numberOfLines={1} style={{ flex: 1 }}>
              {item.subject}
            </AppText>
            {item.unread_count > 0 ? <Badge tone="brand" text={`${item.unread_count} جديدة`} /> : null}
          </Row>
        </View>
      </PressableScale>
    ),
    [colors, isToday],
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
        <PressableScale
          accessibilityLabel="فلتر غير المقروء"
          accessibilityState={{ selected: unreadOnly }}
          onPress={() => setUnreadOnly((v) => !v)}
          style={[
            styles.filterBtn,
            { backgroundColor: unreadOnly ? colors.primary : colors.surface, borderColor: unreadOnly ? colors.primary : colors.border },
          ]}
          scaleTo={press.button}
        >
          <AppText variant="smallBold" style={{ color: unreadOnly ? colors.primaryFg : colors.mutedFg }}>
            غير المقروء
          </AppText>
        </PressableScale>
      </View>

      {isLoading ? (
        /* r131 (عقيدة الحالات): هيكل عظمي مطابق لشكل الصفوف — لا دوار مجرد */
        <ListSkeleton label="جارٍ تحميل المحادثات…" />
      ) : isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          message={debouncedSearch || unreadOnly ? 'لا نتائج مطابقة' : 'لا محادثات بعد'}
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
  row: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md, minHeight: TOUCH_TARGET + 16, alignItems: 'center' },
  /* r154: العقدة الإشارية لغير المقروء — 2×20 بحافة البداية (اللون من
      الثيم في التصيير)؛ المقروء يحتفظ بعمود 2px فارغًا حتى لا يقفز
      التخطيط عند وصول رسالة */
  unreadNode: { width: 2, height: 20, borderRadius: 999 },
  readSpacer: { width: 2, height: 20 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
