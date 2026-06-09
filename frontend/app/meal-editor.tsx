/**
 * Editable AI Meal Breakdown — "Tree" structure
 *
 * Receives ingredients from scan-camera (image AI) or analyze-meal-text (text AI),
 * lets the user fix mis-identifications inline, recomputes totals live, and saves
 * one consolidated entry to the food log.
 *
 * Route params (all stringified):
 *   payload: JSON.stringify({ name, calories, protein, carbs, fat, ingredients_list, source })
 *   meal:    "breakfast" | "lunch" | "dinner" | "snack"
 *   date:    YYYY-MM-DD
 *   notes:   optional user note
 */

import React, { useMemo, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  KeyboardAvoidingView, Platform, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useTheme, radii, spacing, shadow } from "@/src/theme";
import { api, todayStr } from "@/src/api";

type Ing = {
  id: string;
  name: string;
  weight_grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: number;
  user_edited: boolean;
};

type Meal = "breakfast" | "lunch" | "dinner" | "snack";

const uid = () => Math.random().toString(36).slice(2, 10);

function ingFrom(raw: any): Ing {
  return {
    id: uid(),
    name: String(raw?.name || "Item"),
    weight_grams: +Number(raw?.weight_grams || 0).toFixed(1),
    calories: +Number(raw?.calories || 0).toFixed(1),
    protein: +Number(raw?.protein || 0).toFixed(1),
    carbs: +Number(raw?.carbs || 0).toFixed(1),
    fat: +Number(raw?.fat || 0).toFixed(1),
    confidence: Math.max(0, Math.min(1, Number(raw?.confidence ?? 0.75))),
    user_edited: !!raw?.user_edited,
  };
}

export default function MealEditor() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ payload?: string; meal?: Meal; date?: string; notes?: string }>();

  let parsed: any = {};
  try { parsed = JSON.parse(String(params.payload || "{}")); } catch {}

  const [mealName, setMealName] = useState<string>(parsed.name || "My meal");
  const [meal, setMeal] = useState<Meal>((params.meal as Meal) || "snack");
  const [ings, setIngs] = useState<Ing[]>(
    (Array.isArray(parsed.ingredients_list) && parsed.ingredients_list.length > 0
      ? parsed.ingredients_list
      : [{ name: parsed.name || "Item", weight_grams: 100, calories: parsed.calories || 0, protein: parsed.protein || 0, carbs: parsed.carbs || 0, fat: parsed.fat || 0, confidence: 0.7 }]
    ).map(ingFrom)
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [note, setNote] = useState<string>(String(params.notes || ""));
  const [saving, setSaving] = useState(false);
  const targetDate = String(params.date || todayStr());
  const source = String(parsed.source || "ai"); // "ai-photo" | "ai-text" | "manual"

  // ----- Real-time totals -----
  const totals = useMemo(() => {
    return ings.reduce((a, i) => ({
      calories: a.calories + i.calories,
      protein: a.protein + i.protein,
      carbs: a.carbs + i.carbs,
      fat: a.fat + i.fat,
      grams: a.grams + i.weight_grams,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0, grams: 0 });
  }, [ings]);

  // ----- Mutations -----
  const patchIng = useCallback((id: string, patch: Partial<Ing>) => {
    setIngs((arr) => arr.map((i) => i.id === id ? { ...i, ...patch, user_edited: true } : i));
  }, []);

  const deleteIng = useCallback((id: string) => {
    setIngs((arr) => arr.filter((i) => i.id !== id));
  }, []);

  const addBlankIng = useCallback(() => {
    const fresh: Ing = { id: uid(), name: "New ingredient", weight_grams: 50, calories: 100, protein: 5, carbs: 10, fat: 3, confidence: 1, user_edited: true };
    setIngs((arr) => [...arr, fresh]);
    setExpandedId(fresh.id);
  }, []);

  // When the user changes grams, proportionally rescale macros (assuming density was right).
  const rescaleByGrams = (i: Ing, newGrams: number): Ing => {
    if (i.weight_grams <= 0) return { ...i, weight_grams: newGrams, user_edited: true };
    const factor = newGrams / i.weight_grams;
    return {
      ...i,
      weight_grams: +newGrams.toFixed(1),
      calories: +(i.calories * factor).toFixed(1),
      protein: +(i.protein * factor).toFixed(1),
      carbs: +(i.carbs * factor).toFixed(1),
      fat: +(i.fat * factor).toFixed(1),
      user_edited: true,
    };
  };

  const onSave = async () => {
    if (ings.length === 0) {
      Alert.alert("Add at least one ingredient before saving.");
      return;
    }
    setSaving(true);
    try {
      await api.createFoodLog({
        date: targetDate,
        meal_type: meal,
        name: mealName.trim() || "Meal",
        calories: +totals.calories.toFixed(1),
        protein: +totals.protein.toFixed(1),
        carbs: +totals.carbs.toFixed(1),
        fat: +totals.fat.toFixed(1),
        serving_size: 1,
        serving_unit: "meal",
        servings: 1,
        benefits: note ? [`📝 ${note.slice(0, 80)}`] : [],
        ingredients_list: ings.map((i) => ({
          name: i.name,
          weight_grams: i.weight_grams,
          calories: i.calories,
          protein: i.protein,
          carbs: i.carbs,
          fat: i.fat,
          confidence: i.confidence,
          user_edited: i.user_edited,
        })),
      } as any);
      router.replace("/(tabs)");
    } catch (e: any) {
      Alert.alert("Save failed", String(e?.message || e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={20} testID="meal-close" style={{ width: 44, height: 44, justifyContent: "center" }}>
            <Ionicons name="close" size={26} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Meal breakdown</Text>
          <TouchableOpacity onPress={onSave} hitSlop={20} testID="meal-save" disabled={saving} style={{ paddingHorizontal: 8, height: 44, justifyContent: "center" }}>
            <Text style={[styles.saveTop, { color: colors.primary, opacity: saving ? 0.5 : 1 }]}>{saving ? "..." : "Save"}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          {/* Meal name + meal type */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
            <Text style={[styles.muted, { color: colors.muted }]}>MEAL NAME</Text>
            <TextInput testID="meal-name" value={mealName} onChangeText={setMealName} style={[styles.input, { color: colors.text, borderColor: colors.border }]} />
            <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
              {(["breakfast", "lunch", "dinner", "snack"] as Meal[]).map((m) => (
                <TouchableOpacity key={m} testID={`meal-type-${m}`} onPress={() => setMeal(m)}
                  style={[styles.chip, { backgroundColor: meal === m ? colors.primary : colors.chipBg }]}>
                  <Text style={[styles.chipTxt, { color: meal === m ? "#fff" : colors.text }]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Totals (live) */}
          <View style={[styles.totalsCard, { backgroundColor: colors.primary + "15", borderColor: colors.primary + "30" }]} testID="meal-totals">
            <View style={{ flex: 1 }}>
              <Text style={[styles.muted, { color: colors.primary, fontWeight: "800" }]}>TOTAL · {ings.length} ingredient{ings.length === 1 ? '' : 's'}</Text>
              <Text style={{ color: colors.text, fontWeight: "800", fontSize: 26, marginTop: 2 }}>{Math.round(totals.calories)} kcal</Text>
              <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 12, marginTop: 2 }}>
                P{Math.round(totals.protein)}g · C{Math.round(totals.carbs)}g · F{Math.round(totals.fat)}g · {Math.round(totals.grams)}g total
              </Text>
            </View>
            <View style={[styles.sourcePill, { backgroundColor: colors.primary }]}>
              <Ionicons name={source === "ai-text" ? "chatbubble-ellipses" : source === "ai-photo" ? "camera" : "create"} size={12} color="#fff" />
              <Text style={styles.sourceTxt}>{source === "ai-text" ? "AI text" : source === "ai-photo" ? "AI scan" : "Manual"}</Text>
            </View>
          </View>

          {/* Ingredient branches */}
          <Text style={[styles.muted, { color: colors.muted, marginTop: 4 }]}>INGREDIENTS</Text>
          {ings.map((i, idx) => {
            const expanded = expandedId === i.id;
            const isLowConf = i.confidence < 0.55 && !i.user_edited;
            return (
              <View key={i.id} style={[styles.branch, { borderColor: i.user_edited ? colors.primary : colors.border, backgroundColor: colors.surface }]} testID={`ing-${idx}`}>
                {/* Tree connector */}
                <View style={[styles.treeConn, { backgroundColor: colors.border }]} />

                <TouchableOpacity onPress={() => setExpandedId(expanded ? null : i.id)} style={styles.branchHead}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <Text style={[styles.ingName, { color: colors.text }]} numberOfLines={1}>
                        ├── {i.name}
                      </Text>
                      {i.user_edited && (
                        <View style={[styles.tag, { backgroundColor: colors.primary }]}>
                          <Text style={styles.tagTxt}>EDITED</Text>
                        </View>
                      )}
                      {isLowConf && (
                        <View style={[styles.tag, { backgroundColor: colors.fat }]}>
                          <Text style={styles.tagTxt}>LOW CONF</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.muted, { color: colors.muted, marginTop: 2 }]}>
                      {Math.round(i.weight_grams)}g · {Math.round(i.calories)} kcal · P{Math.round(i.protein)} C{Math.round(i.carbs)} F{Math.round(i.fat)}
                    </Text>
                  </View>
                  <TouchableOpacity testID={`del-ing-${idx}`} hitSlop={8} onPress={() => deleteIng(i.id)} style={[styles.delBtn, { backgroundColor: colors.danger + "15" }]}>
                    <Ionicons name="trash" size={16} color={colors.danger} />
                  </TouchableOpacity>
                  <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
                </TouchableOpacity>

                {expanded && (
                  <View style={{ gap: 8, marginTop: 10 }}>
                    <Text style={[styles.muted, { color: colors.muted }]}>NAME</Text>
                    <TextInput
                      testID={`ing-name-${idx}`}
                      value={i.name}
                      onChangeText={(t) => patchIng(i.id, { name: t })}
                      style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    />
                    {/* Grams: when changed, scale macros */}
                    <Text style={[styles.muted, { color: colors.muted }]}>WEIGHT (g)</Text>
                    <TextInput
                      testID={`ing-grams-${idx}`}
                      value={String(i.weight_grams)}
                      onChangeText={(t) => {
                        const g = parseFloat(t.replace(/[^0-9.]/g, "")) || 0;
                        setIngs((arr) => arr.map((x) => x.id === i.id ? rescaleByGrams(x, g) : x));
                      }}
                      keyboardType="decimal-pad"
                      style={[styles.input, { color: colors.text, borderColor: colors.border }]}
                    />
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <MiniNum label="kcal" value={i.calories} onChange={(v) => patchIng(i.id, { calories: v })} colors={colors} testID={`ing-cal-${idx}`} />
                      <MiniNum label="P" value={i.protein} onChange={(v) => patchIng(i.id, { protein: v })} colors={colors} testID={`ing-p-${idx}`} />
                      <MiniNum label="C" value={i.carbs} onChange={(v) => patchIng(i.id, { carbs: v })} colors={colors} testID={`ing-c-${idx}`} />
                      <MiniNum label="F" value={i.fat} onChange={(v) => patchIng(i.id, { fat: v })} colors={colors} testID={`ing-f-${idx}`} />
                    </View>
                    {!i.user_edited && (
                      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "600" }}>
                        AI confidence: {Math.round(i.confidence * 100)}%
                      </Text>
                    )}
                  </View>
                )}
              </View>
            );
          })}

          {/* Add ingredient button */}
          <TouchableOpacity testID="add-ing" onPress={addBlankIng} style={[styles.addBtn, { borderColor: colors.primary }]}>
            <Ionicons name="add-circle" size={20} color={colors.primary} />
            <Text style={[styles.addBtnTxt, { color: colors.primary }]}>Add an ingredient</Text>
          </TouchableOpacity>

          {/* Notes for future AI improvement */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
            <Text style={[styles.muted, { color: colors.muted }]}>📝 NOTES (corrections for AI)</Text>
            <TextInput
              testID="meal-note"
              placeholder='e.g. "This was brown rice, not white" or "No sauce"'
              placeholderTextColor={colors.muted}
              value={note}
              onChangeText={setNote}
              multiline
              style={[styles.input, { color: colors.text, borderColor: colors.border, minHeight: 60, textAlignVertical: "top" }]}
            />
          </View>

          {/* Save */}
          <TouchableOpacity testID="meal-save-big" disabled={saving} onPress={onSave} style={[styles.saveBig, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}>
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.saveBigTxt}>{saving ? "Saving…" : `Log meal · ${Math.round(totals.calories)} kcal`}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MiniNum({ label, value, onChange, colors, testID }: { label: string; value: number; onChange: (n: number) => void; colors: any; testID?: string }) {
  const [s, setS] = React.useState(String(Math.round(value)));
  React.useEffect(() => { setS(String(Math.round(value))); }, [value]);
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 10, textAlign: "center" }}>{label}</Text>
      <TextInput
        testID={testID}
        value={s}
        onChangeText={(t) => { const c = t.replace(/[^0-9.]/g, ""); setS(c); const n = parseFloat(c || "0") || 0; onChange(n); }}
        keyboardType="decimal-pad"
        style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 8, color: colors.text, fontWeight: "800", textAlign: "center", backgroundColor: colors.bg }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: 12, minHeight: 52 },
  title: { fontWeight: "800", fontSize: 17 },
  saveTop: { fontWeight: "800", fontSize: 16 },
  card: { borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, gap: 6 },
  muted: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontWeight: "600" },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  chipTxt: { fontWeight: "800", fontSize: 12, textTransform: "capitalize" },
  totalsCard: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: radii.xl, padding: spacing.md, borderWidth: 1 },
  sourcePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  sourceTxt: { color: "#fff", fontWeight: "800", fontSize: 10, letterSpacing: 0.5 },
  branch: { borderRadius: radii.xl, padding: spacing.md, borderWidth: 1.5, position: "relative" },
  treeConn: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  branchHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  ingName: { fontWeight: "800", fontSize: 14 },
  tag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  tagTxt: { color: "#fff", fontWeight: "800", fontSize: 9, letterSpacing: 0.5 },
  delBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 999, borderWidth: 2, borderStyle: "dashed" },
  addBtnTxt: { fontWeight: "800" },
  saveBig: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: radii.lg },
  saveBigTxt: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
