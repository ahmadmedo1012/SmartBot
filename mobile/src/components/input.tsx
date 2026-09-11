/**
 * حقل إدخال موحد — ملصق + حقل + خطأ اختياري. دعم RTL كامل
 * (placeholder محاذاة يمين، تباعد 16px+ لأرضية اللمس).
 */
import { useState } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { useTheme } from '@/hooks/use-theme'
import { radius, spacing, TOUCH_TARGET } from '@/constants/theme'

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
        <Text style={{ color: colors.mutedFg, fontFamily: fontBody, fontSize: 13.5, marginBottom: spacing.xs }}>
          {label}
        </Text>
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
        <Text style={{ color: colors.placeholder, fontFamily: fontBody, fontSize: 12, marginTop: 4 }}>
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text style={{ color: colors.destructive, fontFamily: fontBody, fontSize: 12, marginTop: 4 }}>
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({ wrap: {} })
