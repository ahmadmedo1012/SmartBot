import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";
import DashboardScreen from "../screens/DashboardScreen";
import FlowsScreen from "../screens/FlowsScreen";
import InboxScreen from "../screens/InboxScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function TabIcon({ label, focused }) {
  const icons = { الرئيسية: "📊", البوتات: "🤖", الرسائل: "💬" };
  return <Text style={{ fontSize: 22 }}>{icons[label] || "📱"}</Text>;
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => <TabIcon label={route.name} focused={focused} />,
        tabBarStyle: {
          backgroundColor: "#161B24", borderTopColor: "#262C3A",
          paddingBottom: 8, paddingTop: 8, height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, color: "#EDEFF4" },
        tabBarActiveTintColor: "#FF5D3A",
        tabBarInactiveTintColor: "#666",
      })}
    >
      <Tab.Screen name="الرئيسية" component={DashboardScreen} />
      <Tab.Screen name="البوتات" component={FlowsScreen} />
      <Tab.Screen name="الرسائل" component={InboxScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator({ onLogout }) {
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={MainTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
