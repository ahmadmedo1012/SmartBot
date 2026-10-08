/**
 * SmartBot Mobile — حارس «تقليل الحركة» (reduce motion) الموحد.
 *
 * r131 (F11): كان كل من login/register يقرأ AccessibilityInfo يدويًا،
 * والضغط الجديد (PressableScale) والهياكل العظمية (Skeleton) تحتاج نفس
 * القراءة. هذا هو الحارس الوحيد: قراءة أولية + اشتراك حي (الإعداد قد
 * يتغير أثناء الجلسة) — نفس نمط SM-mobile (components/motion).
 *
 * الدلالة = حزام RM في الويب (globals.css:967): كل الحركات اللانهائية
 * (دوران الـspinner، مسح الـskeleton) تتوقف، والحركات المكانية (تحجيم
 * الضغط) تتحول إلى تغذية راجعة بالشفافية فقط.
 */
import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    let mounted = true
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setReduced(v)
      })
      .catch(() => {
        /* بعض البيئات ترفض — الافتراضي إيقاف */
      })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      if (mounted) setReduced(v)
    })
    return () => {
      mounted = false
      sub.remove()
    }
  }, [])

  return reduced
}
