/**
 * التابات الخمس — تحويل MobileBottomNav/AdminSidebar من الويب:
 * الرئيسية (لوحة) · الرسائل (Inbox) · التعليقات · التحليلات · المزيد.
 * العربية RTL — الشريط السفلي بترتيب منطقي (الرئيسية أولًا من اليمين).
 *
 * r131 (F11): سجل ضغط الشريط السفلي 0.93 — نفس حكم الويب r130
 * (MobileBottomNav active:scale-[0.93]) عبر زر تاب مخصص على
 * PressableScale. الخصائص الوصولية/التخطيطية تمر كما هي من الملاح.
 */
import { Tabs } from 'expo-router'
import type { BottomTabBarButtonProps } from 'expo-router/build/react-navigation/bottom-tabs'
import type { ColorValue, StyleProp, ViewStyle } from 'react-native'
import { useTheme } from '@/hooks/use-theme'
import { press } from '@/constants/theme'
import { Icon, type IconName } from '@/components/icon'
import { PressableScale } from '@/components/pressable-scale'

function TabIcon({ name, color, focused }: { name: IconName; color: ColorValue; focused: boolean }) {
  return <Icon name={name} size={24} color={typeof color === 'string' ? color : undefined} strokeWidth={focused ? 2.4 : 1.8} />
}

/**
 * زر التاب على سجل 0.93 — نمرر الخصائص القياسية لـPressable كاملة
 * (الضغط/التسمية/الحالة/الدور/ripple/النمط) ونتجاهل خصائص الويب
 * الخاصة بـexpo-router (href/hoverEffect/pressOpacity) التي لا معنى
 * لها على الأصل.
 */
function TabBarButton(props: BottomTabBarButtonProps) {
  const {
    children,
    onPress,
    onLongPress,
    testID,
    style,
    android_ripple,
    /* expo-router's BottomTabItem يمرر الوسوم بصيغة aria-* + role —
       نمررها كما هي إلى Pressable (يدعمها RN 0.71+) */
    'aria-label': ariaLabel,
    'aria-selected': ariaSelected,
    role,
    accessibilityLargeContentTitle,
    accessibilityShowsLargeContentViewer,
  } = props
  return (
    <PressableScale
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      aria-label={ariaLabel}
      aria-selected={ariaSelected}
      role={role}
      accessibilityLargeContentTitle={accessibilityLargeContentTitle}
      accessibilityShowsLargeContentViewer={accessibilityShowsLargeContentViewer}
      android_ripple={android_ripple}
      style={style as StyleProp<ViewStyle>}
      scaleTo={press.nav}
    >
      {children}
    </PressableScale>
  )
}

export default function TabsLayout() {
  const { colors } = useTheme()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accentFg,
        tabBarInactiveTintColor: colors.mutedFg,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        sceneStyle: { backgroundColor: colors.background },
        /* r131: سجل ضغط الشريط السفلي 0.93 (حكم الويب r130) */
        tabBarButton: (props) => <TabBarButton {...props} />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'الرئيسية',
          tabBarIcon: ({ color, focused }) => <TabIcon name="dashboard" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'الرسائل',
          tabBarIcon: ({ color, focused }) => <TabIcon name="message-circle" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="comments"
        options={{
          title: 'التعليقات',
          tabBarIcon: ({ color, focused }) => <TabIcon name="message-square" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'التحليلات',
          tabBarIcon: ({ color, focused }) => <TabIcon name="bar-chart" color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'المزيد',
          tabBarIcon: ({ color, focused }) => <TabIcon name="grid" color={color} focused={focused} />,
        }}
      />
    </Tabs>
  )
}
