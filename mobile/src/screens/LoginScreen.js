import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { login } from "../lib/api";

export default function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) { Alert.alert("خطأ", "يرجى إدخال اسم المستخدم وكلمة المرور"); return; }
    setLoading(true);
    try {
      const res = await login(username, password);
      if (res.ok) onLogin(res);
      else Alert.alert("خطأ", "بيانات الدخول غير صحيحة");
    } catch (e) { Alert.alert("خطأ", e.message); }
    finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={s.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <StatusBar style="light" />
      <View style={s.overlay}>
        <Text style={s.logo}>🤖</Text>
        <Text style={s.title}>SmartBot</Text>
        <Text style={s.subtitle}>لوحة تحكم الصفحات</Text>
        <TextInput style={s.input} placeholder="اسم المستخدم" placeholderTextColor="#666"
          value={username} onChangeText={setUsername} autoCapitalize="none" />
        <TextInput style={s.input} placeholder="كلمة المرور" placeholderTextColor="#666"
          value={password} onChangeText={setPassword} secureTextEntry />
        <TouchableOpacity style={s.button} onPress={handleLogin} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>تسجيل الدخول</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1017" },
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  logo: { fontSize: 64, marginBottom: 8 },
  title: { fontSize: 32, fontWeight: "800", color: "#EDEFF4", marginBottom: 4 },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 32 },
  input: { width: "100%", height: 50, backgroundColor: "#161B24", borderRadius: 12,
    paddingHorizontal: 16, color: "#EDEFF4", fontSize: 16, marginBottom: 12,
    borderWidth: 1, borderColor: "#262C3A" },
  button: { width: "100%", height: 50, backgroundColor: "#FF5D3A", borderRadius: 12,
    justifyContent: "center", alignItems: "center", marginTop: 8 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
