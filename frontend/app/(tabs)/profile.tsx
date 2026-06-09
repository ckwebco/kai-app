import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Switch, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, radii, spacing, shadow } from "@/src/theme";
import {
  loadProfile, saveProfile, defaultProfile, GOAL_META, computeGoalCalories, computeMacroGoals,
  PROTEIN_BY_MODE,
  computeWaterGoalMl, cupsFromMl,
  kgToLb, lbToKg, type UserProfile, type GoalMode,
} from "@/src/profile";

export default function Profile() {
  const { colors, mode, toggle } = useTheme();
  const [p, setP] = useState<UserProfile>(defaultProfile);
  const [saved, setSaved] = useState(false);

  useEffect(() => { loadProfile().then(setP); }, []);

  const update = (k: keyof UserProfile, v: any) => setP((s) => ({ ...s, [k]: v }));
  const goalMeta = GOAL_META[p.goal_mode] ?? GOAL_META.maintain;
  const goalCal = (() => { try { return computeGoalCalories(p); } catch { return p.calorie_goal || 2200; } })();

  const setGoalMode = (m: GoalMode) => {
    setP((s) => {
      const next = { ...s, goal_mode: m };
      const g = computeMacroGoals(next);
      return { ...next, calorie_goal: g.calories, protein_goal: g.protein, carbs_goal: g.carbs, fat_goal: g.fat };
    });
  };

  const onSave = async () => {
    // recompute macro goals based on goal mode + body
    const g = computeMacroGoals(p);
    const next = { ...p, calorie_goal: g.calories, protein_goal: g.protein, carbs_goal: g.carbs, fat_goal: g.fat };
    setP(next);
    await saveProfile(next);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const wDisplay = p.weight_unit === "lb" ? kgToLb(p.current_weight) : p.current_weight;
  const tDisplay = p.weight_unit === "lb" ? kgToLb(p.target_weight) : p.target_weight;

  const setWeight = (key: "current_weight" | "target_weight") => (txt: string) => {
    const n = parseFloat(txt) || 0;
    const kg = p.weight_unit === "lb" ? lbToKg(n) : n;
    update(key, kg);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={[styles.h1, { color: colors.text }]}>Profile & Goals</Text>

        {/* Goal mode */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Goal mode</Text>
          <Text style={[styles.muted, { color: colors.muted }]}>Drives calorie target, macros, and how much exercise burn gets added back.</Text>
          <View style={styles.goalGrid}>
            {(Object.keys(GOAL_META) as GoalMode[]).map((g) => {
              const meta = GOAL_META[g];
              const active = p.goal_mode === g;
              return (
                <TouchableOpacity
                  key={g}
                  testID={`goal-${g}`}
                  onPress={() => setGoalMode(g)}
                  style={[
                    styles.goalCard,
                    { backgroundColor: active ? meta.color + "1A" : colors.chipBg, borderColor: active ? meta.color : "transparent" },
                  ]}
                >
                  <Ionicons name={meta.icon as any} size={20} color={meta.color} />
                  <Text style={[styles.goalLabel, { color: colors.text }]}>{meta.label}</Text>
                  <Text style={[styles.goalDesc, { color: colors.muted }]} numberOfLines={2}>{meta.description}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[styles.summary, { backgroundColor: colors.chipBg }]}>
            <Text style={[styles.summaryTxt, { color: colors.text }]}>
              Daily target: <Text style={{ fontWeight: "800" }}>{goalCal} kcal</Text>
            </Text>
            <Text style={[styles.muted, { color: colors.muted, marginTop: 4 }]}>
              {(() => { try { const g = computeMacroGoals(p); return `P${g.protein}g · C${g.carbs}g · F${g.fat}g`; } catch { return ""; } })()}
              {` · +${Math.round((p.custom_addback_pct ?? goalMeta.addBackPct) * 100)}% exercise add-back`}
            </Text>
          </View>

          {/* Custom goal toggle + inputs */}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, flex: 1 }}>
                Set my own targets
              </Text>
              <TouchableOpacity
                testID="custom-goals-toggle"
                onPress={() => {
                  setP((s) => {
                    const enabling = !s.use_custom_goals;
                    if (enabling) {
                      // Pre-fill custom fields from current computed values so it's a smooth start
                      const g = computeMacroGoals({ ...s, use_custom_goals: false });
                      return { ...s, use_custom_goals: true, calorie_goal: g.calories, protein_goal: g.protein, carbs_goal: g.carbs, fat_goal: g.fat };
                    }
                    // Turning off: recompute from goal mode + body stats
                    const next = { ...s, use_custom_goals: false };
                    const g = computeMacroGoals(next);
                    return { ...next, calorie_goal: g.calories, protein_goal: g.protein, carbs_goal: g.carbs, fat_goal: g.fat };
                  });
                }}
                style={{ width: 50, height: 28, borderRadius: 14, padding: 3, backgroundColor: p.use_custom_goals ? colors.primary : colors.chipBg }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", alignSelf: p.use_custom_goals ? "flex-end" : "flex-start" }} />
              </TouchableOpacity>
            </View>

            {p.use_custom_goals && (
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <NumField label="Calories" suffix="kcal" value={p.calorie_goal} onChange={(v) => update("calorie_goal", v)} testID="goal-cal" />
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <NumField label="Protein" suffix="g" value={p.protein_goal} onChange={(v) => update("protein_goal", v)} testID="goal-p" />
                  <NumField label="Carbs" suffix="g" value={p.carbs_goal} onChange={(v) => update("carbs_goal", v)} testID="goal-c" />
                  <NumField label="Fat" suffix="g" value={p.fat_goal} onChange={(v) => update("fat_goal", v)} testID="goal-f" />
                </View>
                {(() => {
                  const pm = PROTEIN_BY_MODE[p.goal_mode];
                  const rec = Math.round(pm.gPerKg * (p.current_weight || 70));
                  return (
                    <Text style={{ color: colors.muted, fontSize: 12, fontWeight: "600" }}>
                      💡 Best protein for <Text style={{ fontWeight: "800", color: goalMeta.color }}>{goalMeta.label}</Text>: ~<Text style={{ fontWeight: "800", color: colors.text }}>{rec}g</Text> ({pm.gPerKg} g/kg) — {pm.tip}.
                    </Text>
                  );
                })()}
              </View>
            )}
          </View>

          {/* Weekly exercise frequency */}
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>How often do you train?</Text>
            <View style={{ flexDirection: "row", gap: 4 }}>
              {[0, 1, 2, 3, 4, 5, 6, 7].map((n) => (
                <TouchableOpacity
                  key={n}
                  testID={`weekly-ex-${n}`}
                  onPress={() => update("weekly_exercises", n)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: p.weekly_exercises === n ? colors.primary : colors.chipBg }}
                >
                  <Text style={{ color: p.weekly_exercises === n ? "#fff" : colors.text, fontWeight: "800", fontSize: 13 }}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>days/week of intentional exercise</Text>
          </View>

          {/* Custom add-back slider (stepper) */}
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>Exercise add-back</Text>
              {p.custom_addback_pct !== null && (
                <TouchableOpacity onPress={() => update("custom_addback_pct", null)} testID="addback-reset">
                  <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 11 }}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>
              {p.custom_addback_pct === null
                ? `Using ${goalMeta.label} default · ${Math.round(goalMeta.addBackPct * 100)}%`
                : `Custom · ${Math.round(p.custom_addback_pct * 100)}%`}
            </Text>
            <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap" }}>
              {(() => {
                const [lo, hi] = goalMeta.addBackRange;
                const steps: number[] = [];
                for (let pct = Math.round(lo * 100); pct <= Math.round(hi * 100); pct += 5) steps.push(pct);
                return steps.map((pct) => {
                  const v = pct / 100;
                  const active = p.custom_addback_pct !== null && Math.abs(p.custom_addback_pct - v) < 0.005;
                  return (
                    <TouchableOpacity
                      key={pct}
                      testID={`addback-${pct}`}
                      onPress={() => update("custom_addback_pct", v)}
                      style={{ paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? goalMeta.color : colors.chipBg }}
                    >
                      <Text style={{ color: active ? "#fff" : colors.text, fontWeight: "800", fontSize: 11 }}>{pct}%</Text>
                    </TouchableOpacity>
                  );
                });
              })()}
            </View>
            <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "600" }}>
              {goalMeta.label} range: {Math.round(goalMeta.addBackRange[0] * 100)}–{Math.round(goalMeta.addBackRange[1] * 100)}% · default {Math.round(goalMeta.addBackPct * 100)}%
            </Text>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
              {(Object.entries(GOAL_META) as [string, any][]).map(([k, meta]) => (
                <View key={k} style={{ flex: 1, alignItems: "center", padding: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.color, marginBottom: 3 }} />
                  <Text style={{ color: colors.muted, fontSize: 9, fontWeight: "700" }}>{meta.label}</Text>
                  <Text style={{ color: colors.text, fontSize: 10, fontWeight: "800" }}>{Math.round(meta.addBackPct * 100)}%</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Appearance */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Appearance</Text>
          <View style={styles.row}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <Ionicons name={mode === "dark" ? "moon" : "sunny"} size={22} color={colors.primary} />
              <View>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Dark mode</Text>
                <Text style={[styles.muted, { color: colors.muted }]}>{mode === "dark" ? "On" : "Off"}</Text>
              </View>
            </View>
            <Switch testID="dark-mode-toggle" value={mode === "dark"} onValueChange={toggle} trackColor={{ false: colors.border, true: colors.primary }} thumbColor="#fff" />
          </View>
          <View style={styles.row}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <Ionicons name="speedometer" size={22} color={colors.primary} />
              <View>
                <Text style={[styles.rowTitle, { color: colors.text }]}>Weight unit</Text>
                <Text style={[styles.muted, { color: colors.muted }]}>{p.weight_unit === "kg" ? "Kilograms" : "Pounds"}</Text>
              </View>
            </View>
            <View style={[styles.toggle, { backgroundColor: colors.chipBg }]}>
              {(["kg", "lb"] as const).map((u) => (
                <TouchableOpacity
                  key={u}
                  testID={`unit-${u}`}
                  onPress={() => update("weight_unit", u)}
                  style={[styles.toggleBtn, p.weight_unit === u && { backgroundColor: colors.primary }]}
                >
                  <Text style={[styles.toggleTxt, { color: p.weight_unit === u ? "#fff" : colors.text }]}>{u.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Body */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>About you</Text>
          <Field label="Name" value={p.name} onChangeText={(v: string) => update("name", v)} testID="profile-name" colors={colors} />
          <Field label="Age" value={String(p.age)} onChangeText={(t: string) => update("age", parseInt(t, 10) || 0)} keyboardType="number-pad" testID="profile-age" colors={colors} />
          <Field label="Height (cm)" value={String(p.height)} onChangeText={(t: string) => update("height", parseFloat(t) || 0)} keyboardType="numeric" testID="profile-height" colors={colors} />
          <WeightField
            label={`Current weight (${p.weight_unit})`}
            value={wDisplay}
            unit={p.weight_unit}
            onCommit={(val) => {
              // val is the displayed unit value (kg or lb depending on unit)
              const n = parseFloat(String(val)) || 0;
              const kg = p.weight_unit === "lb" ? lbToKg(n) : n;
              update("current_weight", kg);
            }}
            testID="profile-cur-weight"
          />
          <WeightField
            label={`Target weight (${p.weight_unit})`}
            value={tDisplay}
            unit={p.weight_unit}
            onCommit={(val) => {
              const n = parseFloat(String(val)) || 0;
              const kg = p.weight_unit === "lb" ? lbToKg(n) : n;
              update("target_weight", kg);
            }}
            testID="profile-target-weight"
          />
          <View style={styles.row}>
            <Text style={[{ color: colors.muted, fontWeight: "600", flex: 1 }]}>Activity level</Text>
          </View>
          <View style={styles.activityWrap}>
            {([
              ["sedentary", "Sedentary"],
              ["lightly_active", "Lightly"],
              ["moderately_active", "Moderate"],
              ["very_active", "Very"],
              ["extremely_active", "Extreme"],
            ] as const).map(([a, label]) => (
              <TouchableOpacity
                key={a}
                testID={`activity-${a}`}
                onPress={() => update("activity_level", a)}
                style={[
                  styles.activityChip,
                  { backgroundColor: p.activity_level === a ? colors.primary : colors.chipBg },
                ]}
              >
                <Text style={[styles.activityChipTxt, { color: p.activity_level === a ? "#fff" : colors.text }]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity testID="profile-save-btn" style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={onSave}>
          <Text style={styles.saveBtnTxt}>{saved ? "Saved ✓ — goals recomputed" : "Save & recompute goals"}</Text>
        </TouchableOpacity>

        {/* Water goal */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Ionicons name="water" size={16} color={colors.protein} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Water goal</Text>
          </View>
          <Text style={[styles.muted, { color: colors.muted }]}>
            Auto-computed: <Text style={{ fontWeight: "800", color: colors.text }}>{computeWaterGoalMl({ ...p, custom_water_goal_ml: null })} ml</Text> ({Math.round(cupsFromMl(computeWaterGoalMl({ ...p, custom_water_goal_ml: null })))} cups) based on your weight + {goalMeta.label} mode + {p.weekly_exercises}× training/wk.
          </Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {[1500, 2000, 2500, 3000, 3500, 4000].map((ml) => {
              const active = p.custom_water_goal_ml === ml;
              return (
                <TouchableOpacity key={ml} testID={`water-${ml}`} onPress={() => update("custom_water_goal_ml", ml)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: active ? colors.protein : colors.chipBg }}>
                  <Text style={{ color: active ? "#fff" : colors.text, fontWeight: "800", fontSize: 11 }}>{ml} ml</Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity testID="water-auto" onPress={() => update("custom_water_goal_ml", null)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: p.custom_water_goal_ml === null ? colors.primary : colors.chipBg }}>
              <Text style={{ color: p.custom_water_goal_ml === null ? "#fff" : colors.text, fontWeight: "800", fontSize: 11 }}>AUTO</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>About</Text>
          <Text style={[styles.muted, { color: colors.muted }]}>
            MacroTrack AI · personal · Gemini 3 Pro vision · Open Food Facts · v1.2 (Coach + Smart Goals)
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Field({ label, value, onChangeText, keyboardType, testID, colors }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 12 }}>{label}</Text>
      <TextInput testID={testID} value={value} onChangeText={onChangeText} keyboardType={keyboardType || "default"} placeholderTextColor={colors.muted} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: colors.text, fontWeight: "600", backgroundColor: colors.bg }} />
    </View>
  );
}

function NumField({ label, suffix, value, onChange, testID }: { label: string; suffix: string; value: number; onChange: (n: number) => void; testID?: string }) {
  const { colors } = useTheme();
  const [s, setS] = React.useState<string>(String(Math.round(value || 0)));
  React.useEffect(() => { setS(String(Math.round(value || 0))); }, [value]);
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.bg }}>
        <TextInput
          testID={testID}
          value={s}
          onChangeText={(t) => {
            const cleaned = t.replace(/[^0-9]/g, "");
            setS(cleaned);
            const n = parseInt(cleaned || "0", 10);
            onChange(Number.isFinite(n) ? n : 0);
          }}
          keyboardType="number-pad"
          maxLength={5}
          style={{ flex: 1, paddingVertical: 12, color: colors.text, fontWeight: "800", fontSize: 16 }}
        />
        <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 12 }}>{suffix}</Text>
      </View>
    </View>
  );
}

function WeightField({ label, value, unit, onCommit, testID }: { label: string; value: number | string; unit: "kg" | "lb"; onCommit: (val: number | string) => void; testID?: string }) {
  const { colors } = useTheme();
  const [txt, setTxt] = React.useState<string>(() => (typeof value === "number" ? String(value) : value || ""));
  React.useEffect(() => { setTxt(typeof value === "number" ? String(value) : value || ""); }, [value]);
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 12 }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, backgroundColor: colors.bg }}>
        <TextInput
          testID={testID}
          value={txt}
          onChangeText={(t) => {
            // allow digits and a single decimal point; preserve user edits
            const cleaned = t.replace(/[^0-9.]/g, "");
            // avoid multiple dots
            const parts = cleaned.split('.');
            const normalized = parts.length > 1 ? parts[0] + '.' + parts.slice(1).join('') : parts[0];
            setTxt(normalized);
          }}
          onBlur={() => {
            // commit parsed float
            const n = parseFloat(txt.replace(/\.$/, '')) || 0;
            onCommit(n);
            setTxt(String(n));
          }}
          keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
          placeholder={unit === 'kg' ? 'e.g. 75.0' : 'e.g. 165.0'}
          style={{ flex: 1, paddingVertical: 12, color: colors.text, fontWeight: "800", fontSize: 16 }}
        />
        <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 12, marginLeft: 8 }}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: 120 },
  h1: { fontSize: 28, fontWeight: "800" },
  card: { borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, gap: 12 },
  cardTitle: { fontWeight: "800", textTransform: "uppercase", fontSize: 12, letterSpacing: 0.5 },
  muted: { fontSize: 12, fontWeight: "600" },
  goalGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  goalCard: { width: "48%", padding: 12, borderRadius: 16, borderWidth: 2, gap: 4 },
  goalLabel: { fontWeight: "800", fontSize: 14 },
  goalDesc: { fontSize: 11, fontWeight: "600" },
  summary: { padding: 12, borderRadius: 12 },
  summaryTxt: { fontWeight: "700", fontSize: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  rowTitle: { fontWeight: "700", fontSize: 15 },
  toggle: { flexDirection: "row", padding: 4, borderRadius: 999, gap: 2 },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  toggleTxt: { fontWeight: "800", fontSize: 12 },
  miniBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, margin: 2 },
  miniBtnTxt: { fontSize: 11, fontWeight: "700" },
  activityWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  activityChip: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, minWidth: 80, alignItems: "center" },
  activityChipTxt: { fontSize: 12, fontWeight: "800" },
  saveBtn: { paddingVertical: 16, borderRadius: 999, alignItems: "center" },
  saveBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
});
