/**
 * شاشة تقويم المحتوى (نفس الويب /dashboard/calendar):
 * GET /api/calendar · POST /api/calendar · PUT /api/calendar/{id} · DELETE.
 */
import { useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { AppInput } from '@/components/input'
import { apiDelete, apiGet, apiPost, apiPut } from '@/services/api'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatDateOnly } from '@/lib/format'
import type { CalendarEntry } from '@/types/api'

export default function CalendarScreen() {
  const { colors } = useTheme()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<CalendarEntry | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [content, setContent] = useState('')
  const [when, setWhen] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading, isError, error: qError, refetch, isRefetching } = useQuery<CalendarEntry[]>({
    queryKey: ['calendar'],
    queryFn: () => apiGet<CalendarEntry[]>('/api/calendar'),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['calendar'] })

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { content: content.trim(), scheduled_at: when.trim() }
      return editing ? apiPut(`/api/calendar/${editing.id}`, payload) : apiPost('/api/calendar', payload)
    },
    onSuccess: () => {
      setEditing(null)
      setShowNew(false)
      setContent('')
      setWhen('')
      setError(null)
      invalidate()
    },
    onError: (e) => setError(describeError(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/calendar/${id}`),
    onSuccess: invalidate,
    onError: (e) => setError(describeError(e)),
  })

  const sorted = [...(data ?? [])].sort(
    (a, b) => new Date(a.scheduled_at ?? a.date ?? 0).getTime() - new Date(b.scheduled_at ?? b.date ?? 0).getTime(),
  )

  return (
    <StackScreen
      title="تقويم المحتوى"
      subtitle={`${sorted.length} عنصرًا`}
      action={
        <Button
          title="إضافة"
          size="sm"
          onPress={() => {
            setShowNew(true)
            setEditing(null)
            setContent('')
            setWhen('')
          }}
        />
      }
      isLoading={isLoading}
    >
      {isError ? (
        <ErrorState message={describeError(qError)} onRetry={() => refetch()} />
      ) : sorted.length === 0 ? (
        <EmptyState message="التقويم فارغ" hint="خطط محتوى صفحتك مسبقًا — أضف أول عنصر" />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(c) => String(c.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Badge tone={item.status === 'published' ? 'success' : 'warning'} text={item.status === 'published' ? 'نُشر' : 'مخطط'} />
                <AppText variant="caption" color="mutedFg">
                  {formatDateOnly(item.scheduled_at ?? item.date)}
                </AppText>
              </Row>
              <AppText variant="body" style={{ marginTop: spacing.md }} numberOfLines={3}>
                {item.content ?? item.message ?? ''}
              </AppText>
              <Row style={{ marginTop: spacing.md }}>
                <Button
                  title="تحرير"
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    setEditing(item)
                    setShowNew(true)
                    setContent(item.content ?? item.message ?? '')
                    setWhen((item.scheduled_at ?? item.date ?? '').slice(0, 16))
                  }}
                />
                <Button title="حذف" size="sm" variant="ghost" onPress={() => deleteMutation.mutate(item.id)} />
              </Row>
            </Card>
          )}
        />
      )}

      <Modal visible={showNew} transparent animationType="slide" onRequestClose={() => setShowNew(false)}>
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} accessibilityLabel="إغلاق" onPress={() => setShowNew(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <AppText variant="subtitle" style={{ marginTop: spacing.md }}>
              {editing ? 'تحرير عنصر التقويم' : 'عنصر تقويم جديد'}
            </AppText>
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <AppInput label="المحتوى" value={content} onChangeText={setContent} placeholder="فكرة المنشور…" multiline accessibilityLabel="محتوى التقويم" />
              <AppInput label="التاريخ والوقت" value={when} onChangeText={setWhen} placeholder="2026-09-20 18:00" accessibilityLabel="موعد عنصر التقويم" />
              {error ? (
                <AppText variant="small" style={{ color: colors.destructive }}>
                  {error}
                </AppText>
              ) : null}
              <Row>
                <Button title="حفظ" onPress={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!content.trim() || !when.trim()} />
                <Button title="إلغاء" variant="ghost" onPress={() => setShowNew(false)} />
              </Row>
            </View>
          </View>
        </View>
      </Modal>
    </StackScreen>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 999, marginTop: spacing.sm },
})
