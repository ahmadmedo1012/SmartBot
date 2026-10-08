/**
 * SmartBot Mobile — DirectionalIcon (منقول من الويب v7 §2.1 — r131 F11).
 *
 * المصدر الوحيد لأيقونات الاتجاه (رجوع/تقدّم) في التطبيق. قبل r131 كانت
 * الشاشات تكتب الاتجاه يدويًا: «chevron-right يعني رجوع» و«chevron-left
 * يعني تقدّمًا» — افتراض RTL مضمّن بلا مكوّن واحد يحمل الدلالة. هذا
 * المنقول يحمل الدلالة نفسها بآلية الويب:
 *
 *   آلية القلب الوحيدة: مرآة أفقية (rtl:-scale-x-100 على الويب) —
 *   rotate-180 محظور للأيقونات (يكسر هندسة الخط).
 *
 *   "back"    → رمز LTR: chevron-left/arrow-left  → في RTL يشير يمينًا
 *   "forward" → رمز LTR: chevron-right/arrow-right → في RTL يشير يسارًا
 *
 * المستدعي يمرر المعنى لا اسم الأيقونة. الأيقونات الاتجاهية غير
 * السهمية (Send/LogOut) تبقى استدعاء Icon مباشرًا لكنها تستخدم نفس
 * آلية المرآة عبر RTL_MIRROR_STYLE (§2.2 في الويب).
 */
import { I18nManager, StyleSheet, View } from 'react-native'
import { Icon, type IconName } from '@/components/icon'

export type SemanticDirection = 'back' | 'forward'
export type DirectionalVariant = 'chevron' | 'arrow'

const GLYPHS: Record<SemanticDirection, Record<DirectionalVariant, IconName>> = {
  back: { chevron: 'chevron-left', arrow: 'arrow-left' },
  forward: { chevron: 'chevron-right', arrow: 'arrow-right' },
}

/** المرآة الأفقية الوحيدة — rtl:-scale-x-100 (تُطبَّق تحت RTL فقط). */
export const RTL_MIRROR_STYLE = { transform: [{ scaleX: I18nManager.isRTL ? -1 : 1 }] }

export function DirectionalIcon({
  semanticDirection,
  variant = 'chevron',
  size = 22,
  color,
  strokeWidth = 2,
}: {
  /** معنى السهم لا رسمه: "back" (رجوع) أو "forward" (تالٍ/متابعة/كشف). */
  semanticDirection: SemanticDirection
  /** chevron (تفصيلية/مسارات) أو arrow (سهام مستقلة) */
  variant?: DirectionalVariant
  size?: number
  color?: string
  strokeWidth?: number
}) {
  const glyph = GLYPHS[semanticDirection][variant]
  if (!I18nManager.isRTL) {
    return <Icon name={glyph} size={size} color={color} strokeWidth={strokeWidth} />
  }
  return (
    <View style={styles.mirror}>
      <Icon name={glyph} size={size} color={color} strokeWidth={strokeWidth} />
    </View>
  )
}

const styles = StyleSheet.create({ mirror: RTL_MIRROR_STYLE })
