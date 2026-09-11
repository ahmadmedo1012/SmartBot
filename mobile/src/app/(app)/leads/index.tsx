/**
 * شاشة العملاء المتوقعين — CRM (نفس الويب /dashboard/leads):
 * GET /api/crm/customers — بطاقات عملاء مع إضافة عميل جديد.
 */
import { useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, TextInput, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { AppInput } from '@/components/input'
import { apiGet, apiPost } from '@/services/api'
import { describeError, EmptyState, ErrorState } from '@/components/state-views'
import { formatDate, formatMoney } from '@/lib/format'
import type { Customer } from '@/types/api'

export default function LeadsScreen() {
  const { colors, fontBody } = useTheme()
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery<Customer[]>({
    queryKey: ['crm-customers'],
    queryFn: () => apiGet<Customer[]>('/api/crm/customers'),
  })

  const addMutation = useMutation({
    mutationFn: () => apiPost('/api/crm/customers', { name: name.trim(), phone: phone.trim(), notes: notes.trim() }),
    onSuccess: () => {
      setShowNew(false)
      setName('')
      setPhone('')
      setNotes('')
      setFormError(null)
      queryClient.invalidateQueries({ queryKey: ['crm-customers'] })
    },
    onError: (e) => setFormError(describeError(e)),
  })

  return (
    <StackScreen
      title="العملاء المتوقعون"
      subtitle={`${data?.length ?? 0} عميل`}
      action={
        <Button title="عميل جديد" size="sm" onPress={() => setShowNew(true)} />
      }
      isLoading={isLoading}
    >
      {isError ? (
        <ErrorState message={describeError(error)} onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState message="لا عملاء بعد" hint="أضف عملاءك المتوقعين وتابعهم من هنا" />
      ) : (
        <FlatList
          data={data ?? []}
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
                {item.total_spent ? <Badge tone="success" text={formatMoney(item.total_spent)} /> : null}
              </Row>
              <Row style={{ marginTop: spacing.sm, gap: spacing.lg }}>
                {item.phone ? <AppText variant="small" color="mutedFg">📞 {item.phone}</AppText> : null}
                {item.email ? <AppText variant="small" color="mutedFg">✉ {item.email}</AppText> : null}
              </Row>
              {item.notes ? (
                <AppText variant="small" color="mutedFg" style={{ marginTop: spacing.xs }} numberOfLines={2}>
                  {item.notes}
                </AppText>
              ) : null}
              {item.created_at ? (
                <AppText variant="caption" color="mutedFg" style={{ marginTop: spacing.xs }}>
                  أُضيف {formatDate(item.created_at)}
                </AppText>
              ) : null}
            </Card>
          )}
        />
      )}

      {/* Sheet عميل جديد */}
      <Modal visible={showNew} transparent animationType="slide" onRequestClose={() => setShowNew(false)}>
        <View style={styles.backdrop}>
          <Pressable style={{ flex: 1 }} accessibilityLabel="إغلاق" onPress={() => setShowNew(false)} />
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <View style={[styles.handle, { backgroundColor: colors.border }]} />
            <AppText variant="subtitle" style={{ marginTop: spacing.md }}>
              عميل جديد
            </AppText>
            <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
              <AppInput label="الاسم" value={name} onChangeText={setName} placeholder="اسم العميل" accessibilityLabel="اسم العميل" />
              <AppInput label="الهاتف" value={phone} onChangeText={setPhone} placeholder="09xxxxxxxx" keyboardType="phone-pad" accessibilityLabel="هاتف العميل" />
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
