// Pedometer-backed step tracker card with "Log Exercise Calories" flow.
//
// Step counting works on real iOS/Android device (CMPedometer / step counter sensor).
// Web preview shows a graceful "real-device only" notice.
//
// Flow:
//   1. Counts steps from midnight to now.
//   2. Estimates calories burned (~0.04 kcal/step ≈ 25 kcal per 600 steps).
//   3. User taps "Log exercise calories" → picks 25/50/75/100% of burn.
//   4. That amount is POSTed to /api/activity-log (source=steps, date=today).
//   5. We subtract already-logged from "available to log" so the user can't
//      double-dip on the same calories.

import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Platform, Linking, ActivityIndicator, AppState } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Pedometer } from "expo-sensors";
import { useTheme, radii, spacing } from "@/src/theme";
import { api, todayStr } from "@/src/api";

type Permission = "unknown" | "granted" | "denied" | "blocked" | "unavailable";

const STEP_GOAL_DEFAULT = 10000;
const KCAL_PER_STEP = 0.04; // average ~25 kcal per 600 steps

export function StepTracker({ goal = STEP_GOAL_DEFAULT, onLogged }: { goal?: number; onLogged?: () => void }) {
  const { colors } = useTheme();
  const [steps, setSteps] = useState<number>(0);
  const [permission, setPermission] = useState<Permission>("unknown");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [askedOnce, setAskedOnce] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [todayLogs, setTodayLogs] = useState<any[]>([]);

  const loadTodayLogs = useCallback(async () => {
    try {
      const list = await api.listActivityLog(todayStr());
      setTodayLogs(list || []);
    } catch {}
  }, []);

  useEffect(() => { loadTodayLogs(); }, [loadTodayLogs]);

  const check = useCallback(async () => {
    try {
      const isAvail = await Pedometer.isAvailableAsync();
      setAvailable(isAvail);
      if (!isAvail) { setPermission("unavailable"); return; }
    } catch { setAvailable(false); setPermission("unavailable"); return; }

    try {
      const cur: any = await Pedometer.getPermissionsAsync?.();
      if (cur?.status === "granted") { setPermission("granted"); return; }
      if (cur?.status === "denied") { setPermission(cur.canAskAgain ? "denied" : "blocked"); return; }
    } catch { setPermission("granted"); return; }
    setPermission("denied");
  }, []);

  const request = useCallback(async () => {
    setAskedOnce(true);
    try {
      const res: any = await Pedometer.requestPermissionsAsync?.();
      if (res?.status === "granted") setPermission("granted");
      else if (res?.canAskAgain === false) setPermission("blocked");
      else setPermission("denied");
    } catch { setPermission("granted"); }
  }, []);

  useEffect(() => { check(); }, [check]);

  // Step counting — authoritative source is `getStepCountAsync(midnight, now)`.
  // We DO NOT accumulate from `watchStepCount` (its callback delivers a CUMULATIVE
  // count since the watch started, NOT a delta — adding it caused 3-5× overcount).
  // Instead we use the watch only as a "something changed" trigger that re-polls
  // the authoritative count. Plus a 30-sec safety poll and an AppState listener
  // so re-opening the app immediately refreshes the total.
  const refreshNow = useCallback(async () => {
    try {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const r = await Pedometer.getStepCountAsync(start, new Date());
      const fresh = Math.max(0, Math.floor(r.steps || 0));
      setSteps((prev) => {
        if (fresh === prev) return prev;
        // Tiny sanity guard: ignore single-frame negative deltas (e.g. clock skew)
        if (fresh < prev && (prev - fresh) < 5) return prev;
        return fresh;
      });
    } catch (e) {
      console.warn("[StepTracker] getStepCountAsync failed:", e);
    }
  }, []);

  useEffect(() => {
    if (permission !== "granted") return;
    let cancelled = false;
    let sub: { remove?: () => void } | null = null;
    let interval: any = null;

    // 1. Initial authoritative load
    refreshNow();

    // 2. Subscribe to watchStepCount ONLY as a "kick" — do NOT mutate steps inside
    try {
      sub = Pedometer.watchStepCount(() => { if (!cancelled) refreshNow(); });
    } catch {}

    // 3. Safety net: poll every 30s in case watchStepCount events are dropped
    interval = setInterval(() => { if (!cancelled) refreshNow(); }, 30000);

    // 4. Re-poll the instant the app comes back to foreground
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active" && !cancelled) refreshNow();
    });

    return () => {
      cancelled = true;
      try { sub?.remove?.(); } catch {}
      if (interval) clearInterval(interval);
      try { appSub?.remove?.(); } catch {}
    };
  }, [permission, refreshNow]);

  const burned = Math.round(steps * KCAL_PER_STEP);
  const pct = Math.min(100, Math.round((steps / goal) * 100));
  const km = (steps * 0.000762).toFixed(2);

  // Sum of already-logged "Steps"-sourced activity for today
  const alreadyLogged = todayLogs
    .filter((l) => (l.type || "").toLowerCase() === "steps")
    .reduce((s, l) => s + (l.calories_burned || 0), 0);
  const availableToLog = Math.max(0, burned - alreadyLogged);

  const logPct = async (percent: number) => {
    if (busy) return;
    const cal = Math.round(availableToLog * (percent / 100));
    if (cal <= 0) { setShowPicker(false); return; }
    setBusy(true);
    try {
      await api.createActivityLog({
        date: todayStr(),
        type: "Steps",
        duration_minutes: 0,
        intensity: "moderate",
        calories_burned: cal,
        // store extra metadata in `notes` so we can show % used in history
        notes: `${percent}% of ${burned} kcal from ${steps.toLocaleString()} steps`,
      } as any);
      await loadTodayLogs();
      onLogged?.();
      setShowPicker(false);
    } catch {} finally { setBusy(false); }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} testID="step-tracker">
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>👣 Steps today</Text>
          <Text style={[styles.muted, { color: colors.muted }]}>
            Goal: {goal.toLocaleString()} · {km} km
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={[styles.bigNum, { color: colors.primary }]}>{steps.toLocaleString()}</Text>
          <Text style={[styles.muted, { color: colors.muted }]}>~{burned} kcal burned</Text>
        </View>
      </View>

      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: colors.primary }]} />
      </View>

      {/* Step-source ledger */}
      {alreadyLogged > 0 && (
        <View style={[styles.ledger, { backgroundColor: colors.primary + "10" }]}>
          <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 12 }}>
            ✅ Logged back: {alreadyLogged} kcal · Remaining: {availableToLog} kcal
          </Text>
        </View>
      )}

      {permission === "granted" && burned > 0 && (
        <TouchableOpacity
          testID="log-steps-cta"
          onPress={() => setShowPicker(true)}
          disabled={availableToLog === 0}
          style={[styles.cta, { backgroundColor: availableToLog === 0 ? colors.chipBg : colors.primary, opacity: availableToLog === 0 ? 0.7 : 1 }]}
        >
          <Ionicons name="flame" size={16} color={availableToLog === 0 ? colors.muted : "#fff"} />
          <Text style={[styles.ctaTxt, { color: availableToLog === 0 ? colors.muted : "#fff" }]}>
            {availableToLog === 0 ? "Fully logged for today" : `Log exercise calories (+${availableToLog} kcal available)`}
          </Text>
        </TouchableOpacity>
      )}

      {/* Percentage picker */}
      {showPicker && (
        <View style={[styles.pickerSheet, { backgroundColor: colors.bg, borderColor: colors.border }]} testID="pct-picker">
          <Text style={[styles.muted, { color: colors.muted, fontSize: 11 }]}>HOW MUCH OF THE {availableToLog} KCAL TO ADD BACK?</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            {[25, 50, 75, 100].map((p) => (
              <TouchableOpacity
                key={p}
                testID={`pct-${p}`}
                onPress={() => logPct(p)}
                disabled={busy}
                style={[styles.pctChip, { backgroundColor: colors.primary, opacity: busy ? 0.5 : 1 }]}
              >
                {busy ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Text style={styles.pctNum}>{p}%</Text>
                    <Text style={styles.pctKcal}>+{Math.round(availableToLog * (p / 100))} kcal</Text>
                  </>
                )}
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity testID="pct-cancel" onPress={() => setShowPicker(false)} hitSlop={10} style={{ marginTop: 10, alignSelf: "center" }}>
            <Text style={{ color: colors.muted, fontWeight: "700" }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* States: unavailable / denied / blocked */}
      {permission === "unknown" && <Text style={[styles.muted, { color: colors.muted }]}>Checking sensor…</Text>}

      {permission === "unavailable" && (
        <View style={[styles.notice, { backgroundColor: colors.chipBg }]}>
          <Ionicons name="information-circle" size={14} color={colors.muted} />
          <Text style={[styles.noticeTxt, { color: colors.muted }]}>
            {Platform.OS === "web"
              ? "Step counting works on a real iOS/Android device — not in the web preview."
              : "Sensor unavailable. Step tracking needs a native dev build (won't run in Expo Go)."}
          </Text>
        </View>
      )}

      {permission === "denied" && available && (
        <TouchableOpacity testID="steps-grant" onPress={request} style={[styles.cta, { backgroundColor: colors.primary }]}>
          <Ionicons name="walk" size={16} color="#fff" />
          <Text style={styles.ctaTxt}>{askedOnce ? "Tap again to enable motion access" : "Enable motion to count your steps"}</Text>
        </TouchableOpacity>
      )}

      {permission === "blocked" && (
        <View style={{ gap: 8 }}>
          <Text style={[styles.noticeTxt, { color: colors.muted }]}>Motion access is off. Turn it on in Settings.</Text>
          <TouchableOpacity testID="steps-open-settings" onPress={() => Linking.openSettings()} style={[styles.cta, { backgroundColor: colors.primary }]}>
            <Ionicons name="settings" size={16} color="#fff" />
            <Text style={styles.ctaTxt}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontWeight: "800", fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5 },
  muted: { fontSize: 12, fontWeight: "600" },
  bigNum: { fontSize: 28, fontWeight: "800" },
  barTrack: { height: 10, borderRadius: 999, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999 },
  ledger: { padding: 10, borderRadius: 12 },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 6, padding: 10, borderRadius: 12 },
  noticeTxt: { fontSize: 11, fontWeight: "600", flex: 1, lineHeight: 16 },
  cta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 999 },
  ctaTxt: { color: "#fff", fontWeight: "800", fontSize: 13 },
  pickerSheet: { padding: spacing.md, borderRadius: radii.lg, borderWidth: 1, gap: 4 },
  pctChip: { flex: 1, paddingVertical: 12, borderRadius: 16, alignItems: "center", gap: 2 },
  pctNum: { color: "#fff", fontWeight: "800", fontSize: 16 },
  pctKcal: { color: "#fff", fontWeight: "600", fontSize: 10, opacity: 0.85 },
});
