/**
 * SmartBot Mobile — نصوص بالهوية.
 * متن: IBM Plex Sans Arabic. العناوين: سلسلة الويب (--font-display)
 * Space Grotesk (لاتيني) → Plex Arabic (عربي) — RN لا يدعم سلسلة خطوط
 * لكل محرف، فتُحسم السلسلة على مستوى النص: نص العنوان بلا محرف عربي
 * يرسم Space Grotesk، وما فيه عربية يسقط على Plex Arabic (المتن
 * المختلط يُرسم Plex كاملًا — أقرب تقريب صادق لسلسلة CSS).
 * ختم «mono»: IBM Plex Mono حقيقي بأرقام جدولية (tnum).
 * قاعدة مدارك الباقية: العربية لا تُعطى letter-spacing أبدًا (0).
 */
import { StyleSheet, Text, type TextProps } from 'react-native'
import type { ReactNode } from 'react'
import { useTheme, type AppTheme } from '@/hooks/use-theme'

export type AppTextVariant =
  | 'display'
  | 'title'
  | 'heading'
  | 'subtitle'
  | 'body'
  | 'bodyBold'
  | 'small'
  | 'smallBold'
  | 'caption'
  | 'mono'

export interface AppTextProps extends TextProps {
  variant?: AppTextVariant
  color?: keyof AppTheme['colors']
  align?: 'left' | 'center' | 'right'
}

/** محارف الكتابة العربية (الأساسية + الممدودة + العروض التقديمية) */
const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

/** يحلّ أبناء النص إلى سلسلة نصية إن كانوا نصًا خالصًا (أو مصفوفة نصوص).
 *  أي عنصر React متداخل ⇒ null (لا نحزر — يسقط العنوان على Plex Arabic). */
function resolveText(node: ReactNode): string | null {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) {
    let out = ''
    for (const child of node) {
      const part = resolveText(child)
      if (part === null) return null
      out += part
    }
    return out
  }
  return null
}

export function AppText({ variant = 'body', color, align, style, children, ...rest }: AppTextProps) {
  const { colors, fontBody, fontHeading, fontHeadingLatin } = useTheme()
  const variantStyle = styles[variant]
  const isHeading = variant === 'display' || variant === 'title' || variant === 'heading'
  // سلسلة العناوين: لاتيني خالص → Space Grotesk · فيه عربية (أو متداخل
  // غير قابل للحل) → IBM Plex Sans Arabic.
  const text = isHeading ? resolveText(children) : null
  const headingFont = text !== null && !ARABIC_RE.test(text) ? fontHeadingLatin : fontHeading
  return (
    <Text
      style={[
        { color: colors[color ?? 'foreground'], textAlign: align },
        { fontFamily: isHeading ? headingFont : fontBody },
        variantStyle,
        style,
      ]}
      maxFontSizeMultiplier={1.6}
      {...rest}
    >
      {children}
    </Text>
  )
}

export function stylesFor() {
  return styles
}

const styles = StyleSheet.create({
  /* r130 (W1-H MB-2): on-rung scale — نفس درجات الويب حرفيًا:
   * display = h1 30/lh1.12 · title = h2 22/lh1.2 · heading = h3 18/lh1.3
   * (ووزن العناوين 700 — كان 600) · subtitle = body-lg 17 · body = 15/1.65
   * · small = 13 (كان 13.5) · caption = 12. كان display 30/42 (lh1.4)
   * وtitle 24/34 وheading 19/27 — درجات خارج السلم. */
  display: { fontSize: 30, lineHeight: 34, fontWeight: '700', letterSpacing: 0 },
  title: { fontSize: 22, lineHeight: 26, fontWeight: '700', letterSpacing: 0 },
  heading: { fontSize: 18, lineHeight: 23, fontWeight: '700' },
  subtitle: { fontSize: 17, lineHeight: 26, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 25 },
  bodyBold: { fontSize: 15, lineHeight: 25, fontWeight: '700' },
  small: { fontSize: 13, lineHeight: 20 },
  smallBold: { fontSize: 13, lineHeight: 20, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 17 },
  /* r154: الختم الزمني — IBM Plex Mono حقيقي (كان 'monospace' نظاميًا)
   * بأرقام جدولية: HH:MM والعدّادات لا ترقص عموديًا (tnum كالويب). */
  mono: { fontSize: 13, lineHeight: 19, fontFamily: 'IBMPlexMono_400Regular', fontVariant: ['tabular-nums'] },
})
