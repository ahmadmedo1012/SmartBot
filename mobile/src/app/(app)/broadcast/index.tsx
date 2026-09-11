/**
 * شاشة البث الجماعي (نفس الويب /dashboard/broadcast):
 * GET /api/broadcasts · POST /api/broadcasts (إنشاء) · POST .../send · .../cancel · /estimate.
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
import type { Broadcast } from '@/types/api'

const STATUS_TONE: Record<string, 'success' | 'warning' | 'muted' | 'destructive' | 'info'> = {
  sent: 'success',
  sending: 'info',
  pending: 'warning',
  draft: 'muted',
  failed: 'destructive',
  cancelled: 'muted',
}

export default function BroadcastScreen() {
  const { colors } = useTheme()
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<'all' | 'subscribed'>('all')
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<Broadcast[]>({
    queryKey: ['broadcasts'],
    queryFn: () => apiGet<Broadcast[]>('/api/broadcasts'),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['broadcasts'] })

  const createMutation = useMutation({
    mutationFn: () => apiPost<{ id: number }>('/api/broadcasts', { message: message.trim(), audience }),
    onSuccess: () => {
      setShowNew(false)
      setMessage('')
      setActionError(null)
      invalidate()
    },
    onError: (e) => setActionError(describeError(e)),
  })

  const sendMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/api/broadcasts/${id}/send`),
    onSuccess: () => {
      setActionError(null)
      invalidate()
    },
    onError: (e) => setActionError(describeError(e)),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiPost(`/api/broadcasts/${id}/cancel`),
    onSuccess: () => {
      setActionError(null)
      invalidate()
    },
    onError: (e) => setActionError(describeError(e)),
  })

  return (
    <StackScreen
      title="البث الجماعي"
      subtitle={`${data?.length ?? 0} حملة`}
      action={<Button title="بث جديد" size="sm" onPress={() => setShowNew(true)} />}
      isLoading={isLoading}
    >
      {actionError ? (
        <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
          <Card style={{ backgroundColor: colors.destructiveSoft }}>
            <AppText variant="small" style={{ color: colors.destructive }}>
              {actionError}
            </AppText>
          </Card>
        </View>
      ) : null}

      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="لا حملات بث بعد" hint="أنشئ بثًا جماعيًا للوصول لكل مشتركيك دفعة واحدة" />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(b) => String(b.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Badge tone={STATUS_TONE[item.status ?? ''] ?? 'muted'} text={item.status ?? '—'} />
                <AppText variant="caption" color="mutedFg">
                  {timeAgo(item.created_at)}
                </AppText>
              </Row>
              <AppText variant="body" style={{ marginTop: spacing.md }} numberOfLines={3}>
                {item.message ?? item.content ?? ''}
              </AppText>
              <Row style={{ marginTop: spacing.md, gap: spacing.lg }}>
                {typeof item.recipients === 'number' ? (
                  <AppText variant="caption" color="mutedFg">
                    المستلمون: {item.recipients}
                  </AppText>
                ) : null}
                {typeof item.sent === 'number' && item.sent > 0 ? (
                  <AppText variant="caption" style={{ color: colors.success }}>
                    نجح: {item.sent}
                  </AppText>
                ) : null}
                {typeof item.failed === 'number' && item.failed > 0 ? (
                  <AppText variant="caption" style={{ color: colors.destructive }}>
                    فشل: {item.failed}
                  </AppText>
                ) : null}
              </Row>
              {item.status === 'pending' || item.status === 'draft' ? (
                <Row style={{ marginTop: spacing.md }}>
                  <Button title="إرسال الآن" size="sm" onPress={() => sendMutation.mutate(item.id)} loading={sendMutation.isPending} />
                  <Button title="إلغاء" size="sm" variant="ghost" onPress={() => cancelMutation.mutate(item.id)} />
                </Row>
              ) : null}
            </Card>
          )}
        />
      )}

      {/* Sheet بث جديد */}
      <Modal visible={showNew} transparent animationType="slide" onRequestClose={() => setShowNew(false)}>
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} accessibilityLabel="إغلاق" onPress={() => setShowNew(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <AppText variant="subtitle" style={{ marginTop: spacing.md }}>
              بث جماعي جديد
            </AppText>
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <AppInput
                label="نص الرسالة"
                value={message}
                onChangeText={setMessage}
                placeholder="رسالتك لكل المشتركين…"
                multiline
                accessibilityLabel="نص رسالة البث"
              />
              <Row style={{ gap: spacing.sm }}>
                {(['all', 'subscribed'] as const).map((a) => (
                  <Pressable
                    key={a}
                    accessibilityRole="button"
                    onPress={() => setAudience(a)}
                    style={[
                      styles.chip,
                      { borderColor: audience === a ? colors.primary : colors.border, backgroundColor: audience === a ? `${colors.primary}24` : 'transparent' },
                    ]}
                  >
                    <AppText variant="smallBold" style={{ color: audience === a ? colors.accentFg : colors.mutedFg }}>
                      {a === 'all' ? 'كل المحادثات' : 'المشتركون فقط'}
                    </AppText>
                  </Pressable>
                ))}
              </Row>
              {actionError ? (
                <AppText variant="small" style={{ color: colors.destructive }}>
                  {actionError}
                </AppText>
              ) : null}
              <Row>
                <Button title="إنشاء البث" onPress={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!message.trim()} />
                <Button title="إلغاء" variant="ghost" onPress={() => setShowNew(false)} />
              </Row>
              <AppText variant="caption" color="mutedFg" style={{ textAlign: 'center' }}>
                الخطة المجانية لا تشمل البث الجماعي — يُتاح من Premium وما فوق
              </AppText>
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
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 8 },
})
