/**
 * SmartBot Mobile — الثيم الفعّال (dark افتراضي كما الويب).
 */
import { useColorScheme } from '@/hooks/use-color-scheme'
import { dark, light, type ThemeColors } from '@/constants/theme'

export interface AppTheme {
  colors: ThemeColors
  isDark: boolean
  /** Cairo — نص المتن (نفس --font-sans في الويب) */
  fontBody: string
  /** Readex Pro — العناوين (نفس --font-heading) */
  fontHeading: string
}

export function useTheme(): AppTheme {
  const scheme = useColorScheme()
  // الويب يعتبر dark هو الافتراضي (:root = dark) — نفس القرار هنا
  const isDark = scheme !== 'light'
  return {
    colors: isDark ? dark : light,
    isDark,
    fontBody: 'Cairo_400Regular',
    fontHeading: 'ReadexPro_600SemiBold',
  }
}
