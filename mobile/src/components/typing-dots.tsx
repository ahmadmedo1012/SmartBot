/**
 * SmartBot Mobile — TypingDots: نقاط التفكير الثلاث (منقولة من الويب
 * r152، globals.css .sb-typing — سجل «الآلة تفكر»).
 *
 * ثلاث نقاط لايم 6px (اللون المحجوز لعلامات AI) تنبض بترتيب متدرج:
 * دورة 1.2s خطية لكل نقطة مع انزياح 0.18s — عتامة 0.35→1 ورفع -3px
 * عند القمة (نفس sb-dot-pulse). النسخة العارية (bare) بلا إطار الفقاعة
 * لصفوف الحالة المضمنة؛ الافتراضية فقاعة سطح بخُطّة (مثل .sb-typing).
 *
 * تقليل الحركة: النبض يتوقف وتسكن النقاط عند 0.7 (نفس عقد الويب).
 *
 * زخرفية: aria-hidden في الويب — هنا تُخفى عن الوصول؛ جملة الحالة
 * المجاورة (وزر الإرسال المشغول) تحملان المعنى لقارئات الشاشة.
 */
import { useEffect } from 'react'
import { StyleSheet, View, type ViewProps } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'

import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useTheme } from '@/hooks/use-theme'
import { radius } from '@/constants/theme'

/* الدورة القانونية — 1.2s خطي (sb-dot-pulse)؛ الانزياح 0.18s = 0.15
 * دورة، فطور النقطة i = i/3. */
const DOT_PULSE_MS = 1_200
const DOT_PHASE = [0, 1 / 3, 2 / 3] as const

/** نقطة واحدة — الهوك يُستدعى عددًا ثابتًا من المرات (قواعد الهوكس). */
function Dot({
  phase,
  t,
  reduced,
  color,
}: {
  phase: number
  t: SharedValue<number>
  reduced: SharedValue<boolean>
  color: string
}) {
  const animated = useAnimatedStyle(() => {
    'worklet'
    if (reduced.value) return { opacity: 0.7, transform: [{ translateY: 0 }] }
    /* منحنى sb-dot-pulse: 0-40% صعود · 40-60% قمة · 60-100% هبوط */
    const p = (t.value + phase) % 1
    let k = 0
    if (p < 0.4) k = p / 0.4
    else if (p < 0.6) k = 1
    else k = 1 - (p - 0.6) / 0.4
    return { opacity: 0.35 + 0.65 * k, transform: [{ translateY: -3 * k }] }
  })
  return <Animated.View style={[styles.dot, { backgroundColor: color }, animated]} />
}

export interface TypingDotsProps extends ViewProps {
  /** النسخة العارية — بلا إطار الفقاعة (صف حالة مضمن) */
  bare?: boolean
}

export function TypingDots({ bare = false, style, ...rest }: TypingDotsProps) {
  const { colors } = useTheme()
  const reducedMotion = useReducedMotion()

  const t = useSharedValue(0)
  const reduced = useSharedValue(false)
  useEffect(() => {
    reduced.value = reducedMotion
  }, [reducedMotion, reduced])

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(t)
      t.value = 0
      return
    }
    t.value = 0
    t.value = withRepeat(
      withTiming(1, { duration: DOT_PULSE_MS, easing: Easing.linear }),
      -1,
      false,
    )
  }, [reducedMotion, t])

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        bare ? styles.bare : [styles.bubble, { backgroundColor: colors.surface, borderColor: colors.border }],
        style,
      ]}
      {...rest}
    >
      {DOT_PHASE.map((phase) => (
        <Dot key={phase} phase={phase} t={t} reduced={reduced} color={colors.lime} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  /* فقاعة .sb-typing: سطح + خُطّة + حشو 8/12 + زاوية lg — تُقرأ ألوانها
   * من الثيم في العرض (styles الثابتة لا ترى الثيم). */
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  bare: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 999, opacity: 0.35 },
})
