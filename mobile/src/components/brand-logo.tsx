/**
 * SmartBot Mobile — الشعار الحقيقي للعلامة (expo-image).
 *
 * قبل v27: شاشة الدخول كانت ترسم «شعارًا وهميًا» — دائرة ملونة بحرفَي
 * SB — بينما الويب يعرض brand-icon.png الحقيقي. هذا المكوّن هو المصدر
 * الوحيد للشعار في التطبيق كله (كل شاشة تحتاج شعارًا تستورده من هنا)
 * حتى يستحيل رجوع الدوائر/الحروف الوهمية مستقبلًا.
 *
 * expo-image (بدل Image القياسية): تحميل أسرع، ذاكرة تخزين مدمجة،
 * ومحتوى مناسب متكيف مع القياس — نفس توصية المالك لمكتبات الصور.
 */
import { StyleSheet } from 'react-native'
import { Image, type ImageProps } from 'expo-image'
import { radius } from '@/constants/theme'

// الملف نفسه المعروض على ويب bot.smart-link.ly في شاشات المصادقة —
// نسخة بايت-ببايت من fb_dashboard/frontend/public/brand-icon.png.
const BRAND_ICON = require('../../../assets/images/brand-icon.png')

export interface BrandLogoProps extends Omit<ImageProps, 'source'> {
  /** البجانة المربعة بالبكسل — 64 = بصر الويب (size-16) في بطاقات المصادقة. */
  size?: number
}

export function BrandLogo({ size = 64, style, ...rest }: BrandLogoProps) {
  return (
    <Image
      source={BRAND_ICON}
      style={[{ width: size, height: size }, styles.logo, style]}
      contentFit="contain"
      transition={120}
      accessibilityLabel="شعار SmartBot"
      {...rest}
    />
  )
}

const styles = StyleSheet.create({
  logo: {
    borderRadius: radius.md,
    // الظل الناعم نفسه الذي يعطيه الويب: drop-shadow-lg
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
})
