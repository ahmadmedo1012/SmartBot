/**
 * شاشة المحادثة — نفس بيانات الويب:
 * GET /api/inbox/conversations/{id} (thread) · POST .../reply (Form) · POST .../read.
 * فقاعات رسائل RTL + إدخال رد لاصق أسفل مع KeyboardAvoidingView.
 */
import { useCallback, useEffect, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing, TOUCH_TARGET } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Button, Row } from '@/components/ui'
import { Icon } from '@/components/icon'
import { apiGet, apiPost, apiPostForm } from '@/services/api'
import { LoadingState, ErrorState, describeError } from '@/components/state-views'
import { formatTime } from '@/lib/format'

interface ThreadMessage {
  id: string
  message: string
  from: { id: string; name: string }
  is_from_page: boolean
  created_time: string | null
}

export default function ConversationScreen() {
  const { colors, fontBody } = useTheme()
  const insets = useSafeAreaInsets()
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState<string | null>(null)

  const { data: thread, isLoading, isError, error, refetch } = useQuery<ThreadMessage[]>({
    queryKey: ['conversation', id],
    queryFn: () => apiGet<ThreadMessage[]>(`/api/inbox/conversations/${id}`),
    refetchInterval: 15_000,
  })

  // فتح المحادثة = مقروءة (نفس عقد الويب v17-E-B1)
  useEffect(() => {
    if (id) {
      apiPost(`/api/inbox/conversations/${id}/read`).catch(() => undefined)
    }
  }, [id])

  const replyMutation = useMutation({
    mutationFn: (message: string) => apiPostForm(`/api/inbox/conversations/${id}/reply`, { message }),
    onSuccess: () => {
      setDraft('')
      setSendError(null)
      queryClient.invalidateQueries({ queryKey: ['conversation', id] })
      queryClient.invalidateQueries({ queryKey: ['inbox-conversations'] })
    },
    onError: (e) => setSendError(describeError(e)),
  })

  const renderItem = useCallback(
    ({ item }: { item: ThreadMessage }) => {
      const fromPage = item.is_from_page
      return (
        <View style={[styles.bubbleRow, { justifyContent: fromPage ? 'flex-start' : 'flex-end' }]}>
          {!fromPage ? (
            <View style={[styles.bubble, { backgroundColor: colors.muted, borderTopRightRadius: radius.sm }]}>
              <AppText variant="small" style={{ color: colors.foreground }}>
                {item.message}
              </AppText>
              <AppText variant="caption" color="mutedFg" style={{ alignSelf: 'flex-start', marginTop: 2 }}>
                {formatTime(item.created_time)}
              </AppText>
            </View>
          ) : (
            <View style={[styles.bubble, { backgroundColor: colors.primary, borderTopLeftRadius: radius.sm }]}>
              <AppText variant="small" style={{ color: colors.primaryFg }}>
                {item.message}
              </AppText>
              <AppText variant="caption" style={{ color: colors.primaryFg, opacity: 0.7, alignSelf: 'flex-start', marginTop: 2 }}>
                {formatTime(item.created_time)} · الصفحة
              </AppText>
            </View>
          )}
        </View>
      )
    },
    [colors],
  )

  if (isLoading) return <LoadingState label="جارٍ تحميل المحادثة…" />

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* الترويسة */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.backBtn}>
          <Icon name="chevron-right" size={24} color={colors.foreground} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <AppText variant="subtitle" numberOfLines={1}>
            {name || 'محادثة'}
          </AppText>
          <AppText variant="caption" color="mutedFg">
            ماسنجر فيسبوك
          </AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="تحديث" onPress={() => refetch()} style={styles.backBtn}>
          <Icon name="refresh" size={20} color={colors.mutedFg} />
        </Pressable>
      </View>

      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : (thread ?? []).length === 0 ? (
        <ErrorState message="لا توجد رسائل في هذه المحادثة" onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={thread}
          keyExtractor={(m) => String(m.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, gap: spacing.sm }}
          inverted={false}
        />
      )}

      {/* صندوق الرد */}
      <View style={[styles.composer, { paddingBottom: insets.bottom + spacing.sm }]}>
        {sendError ? (
          <AppText variant="caption" style={{ color: colors.destructive, padding: spacing.xs }}>
            {sendError}
          </AppText>
        ) : null}
        <Row style={{ gap: spacing.sm }}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="اكتب ردك…"
            placeholderTextColor={colors.placeholder}
            textAlign="right"
            multiline
            accessibilityLabel="نص الرد"
            style={[
              styles.input,
              {
                color: colors.foreground,
                borderColor: colors.border,
                backgroundColor: colors.surface,
                fontFamily: fontBody,
              },
            ]}
          />
          <Button
            title="إرسال"
            onPress={() => draft.trim() && replyMutation.mutate(draft.trim())}
            loading={replyMutation.isPending}
            disabled={!draft.trim()}
            size="sm"
          />
        </Row>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: TOUCH_TARGET, height: TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '80%', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  composer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: 8,
    minHeight: 48,
    maxHeight: 120,
    fontSize: 16,
    textAlignVertical: 'top',
  },
})
