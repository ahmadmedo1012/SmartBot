/**
 * SmartBot Mobile — الهيكل العظمي القانوني (r131 F11).
 *
 * عقيدة الحالات (مدارك/A11): التحميل = هيكل عظمي مطابق للشكل، لا دوار
 * مجرد. الوسم القانوني (madarek + الويب): قاعدة muted وحزام sweep بلون
 * border يمر كل 1200ms خطي (--motion-duration-skeleton) — «خطي» حرفيًا
 * (لا ease — وإلا نبضت السرعة كل دورة).
 *
 * تقليل الحركة: الحلقة تتوقف كليًا (حزام الويب RM يجمّد الحركات
 * اللانهائية) — يبقى الشكل الساكن placeholder.
 *
 * التصديرات: Skeleton (البداية) · ListSkeleton (صفوف رسائل) ·
 * CardListSkeleton (بطاقات قوائم) · DashboardSkeleton (لوحة التحكم).
 */
import { useEffect } from 'react'
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'

import { useReducedMotion } from '@/hooks/use-reduced-motion'
import { motion, radius, spacing, TOUCH_TARGET } from '@/constants/theme'
import { useTheme } from '@/hooks/use-theme'
import { Card, Row } from '@/components/ui'

const AnimatedView = Animated.View

/** شريط واحد بقاعدة muted وحزام border يمر كل 1200ms خطي (RM-safe). */
export function Skeleton({
  width,
  height = 14,
  rounded,
  style,
}: {
  width?: DimensionValue
  height?: number
  /** نصف قطر بكسل — الافتراضي radius.sm (8) مثل --radius-sm في الويب */
  rounded?: number
  style?: StyleProp<ViewStyle>
}) {
  const { colors } = useTheme()
  const reducedMotion = useReducedMotion()

  const progress = useSharedValue(0)
  const barWidth = useSharedValue(0)
  const reduced = useSharedValue(false)
  useEffect(() => {
    reduced.value = reducedMotion
  }, [reducedMotion, reduced])

  useEffect(() => {
    if (reducedMotion) {
      cancelAnimation(progress)
      progress.value = 0
      return
    }
    progress.value = 0
    progress.value = withRepeat(
      withTiming(1, { duration: motion.skeleton, easing: Easing.linear }),
      -1,
      false,
    )
  }, [reducedMotion, progress])

  const sweep = useAnimatedStyle(() => {
    'worklet'
    if (reduced.value) return { transform: [{ translateX: -99999 }] }
    const w = barWidth.value
    return { transform: [{ translateX: -w + progress.value * 2 * w }] }
  })

  return (
    <View
      onLayout={(e) => {
        barWidth.value = e.nativeEvent.layout.width
      }}
      style={[
        {
          width,
          height,
          borderRadius: rounded ?? radius.sm,
          backgroundColor: colors.muted,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <AnimatedView style={[StyleSheet.absoluteFill, sweep]}>
        <LinearGradient
          colors={['transparent', colors.border, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </AnimatedView>
    </View>
  )
}

/** هيكل قائمة محادثات/رسائل — صف: صورة رمزية + شريطا نص. */
export function ListSkeleton({ rows = 6, label = 'جارٍ التحميل…' }: { rows?: number; label?: string }) {
  return (
    <View
      style={styles.listWrap}
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <Row key={i} style={{ gap: spacing.md, paddingVertical: spacing.md, minHeight: TOUCH_TARGET + 16 }}>
          <Skeleton width={48} height={48} rounded={999} />
          <View style={{ flex: 1, gap: spacing.sm }}>
            <Skeleton width="55%" height={13} />
            <Skeleton width="85%" height={13} />
          </View>
        </Row>
      ))}
    </View>
  )
}

/** هيكل قائمة بطاقات (تعليقات/قواعد/بث…) — بطاقة: ترويسة + نص + أزرار. */
export function CardListSkeleton({ cards = 4, label = 'جارٍ التحميل…' }: { cards?: number; label?: string }) {
  return (
    <View
      style={styles.cardWrap}
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      {Array.from({ length: cards }, (_, i) => (
        <Card key={i}>
          <Row style={{ gap: spacing.sm }}>
            <Skeleton width={40} height={40} rounded={999} />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <Skeleton width="45%" height={13} />
              <Skeleton width="25%" height={11} />
            </View>
          </Row>
          <Skeleton width="100%" height={15} style={{ marginTop: spacing.md }} />
          <Skeleton width="92%" height={15} style={{ marginTop: spacing.xs }} />
          <Row style={{ gap: spacing.md, marginTop: spacing.md }}>
            <Skeleton width={72} height={32} rounded={radius.md} />
            <Skeleton width={72} height={32} rounded={radius.md} />
          </Row>
        </Card>
      ))}
    </View>
  )
}

/** هيكل لوحة التحكم — ترويسة + شبكة KPI ‏2×2 + بطاقة رسم + بطاقة قائمة. */
export function DashboardSkeleton({ label = 'جارٍ تحميل لوحة التحكم…' }: { label?: string }) {
  return (
    <View
      style={styles.dashWrap}
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      <View style={{ gap: spacing.sm, paddingHorizontal: spacing.xs }}>
        <Skeleton width="35%" height={13} />
        <Skeleton width="45%" height={22} />
      </View>
      <Row style={{ gap: spacing.md, marginTop: spacing.lg }}>
        <View style={{ flex: 1 }}>
          <KpiSkeleton />
        </View>
        <View style={{ flex: 1 }}>
          <KpiSkeleton />
        </View>
      </Row>
      <Row style={{ gap: spacing.md, marginTop: spacing.md }}>
        <View style={{ flex: 1 }}>
          <KpiSkeleton />
        </View>
        <View style={{ flex: 1 }}>
          <KpiSkeleton />
        </View>
      </Row>
      <Card style={{ marginTop: spacing.lg }}>
        <Skeleton width="40%" height={17} />
        <Skeleton width="100%" height={72} rounded={radius.md} style={{ marginTop: spacing.md }} />
      </Card>
      <Card style={{ marginTop: spacing.lg }}>
        <Skeleton width="30%" height={17} />
        <View style={{ gap: spacing.md, marginTop: spacing.md }}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ gap: spacing.xs }}>
              <Skeleton width="50%" height={13} />
              <Skeleton width="80%" height={13} />
            </View>
          ))}
        </View>
      </Card>
    </View>
  )
}

function KpiSkeleton() {
  return (
    <Card>
      <Skeleton width="60%" height={11} />
      <Skeleton width="40%" height={26} style={{ marginTop: spacing.sm }} />
      <Skeleton width="50%" height={11} style={{ marginTop: spacing.sm }} />
    </Card>
  )
}

const styles = StyleSheet.create({
  listWrap: { paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  cardWrap: { padding: spacing.lg, gap: spacing.md },
  dashWrap: { padding: spacing.lg, paddingBottom: spacing.xxxl * 2 },
})
