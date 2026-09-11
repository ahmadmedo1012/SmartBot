/**
 * تاب التعليقات — نفس مصدر الويب (/dashboard/comments):
 * GET /api/comments?limit=50 · POST /api/replies/{id}/reply (Form) · POST /api/comments/{id}/hide.
 * عقد v25 (routers/replies.py): الرد مغلّف {items, source, synced} — ليس مصفوفة (M-01).
 * رد سريع من bottom sheet + إخفاء تعليق + فلتر الحالة (تصفية محلية).
 */
import { useState } from 'react'
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, Row } from '@/components/ui'
import { Icon } from '@/components/icon'
import { apiGet, apiPost, apiPostForm } from '@/services/api'
import { extractItems } from '@/lib/envelope'
import { describeError, EmptyState, ErrorState, LoadingState } from '@/components/state-views'
import { timeAgo } from '@/lib/format'
import type { CommentItem } from '@/types/api'

/** عقد GET /api/comments بعد فك envelope {success,data} (M-01). */
interface CommentsResponse {
  items: CommentItem[]
  source?: string
  synced?: boolean
}

/** حالة الرد على تعليق (M-19): الرد موجود إذا وُجد نص رد أو طابع زمني له. */
function isReplied(item: CommentItem): boolean {
  return !!(item.reply_text ?? item.replied_at)
}

export default function CommentsScreen() {
  const { colors, fontBody } = useTheme()
  const insets = useSafeAreaInsets()
  const queryClient = useQueryClient()
  const [replyTo, setReplyTo] = useState<CommentItem | null>(null)
  const [draft, setDraft] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'pending'>('all')

  // M-20: الفلتر محلي بالكامل — لا يشارك queryKey (كان يستنسخ استعلامات
  // متطابقة لكل تبديل تبويب). الاستعلام واحد والت صفية على العميل.
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<CommentsResponse, Error, CommentItem[]>({
    queryKey: ['comments'],
    queryFn: () => apiGet<CommentsResponse>('/api/comments?limit=50'),
    select: (res) => extractItems<CommentItem>(res),
    refetchInterval: 30_000,
  })

  const comments = (data ?? []).filter((c) => (filter === 'pending' ? !isReplied(c) : true))

  const replyMutation = useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) =>
      apiPostForm(`/api/replies/${id}/reply`, { message }),
    onSuccess: () => {
      setReplyTo(null)
      setDraft('')
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['comments'] })
    },
    onError: (e) => setActionError(describeError(e)),
  })

  const hideMutation = useMutation({
    mutationFn: (id: string) => apiPost(`/api/comments/${id}/hide`),
    onSuccess: () => {
      setActionError(null)
      queryClient.invalidateQueries({ queryKey: ['comments'] })
    },
    onError: (e) => setActionError(describeError(e)),
  })

  const sentimentTone = (s: string | null) =>
    s === 'positive' ? 'success' : s === 'negative' ? 'destructive' : 'muted'

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <AppText variant="title">التعليقات</AppText>
        <Row style={{ gap: spacing.sm }}>
          {(['all', 'pending'] as const).map((f) => (
            <Pressable
              key={f}
              accessibilityRole="button"
              onPress={() => setFilter(f)}
              style={[
                styles.filterChip,
                { backgroundColor: filter === f ? colors.primary : colors.surface, borderColor: filter === f ? colors.primary : colors.border },
              ]}
            >
              <AppText variant="smallBold" style={{ color: filter === f ? colors.primaryFg : colors.mutedFg }}>
                {f === 'all' ? 'الكل' : 'بانتظار الرد'}
              </AppText>
            </Pressable>
          ))}
        </Row>
      </View>

      {actionError ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <Card style={{ backgroundColor: colors.destructiveSoft, padding: spacing.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="small" style={{ color: colors.destructive, flex: 1 }}>
                {actionError}
              </AppText>
              <Pressable accessibilityRole="button" accessibilityLabel="إغلاق الخطأ" onPress={() => setActionError(null)}>
                <Icon name="x" size={18} color={colors.destructive} />
              </Pressable>
            </Row>
          </Card>
        </View>
      ) : null}

      {isLoading ? (
        <LoadingState label="جارٍ تحميل التعليقات…" />
      ) : isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : comments.length === 0 ? (
        <EmptyState
          message={filter === 'pending' ? 'لا تعليقات بانتظار الرد 🎉' : 'لا تعليقات بعد'}
          hint="تعليقات صفحتك تظهر هنا لحظة وصولها"
        />
      ) : (
        <FlatList
          data={comments}
          keyExtractor={(c) => String(c.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }}
          renderItem={({ item }) => {
            const name = item.from_name ?? 'مستخدم'
            const text = item.message ?? ''
            const replied = isReplied(item)
            // M-31: حالة الإخفاء لكل صف — لا spinner مشترك على كل الأزرار
            const hidingThis = hideMutation.isPending && hideMutation.variables === item.id
            return (
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Row style={{ gap: spacing.sm, flex: 1 }}>
                    <View style={[styles.avatar, { backgroundColor: colors.muted }]}>
                      <AppText variant="smallBold" style={{ color: colors.accentFg }}>
                        {(name ?? '؟').charAt(0)}
                      </AppText>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Row style={{ gap: spacing.sm }}>
                        <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                          {name}
                        </AppText>
                        {/* الميول وال إخفاء يُعرضان فقط إذا وُجدا في العقد */}
                        {item.sentiment ? <Badge tone={sentimentTone(item.sentiment)} text={item.sentiment === 'positive' ? 'إيجابي' : item.sentiment === 'negative' ? 'سلبي' : 'محايد'} /> : null}
                      </Row>
                      <AppText variant="caption" color="mutedFg">
                        {timeAgo(item.created_time)}
                      </AppText>
                    </View>
                  </Row>
                  {item.hidden ? <Badge tone="muted" text="مخفي" /> : replied ? <Badge tone="success" text="تم الرد" /> : <Badge tone="warning" text="بانتظار" />}
                </Row>
                <AppText variant="body" style={{ marginTop: spacing.md }}>
                  {text}
                </AppText>
                {replied && item.reply_text ? (
                  <View style={[styles.replyPreview, { backgroundColor: colors.muted }]}>
                    <AppText variant="small" numberOfLines={2} style={{ color: colors.accentFg }}>
                      ↩ {item.reply_text}
                    </AppText>
                  </View>
                ) : null}
                {!item.hidden ? (
                  <Row style={{ marginTop: spacing.md, gap: spacing.md }}>
                    {!replied ? (
                      <Button title="رد" size="sm" onPress={() => setReplyTo(item)} />
                    ) : null}
                    <Button title="إخفاء" size="sm" variant="ghost" onPress={() => hideMutation.mutate(item.id)} loading={hidingThis} />
                  </Row>
                ) : null}
              </Card>
            )
          }}
        />
      )}

      {/* Bottom sheet للرد السريع (بديل الـ modal المكتب) — M-21: KAV لئلا يغطي
          لوحة المفاتيح حقل الإدخال على iOS */}
      <Modal visible={!!replyTo} transparent animationType="slide" onRequestClose={() => setReplyTo(null)}>
        <KeyboardAvoidingView
          style={styles.sheetBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <Pressable style={{ flex: 1 }} accessibilityLabel="إغلاق" onPress={() => setReplyTo(null)} />
          <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + spacing.md }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <AppText variant="subtitle" style={{ marginTop: spacing.md }}>
              الرد على {replyTo?.from_name ?? 'التعليق'}
            </AppText>
            {replyTo?.message ? (
              <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.xs }} numberOfLines={2}>
                «{replyTo.message}»
              </AppText>
            ) : null}
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="اكتب ردك العام (يظهر كتعليق)…"
              placeholderTextColor={colors.placeholder}
              textAlign="right"
              multiline
              autoFocus
              accessibilityLabel="نص الرد على التعليق"
              style={[
                styles.replyInput,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.surface, fontFamily: fontBody },
              ]}
            />
            <Row style={{ marginTop: spacing.md }}>
              <Button title="إرسال الرد" onPress={() => replyTo && draft.trim() && replyMutation.mutate({ id: replyTo.id, message: draft.trim() })} loading={replyMutation.isPending} disabled={!draft.trim()} />
              <Button title="إلغاء" variant="ghost" onPress={() => setReplyTo(null)} />
            </Row>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.sm },
  filterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6 },
  avatar: { width: 40, height: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  replyPreview: { borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  sheetHandle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 999, marginTop: spacing.sm },
  replyInput: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: 12,
    paddingBottom: 8,
    minHeight: 100,
    maxHeight: 160,
    marginTop: spacing.lg,
    fontSize: 16,
    textAlignVertical: 'top',
  },
})
