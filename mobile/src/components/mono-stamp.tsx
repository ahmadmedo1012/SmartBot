/**
 * SmartBot Mobile — MonoStamp: الختم الزمني/الرقمي بترولي (r154).
 *
 * قيمة لاتينية (HH:MM · تاريخ ISO · عدّاد) بخط IBM Plex Mono وأرقام
 * جدولية (tnum) واتجاه LTR قسريًا داخل التخطيط العربي RTL — مع عنوان
 * عربي اختياري فوقها (تاريخ اليوم مثلًا). هذا مكوّن القواعد («grammar
 * hook») الذي تستهلكه وكلاء الشاشات اللاحقين لسجلات الدوائر/الرسائل
 * (مرآة سلوك الويب: ردود حديثة mono HH:MM dir=ltr + عنوان تاريخ عربي).
 *
 * ليس علامة AI — علامات الآلة (thinking dots/LED) تستخدم colors.lime
 * مباشرة؛ هذا الختم محايد الطابع (mutedFg افتراضيًا).
 */
import { View, type ViewProps } from 'react-native'
import { useTheme, type AppTheme } from '@/hooks/use-theme'
import { AppText } from '@/components/themed-text'

/** علامة اليسار-إلى-اليمين (LRM) — تثبّت اتجاه الختم داخل فقرة RTL */
const LRM = '\u200E'

export interface MonoStampProps extends ViewProps {
  /** القيمة الختمية — HH:MM / ISO / عدّاد — تُعرض LTR دائمًا */
  value: string
  /** عنوان عربي اختياري فوق الختم (تاريخ اليوم مثلًا) */
  title?: string
  /** لون القيمة — الافتراضي mutedFg (ختم هادئ على البترول) */
  color?: keyof AppTheme['colors']
  /** وزن Plex Mono: 400 متن أو 500 ختم حضور — الافتراضي 500 */
  weight?: 400 | 500
  /** حجم القيمة (px) — الافتراضي 13 (درجة mono) */
  size?: number
}

export function MonoStamp({
  value,
  title,
  color = 'mutedFg',
  weight = 500,
  size = 13,
  accessibilityLabel,
  ...rest
}: MonoStampProps) {
  const { fontMono, fontMonoMedium } = useTheme()
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? (title ? `${title} — ${value}` : value)}
      style={[{ alignItems: 'flex-start', gap: 2 }]}
      {...rest}
    >
      {title ? (
        <AppText variant="caption" color="mutedFg">
          {title}
        </AppText>
      ) : null}
      <AppText
        variant="mono"
        color={color}
        style={{
          fontFamily: weight === 400 ? fontMono : fontMonoMedium,
          fontSize: size,
          lineHeight: size + 6,
          writingDirection: 'ltr',
        }}
      >
        {`${LRM}${value}${LRM}`}
      </AppText>
    </View>
  )
}
