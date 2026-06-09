import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useTheme, radii, spacing, shadow } from "@/src/theme";
import { api, todayStr } from "@/src/api";
import { useUndo } from "@/src/ui/undo";

type Ing = { name: string; calories: number; protein: number; carbs: number; fat: number; servings: number; serving_size: number; serving_unit: string };

export default function Recipes() {
  const { colors } = useTheme();
  const router = useRouter();
  const undo = useUndo();
  const [recipes, setRecipes] = useState<any[]>([]);
  const [mode, setMode] = useState<"list" | "build">("list");

  const load = useCallback(async () => {
    try { setRecipes(await api.listRecipes()); } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const logRecipe = async (r: any) => {
    const totals = r.ingredients.reduce((a: any, i: Ing) => {
      const m = i.servings || 1;
      a.cal += (i.calories || 0) * m;
      a.p += (i.protein || 0) * m;
      a.c += (i.carbs || 0) * m;
      a.f += (i.fat || 0) * m;
      return a;
    }, { cal: 0, p: 0, c: 0, f: 0 });
    const perServing = r.total_servings || 1;
    await api.createFoodLog({
      date: todayStr(), meal_type: "snack", name: r.name,
      calories: totals.cal / perServing, protein: totals.p / perServing,
      carbs: totals.c / perServing, fat: totals.f / perServing,
      serving_size: 1, serving_unit: "serving", servings: 1, benefits: [],
    });
    router.back();
    setTimeout(() => undo.show({
      message: `Logged ${r.name}`,
      onUndo: async () => { const list = await api.listFoodLog(todayStr()); if (list[0]?.name === r.name) await api.deleteFoodLog(list[0].id); },
    }), 250);
  };

  const onDelete = async (id: string) => {
    const target = recipes.find((r) => r.id === id);
    if (!target) return;
    await api.deleteRecipe(id);
    setRecipes((r) => r.filter((x) => x.id !== id));
    undo.show({
      message: `Deleted ${target.name}`,
      onUndo: async () => { await api.createRecipe({ name: target.name, ingredients: target.ingredients, total_servings: target.total_servings }); load(); },
    });
  };

  if (mode === "build") return <Builder onDone={() => { setMode("list"); load(); }} colors={colors} />;

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} testID="recipes-close-btn">
          <Ionicons name="close" size={26} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>My recipes</Text>
        <TouchableOpacity onPress={() => setMode("build")} testID="recipes-new-btn">
          <Ionicons name="add" size={28} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {recipes.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="book-outline" size={48} color={colors.muted} />
          <Text style={[styles.emptyTxt, { color: colors.muted }]}>No recipes yet.{"\n"}Tap + to build one — combine multiple foods into one meal.</Text>
          <TouchableOpacity onPress={() => setMode("build")} testID="recipes-first-btn" style={[styles.bigBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.bigBtnTxt}>Create recipe</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: spacing.md, gap: 10 }}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            const t = item.ingredients.reduce((a: any, i: Ing) => ({
              cal: a.cal + (i.calories || 0) * (i.servings || 1),
              p: a.p + (i.protein || 0) * (i.servings || 1),
              c: a.c + (i.carbs || 0) * (i.servings || 1),
              f: a.f + (i.fat || 0) * (i.servings || 1),
            }), { cal: 0, p: 0, c: 0, f: 0 });
            const per = item.total_servings || 1;
            return (
              <View style={[styles.recipeCard, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recipeName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[styles.muted, { color: colors.muted }]}>{item.ingredients.length} ingredients · {per} serving{per !== 1 ? 's' : ''}</Text>
                  <Text style={[styles.muted, { color: colors.muted }]}>{Math.round(t.cal / per)} kcal · P{Math.round(t.p / per)} C{Math.round(t.c / per)} F{Math.round(t.f / per)} per serving</Text>
                </View>
                <TouchableOpacity onPress={() => logRecipe(item)} testID={`recipe-log-${item.id}`} style={[styles.iconCircle, { backgroundColor: colors.primary }]}>
                  <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onDelete(item.id)} testID={`recipe-del-${item.id}`} hitSlop={10}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

function Builder({ onDone, colors }: { onDone: () => void; colors: any }) {
  const [name, setName] = useState("");
  const [totalServings, setTotalServings] = useState("1");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [ingredients, setIngredients] = useState<Ing[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { const d = await api.foodSearch(q.trim()); setResults(d.results || []); } catch { setResults([]); }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const addIng = (item: any) => {
    setIngredients((arr) => [...arr, {
      name: item.name, calories: item.calories || 0, protein: item.protein || 0,
      carbs: item.carbs || 0, fat: item.fat || 0, servings: 1,
      serving_size: item.serving_size || 100, serving_unit: item.serving_unit || "g",
    }]);
    setQ(""); setResults([]);
  };
  const removeIng = (idx: number) => setIngredients((arr) => arr.filter((_, i) => i !== idx));
  const setIngServ = (idx: number, v: number) => setIngredients((arr) => arr.map((x, i) => i === idx ? { ...x, servings: Math.max(0.1, v) } : x));

  const totals = ingredients.reduce((a, i) => ({
    cal: a.cal + i.calories * i.servings,
    p: a.p + i.protein * i.servings,
    c: a.c + i.carbs * i.servings,
    f: a.f + i.fat * i.servings,
  }), { cal: 0, p: 0, c: 0, f: 0 });

  const save = async () => {
    if (!name.trim() || ingredients.length === 0) return;
    setBusy(true);
    try {
      await api.createRecipe({ name: name.trim(), ingredients, total_servings: Math.max(1, parseInt(totalServings, 10) || 1) });
      onDone();
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onDone} testID="build-close-btn"><Ionicons name="chevron-back" size={26} color={colors.text} /></TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>New recipe</Text>
        <View style={{ width: 26 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
          <TextInput
            testID="build-name"
            value={name} onChangeText={setName}
            placeholder="Recipe name (e.g. Protein smoothie)"
            placeholderTextColor={colors.muted}
            style={{ fontSize: 18, fontWeight: "800", color: colors.text, paddingVertical: 8 }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }}>This recipe makes</Text>
            <TextInput
              testID="build-total-servings" value={totalServings} onChangeText={setTotalServings} keyboardType="number-pad"
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, width: 70, textAlign: "center", color: colors.text }}
            />
            <Text style={{ color: colors.muted, fontWeight: "700" }}>serving(s)</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Ingredients</Text>
          {ingredients.length === 0 ? (
            <Text style={[styles.muted, { color: colors.muted }]}>Search foods below and tap + to add.</Text>
          ) : ingredients.map((ing, idx) => (
            <View key={idx} style={[styles.ingRow, { borderColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700" }}>{ing.name}</Text>
                <Text style={[styles.muted, { color: colors.muted }]}>{Math.round(ing.calories * ing.servings)} kcal</Text>
              </View>
              <TouchableOpacity onPress={() => setIngServ(idx, ing.servings - 1)} hitSlop={10}><Ionicons name="remove-circle-outline" size={22} color={colors.muted} /></TouchableOpacity>
              <Text style={{ color: colors.text, fontWeight: "800", minWidth: 32, textAlign: "center" }}>×{ing.servings}</Text>
              <TouchableOpacity onPress={() => setIngServ(idx, ing.servings + 1)} hitSlop={10}><Ionicons name="add-circle-outline" size={22} color={colors.muted} /></TouchableOpacity>
              <TouchableOpacity onPress={() => removeIng(idx)} hitSlop={10}><Ionicons name="trash-outline" size={18} color={colors.danger} /></TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Add ingredient</Text>
          <View style={[styles.inputWrap, { backgroundColor: colors.chipBg, borderColor: colors.border }]}>
            <Ionicons name="search" size={16} color={colors.muted} />
            <TextInput
              testID="build-ing-search" value={q} onChangeText={setQ}
              placeholder="Search foods…" placeholderTextColor={colors.muted}
              style={{ flex: 1, color: colors.text, fontWeight: "600" }}
            />
          </View>
          {results.slice(0, 6).map((r, i) => (
            <TouchableOpacity key={r.code || i} onPress={() => addIng(r)} style={[styles.ingPick, { borderColor: colors.border }]} testID={`build-pick-${i}`}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontWeight: "700" }} numberOfLines={1}>{r.name}</Text>
                <Text style={[styles.muted, { color: colors.muted }]}>{Math.round(r.calories)} kcal · {r.brand || ""}</Text>
              </View>
              <Ionicons name="add-circle" size={22} color={colors.primary} />
            </TouchableOpacity>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Totals</Text>
          <Text style={{ color: colors.text, fontWeight: "800", fontSize: 18 }}>{Math.round(totals.cal)} kcal</Text>
          <Text style={[styles.muted, { color: colors.muted }]}>P{Math.round(totals.p)}g · C{Math.round(totals.c)}g · F{Math.round(totals.f)}g (whole recipe)</Text>
        </View>

        <TouchableOpacity testID="build-save-btn" disabled={busy || !name || ingredients.length === 0} onPress={save}
          style={[styles.saveBtn, { backgroundColor: colors.primary }, (busy || !name || ingredients.length === 0) && { opacity: 0.5 }]}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnTxt}>Save recipe</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md },
  title: { fontSize: 18, fontWeight: "800" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 },
  emptyTxt: { textAlign: "center", lineHeight: 20 },
  bigBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999 },
  bigBtnTxt: { color: "#fff", fontWeight: "800" },
  recipeCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radii.xl, borderWidth: 1 },
  recipeName: { fontWeight: "800", fontSize: 15 },
  muted: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  iconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  card: { borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, gap: 10 },
  sectionTitle: { fontWeight: "800", textTransform: "uppercase", fontSize: 12, letterSpacing: 0.5 },
  ingRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8, borderTopWidth: 1 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, borderWidth: 1 },
  ingPick: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1 },
  saveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 999 },
  saveBtnTxt: { color: "#fff", fontWeight: "800" },
});
