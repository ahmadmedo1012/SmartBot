/**
 * SmartBot Mobile — الدوار القانوني (r131 F11، مطابق Madarek .spinner).
 *
 * التشريح القانوني (madarek components.css:1352 + polish.css:745 — نفس
 * تشريح DefaultLoading في الويب بعد r131):
 *   22px · حد 2px بلون النص @8% (color-mix text 8%) · قوس علوي بلون
 *   العلامة (accent) · دوران 700ms خطي (--motion-duration-stat).
 *
 * قبل r131: LoadingState كان ActivityIndicator size="large" (36px بنظام
 * ألوان النظام) وزر التحميل ActivityIndicator "small" — خارج التشريح.
 *
 * تقليل الحركة: الدوران اللانهائي يتوقف (نفس حزام RM في الويب —
 * globals.css:967 يجمّد كل الحركات)؛ يبقى القرص الساكن + النص المجاور
 * يحملان المعنى.
 */
import { useEffect } from 'react'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'

import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useTheme } from '@/hooks/use-theme'
import { motion } from '@/constants/theme'

export interface SpinnerProps {
  /** القطر بالبكسل — 22 القانوني (DefaultLoading)، 18 داخل الأزرار */
  size?: number
  /** لون القوس العلوي (لون النص على أرضية ملوّنة — زر أساسي)؛
   *  الافتراضي حبر العلامة (accentFg). */
  color?: string
}

export function Spinner({ size = 22, color }: SpinnerProps) {
  const { colors } = useTheme()
  const reducedMotion = useReducedMotion()

  const rotation = useSharedValue(0)
  const reduced = useSharedValue(false)
  useEffect(() => {
    reduced.value = reducedMotion
  }, [reducedMotion, reduced])

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(rotation)
      rotation.value = 0
      return
    }
    rotation.value = 0
    rotation.value = withRepeat(
      withTiming(360, { duration: motion.stat, easing: Easing.linear }),
      -1,
      false,
    )
  }, [reducedMotion, rotation])

  const animatedStyle = useAnimatedStyle(() => {
    'worklet'
    return { transform: [{ rotate: `${reduced.value ? 0 : rotation.value}deg` }] }
  })

  const arc = color ?? colors.accentFg
  const rimBase = color ?? colors.foreground
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: 2,
          borderColor: `${rimBase}14`, /* النص @8% — 0x14 ≈ 20/255 */
          borderTopColor: arc,
        },
        animatedStyle,
      ]}
    />
  )
}
