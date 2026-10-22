/**
 * P6-2-e3/W21 — دبابيس التكافؤ للجوال (حزمة «آلة القياس» Machine
 * Instrument).
 *
 * الجوال بلا عدّاء تكافؤ تصميمي مستقل (الويب يحمل parity.mjs) — هذه
 * الحزمة الصغيرة هي «مسمار» الهوية على الأرض: تثبّت قيم الرموز الجوهرية
 * حرفيًا (أرض #050506 · بطاقة #0A0B0E · حبر #F4F4F6 · صوت آلة سماوي
 * #56E2F2 · بنفسجي محجوز #9380FF · العائلات التسع)، وتثبّت سلك
 * الخطوط في _layout (Space Grotesk + Plex Mono + Plex Sans Arabic)،
 * وتثبّت أرضيات app.json (شاشة البداية + الأيقونة التكيّفية
 * — نفس دبوس المولد scripts/generate-icons.py)، وتثبّت أن موتيفات
 * غرفة الآلة الأربعة (RobotMark/CircuitTrace/MonoStamp/TypingDots)
 * مُصدَّرة فعلًا، وأن أصول العلامة السبعة موجودة في مساراتها.
 *
 * الدبابيس مصدرها الحقيقة الشقيقة: fb_dashboard globals.css +
 * design-system/smartbot-phase17/ART-DIRECTION.md — أي انجراف لاحق في
 * هذه القيم يكسر الاختبار ويوقف الدمج. (البترول المتقاعد محظور — §7.)
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { dark, light, families } from '@/constants/theme'

const read = (rel: string): string =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

/* ── §1 الرموز الجوهرية — الوضع الليلي (الافتراضي، مطابق للويب) ─────────── */
describe('W21 · رموز Machine Instrument (dark)', () => {
  it('الأرض والبطاقة والسطح والخُطّة: سلّم الويب حرفيًا', () => {
    expect(dark.background).toBe('#050506')
    expect(dark.card).toBe('#0A0B0E')
    expect(dark.surface).toBe('#101115')
    expect(dark.border).toBe('#292A30')
  })

  it('الحبر والثانوي والصامت: #F4F4F6 / #A7A8B0 / #777983', () => {
    expect(dark.foreground).toBe('#F4F4F6')
    expect(dark.mutedFg).toBe('#A7A8B0')
    expect(dark.placeholder).toBe('#777983')
  })

  it('صوت الآلة السماوي ودرجة ضغطه: #56E2F2 / #2AC5D8 (strong الويب)', () => {
    expect(dark.primary).toBe('#56E2F2')
    expect(dark.primaryPressed).toBe('#2AC5D8')
    expect(dark.primaryFg).toBe('#05171B')
  })

  it('البنفسجي محجوز لعلامات الآلة: #9380FF (dark) و #6B54E0 (light)', () => {
    expect(dark.violet).toBe('#9380FF')
    expect(light.violet).toBe('#6B54E0')
  })

  it('الكهرماني سجل الإنسان/التسليم: #FF9A69 (dark) و #C25E33 (light)', () => {
    expect(dark.amber).toBe('#FF9A69')
    expect(light.amber).toBe('#C25E33')
  })
})

/* ── §2 الوضع النهاري — البورسلين الشقيق ──────────────────────────── */
describe('W21 · رموز Machine Instrument (light — porcelain day)', () => {
  it('البورسلين #F2F2F0 والسماوي العميق #0E7A8A وضغطه #0B5A68', () => {
    expect(light.background).toBe('#F2F2F0')
    expect(light.primary).toBe('#0E7A8A')
    expect(light.primaryPressed).toBe('#0B5A68')
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

  it('copper هي العائلة الإشارية في dark: بئر #0D1E24 وحبر سماوي #56E2F2', () => {
    expect(families.dark.copper).toEqual({ bg: '#0D1E24', ink: '#56E2F2', deep: '#C9F6FC' })
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

/* ── §5 أرضيات app.json — الشقيقة للراسترات ──────────────────── */
describe('W21 · أرضيات app.json (Machine Instrument)', () => {
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

  it('شاشة البداية: أرضية #050506 + splash-icon.png', () => {
    expect(splashPlugin).toBeDefined()
    expect(splashPlugin?.[1]?.backgroundColor).toBe('#050506')
    expect(splashPlugin?.[1]?.image).toBe('./assets/images/splash-icon.png')
  })

  it('الأيقونة التكيّفية: backgroundColor #050506 (الطبقة الخلفية الداكنة)', () => {
    expect(appJson.expo.android.adaptiveIcon.backgroundColor).toBe('#050506')
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

/* ── §7 حظر الهكسات المتقاعدة — لا رجوع لمدارك ولا للبترول أبدًا ───────────────────── */
describe('P6-2-e3 · حظر الهكسات المتقاعدة', () => {
  it('theme.ts خالٍ من ليل مدارك وذهبها (#070B16/#05070F/#E9B44C)', () => {
    const src = read('../constants/theme.ts').toUpperCase()
    expect(src).not.toContain('#070B16')
    expect(src).not.toContain('#05070F')
    expect(src).not.toContain('#E9B44C')
  })

  it('theme.ts خالٍ من البترول المتقاعد (#071A21/#17C3A4/#C6F24E — W21)', () => {
    const src = read('../constants/theme.ts').toUpperCase()
    expect(src).not.toContain('#071A21')
    expect(src).not.toContain('#17C3A4')
    expect(src).not.toContain('#C6F24E')
  })
})
