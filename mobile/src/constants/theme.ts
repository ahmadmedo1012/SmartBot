/**
 * SmartBot Mobile — Design tokens (Madarek).
 *
 * القيم منقولة حرفيًا من نظام تصميم مدارك (tokens.css) عبر نسخة الويب
 * المحوّلة (fb_dashboard/frontend/src/app/globals.css — SoT الشقيقة):
 * ليلي نيلي #070B16 مع ذهبي #E9B44C (dark الافتراضي، مطابق للويب)،
 * ونهاري كريمي #FBFAF9 مع نحاسي #B57438. الخط: IBM Plex Sans Arabic.
 *
 * سلّم الألوان dark (أرض < بطاقة < سطح < تعبئة):
 *   #070B16 < #0D1428 < #121A36 — نفس سلم Madarek neutral.
 *   (r130/W1-E M-1: التعديل muted كان #182142 — سطح-3 — درجة أدكن من
 *   الويب؛ صار #121A36 = سطح-2 مطابق للويب.)
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
  /* r130 (W1-E M-1): #182142 (surface-3) → #121A36 (surface-2) — نفس
     درجة الويب/Madarek --muted dark. */
  muted: '#121A36',
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

/** سلّم المسافات من Madarek --sp (4px ladder: …20/24/32/40).
 *  r130 (W1-E M-2): كانت xxl: 28 و xxxl: 36 — درجتان مخترعتان لا
 *  وجود لهما في السلم المرجعي؛ صارتا 24/32 الكنسيتين. */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const

/** r130 (W1-E M-3) — العائلات التسع (Madarek tokens.css §1.4 dark /
 *  §2.4 light): أرضية/حبر/غامق لكل عائلة، نفس قيم الويب حرفيًا.
 *  القاعدة: الخلفية من -bg والنص من -deep (AA)؛ -ink للحشو والرسوم
 *  فقط — لا تُخترع عائلة عاشرة أبدًا (MASTER §2.4). */
export interface PastelFamily {
  /** الأرضية العميقة (dark) / الباستيل (light) */
  bg: string
  /** الحبر المشبع — للتعبئة والرسوم */
  ink: string
  /** النص الآمن على الأرضية */
  deep: string
}

export type FamilyName =
  | 'peach' | 'mint' | 'lavender' | 'sky' | 'yellow'
  | 'rose' | 'sand' | 'grey' | 'copper'

const DARK_FAMILIES: Record<FamilyName, PastelFamily> = {
  peach:    { bg: '#2C1A16', ink: '#F2A07F', deep: '#FCD9C4' },
  mint:     { bg: '#0F241C', ink: '#7FD39A', deep: '#C9EAD3' },
  lavender: { bg: '#221B3A', ink: '#B7A0F4', deep: '#DCD2F9' },
  sky:      { bg: '#14213A', ink: '#8FBBF2', deep: '#C9DCEE' },
  yellow:   { bg: '#2C2410', ink: '#ECC97D', deep: '#F8E5B5' },
  rose:     { bg: '#2C1620', ink: '#F0938F', deep: '#FACDD2' },
  sand:     { bg: '#241F14', ink: '#D9C18C', deep: '#EFE2C5' },
  grey:     { bg: '#161D33', ink: '#A9B0C8', deep: '#D5DAE8' },
  copper:   { bg: '#2C2312', ink: '#E9B44C', deep: '#F5D48A' },
}

const LIGHT_FAMILIES: Record<FamilyName, PastelFamily> = {
  peach:    { bg: '#FFE9DC', ink: '#E07856', deep: '#6B2D1A' },
  mint:     { bg: '#DCF1E2', ink: '#4FA66D', deep: '#1F4F30' },
  lavender: { bg: '#ECE6FA', ink: '#8A6FE0', deep: '#3F2D7A' },
  sky:      { bg: '#DDEBF7', ink: '#5C8FCE', deep: '#1F3D63' },
  yellow:   { bg: '#FCF1CD', ink: '#D6A330', deep: '#6B4C0B' },
  rose:     { bg: '#FCE0E2', ink: '#DD6E78', deep: '#6B2128' },
  sand:     { bg: '#F1ECDF', ink: '#B59868', deep: '#5A4623' },
  grey:     { bg: '#EFECE7', ink: '#6B665E', deep: '#2D2A24' },
  copper:   { bg: '#F4E4D2', ink: '#B57438', deep: '#5C3416' },
}

/** عائلات الأقسام حسب الوضع — استهلاك:
 *  `const f = families[isDark ? 'dark' : 'light'].mint` */
export const families: Record<'dark' | 'light', Record<FamilyName, PastelFamily>> = {
  dark: DARK_FAMILIES,
  light: LIGHT_FAMILIES,
}

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
