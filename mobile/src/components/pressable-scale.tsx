/**
 * SmartBot Mobile — سجل الضغط القانوني (r131 F11، A4 P2-9).
 *
 * قبل r131: زرّ التطبيق كان opacity 0.85 فقط (شفافية بلا تحجيم) —
 * سجل Madarek لم يهبط إلى الموبايل قط رغم ادعاء commit r130. هذا المكوّن
 * هو القاعدة كمكوّن (نفس PressableScale في SM-mobile r130 W2-4):
 *
 *   · أدوات التحكم (زر/حبة/رابط) → scaleTo 0.97 (الافتراضي — --press-scale)
 *   · بطاقة/صف قابل للضغط       → scaleTo 0.99 (--state-card-pressed-scale)
 *   · الشريط السفلي فقط          → scaleTo 0.93 (حكم الويب r130)
 *
 * التوقيت: دخول 80ms (micro) وخروج 160ms (fast) على منحنى التباطؤ
 * cubic-bezier(0.16,1,0.3,1) — --ease-out (Madarek tokens.css:129).
 *
 * تقليل الحركة (useReducedMotion): يُسقط التحجيم المكاني — التغذية
 * الراجعة تصبح غمرة شفافية فقط (ليست حركة مكانية)، مطابقة لحزام RM
 * في الويب.
 *
 * يحمل أيضًا خط الأساس: accessibilityRole="button" ما لم يمرره المستدعي.
 */
import { useEffect } from 'react'
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'

import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { EASE_OUT_POINTS, press } from '@/constants/theme'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

/** --ease-out = cubic-bezier(0.16, 1, 0.3, 1) */
const EASE_OUT = Easing.bezier(...EASE_OUT_POINTS)

export interface PressableScaleProps extends PressableProps {
  /** معامل التحجيم عند الضغط: أدوات 0.97 (افتراضي) · بطاقات 0.99 · شريط سفلي 0.93 */
  scaleTo?: number
  /** مدة الدخول بالمللي (افتراضي 80 — درجة micro) */
  pressDurationMs?: number
  style?: StyleProp<ViewStyle>
}

export function PressableScale({
  scaleTo = press.button,
  pressDurationMs = press.inMs,
  style,
  onPressIn,
  onPressOut,
  disabled,
  accessibilityRole,
  ...props
}: PressableScaleProps) {
  const reducedMotion = useReducedMotion()

  // قيم مشتركة تعكس علم RM داخل الـworklet — مسار رسم واحد للوضعين
  const pressed = useSharedValue(0)
  const reduced = useSharedValue(false)
  useEffect(() => {
    reduced.value = reducedMotion
  }, [reducedMotion, reduced])

  const animatedStyle = useAnimatedStyle(() => {
    'worklet'
    if (reduced.value) {
      // تقليل حركة: لا تحجيم مكاني — غمرة شفافية فقط
      return { opacity: 1 - pressed.value * 0.3 }
    }
    return {
      transform: [{ scale: 1 + pressed.value * (scaleTo - 1) }],
      opacity: 1 - pressed.value * 0.15,
    }
  })

  const pressIn: NonNullable<PressableProps['onPressIn']> = (e) => {
    pressed.value = withTiming(1, { duration: pressDurationMs, easing: EASE_OUT })
    onPressIn?.(e)
  }
  const pressOut: NonNullable<PressableProps['onPressOut']> = (e) => {
    pressed.value = withTiming(0, { duration: press.outMs, easing: EASE_OUT })
    onPressOut?.(e)
  }

  return (
    <AnimatedPressable
      onPressIn={pressIn}
      onPressOut={pressOut}
      disabled={disabled}
      accessibilityRole={accessibilityRole ?? 'button'}
      style={[style, animatedStyle]}
      {...props}
    />
  )
}
