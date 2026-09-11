/**
 * شاشة الإعدادات (نفس الويب /dashboard/settings):
 * GET /api/me (بيانات) · POST /api/auth/change-password · خيارات الحساب.
 */
import { useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Button, Card, Divider, Row } from '@/components/ui'
import { StackScreen } from '@/components/screen-header'
import { AppInput } from '@/components/input'
import { apiGet, apiPost } from '@/services/api'
import { describeError } from '@/components/state-views'
import { useAuth } from '@/state/auth'
import { formatDate } from '@/lib/format'
import type { User } from '@/types/api'

export default function SettingsScreen() {
  const { colors } = useTheme()
  const { user, logout } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const { data: me } = useQuery<{ user: User }>({
    queryKey: ['me'],
    queryFn: () => apiGet<{ user: User }>('/api/me'),
  })
  const u = me?.user ?? user

  async function changePassword() {
    setBusy(true)
    setMsg(null)
    try {
      await apiPost('/api/auth/change-password', {
        current_password: current,
        new_password: next,
      })
      setMsg({ ok: true, text: 'تم تغيير كلمة المرور — سجّل الدخول ببياناتك الجديدة' })
      setCurrent('')
      setNext('')
    } catch (e) {
      setMsg({ ok: false, text: describeError(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <StackScreen title="الإعدادات">
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl * 2 }}>
        {/* الحساب */}
        <Card>
          <AppText variant="subtitle">الحساب</AppText>
          <View style={{ marginTop: spacing.md, gap: spacing.md }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="small" color="mutedFg">اسم المستخدم</AppText>
              <AppText variant="smallBold">{u?.username ?? '—'}</AppText>
            </Row>
            <Divider />
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="small" color="mutedFg">البريد</AppText>
              <AppText variant="smallBold">{u?.email || '—'}</AppText>
            </Row>
            <Divider />
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="small" color="mutedFg">الدور</AppText>
              <Badge tone="muted" text={u?.role === 'admin' ? 'مدير مساحة' : u?.role === 'editor' ? 'محرر' : 'مشاهد'} />
            </Row>
            <Divider />
            <Row style={{ justifyContent: 'space-between' }}>
              <AppText variant="small" color="mutedFg">الخطة</AppText>
              <Badge tone="brand" text={u?.subscriptionStatus ?? 'free'} />
            </Row>
            {u?.subscriptionPlanEnd ? (
              <>
                <Divider />
                <Row style={{ justifyContent: 'space-between' }}>
                  <AppText variant="small" color="mutedFg">تنتهي</AppText>
                  <AppText variant="smallBold">{formatDate(u.subscriptionPlanEnd)}</AppText>
                </Row>
              </>
            ) : null}
          </View>
        </Card>

        {/* تغيير كلمة المرور */}
        <Card>
          <AppText variant="subtitle">تغيير كلمة المرور</AppText>
          <View style={{ gap: spacing.md, marginTop: spacing.md }}>
            <AppInput
              label="كلمة المرور الحالية"
              value={current}
              onChangeText={setCurrent}
              secureTextEntry
              placeholder="••••••••"
              accessibilityLabel="كلمة المرور الحالية"
            />
            <AppInput
              label="كلمة المرور الجديدة"
              value={next}
              onChangeText={setNext}
              secureTextEntry
              placeholder="8 أحرف على الأقل"
              accessibilityLabel="كلمة المرور الجديدة"
            />
            {msg ? (
              <AppText variant="small" style={{ color: msg.ok ? colors.success : colors.destructive }}>
                {msg.text}
              </AppText>
            ) : null}
            <Button
              title="تغيير كلمة المرور"
              onPress={changePassword}
              loading={busy}
              disabled={!current || next.length < 8}
            />
          </View>
        </Card>

        {/* الخروج */}
        <Button title="تسجيل الخروج" variant="danger" onPress={() => logout()} />

        <AppText variant="caption" color="mutedFg" style={{ textAlign: 'center' }}>
          SmartBot · بوابة الدعم: support@smart-link.ly
        </AppText>
      </ScrollView>
    </StackScreen>
  )
}
