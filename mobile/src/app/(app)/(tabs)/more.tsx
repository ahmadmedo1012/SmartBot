/**
 * تاب المزيد — كل أقسام لوحة الويب (defaultNavSections في AdminSidebar):
 * النمو · الإدارة · الحساب — وصول سريع لكل شاشات stack.
 */
import { ScrollView, StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useTheme } from '@/hooks/use-theme'
import { press, radius, spacing, TOUCH_TARGET } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Badge, Card, Row } from '@/components/ui'
import { Icon, type IconName } from '@/components/icon'
import { DirectionalIcon, RTL_MIRROR_STYLE } from '@/components/directional-icon'
import { PressableScale } from '@/components/pressable-scale'
import { apiGet } from '@/services/api'
import { useAuth } from '@/state/auth'

interface MoreItem {
  title: string
  icon: IconName
  href: string
  badge?: string
}

const GROWTH: MoreItem[] = [
  { title: 'الجمهور والمشتركون', icon: 'users', href: '/(app)/audience' },
  { title: 'العملاء المتوقعون (CRM)', icon: 'user-plus', href: '/(app)/leads' },
  { title: 'البث الجماعي', icon: 'radio', href: '/(app)/broadcast' },
  { title: 'الحملات التسلسلية', icon: 'workflow', href: '/(app)/sequences' },
  { title: 'التسويق', icon: 'megaphone', href: '/(app)/marketing' },
  { title: 'الإعلانات', icon: 'target', href: '/(app)/ads' },
  { title: 'التقارير', icon: 'file-text', href: '/(app)/reports' },
]

const MANAGEMENT: MoreItem[] = [
  { title: 'المنشورات والمجدول', icon: 'clock', href: '/(app)/scheduled' },
  { title: 'تقويم المحتوى', icon: 'calendar', href: '/(app)/calendar' },
  { title: 'الردود التلقائية', icon: 'bot', href: '/(app)/autoreply' },
  { title: 'الصفحات (فيسبوك)', icon: 'newspaper', href: '/(app)/pages' },
  { title: 'الفريق', icon: 'users', href: '/(app)/team' },
  { title: 'سجل النشاطات', icon: 'activity', href: '/(app)/activity' },
]

const ACCOUNT: MoreItem[] = [
  { title: 'الإشعارات', icon: 'bell', href: '/(app)/notifications' },
  { title: 'الأدوات (العروض والقوالب)', icon: 'wrench', href: '/(app)/tools' },
  { title: 'الفواتير والاشتراك', icon: 'credit-card', href: '/(app)/billing' },
  { title: 'الدعم', icon: 'help-circle', href: '/(app)/support' },
  { title: 'الإعدادات', icon: 'settings', href: '/(app)/settings' },
]

export default function MoreScreen() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const { user, logout } = useAuth()

  const { data: notifSettings } = useQuery<{ unread?: number }>({
    queryKey: ['notifications-summary'],
    queryFn: () => apiGet<{ unread?: number }>('/api/notifications/'),
  })

  const unread = notifSettings?.unread

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xxxl * 2, gap: spacing.lg }}>
        {/* بطاقة الحساب */}
        <Card>
          <Row style={{ gap: spacing.md }}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <AppText variant="subtitle" style={{ color: colors.primaryFg }}>
                {(user?.username ?? '؟').charAt(0).toUpperCase()}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="subtitle">{user?.name ?? user?.username}</AppText>
              <Row style={{ gap: spacing.sm, marginTop: 4 }}>
                <Badge tone="brand" text={user?.subscriptionStatus === 'free' ? 'مجاني' : user?.subscriptionStatus ?? ''} />
                <Badge tone="muted" text={user?.role === 'admin' ? 'مدير' : user?.role === 'editor' ? 'محرر' : 'مشاهد'} />
              </Row>
            </View>
          </Row>
          {!user?.onboardingCompleted ? (
            <PressableScale
              accessibilityLabel="إكمال ربط صفحة فيسبوك"
              onPress={() => router.push({ pathname: '/(app)/onboarding' })}
              style={{ marginTop: spacing.md }}
              scaleTo={press.card}
            >
              <Card style={{ backgroundColor: colors.warningSoft, borderWidth: 0 }}>
                <Row style={{ gap: spacing.sm }}>
                  <Icon name="alert-circle" size={18} color={colors.warning} />
                  <AppText variant="small" style={{ color: colors.warning, flex: 1 }}>
                    أكمل ربط صفحة فيسبوك لتفعيل البوت
                  </AppText>
                </Row>
              </Card>
            </PressableScale>
          ) : null}
        </Card>

        <Section title="النمو" items={GROWTH} unread={unread} />
        <Section title="الإدارة" items={MANAGEMENT} unread={unread} />
        <Section title="الحساب" items={ACCOUNT} unread={unread} />

        {/* تسجيل الخروج */}
        <PressableScale
          accessibilityLabel="تسجيل الخروج"
          onPress={() => logout()}
          style={[styles.logoutBtn, { borderColor: colors.destructive }]}
          scaleTo={press.button}
        >
          <Row style={{ justifyContent: 'center', gap: spacing.sm }}>
            {/* r131: LogOut أيقونة اتجاهية غير سهمية — مرآة RTL (كالويب §2.2) */}
            <View style={RTL_MIRROR_STYLE}>
              <Icon name="log-out" size={20} color={colors.destructive} />
            </View>
            <AppText variant="smallBold" style={{ color: colors.destructive }}>
              تسجيل الخروج
            </AppText>
          </Row>
        </PressableScale>

        <AppText variant="caption" color="mutedFg" style={{ textAlign: 'center' }}>
          SmartBot v1.0.0 · api.smart-link.ly
        </AppText>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  avatar: { width: 52, height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  item: { borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: TOUCH_TARGET + 8, justifyContent: 'center' },
  logoutBtn: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
  },
})

/** قسم من أقسام «المزيد» — مكون مستقل خارج الشاشة (قاعدة react-hooks). */
function Section({ title, items, unread }: { title: string; items: MoreItem[]; unread?: number }) {
  const { colors } = useTheme()
  return (
    <Card>
      <AppText variant="subtitle" color="mutedFg">
        {title}
      </AppText>
      <View style={{ marginTop: spacing.md, gap: spacing.xs }}>
        {items.map((item) => (
          <PressableScale
            key={item.href}
            accessibilityLabel={item.title}
            onPress={() => router.push({ pathname: item.href })}
            style={styles.item}
            scaleTo={press.card}
          >
            <Row style={{ gap: spacing.md, flex: 1 }}>
              <Icon name={item.icon} size={20} color={colors.accentFg} />
              <AppText variant="body" style={{ flex: 1 }}>
                {item.title}
              </AppText>
            </Row>
            <Row style={{ gap: spacing.sm }}>
              {item.href.includes('notifications') && typeof unread === 'number' && unread > 0 ? (
                <Badge tone="brand" text={String(unread)} />
              ) : null}
              {/* r131: شفرون الكشف من الدلالة — forward يشير يسارًا تحت RTL */}
              <DirectionalIcon
                semanticDirection="forward"
                variant="chevron"
                size={18}
                color={colors.mutedFg}
              />
            </Row>
          </PressableScale>
        ))}
      </View>
    </Card>
  )
}
