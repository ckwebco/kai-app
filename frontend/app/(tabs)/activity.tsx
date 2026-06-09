import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, radii, spacing, shadow } from "@/src/theme";
import { api, todayStr } from "@/src/api";
import { useFocusEffect, useRouter } from "expo-router";
import { showUndo } from "@/src/undo";
import { loadProfile, GOAL_META, addBackCalories, type UserProfile } from "@/src/profile";
import { StepTracker } from "@/src/ui/StepTracker";

const PRESETS: { type: string; cal_per_min: number; icon: any }[] = [
  { type: "Walking", cal_per_min: 4, icon: "walk" },
  { type: "Running", cal_per_min: 11, icon: "speedometer" },
  { type: "Cycling", cal_per_min: 8, icon: "bicycle" },
  { type: "Gym", cal_per_min: 7, icon: "barbell" },
  { type: "Swimming", cal_per_min: 9, icon: "water" },
  { type: "Yoga", cal_per_min: 3, icon: "leaf" },
];

type Intensity = "easy" | "moderate" | "hard";

export default function Activity() {
  const { colors } = useTheme();
  const router = useRouter();
  const [logs, setLogs] = useState<any[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [mode, setMode] = useState<"preset" | "custom">("preset");

  // Preset
  const [selected, setSelected] = useState(PRESETS[0]);
  const [duration, setDuration] = useState("30");

  // Custom
  const [desc, setDesc] = useState("");
  const [intensity, setIntensity] = useState<Intensity>("moderate");
  const [customDur, setCustomDur] = useState("30");
  const [estimating, setEstimating] = useState(false);
  const [estimate, setEstimate] = useState<{ activity: string; calories_burned: number; note: string; met: number; duration_minutes?: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([api.listActivityLog(todayStr()), loadProfile()]);
      setLogs(l); setProfile(p);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalBurned = logs.reduce((s, l) => s + (l.calories_burned || 0), 0);
  const addBack = profile ? addBackCalories(totalBurned, profile.goal_mode, profile.custom_addback_pct) : 0;

  const addPresetLog = async () => {
    const mins = Math.max(1, parseInt(duration, 10) || 0);
    const cal = Math.round(selected.cal_per_min * mins);
    try {
      const created = await api.createActivityLog({
        date: todayStr(), type: selected.type, duration_minutes: mins,
        intensity: "moderate", calories_burned: cal,
      });
      load();
      showUndo({ id: created.id, text: `Logged ${mins}m ${selected.type} (+${cal} kcal)`, onUndo: async () => load() });
    } catch {}
  };

  const onEstimate = async () => {
    setErr(null);
    if (!desc.trim()) return;
    setEstimating(true);
    setEstimate(null);
    try {
      const data = await api.exerciseEstimate(
        desc.trim(),
        intensity,
        Math.max(1, parseInt(customDur, 10) || 0),
        profile?.current_weight || 70,
      );
      setEstimate(data);
    } catch (e: any) {
      setErr("AI estimate failed. Try again.");
    } finally {
      setEstimating(false);
    }
  };

  const saveEstimate = async () => {
    if (!estimate) return;
    try {
      const created = await api.createActivityLog({
        date: todayStr(),
        type: estimate.activity,
        duration_minutes: estimate.duration_minutes ?? Math.max(1, parseInt(customDur, 10) || 0),
        intensity,
        calories_burned: estimate.calories_burned,
      });
      load();
      setDesc(""); setEstimate(null);
      showUndo({ id: created.id, text: `Logged ${estimate.activity} (+${estimate.calories_burned} kcal)`, onUndo: async () => load() });
    } catch {}
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={[styles.h1, { color: colors.text }]}>Activity</Text>
          <TouchableOpacity
            testID="activity-history-btn"
            onPress={() => router.push("/activity-history")}
            hitSlop={20}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.chipBg }}
          >
            <Ionicons name="time" size={14} color={colors.text} />
            <Text style={{ color: colors.text, fontWeight: "800", fontSize: 12 }}>History</Text>
          </TouchableOpacity>
        </View>

        {/* Pedometer steps card with "Log exercise calories" picker */}
        <StepTracker onLogged={load} />

        {/* Today summary with add-back */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Today</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
            <Text style={[styles.big, { color: colors.text }]}>{totalBurned}</Text>
            <Text style={[styles.muted, { color: colors.muted }]}>kcal burned</Text>
          </View>
          {profile && totalBurned > 0 && (
            <View style={[styles.addBackRow, { backgroundColor: GOAL_META[profile.goal_mode].color + "22" }]}>
              <Ionicons name="add-circle" size={16} color={GOAL_META[profile.goal_mode].color} />
              <Text style={[styles.addBackTxt, { color: GOAL_META[profile.goal_mode].color }]}>
                +{addBack} kcal added back ({GOAL_META[profile.goal_mode].label} mode)
              </Text>
            </View>
          )}
        </View>

        {/* Mode toggle */}
        <View style={[styles.modeToggle, { backgroundColor: colors.chipBg }]}>
          <TouchableOpacity
            testID="activity-mode-preset"
            onPress={() => setMode("preset")}
            style={[styles.modeBtn, mode === "preset" && { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.modeTxt, { color: mode === "preset" ? colors.text : colors.muted }]}>Quick presets</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="activity-mode-custom"
            onPress={() => setMode("custom")}
            style={[styles.modeBtn, mode === "custom" && { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.modeTxt, { color: mode === "custom" ? colors.text : colors.muted }]}>AI estimate ✨</Text>
          </TouchableOpacity>
        </View>

        {mode === "preset" ? (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
            <View style={styles.chipRow}>
              {PRESETS.map((p) => (
                <TouchableOpacity
                  key={p.type}
                  testID={`activity-chip-${p.type.toLowerCase()}`}
                  onPress={() => setSelected(p)}
                  style={[styles.chip, { backgroundColor: selected.type === p.type ? colors.primary : colors.chipBg }]}
                >
                  <Ionicons name={p.icon} size={14} color={selected.type === p.type ? "#fff" : colors.text} />
                  <Text style={[styles.chipTxt, { color: selected.type === p.type ? "#fff" : colors.text }]}>{p.type}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              <Text style={[{ color: colors.text, fontWeight: "600", flex: 1 }]}>Duration (min)</Text>
              <TextInput
                testID="activity-duration-input"
                keyboardType="number-pad"
                value={duration}
                onChangeText={setDuration}
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
              />
            </View>
            <TouchableOpacity testID="activity-save-btn" style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={addPresetLog}>
              <Text style={styles.saveBtnTxt}>Log {selected.type}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
            <Text style={[styles.muted, { color: colors.muted }]}>Describe the activity. Gemini estimates calories from MET science + your weight.</Text>
            <TextInput
              testID="ex-desc-input"
              value={desc}
              onChangeText={setDesc}
              placeholder="e.g. basketball with friends, vinyasa yoga, HIIT class…"
              placeholderTextColor={colors.muted}
              multiline
              style={[styles.textArea, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
            />
            <View style={styles.intensityRow}>
              {(["easy", "moderate", "hard"] as Intensity[]).map((it) => (
                <TouchableOpacity
                  key={it}
                  testID={`ex-int-${it}`}
                  onPress={() => setIntensity(it)}
                  style={[styles.intBtn, { backgroundColor: intensity === it ? colors.primary : colors.chipBg }]}
                >
                  <Text style={[styles.intTxt, { color: intensity === it ? "#fff" : colors.text }]}>{it}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.row}>
              <Text style={[{ color: colors.text, fontWeight: "600", flex: 1 }]}>Duration (min)</Text>
              <TextInput
                testID="ex-dur-input"
                keyboardType="number-pad"
                value={customDur}
                onChangeText={setCustomDur}
                style={[styles.input, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
              />
            </View>
            {err && <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 12 }}>{err}</Text>}
            <TouchableOpacity
              testID="ex-estimate-btn"
              onPress={onEstimate}
              disabled={estimating || !desc.trim()}
              style={[styles.saveBtn, { backgroundColor: colors.primary, opacity: estimating || !desc.trim() ? 0.5 : 1 }]}
            >
              {estimating ? <ActivityIndicator color="#fff" /> : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="sparkles" size={16} color="#fff" />
                  <Text style={styles.saveBtnTxt}>Estimate burn</Text>
                </View>
              )}
            </TouchableOpacity>

            {estimate && (
              <View style={[styles.estCard, { backgroundColor: colors.chipBg }]}>
                <Text style={[styles.estTitle, { color: colors.text }]}>{estimate.activity}</Text>
                <Text style={[styles.estCal, { color: colors.primary }]}>{estimate.calories_burned} kcal</Text>
                <Text style={[styles.muted, { color: colors.muted }]}>MET {estimate.met} · {intensity} · {customDur} min</Text>
                {estimate.note ? <Text style={[styles.estNote, { color: colors.text }]}>{estimate.note}</Text> : null}
                <TouchableOpacity testID="ex-save-btn" style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={saveEstimate}>
                  <Text style={styles.saveBtnTxt}>Save to log</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Today log */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Logged today</Text>
          {logs.length === 0 ? (
            <Text style={[styles.muted, { color: colors.muted }]}>No activities yet.</Text>
          ) : (
            logs.map((l) => (
              <View key={l.id} style={[styles.logRow, { borderColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.logTxt, { color: colors.text }]}>{l.type}</Text>
                  <Text style={[styles.muted, { color: colors.muted }]}>{l.duration_minutes} min · {l.intensity}</Text>
                </View>
                <Text style={[styles.logTxt, { color: colors.text, marginRight: 12 }]}>{l.calories_burned} kcal</Text>
                <TouchableOpacity
                  testID={`del-activity-${l.id}`}
                  onPress={async () => {
                    setLogs((arr) => arr.filter((x) => x.id !== l.id));
                    await api.deleteActivityLog(l.id);
                    showUndo({
                      id: l.id,
                      text: `Removed ${l.type}`,
                      onUndo: async () => {
                        await api.createActivityLog({ date: l.date, type: l.type, duration_minutes: l.duration_minutes, intensity: l.intensity, calories_burned: l.calories_burned });
                        load();
                      },
                    });
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: 120 },
  h1: { fontSize: 28, fontWeight: "800" },
  card: { borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, gap: 10 },
  cardTitle: { fontWeight: "800", textTransform: "uppercase", fontSize: 12, letterSpacing: 0.5 },
  big: { fontSize: 36, fontWeight: "800" },
  muted: { fontSize: 12, fontWeight: "600" },
  addBackRow: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 12, marginTop: 4 },
  addBackTxt: { fontWeight: "800", fontSize: 12 },
  modeToggle: { flexDirection: "row", padding: 4, borderRadius: 999, gap: 4 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center" },
  modeTxt: { fontWeight: "800", fontSize: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  chipTxt: { fontWeight: "700", fontSize: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, width: 100, textAlign: "center", fontWeight: "700" },
  textArea: { borderWidth: 1, borderRadius: 14, padding: 14, minHeight: 70, fontSize: 14, fontWeight: "500", textAlignVertical: "top" },
  intensityRow: { flexDirection: "row", gap: 6 },
  intBtn: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: "center" },
  intTxt: { fontWeight: "800", fontSize: 12, textTransform: "capitalize" },
  saveBtn: { paddingVertical: 14, borderRadius: 999, alignItems: "center" },
  saveBtnTxt: { color: "#fff", fontWeight: "800" },
  estCard: { padding: 14, borderRadius: 16, gap: 6, marginTop: 4 },
  estTitle: { fontSize: 16, fontWeight: "800" },
  estCal: { fontSize: 26, fontWeight: "800" },
  estNote: { fontSize: 13, lineHeight: 18, marginVertical: 4 },
  logRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: 1, alignItems: "center" },
  logTxt: { fontWeight: "700" },
});
