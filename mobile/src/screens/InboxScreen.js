import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { fetchInbox } from "../lib/api";

export default function InboxScreen() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setStats(await fetchInbox()); }
    catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#FF5D3A" /></View>;

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={s.header}><Text style={s.title}>صندوق الوارد</Text></View>
      <View style={s.kpiRow}>
        <View style={s.kpi}><Text style={s.kpiValue}>{stats?.total_conversations || 0}</Text><Text style={s.kpiLabel}>إجمالي المحادثات</Text></View>
        <View style={s.kpi}><Text style={s.kpiValue}>{stats?.unread_count || 0}</Text><Text style={s.kpiLabel}>غير مقروء</Text></View>
      </View>
      <View style={s.card}>
        <Text style={s.cardTitle}>المنصات</Text>
        {Object.entries(stats?.platform_breakdown || {}).map(([k, v]) => (
          <View key={k} style={s.platformRow}>
            <Text style={s.platformName}>{k}</Text>
            <Text style={s.platformCount}>{v}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1017" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0D1017" },
  header: { padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "800", color: "#EDEFF4" },
  kpiRow: { flexDirection: "row", paddingHorizontal: 12, gap: 8, marginBottom: 8 },
  kpi: { flex: 1, backgroundColor: "#161B24", borderRadius: 12, padding: 16, alignItems: "center" },
  kpiValue: { fontSize: 28, fontWeight: "800", color: "#4C8DFF" },
  kpiLabel: { fontSize: 12, color: "#666", marginTop: 4 },
  card: { backgroundColor: "#161B24", margin: 12, padding: 16, borderRadius: 12 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: "#EDEFF4", marginBottom: 12 },
  platformRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#262C3A" },
  platformName: { fontSize: 14, color: "#EDEFF4" },
  platformCount: { fontSize: 14, color: "#4C8DFF", fontWeight: "600" },
});
