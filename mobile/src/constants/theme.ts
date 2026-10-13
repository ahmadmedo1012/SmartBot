/**
 * SmartBot Mobile — Design tokens (Circuit Petrol).
 *
 * القيم منقولة حرفيًا من نظام تصميم الويب (fb_dashboard/frontend/src/app/
 * globals.css — SoT الشقيقة، سلسلة #071A21): ليلي بترولي #071A21 مع
 * أزرق-أخضر إشاري #17C3A4 (dark الافتراضي، مطابق للويب)، ونهاري كريمي
 * مخضرّ #EDF6F3 مع أزرق-أخضر عميق #0C7563. الخط: IBM Plex Sans Arabic
 * متنًا + Space Grotesk عناوين لاتينية (انظر themed-text) وIBM Plex Mono
 * للأختام الزمنية.
 *
 * سلّم الألوان dark (أرض < بطاقة < سطح < خُطّة):
 *   #071A21 < #0D2830 < #123039 — نفس سلم الويب البترولي
 *   (الخُطّة/hairline #1D4450 = border).
 * النص على التعبئة الإشارية: espresso #04231B (--accent-fg في الويب،
 * ≈7.4:1 على الأزرق-أخضر) — وليس الأبيض.
 * LIME #C6F24E محجوز لعلامات AI/الآلة فقط (dark) / #5A7A16 (light) —
 * لا يُستخدم لونًا تفاعليًا أبدًا.
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
  /** حجاب النوافذ المنبثقة — الويب --overlay (داكن 0.62 / فاتح 0.40) */
  scrim: string
  flame: string
  ember: string
  saffron: string
  ash: string
  /** درجة الضغط للأساسي (--accent-strong في الويب: hover #1FD6B4 ·
   *  pressed #12A386 — الجوال يستهلك درجة الضغط). */
  primaryPressed: string
  /** LIME — علامات AI/الآلة فقط (thinking dots/LED/نبض حي).
   *  dark #C6F24E (13.8:1 على الأرض البترولية) · light #5A7A16 (AA
   *  على الكريمي). محجوز — ليس لونًا تفاعليًا أبدًا. */
  lime: string
}

export const dark: ThemeColors = {
  background: '#071A21',
  surface: '#123039',
  card: '#0D2830',
  foreground: '#E9F5F0',
  /* الويب dark --muted = surface-2 #123039 (نفس الدرج). */
  muted: '#123039',
  mutedFg: '#9FC3BC',
  primary: '#17C3A4',
  primaryFg: '#04231B',
  accentFg: '#17C3A4',
  border: '#1D4450',
  input: '#64949E',
  placeholder: '#6E938E',
  success: '#45D6A0',
  warning: '#F5C46B',
  info: '#7CC4DE',
  destructive: '#F2919B',
  successSoft: '#0C2E24',
  warningSoft: '#332708',
  infoSoft: '#10303B',
  destructiveSoft: '#331821',
  scrim: 'rgba(15, 15, 15, 0.62)',
  flame: '#17C3A4',
  ember: '#12A386',
  saffron: '#17C3A4',
  ash: '#9FC3BC',
  primaryPressed: '#12A386',
  lime: '#C6F24E',
}

export const light: ThemeColors = {
  background: '#EDF6F3',
  surface: '#E4F0ED',
  card: '#FFFFFF',
  foreground: '#0A242E',
  muted: '#DAEAE6',
  mutedFg: '#3A5450',
  primary: '#0C7563',
  primaryFg: '#F2FDFA',
  accentFg: '#085B4C',
  border: '#CCE0DB',
  input: '#51736E',
  placeholder: '#51736E',
  success: '#2E9E6F',
  warning: '#C29217',
  info: '#3E96BC',
  destructive: '#D95F6C',
  successSoft: '#D9F3E6',
  warningSoft: '#FBF1CF',
  infoSoft: '#DDF0F7',
  destructiveSoft: '#FCE3E6',
  scrim: 'rgba(15, 15, 15, 0.40)',
  flame: '#0C7563',
  ember: '#095C4C',
  saffron: '#0B6B5A',
  ash: '#3A5450',
  primaryPressed: '#085B4C',
  lime: '#5A7A16',
}

/** Radius scale (Madarek): 6/8/10/12/16/20/28 (--r-xs..--r-3xl) */
export const radius = { xs: 6, sm: 8, md: 10, lg: 12, xl: 16, xxl: 20, xxxl: 28 } as const

/** سلّم المسافات من --sp (4px ladder: …20/24/32/40). */
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const

/** العائلات التسع (الويب globals.css — البلوك البترولي dark/.light):
 *  أرضية/حبر/غامق لكل عائلة، نفس قيم الويب حرفيًا.
 *  القاعدة: الخلفية من -bg والنص من -deep (AA)؛ -ink للحشو والرسوم
 *  فقط — لا تُخترع عائلة عاشرة أبدًا (MASTER §2.4).
 *  copper = العائلة الإشارية في dark (bg #0A2E28 = accent-soft). */
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
  peach:    { bg: '#2A1E1A', ink: '#F2A887', deep: '#F8D9C8' },
  mint:     { bg: '#0C2E24', ink: '#45D6A0', deep: '#C9EDDB' },
  lavender: { bg: '#1E2740', ink: '#9FB2E8', deep: '#D8DEF8' },
  sky:      { bg: '#10303B', ink: '#7CC4DE', deep: '#CDE9F3' },
  yellow:   { bg: '#332708', ink: '#F5C46B', deep: '#F8E7B8' },
  rose:     { bg: '#331821', ink: '#F2919B', deep: '#FAD3D7' },
  sand:     { bg: '#1B3230', ink: '#B9D4C8', deep: '#DDEBE1' },
  grey:     { bg: '#14262E', ink: '#A3B8BF', deep: '#D8E5E8' },
  copper:   { bg: '#0A2E28', ink: '#17C3A4', deep: '#A9F0DF' },
}

const LIGHT_FAMILIES: Record<FamilyName, PastelFamily> = {
  peach:    { bg: '#FFEDE2', ink: '#DB7B57', deep: '#6B2D1A' },
  mint:     { bg: '#D9F3E6', ink: '#2E9E6F', deep: '#0F4A33' },
  lavender: { bg: '#E8ECF9', ink: '#7086D6', deep: '#2D3A7A' },
  sky:      { bg: '#DDF0F7', ink: '#3E96BC', deep: '#0F3D52' },
  yellow:   { bg: '#FBF1CF', ink: '#C29217', deep: '#6B4C0B' },
  rose:     { bg: '#FCE3E6', ink: '#D95F6C', deep: '#6B2128' },
  sand:     { bg: '#EBF2EC', ink: '#7FA089', deep: '#33523F' },
  grey:     { bg: '#EAF0F1', ink: '#5F7377', deep: '#2A3A3E' },
  copper:   { bg: '#D7F3EA', ink: '#0E8A75', deep: '#0A4A3C' },
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
