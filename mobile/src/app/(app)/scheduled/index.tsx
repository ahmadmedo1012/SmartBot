/**
 * شاشة المنشورات المجدولة (نفس الويب /dashboard/scheduled + /posts):
 * GET /api/scheduled-posts (مصفوفة مجردة) · POST /api/scheduled-posts ·
 * .../publish · DELETE.
 * عقد v25 (scheduled_posts_routes.py — M-13): الإنشاء Form-encoded بالمفتاح
 * message (لا content ولا JSON) — الحالة حقل status ('published').
 */
import { useState } from 'react'
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { AppInput } from '@/components/input'
import { apiDelete, apiGet, apiPost, apiPostForm } from '@/services/api'
import { extractItems } from '@/lib/envelope'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatDate } from '@/lib/format'
import type { ScheduledPost } from '@/types/api'

export default function ScheduledScreen() {
  const { colors } = useTheme()
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [message, setMessage] = useState('')
  const [when, setWhen] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading, isError, error: queryError, refetch, isRefetching } = useQuery<unknown, Error, ScheduledPost[]>({
    queryKey: ['scheduled-posts'],
    queryFn: () => apiGet('/api/scheduled-posts'),
    select: (res) => extractItems<ScheduledPost>(res),
  })
  const posts = data ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['scheduled-posts'] })

  // M-13: العقد الفعلي — Form-encoded {message, scheduled_at} (كان JSON
  // بمفتاح content → 422 «message مطلوب» دائمًا — تدفق ميت)
  const createMutation = useMutation({
    mutationFn: () =>
      apiPostForm('/api/scheduled-posts', {
        message: message.trim(),
        scheduled_at: when.trim(),
      }),
    onSuccess: () => {
      setShowNew(false)
      setMessage('')
      setWhen('')
      setError(null)
      invalidate()
    },
    onError: (e) => setError(describeError(e)),
  })

  const publishMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/api/scheduled-posts/${id}/publish`),
    onSuccess: invalidate,
    onError: (e) => setError(describeError(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/scheduled-posts/${id}`),
    onSuccess: invalidate,
    onError: (e) => setError(describeError(e)),
  })

  return (
    <StackScreen
      title="المنشورات والمجدول"
      subtitle={`${posts.length} منشورًا`}
      action={<Button title="جدولة منشور" size="sm" onPress={() => setShowNew(true)} />}
      isLoading={isLoading}
    >
      {error ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <Card style={{ backgroundColor: colors.destructiveSoft }}>
            <AppText variant="small" style={{ color: colors.destructive }}>
              {error}
            </AppText>
          </Card>
        </View>
      ) : null}

      {isError ? (
        <ErrorState message={describeError(queryError)} onRetry={() => refetch()} />
      ) : posts.length === 0 ? (
        <EmptyState message="لا منشورات مجدولة" hint="جدول منشورات صفحتك مسبقًا وستُنشر تلقائيًا" />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => String(p.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Badge tone={item.status === 'published' ? 'success' : item.status === 'failed' ? 'destructive' : 'warning'} text={item.status === 'published' ? 'نُشر' : item.status === 'failed' ? 'فشل' : 'مجدول'} />
                {item.scheduled_at ? (
                  <AppText variant="caption" color="mutedFg">
                    {formatDate(item.scheduled_at)}
                  </AppText>
                ) : null}
              </Row>
              <AppText variant="body" style={{ marginTop: spacing.md }} numberOfLines={4}>
                {item.message ?? ''}
              </AppText>
              {item.status !== 'published' ? (
                <Row style={{ marginTop: spacing.md }}>
                  <Button title="نشر الآن" size="sm" onPress={() => publishMutation.mutate(item.id)} loading={publishMutation.isPending && publishMutation.variables === item.id} />
                  <Button title="حذف" size="sm" variant="ghost" onPress={() => deleteMutation.mutate(item.id)} loading={deleteMutation.isPending && deleteMutation.variables === item.id} />
                </Row>
              ) : null}
            </Card>
          )}
        />
      )}

      {/* Sheet جدولة منشور — M-21: KAV لئلا تغطي لوحة المفاتيح الحقول على iOS */}
      <Modal visible={showNew} transparent animationType="slide" onRequestClose={() => setShowNew(false)}>
        <KeyboardAvoidingView
          style={styles.backdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <Pressable style={{ flex: 1 }} accessibilityLabel="إغلاق" onPress={() => setShowNew(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <AppText variant="subtitle" style={{ marginTop: spacing.md }}>
              جدولة منشور جديد
            </AppText>
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <AppInput label="نص المنشور" value={message} onChangeText={setMessage} placeholder="ماذا ستنشر صفحتك؟" multiline accessibilityLabel="نص المنشور" />
              <AppInput label="موعد النشر" value={when} onChangeText={setWhen} placeholder="2026-09-20T18:00" accessibilityLabel="موعد النشر" hint="صيغة ISO: 2026-09-20T18:00 — يجب أن يكون مستقبليًا" />
              {error ? (
                <AppText variant="small" style={{ color: colors.destructive }}>
                  {error}
                </AppText>
              ) : null}
              <Row>
                <Button title="جدولة" onPress={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!message.trim() || !when.trim()} />
                <Button title="إلغاء" variant="ghost" onPress={() => setShowNew(false)} />
              </Row>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </StackScreen>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 999, marginTop: spacing.sm },
})
