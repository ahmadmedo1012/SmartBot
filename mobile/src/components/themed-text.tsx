/**
 * SmartBot Mobile — نصوص بالهوية (IBM Plex Sans Arabic متنًا وعناوين).
 * قاعدة مدارك: العربية لا تُعطى letter-spacing أبدًا (0 — لا سالب).
 */
import { StyleSheet, Text, type TextProps } from 'react-native'
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

export function AppText({ variant = 'body', color, align, style, ...rest }: AppTextProps) {
  const { colors, fontBody, fontHeading } = useTheme()
  const variantStyle = styles[variant]
  return (
    <Text
      style={[
        { color: colors[color ?? 'foreground'], textAlign: align },
        variant === 'display' || variant === 'title' || variant === 'heading'
          ? { fontFamily: fontHeading }
          : { fontFamily: fontBody },
        variantStyle,
        style,
      ]}
      maxFontSizeMultiplier={1.6}
      {...rest}
    />
  )
}

export function stylesFor() {
  return styles
}

const styles = StyleSheet.create({
  /* r130 (W1-H MB-2): on-rung scale — نفس درجات الويب/Madarek حرفيًا:
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
  mono: { fontSize: 13, lineHeight: 19, fontFamily: 'monospace' },
})
