/**
 * حقل إدخال موحد — ملصق + حقل + خطأ اختياري. دعم RTL كامل
 * (placeholder محاذاة يمين، تباعد 16px+ لأرضية اللمس).
 * r131: الملصق/التلميح/الخطأ عبر AppText على درجات السلم
 * (13 small / 12 caption — كان الملصق 13.5 درجة ميتة خارج السلم).
 */
import { useState } from 'react'
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing, TOUCH_TARGET } from '@/constants/theme'
import { AppText } from '@/components/themed-text'

export interface AppInputProps extends TextInputProps {
  label?: string
  error?: string | null
  hint?: string
}

export function AppInput({ label, error, hint, style, ...rest }: AppInputProps) {
  const { colors, fontBody } = useTheme()
  const [focused, setFocused] = useState(false)
  return (
    <View style={styles.wrap}>
      {label ? (
        <AppText variant="small" color="mutedFg" style={{ marginBottom: spacing.xs }}>
          {label}
        </AppText>
      ) : null}
      <TextInput
        placeholderTextColor={colors.placeholder}
        textAlign="right"
        accessibilityLabel={rest.accessibilityLabel ?? label}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          {
            backgroundColor: colors.surface,
            color: colors.foreground,
            borderColor: focused ? colors.input : colors.border,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: spacing.lg,
            minHeight: TOUCH_TARGET + 4,
            fontFamily: fontBody,
            fontSize: 16, // أرضية iOS zoom (قاعدة الويب v17 #4 نفسها)
            textAlignVertical: 'center',
          },
          style,
        ]}
        {...rest}
      />
      {hint && !error ? (
        <AppText variant="caption" color="placeholder" style={{ marginTop: 4 }}>
          {hint}
        </AppText>
      ) : null}
      {error ? (
        <AppText variant="caption" style={{ marginTop: 4, color: colors.destructive }}>
          {error}
        </AppText>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({ wrap: {} })
