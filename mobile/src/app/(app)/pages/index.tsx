/**
 * شاشة الصفحات — إعداد فيسبوك (نفس الويب /dashboard/pages):
 * GET /api/facebook/settings · PUT /api/facebook/settings · POST /api/facebook/test.
 */
import { useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { AppInput } from '@/components/input'
import { apiGet, apiPost, apiPut } from '@/services/api'
import { describeError, LoadingState } from '@/components/state-views'
import type { FacebookSettings } from '@/types/api'

export default function PagesScreen() {
  const { colors } = useTheme()
  const queryClient = useQueryClient()
  const [pageId, setPageId] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const { data, isLoading } = useQuery<FacebookSettings>({
    queryKey: ['facebook-settings'],
    queryFn: () => apiGet<FacebookSettings>('/api/facebook/settings'),
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      apiPut('/api/facebook/settings', {
        page_id: pageId.trim() || data?.page_id || '',
        access_token: accessToken.trim(),
        subscribe_webhook: true,
      }),
    onSuccess: () => {
      setAccessToken('')
      setMsg({ ok: true, text: 'تم حفظ إعدادات الصفحة وربط الويبهوك' })
      queryClient.invalidateQueries({ queryKey: ['facebook-settings'] })
    },
    onError: (e) => setMsg({ ok: false, text: describeError(e) }),
  })

  const testMutation = useMutation({
    mutationFn: () => apiPost<{ ok: boolean }>('/api/facebook/test'),
    onSuccess: (res) => setMsg({ ok: true, text: 'الاتصال بالصفحة يعمل ✓' }),
    onError: (e) => setMsg({ ok: false, text: describeError(e) }),
  })

  if (isLoading) return <LoadingState label="جارٍ تحميل إعدادات الصفحة…" />

  const connected = data?.connected ?? data?.webhook_subscribed ?? false

  return (
    <StackScreen title="الصفحات (فيسبوك)" subtitle={data?.page_name ?? undefined}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl * 2 }}>
        {/* الحالة الحالية */}
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <AppText variant="subtitle">حالة الاتصال</AppText>
            <Badge tone={connected ? 'success' : 'warning'} text={connected ? 'متصل' : 'غير متصل'} />
          </Row>
          <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="small" color="mutedFg">معرف الصفحة</AppText>
              <AppText variant="smallBold">{data?.page_id || '—'}</AppText>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="small" color="mutedFg">اسم الصفحة</AppText>
              <AppText variant="smallBold">{data?.page_name || '—'}</AppText>
            </Row>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="small" color="mutedFg">الويبهوك</AppText>
              <Badge tone={data?.webhook_subscribed ? 'success' : 'destructive'} text={data?.webhook_subscribed ? 'مشترك' : 'غير مشترك'} />
            </Row>
          </View>
          <Row style={{ marginTop: spacing.lg }}>
            <Button
              title="اختبار الاتصال"
              variant="secondary"
              size="sm"
              onPress={() => testMutation.mutate()}
              loading={testMutation.isPending}
            />
          </Row>
        </Card>

        {/* تحديث البيانات */}
        <Card>
          <AppText variant="subtitle">تحديث بيانات الصفحة</AppText>
          <View style={{ gap: spacing.md, marginTop: spacing.md }}>
            <AppInput
              label="معرف الصفحة (Page ID)"
              value={pageId || data?.page_id || ''}
              onChangeText={setPageId}
              placeholder="100234567890"
              autoCapitalize="none"
              accessibilityLabel="معرف الصفحة"
            />
            <AppInput
              label="رمز وصول الصفحة (جديد فقط عند التغيير)"
              value={accessToken}
              onChangeText={setAccessToken}
              placeholder="EAAG…"
              autoCapitalize="none"
              accessibilityLabel="رمز وصول الصفحة"
              hint="اتركه فارغًا للإبقاء على الرمز الحالي"
            />
            {msg ? (
              <AppText variant="small" style={{ color: msg.ok ? colors.success : colors.destructive }}>
                {msg.text}
              </AppText>
            ) : null}
            <Button
              title="حفظ الإعدادات"
              onPress={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
              disabled={!pageId.trim() && !data?.page_id}
            />
          </View>
        </Card>

        <AppText variant="caption" color="mutedFg" style={{ textAlign: 'center' }}>
          توكن الصفحة يُشفَّر بـ Fernet على الخادم — لا يُخزَّن في التطبيق إطلاقًا
        </AppText>
      </ScrollView>
    </StackScreen>
  )
}
