import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { fetchStats, fetchAnalytics, fetchEnv } from "../lib/api";

function KPI({ label, value, color }) {
  return (
    <View style={[s.kpi, { borderTopColor: color }]}>
      <Text style={[s.kpiValue, { color }]}>{value ?? "—"}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

export default function DashboardScreen({ navigation }) {
  const [stats, setStats] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [env, setEnv] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, a, e] = await Promise.all([
        fetchStats(), fetchAnalytics(7), fetchEnv(),
      ]);
      setStats(s); setAnalytics(a); setEnv(e);
    } catch (err) { /* ignore */ }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={s.header}>
        <Text style={s.title}>لوحة التحكم</Text>
        <Text style={s.dbType}>{env?.db_type === "postgres" ? "PostgreSQL" : "SQLite"}</Text>
      </View>
      <View style={s.kpiRow}>
        <KPI label="إجمالي الردود" value={stats?.total_replies} color="#FF5D3A" />
        <KPI label="ردود اليوم" value={stats?.today_replies} color="#4C8DFF" />
        <KPI label="المتابعون" value={stats?.fan_count || analytics?.fan_count} color="#22c55e" />
        <KPI label="ذروة النشاط" value={analytics?.peak_hour != null ? `${analytics.peak_hour}:00` : "—"} color="#f59e0b" />
      </View>
      {analytics?.total_replies > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>آخر 7 أيام</Text>
          <Text style={s.replyCount}>{analytics.total_replies} رد</Text>
          <Text style={s.subText}>{analytics.today_replies} رد اليوم</Text>
        </View>
      )}
      <View style={s.menuGrid}>
        {[
          { label: "البوت البصري", icon: "🔧", screen: "Flows" },
          { label: "صندوق الوارد", icon: "💬", screen: "Messages" },
          { label: "القواعد", icon: "📋", screen: "Rules" },
          { label: "التقارير", icon: "📊", screen: "Reports" },
        ].map(item => (
          <View key={item.screen} style={s.menuItem}>
            <Text style={s.menuIcon}>{item.icon}</Text>
            <Text style={s.menuLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1017" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "800", color: "#EDEFF4" },
  dbType: { fontSize: 11, color: "#4C8DFF", backgroundColor: "#4C8DFF20", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 8 },
  kpi: { flex: 1, minWidth: "45%", backgroundColor: "#161B24", borderRadius: 12, padding: 16, borderTopWidth: 3, marginBottom: 8 },
  kpiValue: { fontSize: 28, fontWeight: "800", fontFamily: Platform?.OS === "ios" ? "Menlo" : "monospace" },
  kpiLabel: { fontSize: 12, color: "#666", marginTop: 4 },
  card: { backgroundColor: "#161B24", margin: 12, padding: 20, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: "#4C8DFF" },
  cardTitle: { fontSize: 14, color: "#666" },
  replyCount: { fontSize: 36, fontWeight: "800", color: "#EDEFF4", marginTop: 4 },
  subText: { fontSize: 12, color: "#4C8DFF", marginTop: 4 },
  menuGrid: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 8 },
  menuItem: { width: "48%", backgroundColor: "#161B24", borderRadius: 12, padding: 20, alignItems: "center", marginBottom: 8 },
  menuIcon: { fontSize: 32 },
  menuLabel: { fontSize: 13, color: "#EDEFF4", marginTop: 8, fontWeight: "600" },
});
