/**
 * شاشة الردود التلقائية — قواعد البوت (نفس الويب /dashboard/autoreply):
 * GET /api/rules · POST /api/rules · PUT /api/rules/{id} · toggle · DELETE.
 * جدول الويب → بطاقات + sheet تحرير.
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
import type { Rule } from '@/types/api'

export default function AutoreplyScreen() {
  const { colors } = useTheme()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Rule | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [reply, setReply] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data, isLoading, isError, error: queryError, refetch, isRefetching } = useQuery<Rule[]>({
    queryKey: ['rules'],
    queryFn: () => apiGet<Rule[]>('/api/rules'),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['rules'] })

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { keyword: keyword.trim(), reply: reply.trim() }
      return editing ? apiPut(`/api/rules/${editing.id}`, payload) : apiPost('/api/rules', payload)
    },
    onSuccess: () => {
      setEditing(null)
      setShowNew(false)
      setKeyword('')
      setReply('')
      setError(null)
      invalidate()
    },
    onError: (e) => setError(describeError(e)),
  })

  const toggleMutation = useMutation({
    mutationFn: (r: Rule) => apiPost(`/api/rules/${r.id}/toggle`),
    onSuccess: invalidate,
    onError: (e) => setError(describeError(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiDelete(`/api/rules/${id}`),
    onSuccess: invalidate,
    onError: (e) => setError(describeError(e)),
  })

  function openEditor(rule?: Rule) {
    if (rule) {
      setEditing(rule)
      setKeyword(rule.keyword ?? '')
      setReply(rule.reply ?? '')
    } else {
      setEditing(null)
      setShowNew(true)
      setKeyword('')
      setReply('')
    }
    setError(null)
  }

  const sheetVisible = showNew || !!editing

  return (
    <StackScreen
      title="الردود التلقائية"
      subtitle={`${data?.length ?? 0} قاعدة`}
      action={<Button title="قاعدة جديدة" size="sm" onPress={() => openEditor()} />}
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
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="لا قواعد بعد" hint="أنشئ قاعدة: عندما يعلّق أحدهم بكلمة محددة يرد البوت تلقائيًا" />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => String(r.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => {
            const active = item.is_active ?? item.active ?? true
            return (
              <Card>
                <Row style={{ justifyContent: 'space-between' }}>
                  <Badge tone={active ? 'success' : 'muted'} text={active ? 'نشطة' : 'موقوفة'} />
                  {typeof item.priority === 'number' ? <Badge tone="muted" text={`أولوية ${item.priority}`} /> : null}
                </Row>
                <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                  <Row style={{ gap: spacing.sm }}>
                    <Badge tone="brand" text="إذا" />
                    <AppText variant="smallBold" style={{ flex: 1 }} numberOfLines={1}>
                      {item.keyword}
                    </AppText>
                  </Row>
                  <Row style={{ gap: spacing.sm }}>
                    <Badge tone="info" text="رد" />
                    <AppText variant="small" color="mutedFg" style={{ flex: 1 }} numberOfLines={2}>
                      {item.reply}
                    </AppText>
                  </Row>
                </View>
                <Row style={{ marginTop: spacing.md }}>
                  <Button title={active ? 'إيقاف' : 'تنشيط'} size="sm" variant="secondary" onPress={() => toggleMutation.mutate(item)} />
                  <Button title="تحرير" size="sm" variant="ghost" onPress={() => openEditor(item)} />
                  <Button title="حذف" size="sm" variant="ghost" onPress={() => deleteMutation.mutate(item.id)} />
                </Row>
              </Card>
            )
          }}
        />
      )}

      {/* Sheet تحرير/إنشاء */}
      <Modal visible={sheetVisible} transparent animationType="slide" onRequestClose={() => (setEditing(null), setShowNew(false))}>
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} accessibilityLabel="إغلاق" onPress={() => (setEditing(null), setShowNew(false))} />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <AppText variant="subtitle" style={{ marginTop: spacing.md }}>
              {editing ? 'تحرير القاعدة' : 'قاعدة رد جديدة'}
            </AppText>
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <AppInput label="الكلمة المفتاحية" value={keyword} onChangeText={setKeyword} placeholder="مثال: سعر، متوفر، توصيل" accessibilityLabel="الكلمة المفتاحية" />
              <AppInput label="نص الرد" value={reply} onChangeText={setReply} placeholder="رد البوت التلقائي…" multiline accessibilityLabel="نص الرد" />
              {error ? (
                <AppText variant="small" style={{ color: colors.destructive }}>
                  {error}
                </AppText>
              ) : null}
              <Row>
                <Button title="حفظ" onPress={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={!keyword.trim() || !reply.trim()} />
                <Button title="إلغاء" variant="ghost" onPress={() => (setEditing(null), setShowNew(false))} />
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
