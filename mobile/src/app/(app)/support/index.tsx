/**
 * شاشة الدعم (نفس الويب /dashboard/support):
 * GET /api/support/info · /api/support/tickets · POST /api/support/ticket.
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
import { apiGet, apiPost } from '@/services/api'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { timeAgo } from '@/lib/format'
import type { PublicConfig, SupportTicket } from '@/types/api'

export default function SupportScreen() {
  const { colors } = useTheme()
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: info } = useQuery<PublicConfig>({
    queryKey: ['support-info'],
    queryFn: () => apiGet<PublicConfig>('/api/support/info'),
  })

  const { data: tickets, isLoading, isError, error: qError, refetch, isRefetching } = useQuery<SupportTicket[]>({
    queryKey: ['support-tickets'],
    queryFn: () => apiGet<SupportTicket[]>('/api/support/tickets'),
  })

  const createMutation = useMutation({
    mutationFn: () => apiPost('/api/support/ticket', { subject: subject.trim(), message: message.trim() }),
    onSuccess: () => {
      setShowNew(false)
      setSubject('')
      setMessage('')
      setError(null)
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] })
    },
    onError: (e) => setError(describeError(e)),
  })

  return (
    <StackScreen
      title="الدعم الفني"
      action={<Button title="تذكرة جديدة" size="sm" onPress={() => setShowNew(true)} />}
      isLoading={isLoading}
    >
      {/* قنوات التواصل */}
      <View style={{ padding: spacing.lg, paddingBottom: 0 }}>
        <Card>
          <AppText variant="subtitle">قنوات التواصل</AppText>
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            {info?.support_phone ? <AppText variant="small" color="mutedFg">📞 {info.support_phone}</AppText> : null}
            {info?.support_whatsapp ? <AppText variant="small" color="mutedFg">💬 واتساب: {info.support_whatsapp}</AppText> : null}
          </View>
        </Card>
      </View>

      {isError ? (
        <ErrorState message={describeError(qError)} onRetry={() => refetch()} />
      ) : (tickets ?? []).length === 0 ? (
        <EmptyState message="لا تذاكر دعم" hint="واجهت مشكلة؟ افتح تذكرة وسيرد فريقنا" />
      ) : (
        <FlatList
          data={tickets ?? []}
          keyExtractor={(t) => String(t.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                  {item.subject ?? 'تذكرة'}
                </AppText>
                <Badge
                  tone={item.status === 'closed' ? 'muted' : item.status === 'answered' ? 'success' : 'warning'}
                  text={item.status === 'closed' ? 'مغلقة' : item.status === 'answered' ? 'رد الدعم' : 'مفتوحة'}
                />
              </Row>
              {item.message ? (
                <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.sm }} numberOfLines={3}>
                  {item.message}
                </AppText>
              ) : null}
              {item.created_at ? (
                <AppText variant="caption" color="mutedFg" style={{ marginTop: spacing.xs }}>
                  {timeAgo(item.created_at)}
                </AppText>
              ) : null}
              {(item.replies ?? []).length > 0 ? (
                <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                  {(item.replies ?? []).slice(-2).map((r) => (
                    <View key={r.id} style={[styles.replyBox, { backgroundColor: colors.muted }]}>
                      <AppText variant="small" style={{ color: colors.foreground }}>
                        {r.message}
                      </AppText>
                    </View>
                  ))}
                </View>
              ) : null}
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
              تذكرة دعم جديدة
            </AppText>
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <AppInput label="الموضوع" value={subject} onChangeText={setSubject} placeholder="موضوع مشكلتك" accessibilityLabel="موضوع التذكرة" />
              <AppInput label="التفاصيل" value={message} onChangeText={setMessage} placeholder="اشرح المشكلة بالتفصيل…" multiline accessibilityLabel="تفاصيل التذكرة" />
              {error ? (
                <AppText variant="small" style={{ color: colors.destructive }}>
                  {error}
                </AppText>
              ) : null}
              <Row>
                <Button title="إرسال" onPress={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!subject.trim() || !message.trim()} />
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
  replyBox: { borderRadius: radius.md, padding: spacing.md },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 999, marginTop: spacing.sm },
})
