/**
 * شاشة العملاء المتوقعين — CRM (نفس الويب /dashboard/leads):
 * GET /api/crm/customers — عقد v25 (routers/crm_routes.py): مغلّف
 * {total,page,per_page,items} (M-04) — ليس مصفوفة.
 * POST /api/crm/customers — Form-encoded: fb_user_id (مطلوب) + name + phone
 * (الإنشاء القديم أرسل JSON بلا fb_user_id → 422 دائمًا — تدفق ميت M-04).
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
import { apiGet, apiPostForm } from '@/services/api'
import { extractItems } from '@/lib/envelope'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatDate, formatNumber } from '@/lib/format'
import type { Customer } from '@/types/api'

export default function LeadsScreen() {
  const { colors } = useTheme()
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [fbUserId, setFbUserId] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<
    { total?: number; page?: number; per_page?: number; items: Customer[] },
    Error,
    Customer[]
  >({
    queryKey: ['crm-customers'],
    queryFn: () => apiGet('/api/crm/customers?per_page=100'),
    select: (res) => extractItems<Customer>(res),
  })
  const customers = data ?? []

  const addMutation = useMutation({
    mutationFn: () => {
      // العقد (crm_routes.py): Form-encoded + fb_user_id مطلوب — نولّده من
      // الاسم + الطابع الزمني إذا تركه المستخدم فارغًا
      const effectiveFbId =
        fbUserId.trim() || `lead-${name.trim().replace(/\s+/g, '-')}-${Date.now()}`.toLowerCase()
      return apiPostForm('/api/crm/customers', {
        fb_user_id: effectiveFbId,
        name: name.trim(),
        phone: phone.trim(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      })
    },
    onSuccess: () => {
      setShowNew(false)
      setName('')
      setPhone('')
      setFbUserId('')
      setNotes('')
      setFormError(null)
      queryClient.invalidateQueries({ queryKey: ['crm-customers'] })
    },
    onError: (e) => setFormError(describeError(e)),
  })

  return (
    <StackScreen
      title="العملاء المتوقعون"
      subtitle={`${customers.length} عميل`}
      action={
        <Button title="عميل جديد" size="sm" onPress={() => setShowNew(true)} />
      }
      isLoading={isLoading}
    >
      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : customers.length === 0 ? (
        <EmptyState message="لا عملاء بعد" hint="أضف عملاءك المتوقعين وتابعهم من هنا" />
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c) => String(c.id)}
          onRefresh={() => refetch()}
          refreshing={isRefetching}
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
          renderItem={({ item }) => (
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="smallBold" numberOfLines={1} style={{ flex: 1 }}>
                  {item.name ?? 'عميل'}
                </AppText>
                {item.stage ? <Badge tone={item.stage === 'lead' ? 'warning' : 'brand'} text={item.stage === 'lead' ? 'متوقع' : item.stage} /> : null}
              </Row>
              <Row style={{ marginTop: spacing.sm, gap: spacing.lg }}>
                {item.phone ? <AppText variant="small" color="mutedFg">📞 {item.phone}</AppText> : null}
                {typeof item.total_interactions === 'number' ? (
                  <AppText variant="small" color="mutedFg">{formatNumber(item.total_interactions)} تفاعل</AppText>
                ) : null}
              </Row>
              {item.notes ? (
                <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.xs }} numberOfLines={2}>
                  {item.notes}
                </AppText>
              ) : null}
              {item.last_contacted_at || item.first_seen_at ? (
                <AppText variant="caption" color="mutedFg" style={{ marginTop: spacing.xs }}>
                  {item.last_contacted_at ? `آخر تواصل ${formatDate(item.last_contacted_at)}` : `أُضيف ${formatDate(item.first_seen_at)}`}
                </AppText>
              ) : null}
            </Card>
          )}
        />
      )}

      {/* Sheet عميل جديد — M-21: KAV لئلا تغطي لوحة المفاتيح الحقول على iOS */}
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
              عميل جديد
            </AppText>
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <AppInput label="الاسم" value={name} onChangeText={setName} placeholder="اسم العميل" accessibilityLabel="اسم العميل" />
              <AppInput label="الهاتف" value={phone} onChangeText={setPhone} placeholder="09xxxxxxxx" keyboardType="phone-pad" accessibilityLabel="هاتف العميل" />
              <AppInput
                label="معرف فيسبوك (اختياري)"
                value={fbUserId}
                onChangeText={setFbUserId}
                placeholder="يُولّد تلقائيًا إذا تُرك فارغًا"
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="معرف فيسبوك للعميل"
                hint="مطلوب من الخادم — نولّده لك تلقائيًا عند الترك فارغًا"
              />
              <AppInput label="ملاحظات (اختياري)" value={notes} onChangeText={setNotes} placeholder="ما يهمك عن هذا العميل" multiline accessibilityLabel="ملاحظات" />
              {formError ? (
                <AppText variant="small" style={{ color: colors.destructive }}>
                  {formError}
                </AppText>
              ) : null}
              <Row>
                <Button title="إضافة" onPress={() => addMutation.mutate()} loading={addMutation.isPending} disabled={!name.trim()} />
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
