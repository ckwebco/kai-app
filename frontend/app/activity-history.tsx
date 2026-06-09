import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme, radii, spacing, shadow } from "@/src/theme";
import { api } from "@/src/api";

// Group activity logs by date and split into "Steps-source" vs "Workout-source".
type Day = {
  date: string;
  total: number;        // total kcal burned that day
  fromSteps: number;    // kcal already logged back from steps
  workoutKcal: number;  // other workout entries
  steps: number;        // approximate steps for the day (reverse-engineered from logged kcal)
  pctUsed: number;      // 0..100 — how much of step-burn the user has logged back (approx)
  entries: any[];
};

const KCAL_PER_STEP = 0.04;

export default function ActivityHistory() {
  const { colors } = useTheme();
  const router = useRouter();
  const [days, setDays] = useState<Day[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const all = await api.listActivityLog(); // no date → returns all
      const byDate: Record<string, Day> = {};
      for (const log of all || []) {
        const d = log.date;
        if (!byDate[d]) byDate[d] = { date: d, total: 0, fromSteps: 0, workoutKcal: 0, steps: 0, pctUsed: 0, entries: [] };
        byDate[d].total += log.calories_burned || 0;
        byDate[d].entries.push(log);
        const t = String(log.type || "").toLowerCase();
        if (t === "steps") {
          byDate[d].fromSteps += log.calories_burned || 0;
          // Try to recover steps & percent from the notes string
          // notes example: "50% of 320 kcal from 8,000 steps"
          const m = String(log.notes || "").match(/(\d+)%\s*of\s*(\d+)\s*kcal\s*from\s*([\d,]+)/i);
          if (m) {
            byDate[d].pctUsed = Math.max(byDate[d].pctUsed, parseInt(m[1], 10));
            byDate[d].steps = Math.max(byDate[d].steps, parseInt(m[3].replace(/,/g, ""), 10));
          } else {
            byDate[d].steps = Math.max(byDate[d].steps, Math.round((log.calories_burned || 0) / KCAL_PER_STEP));
          }
        } else {
          byDate[d].workoutKcal += log.calories_burned || 0;
        }
      }
      const arr = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
      setDays(arr);
    } catch (e) {
      console.warn("activity history load failed", e);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const fmtDate = (iso: string) => {
    const d = new Date(iso + "T12:00:00");
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={20} testID="hist-back" style={{ width: 44, height: 44, justifyContent: "center" }}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>Activity history</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 80 }}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {days.length === 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
              <Text style={[styles.muted, { color: colors.muted, textAlign: "center" }]}> 
              No activity logged yet. Take a walk and tap &quot;Log exercise calories&quot; on the Activity tab to start tracking. 👟
            </Text>
          </View>
        )}

        {days.map((d) => (
          <View key={d.date} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]} testID={`hist-day-${d.date}`}>
            <View style={styles.rowBetween}>
              <Text style={[styles.dateTxt, { color: colors.text }]}>{fmtDate(d.date)}</Text>
              {d.pctUsed > 0 && (
                <View style={[styles.pctPill, { backgroundColor: colors.primary }]}>
                  <Text style={styles.pctPillTxt}>{d.pctUsed}% used</Text>
                </View>
              )}
            </View>

            <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
              <Stat label="Steps" val={d.steps > 0 ? d.steps.toLocaleString() : "—"} colors={colors} />
              <Stat label="Burned" val={`${Math.round(d.total)} kcal`} colors={colors} />
              <Stat label="Logged back" val={`${Math.round(d.fromSteps)} kcal`} colors={colors} accent />
            </View>

            {d.workoutKcal > 0 && (
              <Text style={[styles.muted, { color: colors.muted }]}>
                + {Math.round(d.workoutKcal)} kcal from {d.entries.filter((e) => (e.type || "").toLowerCase() !== "steps").length} workout entrie(s)
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ label, val, colors, accent }: { label: string; val: string | number; colors: any; accent?: boolean }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={[styles.muted, { color: colors.muted }]}>{label}</Text>
      <Text style={{ fontWeight: "800", fontSize: 16, color: accent ? colors.primary : colors.text }}>{val}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, minHeight: 52 },
  title: { fontWeight: "800", fontSize: 17 },
  card: { borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, gap: 10 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statsRow: { flexDirection: "row", paddingTop: 10, borderTopWidth: 1, gap: 4 },
  dateTxt: { fontWeight: "800", fontSize: 14 },
  muted: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  pctPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  pctPillTxt: { color: "#fff", fontWeight: "800", fontSize: 11 },
});
