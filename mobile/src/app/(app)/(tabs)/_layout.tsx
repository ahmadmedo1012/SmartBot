/**
 * التابات الخمس — تحويل MobileBottomNav/AdminSidebar من الويب:
 * الرئيسية (لوحة) · الرسائل (Inbox) · التعليقات · التحليلات · المزيد.
 * العربية RTL — الشريط السفلي بترتيب منطقي (الرئيسية أولًا من اليمين).
 */
import { Tabs } from 'expo-router'
import type { ColorValue } from 'react-native'
import { useTheme } from '@/hooks/use-theme'
import { Icon, type IconName } from '@/components/icon'

function TabIcon({ name, color, focused }: { name: IconName; color: ColorValue; focused: boolean }) {
  return <Icon name={name} size={24} color={typeof color === 'string' ? color : undefined} strokeWidth={focused ? 2.4 : 1.8} />
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
