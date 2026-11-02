/**
 * SmartBot Mobile — الحالة «متاحة في Premium» المشتركة (GAP-X1 · P42-5a).
 *
 * التوأم البصري الحرفي لمكوّن الويب PremiumLockCard
 * (fb_dashboard/frontend/src/components/shared/PremiumLockCard.tsx —
 * W2-BOT-5، المولود في commit 3ce58c3): العنوان يسمّي الميزة + نسخة
 * الخادم الحرفية (عائلة GATE_MESSAGES — كل بوابة تنتهي «رقِّ خطتك»)
 * أو النص العام عند غيابه + باب الترقية إلى شاشة الاشتراك الجوّالية
 * (/(app)/subscribe — نظير /subscribe في الويب).
 *
 * العقد البصري (مرآة حرفية — بئر العائلة المسطّح):
 *   - تاج Crown داخل بئر أصفر عائلي 56px (size-14 الويب) بدرجة r-xl
 *     وحبر العائلة (families.yellow) — لا هالة زجاجية (de-glow r131-F8).
 *   - المسار الحرفي لأيقونة التاج من lucide-react 1.x (components/icon.tsx)
 *     — نفس مجموعة الويب الذي يستورد Crown من lucide-react.
 *
 * التصنيف مسؤولية الشاشة: isPlanLocked (lib/gates.ts) يميّز عائلة
 * البوابات («رقِّ خطتك») عن إيقاف المنظمة والصلاحيات؛ المكوّن لا يصنّف،
 * يعرض فقط. فرض الخطة خادمي — هذا عرضٌ صادق فقط.
 */
import { StyleSheet, View } from 'react-native'
import { router } from 'expo-router'
import { useTheme } from '@/hooks/use-theme'
import { families, spacing } from '@/constants/theme'
import { AppText } from '@/components/themed-text'
import { Button } from '@/components/ui'
import { Icon } from '@/components/icon'

/** النص العام عند غياب نسخة الخادم — حرفيًا من PremiumLockCard الويب. */
export const PREMIUM_LOCK_DEFAULT_MESSAGE =
  'خطتك الحالية لا تتضمن هذه الميزة. رقِّ خطتك من صفحة الاشتراك للاطلاع عليها.'

export function PremiumLock({ title, message }: { title: string; message?: string }) {
  const { colors, isDark } = useTheme()
  /* بئر العائلة المسطّح: أرضية yellow-bg وحبر yellow-ink حسب الوضع —
   * نفس قيم الويب (--c-yellow-bg/--c-yellow-ink حرفيًا في families). */
  const fam = families[isDark ? 'dark' : 'light'].yellow
  return (
    <View style={styles.wrap}>
      <View style={[styles.crownWell, { backgroundColor: fam.bg }]}>
        <Icon name="crown" size={20} color={fam.ink} />
      </View>
      <AppText variant="smallBold" align="center">
        {title} — متاحة في Premium
      </AppText>
      <AppText variant="caption" color="mutedFg" align="center" style={styles.message}>
        {message ?? PREMIUM_LOCK_DEFAULT_MESSAGE}
      </AppText>
      <Button
        title="ترقية الخطة"
        size="sm"
        variant="secondary"
        icon={<Icon name="crown" size={14} color={colors.foreground} />}
        onPress={() => router.push({ pathname: '/(app)/subscribe' })}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  /* مرآة py-10 gap-3 الويب: عمودي 40px وفجوة 12px */
  wrap: { alignItems: 'center', gap: spacing.md, paddingVertical: 40, alignSelf: 'stretch' },
  /* مرآة size-14 rounded-xl: بئر 56px بدرجة r-xl (16) — عائلة لا زجاج */
  crownWell: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  /* مرآة text-xs muted max-w-xs leading-relaxed: 320px حد أقصى للسطر */
  message: { maxWidth: 320 },
})
