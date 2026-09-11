/**
 * SmartBot Mobile — نصوص بالهوية (Cairo متن / Readex Pro عناوين).
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
  display: { fontSize: 30, lineHeight: 42, fontWeight: '700', letterSpacing: -0.5 },
  title: { fontSize: 24, lineHeight: 34, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: 19, lineHeight: 27, fontWeight: '600' },
  subtitle: { fontSize: 17, lineHeight: 25, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 24 },
  bodyBold: { fontSize: 15, lineHeight: 24, fontWeight: '700' },
  small: { fontSize: 13.5, lineHeight: 20 },
  smallBold: { fontSize: 13.5, lineHeight: 20, fontWeight: '700' },
  caption: { fontSize: 12, lineHeight: 17 },
  mono: { fontSize: 13, lineHeight: 19, fontFamily: 'monospace' },
})
