import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import LoginScreen from "./src/screens/LoginScreen";
import AppNavigator from "./src/navigation/AppNavigator";

export default function App() {
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check stored session
    setTimeout(() => setLoading(false), 500);
  }, []);

  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator size="large" color="#FF5D3A" />
      </View>
    );
  }

  if (!auth) return <LoginScreen onLogin={(u) => setAuth(u)} />;
  return <AppNavigator onLogout={() => setAuth(null)} />;
}

const s = StyleSheet.create({
  loading: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0D1017" },
});
