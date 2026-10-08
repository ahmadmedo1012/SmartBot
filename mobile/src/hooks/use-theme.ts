/**
 * SmartBot Mobile — الثيم الفعّال (dark افتراضي كما الويب).
 */
import { useColorScheme } from '@/hooks/use-color-scheme'
import { dark, light, type ThemeColors } from '@/constants/theme'

export interface AppTheme {
  colors: ThemeColors
  isDark: boolean
  /** IBM Plex Sans Arabic 400 — نص المتن (نفس --font-sans في الويب) */
  fontBody: string
  /** IBM Plex Sans Arabic 700 — العناوين (r130/W1-H MB-1: كان 600 —
   *  الوزن القنيوي للعرض هو 700، مثل --font-display في الويب تمامًا) */
  fontHeading: string
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
  }
}
