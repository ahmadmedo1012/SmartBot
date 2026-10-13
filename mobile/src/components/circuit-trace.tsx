/**
 * SmartBot Mobile — CircuitTrace: علامة المسار الإشارية (منقولة من الويب
 * r152، fb_dashboard/frontend/src/components/shared/CircuitTrace.tsx —
 * نفس عقد الهندسة بالوحدات).
 *
 * مسار إشارة رفيع بعُقد — لكنة عالم غرفة الآلة وفاصل قصير. متدرج
 * بالثيم: المسار = primary @34% (عتامة بدل color-mix)، العُقد = primary،
 * والعقدة الحية = لايم (محجوزة لنبضات AI/الأتمتة). SVG خالص: لا حركة.
 *
 * عقد الهندسة (مقاوم للتمدد): preserveAspectRatio="none" — الخط الأفقي
 * يحمل vectorEffect="non-scaling-stroke" والعُقد خطوط عمودية (محصّنة من
 * التمدد الأفقي؛ الدوائر كانت ستتمزق قطوعًا ناقصة فأُبعدت كالويب).
 *
 * المتغيرات:
 *   divider (افتراضي) — مسار أفقي، عقدة طرفية + عقدة وسطى.
 *   live              — العقدة الطرفية النهائية لايم (أتمتة نشطة).
 *   corner            — مسار على شكل L لبطاقات/لوحات.
 */
import Svg, { Line, Path } from 'react-native-svg'

import { useTheme } from '@/hooks/use-theme'

export interface CircuitTraceProps {
  variant?: 'divider' | 'live' | 'corner'
  /** الارتفاع بالبكسل — 8 الافتراضي (هندسة الويب 120×8) */
  height?: number
}

/** عتامة المسار — مرآة color-mix(primary 34%, transparent) */
const TRACE_OPACITY = 0.34

export function CircuitTrace({ variant = 'divider', height = 8 }: CircuitTraceProps) {
  const { colors } = useTheme()
  const isLive = variant === 'live'
  return (
    <Svg width="100%" height={height} viewBox="0 0 120 8" preserveAspectRatio="none">
      {variant === 'corner' ? (
        <Path d="M2 6 H56 Q60 6 60 2 V1.5" fill="none" stroke={colors.primary} strokeWidth={1.5} opacity={TRACE_OPACITY} vectorEffect="non-scaling-stroke" />
      ) : (
        <>
          <Line x1={4} y1={4} x2={116} y2={4} stroke={colors.primary} strokeWidth={1.5} opacity={TRACE_OPACITY} vectorEffect="non-scaling-stroke" />
          {/* عُقد طرفية عمودية ⇒ محصّنة من التمدد؛ عرض الفرشاة ثابت
              (non-scaling) عند كل عرض حاوية */}
          <Line x1={2} y1={2.2} x2={2} y2={5.8} stroke={colors.primary} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <Line x1={60} y1={3.1} x2={60} y2={4.9} stroke={colors.primary} strokeWidth={2} strokeLinecap="round" opacity={0.75} vectorEffect="non-scaling-stroke" />
          {/* العقدة الحية — لايم: نبض الأتمتة (سطح نشط/AI يعمل) */}
          <Line x1={118} y1={2.2} x2={118} y2={5.8} stroke={isLive ? colors.lime : colors.primary} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </>
      )}
    </Svg>
  )
}
