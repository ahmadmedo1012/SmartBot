/**
 * SmartBot Mobile — Design tokens (Machine Instrument «آلة القياس»).
 *
 * القيم منقولة حرفيًا من نظام تصميم الويب (fb_dashboard/frontend/src/app/
 * globals.css + design-system/smartbot-phase17/ART-DIRECTION.md — SoT
 * الشقيقة): ليلي #050506 مع صوت آلة سماوي #56E2F2 (dark الافتراضي،
 * مطابق للويب)، ونهاري بورسلين #F2F2F0 مع سماوي عميق #0E7A8A. الخط:
 * IBM Plex Sans Arabic متنًا + Space Grotesk عناوين لاتينية (انظر
 * themed-text) وIBM Plex Mono للأختام الزمنية.
 *
 * سلّم الألوان dark (أرض < بطاقة < سطح < خُطّة):
 *   #050506 < #0A0B0E < #101115 — نفس سلم الويب
 *   (الخُطّة/hairline #292A30 = border · القوية #41434B).
 * النص على التعبئة الإشارية: #05171B (--accent-fg في الويب، ≈7.4:1 على
 * السماوي) — وليس الأبيض.
 * VIOLET #9380FF محجوز لعلامات AI/الآلة فقط (dark) / #6B54E0 (light) —
 * لا يُستخدم لونًا تفاعليًا أبدًا. (الويب يسمّي رمزه --c-lime-* تاريخيًا
 * لكن قيمته بنفسجية — هنا الاسم صادق.)
 * AMBER #FF9A69 سجل الإنسان/التسليم (dark) / #C25E33 بورسلين (light).
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
  /** أرضيات الحالة العميقة المعتمة (opaque) — الويب --c-*-bg */
  successSoft: string
  warningSoft: string
  infoSoft: string
  destructiveSoft: string
  /** حجاب النوافذ المنبثقة — الويب --overlay (داكن 0.66 / فاتح 0.40) */
  scrim: string
  flame: string
  ember: string
  saffron: string
  ash: string
  /** درجة الضغط للأساسي (--accent-strong في الويب: hover #7CEFF9 ·
   *  strong #2AC5D8 — الجوال يستهلك درجة الضغط). */
  primaryPressed: string
  /** VIOLET — علامات AI/الآلة فقط (thinking dots/LED/نبض حي).
   *  dark #9380FF (13.8:1 على الأرض الداكنة) · light #6B54E0 (AA
   *  على البورسلين). محجوز — ليس لونًا تفاعليًا أبدًا. (الويب يحمله
   *  تاريخيًا على اسم --c-lime-*؛ القيمة بنفسجية — الاسم هنا صادق.) */
  violet: string
  /** AMBER — سجل الإنسان/التسليم (الويب --sb-accent-amber، المسرح
   *  Phase 17): dark #FF9A69 · light #C25E33 (porcelain day). */
  amber: string
}

export const dark: ThemeColors = {
  background: '#050506',
  surface: '#101115',
  card: '#0A0B0E',
  foreground: '#F4F4F6',
  /* الويب dark --muted = surface-2 #101115 (نفس الدرج). */
  muted: '#101115',
  mutedFg: '#A7A8B0',
  primary: '#56E2F2',
  primaryFg: '#05171B',
  accentFg: '#56E2F2',
  border: '#292A30',
  input: '#898B90',
  placeholder: '#777983',
  success: '#5FE3A1',
  warning: '#F8CF6E',
  info: '#8FC9D8',
  destructive: '#F2919B',
  successSoft: '#0D241B',
  warningSoft: '#332A10',
  infoSoft: '#102530',
  destructiveSoft: '#331821',
  scrim: 'rgba(5, 5, 6, 0.66)',
  flame: '#56E2F2',
  ember: '#2AC5D8',
  saffron: '#56E2F2',
  ash: '#A7A8B0',
  primaryPressed: '#2AC5D8',
  violet: '#9380FF',
  amber: '#FF9A69',
}

export const light: ThemeColors = {
  background: '#F2F2F0',
  surface: '#E9E9E6',
  card: '#FFFFFF',
  foreground: '#101115',
  muted: '#E1E1DE',
  mutedFg: '#41434B',
  primary: '#0E7A8A',
  primaryFg: '#F2F2F0',
  accentFg: '#0B5A68',
  border: '#D5D5D2',
  input: '#55585F',
  placeholder: '#55585F',
  success: '#2E9E6F',
  warning: '#B08210',
  info: '#3E96BC',
  destructive: '#D95F6C',
  successSoft: '#D9F3E6',
  warningSoft: '#FBF1CF',
  infoSoft: '#DDF0F7',
  destructiveSoft: '#FCE3E6',
  scrim: 'rgba(15, 15, 15, 0.40)',
  flame: '#0E7A8A',
  ember: '#0A6A78',
  saffron: '#0D7488',
  ash: '#41434B',
  primaryPressed: '#0B5A68',
  violet: '#6B54E0',
  amber: '#C25E33',
}

/** Radius scale (Madarek): 6/8/10/12/16/20/28 (--r-xs..--r-3xl) */
export const radius = { xs: 6, sm: 8, md: 10, lg: 12, xl: 16, xxl: 20, xxxl: 28 } as const

/** سلّم المسافات من --sp (4px ladder: …20/24/32/40). */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const

/** العائلات التسع (الويب globals.css — بلوك dark/.light الحالي):
 *  أرضية/حبر/غامق لكل عائلة، نفس قيم الويب حرفيًا.
 *  القاعدة: الخلفية من -bg والنص من -deep (AA)؛ -ink للحشو والرسوم
 *  فقط — لا تُخترع عائلة عاشرة أبدًا (MASTER §2.4).
 *  copper = العائلة الإشارية في dark (bg #0D1E24 = accent-soft). */
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
  peach:    { bg: '#2A1F1C', ink: '#FFB08C', deep: '#FFE2D1' },
  mint:     { bg: '#0D241B', ink: '#5FE3A1', deep: '#CFEDE1' },
  lavender: { bg: '#1E2233', ink: '#A9B4F0', deep: '#D8DDF9' },
  sky:      { bg: '#102530', ink: '#8FC9D8', deep: '#CFE8F0' },
  yellow:   { bg: '#332A10', ink: '#F8CF6E', deep: '#F9E6BC' },
  rose:     { bg: '#331821', ink: '#F2919B', deep: '#FAD3D7' },
  sand:     { bg: '#1A1D1C', ink: '#C4C9C4', deep: '#DEE3E0' },
  grey:     { bg: '#141519', ink: '#A7A8B0', deep: '#D6D7DB' },
  copper:   { bg: '#0D1E24', ink: '#56E2F2', deep: '#C9F6FC' },
}

const LIGHT_FAMILIES: Record<FamilyName, PastelFamily> = {
  peach:    { bg: '#FFEDE3', ink: '#E0825C', deep: '#74301C' },
  mint:     { bg: '#D9F3E6', ink: '#2E9E6F', deep: '#0F4A33' },
  lavender: { bg: '#E9E8F7', ink: '#7B86DC', deep: '#32387E' },
  sky:      { bg: '#DDF0F7', ink: '#3E96BC', deep: '#0F3D52' },
  yellow:   { bg: '#FBF1CF', ink: '#C29217', deep: '#6B4C0B' },
  rose:     { bg: '#FCE3E6', ink: '#D95F6C', deep: '#6B2128' },
  sand:     { bg: '#EDEFEA', ink: '#849489', deep: '#385241' },
  grey:     { bg: '#EAEEF0', ink: '#62696C', deep: '#2E3A40' },
  copper:   { bg: '#DCF1F4', ink: '#12748A', deep: '#0C4753' },
}

/** عائلات الأقسام حسب الوضع — استهلاك:
 *  `const f = families[isDark ? 'dark' : 'light'].mint` */
export const families: Record<'dark' | 'light', Record<FamilyName, PastelFamily>> = {
  dark: DARK_FAMILIES,
  light: LIGHT_FAMILIES,
}

/** سلّم الحركة (motion ladder): micro 80 → cinema 720 */
export const motion = {
  micro: 80,
  fast: 160,
  base: 240,
  slow: 380,
  slower: 520,
  cinema: 720,
  /** حلقة الدوران القانونية — 700ms خطي (--motion-duration-stat). */
  stat: 700,
  /** مسح الهيكل العظمي (skeleton shimmer) — 1200ms خطي. */
  skeleton: 1200,
} as const

/** سجل الضغط القانوني: الضغط = تحجيم لا شفافية: زر 0.97 · بطاقة/صف
 *  0.99 · شريط سفلي 0.93، دخول 80ms (micro) وخروج 160ms (fast) على
 *  منحنى التباطؤ cubic-bezier(0.16,1,0.3,1). */
export const press = {
  /** أدوات التحكم (أزرار/حبوب/روابط) — --press-scale 0.97 */
  button: 0.97,
  /** البطاقات والصفوف القابلة للضغط — 0.99 */
  card: 0.99,
  /** الشريط السفلي (bottom-nav) — أعمق درجة */
  nav: 0.93,
  /** دخول الضغط بالمللي (micro 80) والخروج (fast 160) */
  inMs: motion.micro,
  outMs: motion.fast,
} as const

/** نقاط منحنى التباطؤ --ease-out — يُستهلك Easing.bezier(...EASE_OUT_POINTS). */
export const EASE_OUT_POINTS = [0.16, 1, 0.3, 1] as const

/** مسافات اللمس ≥44px (HIG/Material) */
export const TOUCH_TARGET = 48
