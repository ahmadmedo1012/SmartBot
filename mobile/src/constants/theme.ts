/**
 * SmartBot Mobile — Design tokens.
 *
 * القيم محوّلة رياضيًا من نظام تصميم الويب (globals.css — oklch) إلى sRGB hex
 * عبر سكربت التحويل؛ الهوية البصرية (البرتقالي الناري + الأسود الدافئ +
 * Cairo/Readex Pro) منقولة كما هي. dark هو الافتراضي (مطابق للويب).
 */

export interface ThemeColors {
  background: string
  surface: string
  card: string
  foreground: string
  muted: string
  mutedFg: string
  primary: string
  primaryFg: string
  accentFg: string
  border: string
  input: string
  placeholder: string
  success: string
  warning: string
  info: string
  destructive: string
  /** tints 14% على الداكن */
  successSoft: string
  warningSoft: string
  infoSoft: string
  destructiveSoft: string
  flame: string
  ember: string
  saffron: string
  ash: string
}

export const dark: ThemeColors = {
  background: '#010000',
  surface: '#0c0806',
  card: '#070503',
  foreground: '#ebe7e2',
  muted: '#15110d',
  mutedFg: '#8c857d',
  primary: '#c53c00',
  primaryFg: '#fafafa',
  accentFg: '#e15700',
  border: '#211c18',
  input: '#625c58',
  placeholder: '#a59d95',
  success: '#23a136',
  warning: '#d29000',
  info: '#348dcf',
  destructive: '#e62b34',
  successSoft: 'rgba(35, 161, 54, 0.14)',
  warningSoft: 'rgba(210, 144, 0, 0.14)',
  infoSoft: 'rgba(52, 141, 207, 0.14)',
  destructiveSoft: 'rgba(230, 43, 52, 0.14)',
  flame: '#c53c00',
  ember: '#952600',
  saffron: '#f0a646',
  ash: '#b3ada6',
}

export const light: ThemeColors = {
  background: '#fcfaf7',
  surface: '#e8e4df',
  card: '#fffffe',
  foreground: '#070504',
  muted: '#eeeae7',
  mutedFg: '#635c55',
  primary: '#910000',
  primaryFg: '#fafafa',
  accentFg: '#b32a00',
  border: '#d4d0cb',
  input: '#d4d0cb',
  placeholder: '#6f6860',
  success: '#007329',
  warning: '#9d5300',
  info: '#0062a1',
  destructive: '#d73337',
  successSoft: 'rgba(0, 115, 41, 0.12)',
  warningSoft: 'rgba(157, 83, 0, 0.12)',
  infoSoft: 'rgba(0, 98, 161, 0.12)',
  destructiveSoft: 'rgba(215, 51, 55, 0.12)',
  flame: '#901a00',
  ember: '#a24200',
  saffron: '#f0a646',
  ash: '#413c36',
}

/** Radius scale من الويب: 8/12/16/20/28/36 */
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 36 } as const

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 36 } as const

/** مسافات اللمس ≥44px (HIG/Material) */
export const TOUCH_TARGET = 48
