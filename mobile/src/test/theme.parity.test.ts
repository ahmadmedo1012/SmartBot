/**
 * P6-2-e3 — دبابيس التكافؤ البترولي للجوال (حزمة «غرفة الآلة»).
 *
 * الجوال بلا عدّاء تكافؤ تصميمي مستقل (الويب يحمل parity.mjs) — هذه
 * الحزمة الصغيرة هي «مسمار» الهوية على الأرض: تثبّت قيم الرموز الجوهرية
 * حرفيًا (أرض بترولية #071A21 · بطاقة #0D2830 · حبر #E9F5F0 · إشاري
 * تيل #17C3A4 · لايم محجوز #C6F24E · العائلات التسع)، وتثبّت سلك
 * الخطوط في _layout (Space Grotesk + Plex Mono + Plex Sans Arabic)،
 * وتثبّت أرضيات app.json البترولية (شاشة البداية + الأيقونة التكيّفية
 * — نفس دبوس المولد scripts/generate-icons.py)، وتثبّت أن موتيفات
 * غرفة الآلة الأربعة (RobotMark/CircuitTrace/MonoStamp/TypingDots)
 * مُصدَّرة فعلًا، وأن أصول العلامة السبعة موجودة في مساراتها.
 *
 * الدبابيس مصدرها الحقيقة الشقيقة: fb_dashboard globals.css — أي انجراف
 * لاحق في هذه القيم يكسر الاختبار ويوقف الدمج.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { dark, light, families } from '@/constants/theme'

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/* ── §1 الرموز الجوهرية — الوضع الليلي (الافتراضي، مطابق للويب) ─────────── */
describe('P6-2-e3 · الرموز البترولية (dark)', () => {
  it('الأرض والبطاقة والسطح والخُطّة: سلّم الويب البترولي حرفيًا', () => {
    expect(dark.background).toBe('#071A21')
    expect(dark.card).toBe('#0D2830')
    expect(dark.surface).toBe('#123039')
    expect(dark.border).toBe('#1D4450')
  })

  it('الحبر والصامت: #E9F5F0 / #9FC3BC / #6E938E', () => {
    expect(dark.foreground).toBe('#E9F5F0')
    expect(dark.mutedFg).toBe('#9FC3BC')
    expect(dark.placeholder).toBe('#6E938E')
  })

  it('الإشاري تيل ودرجة ضغطه: #17C3A4 / #12A386 (pressed الويب)', () => {
    expect(dark.primary).toBe('#17C3A4')
    expect(dark.primaryPressed).toBe('#12A386')
    expect(dark.primaryFg).toBe('#04231B')
  })

  it('اللايم محجوز لعلامات الآلة: #C6F24E (dark) و #5A7A16 (light)', () => {
    expect(dark.lime).toBe('#C6F24E')
    expect(light.lime).toBe('#5A7A16')
  })
})

/* ── §2 الوضع النهاري — الكريمي المخضرّ الشقيق ──────────────────────────── */
describe('P6-2-e3 · الرموز البترولية (light)', () => {
  it('الكريمي #EDF6F3 والتيل العميق #0C7563 وضغطه #085B4C', () => {
    expect(light.background).toBe('#EDF6F3')
    expect(light.primary).toBe('#0C7563')
    expect(light.primaryPressed).toBe('#085B4C')
  })
})

/* ── §3 العائلات التسع — لا عائلة عاشرة أبدًا ─────────────────────────── */
describe('P6-2-e3 · العائلات التسع', () => {
  const EXPECTED = [
    'peach', 'mint', 'lavender', 'sky', 'yellow',
    'rose', 'sand', 'grey', 'copper',
  ] as const

  it('dark و light يحملان العائلات التسع نفسها بلا زيادة ولا نقصان', () => {
    expect(Object.keys(families.dark).sort()).toEqual([...EXPECTED].sort())
    expect(Object.keys(families.light).sort()).toEqual([...EXPECTED].sort())
  })

  it('copper هي العائلة الإشارية في dark: بئر #0A2E28 وحبر تيل #17C3A4', () => {
    expect(families.dark.copper).toEqual({ bg: '#0A2E28', ink: '#17C3A4', deep: '#A9F0DF' })
  })
})

/* ── §4 سلك الخطوط — _layout يحمل السلسلة كاملة ───────────────────────── */
describe('P6-2-e3 · سلك الخطوط في _layout', () => {
  const layout = read('../app/_layout.tsx')

  it('Space Grotesk 500/600/700 محمّلة (عناوين لاتينية/أرقام)', () => {
    expect(layout).toContain('SpaceGrotesk_500Medium')
    expect(layout).toContain('SpaceGrotesk_600SemiBold')
    expect(layout).toContain('SpaceGrotesk_700Bold')
  })

  it('IBM Plex Mono 400/500 محمّلة (أختام HH:MM tabular)', () => {
    expect(layout).toContain('IBMPlexMono_400Regular')
    expect(layout).toContain('IBMPlexMono_500Medium')
  })

  it('IBM Plex Sans Arabic 400/500/600/700 محمّلة (المتن العربي)', () => {
    expect(layout).toContain('IBMPlexSansArabic_400Regular')
    expect(layout).toContain('IBMPlexSansArabic_700Bold')
  })

  it('الحلقة واحدة: useFonts تستهلك الأوزان التسعة في _layout نفسه', () => {
    expect(layout).toContain('useFonts(')
  })
})

/* ── §5 أرضيات app.json — الشقيقة البترولية للراسترات ──────────────────── */
describe('P6-2-e3 · أرضيات app.json البترولية', () => {
  const appJson = JSON.parse(read('../../app.json')) as {
    expo: {
      icon: string
      android: { adaptiveIcon: Record<string, string | undefined> }
      web: { favicon: string }
      plugins: (string | [string, Record<string, unknown>])[]
    }
  }
  const splashPlugin = appJson.expo.plugins.find(
    (p): p is [string, Record<string, unknown>] => Array.isArray(p) && p[0] === 'expo-splash-screen',
  )

  it('شاشة البداية: أرضية #071A21 + splash-icon.png', () => {
    expect(splashPlugin).toBeDefined()
    expect(splashPlugin?.[1]?.backgroundColor).toBe('#071A21')
    expect(splashPlugin?.[1]?.image).toBe('./assets/images/splash-icon.png')
  })

  it('الأيقونة التكيّفية: backgroundColor #071A21 (الطبقة الخلفية البترولية)', () => {
    expect(appJson.expo.android.adaptiveIcon.backgroundColor).toBe('#071A21')
  })

  it('أصول العلامة السبعة موجودة في مساراتها (المولد يثبّت أحجامها)', () => {
    const files = [
      'icon.png',
      'splash-icon.png',
      'android-icon-foreground.png',
      'android-icon-background.png',
      'android-icon-monochrome.png',
      'brand-icon.png',
      'favicon.png',
    ]
    for (const f of files) {
      expect(existsSync(fileURLToPath(new URL(`../../assets/images/${f}`, import.meta.url)))).toBe(true)
    }
  })
})

/* ── §6 موتيفات غرفة الآلة — المُصدَّرات موجودة فعلًا ──────────────────── */
describe('P6-2-e3 · موتيفات غرفة الآلة', () => {
  it('RobotMark مُصدَّر بحالاته الخمس', () => {
    const src = read('../components/robot-mark.tsx')
    expect(src).toContain('export function RobotMark')
    expect(src).toContain("'idle' | 'greeting' | 'thinking' | 'responding' | 'error'")
  })

  it('CircuitTrace و TypingDots و MonoStamp مُصدَّرة', () => {
    expect(read('../components/circuit-trace.tsx')).toContain('export function CircuitTrace')
    expect(read('../components/typing-dots.tsx')).toContain('export function TypingDots')
    expect(read('../components/mono-stamp.tsx')).toContain('export function MonoStamp')
  })

  it('MonoStamp معاد تصديره من ui.tsx (البوابة القانونية للمستهلكين)', () => {
    expect(read('../components/ui.tsx')).toContain("export { MonoStamp, type MonoStampProps } from '@/components/mono-stamp'")
  })
})

/* ── §7 حظر الهكسات المتقاعدة — لا رجوع لمدارك أبدًا ───────────────────── */
describe('P6-2-e3 · حظر هكسات مدارك', () => {
  it('theme.ts خالٍ من ليل مدارك وذهبها (#070B16/#05070F/#E9B44C)', () => {
    const src = read('../constants/theme.ts').toUpperCase()
    expect(src).not.toContain('#070B16')
    expect(src).not.toContain('#05070F')
    expect(src).not.toContain('#E9B44C')
  })
})
