/**
 * SmartBot Mobile — Design tokens (Madarek).
 *
 * القيم منقولة حرفيًا من نظام تصميم مدارك (tokens.css) عبر نسخة الويب
 * المحوّلة (fb_dashboard/frontend/src/app/globals.css — SoT الشقيقة):
 * ليلي نيلي #070B16 مع ذهبي #E9B44C (dark الافتراضي، مطابق للويب)،
 * ونهاري كريمي #FBFAF9 مع نحاسي #B57438. الخط: IBM Plex Sans Arabic.
 *
 * سلّم الألوان dark (أرض < بطاقة < سطح < تعبئة):
 *   #070B16 < #0D1428 < #121A36 < #182142 — نفس سلم Madarek neutral.
 * حالة النصوص اللاتينية داخل الحروف الذهبية: espresso #05070F
 * (Madarek --accent-fg، 10.63:1 على الذهب) — وليس الأبيض.
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
  /** أرضيات الحالة العميقة المعتمة (opaque) — Madarek --c-*-bg */
  successSoft: string
  warningSoft: string
  infoSoft: string
  destructiveSoft: string
  /** حجاب النوافذ المنبثقة — Madarek --overlay (داكن 0.62 / فاتح 0.40) */
  scrim: string
  flame: string
  ember: string
  saffron: string
  ash: string
}

export const dark: ThemeColors = {
  background: '#070B16',
  surface: '#121A36',
  card: '#0D1428',
  foreground: '#F2EFE6',
  muted: '#182142',
  mutedFg: '#C3C8DC',
  primary: '#E9B44C',
  primaryFg: '#05070F',
  accentFg: '#E9B44C',
  border: '#1B2444',
  input: '#7A83A0',
  placeholder: '#8E97B8',
  success: '#7FD39A',
  warning: '#ECC97D',
  info: '#8FBBF2',
  destructive: '#F0938F',
  successSoft: '#0F241C',
  warningSoft: '#2C2410',
  infoSoft: '#14213A',
  destructiveSoft: '#2C1620',
  scrim: 'rgba(15, 15, 15, 0.62)',
  flame: '#E9B44C',
  ember: '#C9962F',
  saffron: '#E9B44C',
  ash: '#C3C8DC',
}

export const light: ThemeColors = {
  background: '#FBFAF9',
  surface: '#F7F6F3',
  card: '#FFFFFF',
  foreground: '#191918',
  muted: '#F1EFEC',
  mutedFg: '#4F4D48',
  primary: '#B57438',
  primaryFg: '#1A0F06',
  accentFg: '#5C3416',
  border: '#E9E7E2',
  input: '#6E6C65',
  placeholder: '#6E6C65',
  success: '#4FA66D',
  warning: '#D6A330',
  info: '#5C8FCE',
  destructive: '#DD6E78',
  successSoft: '#DCF1E2',
  warningSoft: '#FCF1CD',
  infoSoft: '#DDEBF7',
  destructiveSoft: '#FCE0E2',
  scrim: 'rgba(15, 15, 15, 0.40)',
  flame: '#B57438',
  ember: '#B57438',
  saffron: '#D6A330',
  ash: '#4F4D48',
}

/** Radius scale من Madarek: 6/8/10/12/16/20/28 (--r-xs..--r-3xl) */
export const radius = { xs: 6, sm: 8, md: 10, lg: 12, xl: 16, xxl: 20, xxxl: 28 } as const

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 36 } as const

/** سلّم الحركة من Madarek (motion ladder): micro 80 → cinema 720 */
export const motion = {
  micro: 80,
  fast: 160,
  base: 240,
  slow: 380,
  slower: 520,
  cinema: 720,
} as const

/** مسافات اللمس ≥44px (HIG/Material) */
export const TOUCH_TARGET = 48
