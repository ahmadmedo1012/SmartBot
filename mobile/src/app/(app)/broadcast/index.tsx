/**
 * شاشة البث الجماعي (نفس الويب /dashboard/broadcast):
 * GET /api/broadcasts (مصفوفة مجردة) · POST /api/broadcasts (إنشاء) ·
 * POST .../send · .../cancel · /estimate.
 * عقد v25 (routers/broadcasts.py — M-10): الإنشاء JSON {name (مطلوب)،
 * message_template (مطلوب)} — القائمة ترجع {name, status,
 * total_recipients, sent_count, failed_count, created_at}.
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
import { apiGet, apiPost } from '@/services/api'
import { extractItems } from '@/lib/envelope'
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

const STATUS_LABEL: Record<string, string> = {
  sent: 'أُرسل',
  sending: 'جارٍ الإرسال',
  pending: 'بانتظار',
  draft: 'مسودة',
  failed: 'فشل',
  cancelled: 'ملغى',
}

export default function BroadcastScreen() {
  const { colors } = useTheme()
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [audience, setAudience] = useState<'all' | 'subscribed'>('all')
  const [actionError, setActionError] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<unknown, Error, Broadcast[]>({
    queryKey: ['broadcasts'],
    queryFn: () => apiGet('/api/broadcasts'),
    select: (res) => extractItems<Broadcast>(res),
  })
  const broadcasts = data ?? []

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['broadcasts'] })

  // M-10: العقد الفعلي — JSON {name, message_template} (كان يرسل {message}
  // بلا اسم → 422 «name مطلوب» دائمًا — تدفق ميت)
  const createMutation = useMutation({
    mutationFn: () =>
      apiPost<{ id: number }>('/api/broadcasts', {
        name: name.trim(),
        message_template: message.trim(),
        audience,
      }),
    onSuccess: () => {
      setShowNew(false)
      setName('')
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
      subtitle={`${broadcasts.length} حملة`}
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
      ) : broadcasts.length === 0 ? (
        <EmptyState message="لا حملات بث بعد" hint="أنشئ بثًا جماعيًا للوصول لكل مشتركيك دفعة واحدة" />
      ) : (
        <FlatList
          data={broadcasts}
          keyExtractor={(b) => String(b.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                  {item.name ?? 'بث'}
                </AppText>
                <Badge tone={STATUS_TONE[item.status ?? ''] ?? 'muted'} text={STATUS_LABEL[item.status ?? ''] ?? item.status ?? '—'} />
              </Row>
              <Row style={{ marginTop: spacing.md, gap: spacing.lg }}>
                {typeof item.total_recipients === 'number' ? (
                  <AppText variant="caption" color="mutedFg">
                    المستلمون: {item.total_recipients}
                  </AppText>
                ) : null}
                {typeof item.sent_count === 'number' && item.sent_count > 0 ? (
                  <AppText variant="caption" style={{ color: colors.success }}>
                    نجح: {item.sent_count}
                  </AppText>
                ) : null}
                {typeof item.failed_count === 'number' && item.failed_count > 0 ? (
                  <AppText variant="caption" style={{ color: colors.destructive }}>
                    فشل: {item.failed_count}
                  </AppText>
                ) : null}
              </Row>
              {item.created_at ? (
                <AppText variant="caption" color="mutedFg" style={{ marginTop: spacing.xs }}>
                  {timeAgo(item.created_at)}
                  {item.sent_at ? ` · أُرسل ${timeAgo(item.sent_at)}` : ''}
                </AppText>
              ) : null}
              {item.status === 'pending' || item.status === 'draft' ? (
                <Row style={{ marginTop: spacing.md }}>
                  <Button title="إرسال الآن" size="sm" onPress={() => sendMutation.mutate(item.id)} loading={sendMutation.isPending && sendMutation.variables === item.id} />
                  <Button title="إلغاء" size="sm" variant="ghost" onPress={() => cancelMutation.mutate(item.id)} loading={cancelMutation.isPending && cancelMutation.variables === item.id} />
                </Row>
              ) : null}
            </Card>
          )}
        />
      )}

      {/* Sheet بث جديد — M-21: KAV لئلا تغطي لوحة المفاتيح الحقول على iOS */}
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
              بث جماعي جديد
            </AppText>
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <AppInput
                label="اسم الحملة"
                value={name}
                onChangeText={setName}
                placeholder="مثال: عرض نهاية الأسبوع"
                accessibilityLabel="اسم حملة البث"
                hint="مطلوب من الخادم (حرفان على الأقل)"
              />
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
                <Button title="إنشاء البث" onPress={() => createMutation.mutate()} loading={createMutation.isPending} disabled={!name.trim() || name.trim().length < 2 || message.trim().length < 5} />
                <Button title="إلغاء" variant="ghost" onPress={() => setShowNew(false)} />
              </Row>
              <AppText variant="caption" color="mutedFg" style={{ textAlign: 'center' }}>
                الخطة المجانية لا تشمل البث الجماعي — يُتاح من Premium وما فوق
              </AppText>
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
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 8 },
})
