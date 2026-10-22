/**
 * SmartBot Mobile — الثيم الفعّال (dark افتراضي كما الويب).
 *
 * colors.violet متاحة هنا لعلامات AI/الآلة (نقاط التفكير/LED/النبض الحي)
 * — محجوزة لذلك فقط، ليست لونًا تفاعليًا (راجع theme.ts §VIOLET).
 */
import { useColorScheme } from '@/hooks/use-color-scheme'
import { dark, light, type ThemeColors } from '@/constants/theme'

export interface AppTheme {
  colors: ThemeColors
  isDark: boolean
  /** IBM Plex Sans Arabic 400 — نص المتن (نفس --font-sans في الويب) */
  fontBody: string
  /** IBM Plex Sans Arabic 700 — العناوين العربية (r130/W1-H MB-1: كان 600 —
   *  الوزن القنيوي للعرض هو 700، مثل --font-display في الويب تمامًا) */
  fontHeading: string
  /** Space Grotesk 700 — العناوين اللاتينية: النصف الأول من سلسلة الويب
   *  (--font-display: Space Grotesk → Plex Arabic). RN لا يدعم سلاسل
   *  خطوط لكل محرف، فتُحسم السلسلة على مستوى النص في themed-text:
   *  نص بلا حرف عربي → Grotesk، وإلا Plex Arabic. */
  fontHeadingLatin: string
  /** IBM Plex Mono 400 — الأختام الجدولية (variant «mono») */
  fontMono: string
  /** IBM Plex Mono 500 — ختم القيمة في MonoStamp (درجة الحضور) */
  fontMonoMedium: string
}

export function useTheme(): AppTheme {
  const scheme = useColorScheme()
  // الويب يعتبر dark هو الافتراضي (:root = dark) — نفس القرار هنا
  const isDark = scheme !== 'light'
  return {
    colors: isDark ? dark : light,
    isDark,
    fontBody: 'IBMPlexSansArabic_400Regular',
    fontHeading: 'IBMPlexSansArabic_700Bold',
    fontHeadingLatin: 'SpaceGrotesk_700Bold',
    fontMono: 'IBMPlexMono_400Regular',
    fontMonoMedium: 'IBMPlexMono_500Medium',
  }
}
