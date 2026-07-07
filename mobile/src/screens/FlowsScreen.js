import React, { useState, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, ActivityIndicator,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { fetchFlows } from "../lib/api";

export default function FlowsScreen() {
  const [flows, setFlows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setFlows(await fetchFlows()); }
    catch (e) { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (loading) return <View style={s.center}><ActivityIndicator size="large" color="#FF5D3A" /></View>;

  return (
    <ScrollView style={s.container} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <View style={s.header}><Text style={s.title}>البوت البصري</Text><Text style={s.count}>{flows.length} بوت</Text></View>
      {flows.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyIcon}>🤖</Text>
          <Text style={s.emptyText}>لا توجد بوتات بعد</Text>
          <Text style={s.emptyHint}>أنشئ أول بوت من لوحة التحكم</Text>
        </View>
      ) : flows.map(f => (
        <View key={f.id} style={s.card}>
          <Text style={s.flowName}>{f.name}</Text>
          <View style={s.badgeRow}>
            <View style={[s.badge, f.status === "active" ? s.activeBadge : s.draftBadge]}>
              <Text style={s.badgeText}>{f.status === "active" ? "نشط" : "مسودة"}</Text>
            </View>
            <Text style={s.flowStat}>{f.total_replies || 0} رد</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0D1017" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0D1017" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, paddingTop: 60 },
  title: { fontSize: 24, fontWeight: "800", color: "#EDEFF4" },
  count: { fontSize: 14, color: "#666" },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, color: "#EDEFF4", fontWeight: "600" },
  emptyHint: { fontSize: 13, color: "#666", marginTop: 4 },
  card: { backgroundColor: "#161B24", margin: 12, marginVertical: 6, padding: 16, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: "#FF5D3A" },
  flowName: { fontSize: 16, fontWeight: "700", color: "#EDEFF4" },
  badgeRow: { flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 8 },
  activeBadge: { backgroundColor: "#22c55e20" },
  draftBadge: { backgroundColor: "#66620" },
  badgeText: { fontSize: 11, fontWeight: "600", color: "#22c55e" },
  flowStat: { fontSize: 12, color: "#666" },
});
