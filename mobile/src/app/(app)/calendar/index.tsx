/**
 * شاشة تقويم المحتوى (نفس الويب /dashboard/calendar):
 * GET /api/calendar · POST /api/calendar · PUT /api/calendar/{id} · DELETE.
 * عقد v25 (calendar_routes.py — M-14): الكتابة JSON بمفاتيح message و
 * scheduled_at (لا content ولا title) — العناصر تُرجع message/status.
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
import { apiDelete, apiGet, apiPost, apiPut } from '@/services/api'
import { extractItems } from '@/lib/envelope'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatDateOnly } from '@/lib/format'
import type { CalendarEntry } from '@/types/api'

export default function CalendarScreen() {
  const { colors } = useTheme()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<CalendarEntry | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [message, setMessage] = useState('')
  const [when, setWhen] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading, isError, error: qError, refetch, isRefetching } = useQuery<unknown, Error, CalendarEntry[]>({
    queryKey: ['calendar'],
    queryFn: () => apiGet('/api/calendar'),
    select: (res) => extractItems<CalendarEntry>(res),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['calendar'] })

  // M-14: العقد الفعلي — JSON {message, scheduled_at} (كان بمفاتيح
  // content → 422 «message مطلوب» دائمًا — تدفق ميت)
  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { message: message.trim(), scheduled_at: when.trim() }
      return editing ? apiPut(`/api/calendar/${editing.id}`, payload) : apiPost('/api/calendar', payload)
    },
    onSuccess: () => {
      setEditing(null)
      setShowNew(false)
      setMessage('')
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
    (a, b) => new Date(a.scheduled_at ?? 0).getTime() - new Date(b.scheduled_at ?? 0).getTime(),
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
            setMessage('')
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
                  {formatDateOnly(item.scheduled_at)}
                </AppText>
              </Row>
              <AppText variant="body" style={{ marginTop: spacing.md }} numberOfLines={3}>
                {item.message ?? ''}
              </AppText>
              <Row style={{ marginTop: spacing.md }}>
                <Button
                  title="تحرير"
                  size="sm"
                  variant="ghost"
                  onPress={() => {
                    setEditing(item)
                    setShowNew(true)
                    setMessage(item.message ?? '')
                    setWhen((item.scheduled_at ?? '').slice(0, 16))
                  }}
                />
                <Button title="حذف" size="sm" variant="ghost" onPress={() => deleteMutation.mutate(item.id)} loading={deleteMutation.isPending && deleteMutation.variables === item.id} />
              </Row>
            </Card>
          )}
        />
      )}

      {/* Sheet عنصر التقويم — M-21: KAV لئلا تغطي لوحة المفاتيح الحقول على iOS */}
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
              {editing ? 'تحرير عنصر التقويم' : 'عنصر تقويم جديد'}
            </AppText>
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <AppInput label="المحتوى" value={message} onChangeText={setMessage} placeholder="فكرة المنشور…" multiline accessibilityLabel="محتوى التقويم" />
              <AppInput label="التاريخ والوقت" value={when} onChangeText={setWhen} placeholder="2026-09-20T18:00" accessibilityLabel="موعد عنصر التقويم" hint="صيغة ISO: 2026-09-20T18:00" />
              {error ? (
                <AppText variant="small" style={{ color: colors.destructive }}>
                  {error}
                </AppText>
              ) : null}
              <Row>
                <Button title="حفظ" onPress={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!message.trim() || !when.trim()} />
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
