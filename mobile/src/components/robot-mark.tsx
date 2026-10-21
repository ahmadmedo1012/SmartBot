/**
 * SmartBot Mobile — RobotMark: الروبوت الواحد (منقول من الويب r152،
 * fb_dashboard/frontend/src/components/shared/RobotMark.tsx — الهندسة
 * حرفية بالوحدات نفسها: viewBox 0 0 120 120).
 *
 * هوية واحدة في كل مكان: قوقعة معدنية مطفية (سطح + خُطّة) · زجاج عين
 * سماوي (صوت الآلة) · LED حالة بنفسجية (إشارة الذكاء/الأتمتة —
 * اللون المحجوز). لا أصول صور: SVG واحد خفيف يتبع الثيم.
 *
 * الحالات (مرآة سلوك الويب):
 *   idle       — هدوء، LED يتنفس (rb-led). الافتراضي.
 *   greeting   — عينان قوسان + موجة إشارية (rb-wave).
 *   thinking   — شريط مسح بنفسجي يجوب الزجاج (rb-scan) — سجل الذكاء.
 *   responding — عينان مفتوحتان + أمواج صوتية إشارية (rb-say).
 *   error      — الزجاج والـLED يتحولان rose مع رجّة (rb-glitch).
 *
 * الحركة: أفعال rb-* في globals.css للويب تُعاد هنا بـRN Animated على
 * خصائص SVG مباشرة (react-native-svg يدعم setNativeProps — «Hack to make
 * Animated work with Shape components»)، فالمسح/الرجّة يحرّكان خاصية x
 * والعتامات تقاد كخصائص — نفس الأزمنة (3.8s/1.6s/1.1s/2.2s/2.4s).
 * كل حلقة لانهائية تتوقف عبر useReducedMotion (حزام RM الموحد للمستودع
 * — مرآة prefers-reduced-motion في الويب): في وضع التقليل يُرسم الروبوت
 * ساكنًا (المسح بمنتصف الزجاج 0.6، الأمواج كاملة العتامة — عقد الويب).
 *
 * زخرفي افتراضيًا: المستهلك يقرنه بنص — إلا إذا مُرّر accessibilityLabel
 * فيصبح عنصر صورة معلوماتيًا (مرآة «title» في الويب).
 */
import { useEffect, useState } from 'react'
import { Animated, Easing } from 'react-native'
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg'

import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { useTheme } from '@/hooks/use-theme'

export type RobotState = 'idle' | 'greeting' | 'thinking' | 'responding' | 'error'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)
const AnimatedRect = Animated.createAnimatedComponent(Rect)
const AnimatedPath = Animated.createAnimatedComponent(Path)

/* سُلّم زمن الأفعال — أزمنة الويب حرفيًا (globals.css §4) */
const LED_BREATHE_MS = 3_800 // rb-led-breathe
const SCAN_MS = 1_600 // rb-scan
const SAY_MS = 1_100 // rb-say (+ انزياح بدء 150ms لكل موجة)
const GLITCH_MS = 2_200 // rb-glitch (خطوة 1.5 وحدة)
const WAVE_MS = 2_400 // rb-wave

export interface RobotMarkProps {
  /** حالة الروبوت — idle افتراضيًا */
  state?: RobotState
  /** الضلع بالبكسل (SVG مربع 120×120 وحدة) */
  size?: number
  /** اسم وصولي اختياري — يرفعه من زخرفي إلى عنصر صورة معلوماتي */
  accessibilityLabel?: string
}

export function RobotMark({ state = 'idle', size = 48, accessibilityLabel }: RobotMarkProps) {
  const { colors, isDark } = useTheme()
  const reduced = useReducedMotion()

  /* السجل المحجوز: الـLED بنفسجي (نبض الآلة) إلا في الخطأ حيث تتحول
   * الآلة كلها rose (مرآة led/visor في الويب). */
  const led = state === 'error' ? colors.destructive : colors.violet
  const visor = state === 'error' ? colors.destructive : colors.primary
  /* --secondary الويب = السطح؛ --surface-sunken = أعمق درجة (أرض dark /
   * سطح light — نفس القيم الحرفية). */
  const shell = colors.surface
  const sunken = isDark ? colors.background : colors.surface

  /* قيم الأفعال — تُنشأ مرة (useState المهيّئ = هوية مستقرة) وتُحرّك
   * بحسب الحالة؛ useRef.current في أثناء التصيير محظور بقواعد الهوكس */
  const [ledV] = useState(() => new Animated.Value(1))
  const [scanV] = useState(() => new Animated.Value(0.5))
  const [glitchV] = useState(() => new Animated.Value(0))
  const [waveV] = useState(() => new Animated.Value(0.55))
  const [sayV] = useState(() => [0.55, 0.55, 0.55, 0.55].map((v) => new Animated.Value(v)))

  useEffect(() => {
    const running: Animated.CompositeAnimation[] = []

    /* rb-led — يتنفس في كل الحالات (نبض الآلة الدائم) */
    if (!reduced) {
      ledV.setValue(0.45)
      const ledLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(ledV, { toValue: 1, duration: LED_BREATHE_MS / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          Animated.timing(ledV, { toValue: 0.45, duration: LED_BREATHE_MS / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        ]),
      )
      ledLoop.start()
      running.push(ledLoop)
    } else {
      ledV.setValue(1)
    }

    if (!reduced) {
      if (state === 'thinking') {
        /* rb-scan — جولات ±14 وحدة حول x=56 مع عتامة 0.25→1 (قيمة
         * واحدة تقود x والعتامة معًا عبر interpolate منفصلين). */
        const scanLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(scanV, { toValue: 1, duration: SCAN_MS / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
            Animated.timing(scanV, { toValue: 0, duration: SCAN_MS / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          ]),
        )
        scanLoop.start()
        running.push(scanLoop)
      }
      if (state === 'error') {
        /* rb-glitch — نوبة 1.5 وحدة على x الزجاج (steps الويب تُقارَب
         * بانزلاق خطي — رجّة خفيفة بأمان الدقة). */
        const glitchLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(glitchV, { toValue: 1, duration: GLITCH_MS / 2, easing: Easing.linear, useNativeDriver: false }),
            Animated.timing(glitchV, { toValue: 0, duration: GLITCH_MS / 2, easing: Easing.linear, useNativeDriver: false }),
          ]),
        )
        glitchLoop.start()
        running.push(glitchLoop)
      }
      if (state === 'greeting') {
        const waveLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(waveV, { toValue: 1, duration: WAVE_MS / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
            Animated.timing(waveV, { toValue: 0.55, duration: WAVE_MS / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
          ]),
        )
        waveLoop.start()
        running.push(waveLoop)
      }
      if (state === 'responding') {
        /* rb-say — الأمواج الأربع: دورة 1.1s لكل موجة مع انزياح بدء
         * 150ms (Animated.stagger — نفس animation-delay للويب؛
         * تحجيم transform-box غير ممكن على SVG في RN فتقوم العتامة
         * المتدرجة بالنبض — بديل صادق وموثوق). */
        const sayLoops = sayV.map((v) =>
          Animated.loop(
            Animated.sequence([
              Animated.timing(v, { toValue: 1, duration: SAY_MS / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
              Animated.timing(v, { toValue: 0.55, duration: SAY_MS / 2, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
            ]),
          ),
        )
        Animated.stagger(150, sayLoops).start()
        running.push(...sayLoops)
      }
    } else {
      /* عقد الويب المختزل: المسح يسكن منتصف الزجاج بعتمة 0.6، والأمواج
       * كاملة العتامة، والرجّة والموجة يعودان لأصلهما. */
      scanV.setValue(0.5)
      waveV.setValue(1)
      glitchV.setValue(0)
      sayV.forEach((v) => v.setValue(1))
    }

    return () => {
      running.forEach((a) => a.stop())
    }
  }, [state, reduced, ledV, scanV, glitchV, waveV, sayV])

  const scanX = scanV.interpolate({ inputRange: [0, 1], outputRange: [42, 70] })
  const scanOpacity = scanV.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] })
  const glitchX = glitchV.interpolate({ inputRange: [0, 1], outputRange: [35, 36.5] })

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      accessible={!!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
    >
      {/* الهوائي + LED الحالة (يتنفس — rb-led) */}
      <Line x1={60} y1={14} x2={60} y2={28} stroke={colors.border} strokeWidth={3} strokeLinecap="round" />
      <AnimatedCircle cx={60} cy={9} r={5.5} fill={led} opacity={ledV} />
      {/* عقدا الأذن — وصلتان كهربائيتان */}
      <Rect x={8} y={44} width={7} height={16} rx={3.5} fill={colors.card} stroke={colors.border} strokeWidth={1.5} />
      <Rect x={105} y={44} width={7} height={16} rx={3.5} fill={colors.card} stroke={colors.border} strokeWidth={1.5} />
      {/* قوقعة الرأس — معدن مطفي */}
      <Rect x={22} y={24} width={76} height={56} rx={18} fill={shell} stroke={colors.border} strokeWidth={2} />
      {/* الرقبة */}
      <Rect x={54} y={76} width={12} height={10} rx={3} fill={colors.card} />
      {/* أرض العين — فتحة غائرة */}
      <Rect x={32} y={36} width={56} height={28} rx={13} fill={sunken} stroke={colors.border} strokeWidth={1.5} />
      {/* زجاج العين — صوت الآلة (إشاري؛ rose + رجّة في الخطأ) */}
      <AnimatedRect x={state === 'error' ? glitchX : 35} y={39} width={50} height={22} rx={10} fill={visor} opacity={state === 'error' ? 0.85 : 0.92} />
      {/* العينان حسب الحالة */}
      {state === 'greeting' ? (
        <G stroke={sunken} strokeWidth={3.4} strokeLinecap="round">
          <Path d="M45 51 q4 -6 8 0" />
          <Path d="M67 51 q4 -6 8 0" />
        </G>
      ) : state === 'thinking' ? (
        <G fill={sunken}>
          <Rect x={45} y={46} width={8} height={10} rx={4} />
          <Rect x={67} y={48} width={8} height={8} rx={4} />
        </G>
      ) : state === 'responding' ? (
        <G fill={sunken}>
          <Rect x={44} y={43} width={10} height={14} rx={5} />
          <Rect x={66} y={43} width={10} height={14} rx={5} />
        </G>
      ) : (
        <G fill={sunken}>
          <Rect x={45} y={45} width={9} height={12} rx={4.5} />
          <Rect x={66} y={45} width={9} height={12} rx={4.5} />
        </G>
      )}
      {/* شريط المسح — سجل التفكير (بنفسجي: جولة الذكاء) */}
      {state === 'thinking' ? (
        <AnimatedRect x={scanX} y={40} width={5} height={20} rx={2.5} fill={colors.violet} opacity={scanOpacity} />
      ) : null}
      {/* الأمواج الصوتية — سجل الرد (إشاري، الجانبان) */}
      {state === 'responding' ? (
        <G stroke={colors.primary} strokeWidth={2.6} strokeLinecap="round">
          <AnimatedPath d="M12 52 q-4 6 0 12" opacity={sayV[0]} />
          <AnimatedPath d="M6 48 q-6 9 0 18" opacity={sayV[1]} />
          <AnimatedPath d="M108 52 q4 6 0 12" opacity={sayV[2]} />
          <AnimatedPath d="M114 48 q6 9 0 18" opacity={sayV[3]} />
        </G>
      ) : null}
      {/* الموجة — سجل الترحيب (إشاري) */}
      {state === 'greeting' ? (
        <AnimatedPath d="M2 42 q5 -7 9 0 t9 0" stroke={colors.primary} strokeWidth={2.6} strokeLinecap="round" opacity={waveV} />
      ) : null}
      {/* قوقعة الجسد */}
      <Rect x={34} y={84} width={52} height={26} rx={12} fill={shell} stroke={colors.border} strokeWidth={2} />
      {/* مسار الصدر وعقده — موتيف الدارة على الجسد */}
      <Line x1={44} y1={97} x2={76} y2={97} stroke={colors.border} strokeWidth={1.6} />
      <Circle cx={44} cy={97} r={2.4} fill={colors.primary} />
      <Circle cx={76} cy={97} r={2.4} fill={colors.primary} />
      <Rect x={55} y={92} width={10} height={10} rx={3} fill={sunken} />
      <AnimatedCircle cx={60} cy={97} r={2.6} fill={led} opacity={ledV} />
    </Svg>
  )
}
