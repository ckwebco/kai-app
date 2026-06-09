import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, radii, spacing, shadow } from "@/src/theme";
import { api, todayStr, type FoodProduct } from "@/src/api";

type Tab = "search" | "voice" | "quick" | "recent";
type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export default function QuickAdd() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: Tab; meal?: Meal; date?: string }>();
  const [tab, setTab] = useState<Tab>((params.tab as Tab) || (((params as any).tab === "manual") ? "quick" : "search"));
  const [meal, setMeal] = useState<Meal>((params.meal as Meal) || guessMealNow());
  const targetDate = (params.date as string) || todayStr();
  const [selected, setSelected] = useState<(FoodProduct & { code?: string; image_url?: string; serving_sizes?: { label: string; grams: number }[] }) | null>(null);
  const [servings, setServings] = useState(1);
  // Index into selected.serving_sizes (0 = first/default). null when no presets.
  const [servingIdx, setServingIdx] = useState<number | null>(null);

  // Search state
  const [q, setQ] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  // Voice/NL state
  const [voiceTxt, setVoiceTxt] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [voiceErr, setVoiceErr] = useState<string | null>(null);

  // Quick add state
  const [qa, setQa] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });

  // Recent state
  const [recent, setRecent] = useState<any[]>([]);

  // Debounced search
  useEffect(() => {
    if (tab !== "search") return;
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const data = await api.foodSearch(q);
        setResults(data.results || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q, tab]);

  useEffect(() => {
    if (tab !== "recent") return;
    api
      .listFoodLog()
      .then((rows) => {
        const seen = new Set<string>();
        const dedup = rows.filter((r) => {
          const k = r.name.toLowerCase();
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }).slice(0, 25);
        setRecent(dedup);
      })
      .catch(() => setRecent([]));
  }, [tab]);

  const pickFood = useCallback((f: any) => {
    const ss = Array.isArray(f.serving_sizes) ? f.serving_sizes : null;
    setSelected({
      name: f.name,
      brand: f.brand || null,
      calories: Number(f.calories) || 0,   // per 100 g (USDA convention)
      protein: Number(f.protein) || 0,
      carbs: Number(f.carbs) || 0,
      fat: Number(f.fat) || 0,
      serving_size: Number(f.serving_size) || 100,
      serving_unit: f.serving_unit || "g",
      benefits: f.benefits || [],
      ingredients_list: f.ingredients_list || [],
      code: f.code,
      image_url: f.image_url,
      serving_sizes: ss || undefined,
    });
    setServingIdx(ss && ss.length > 0 ? 0 : null);
    setServings(Number(f.servings) || 1);
  }, []);

  const onParseVoice = async () => {
    const t = voiceTxt.trim();
    if (!t) return;
    setVoiceBusy(true);
    setVoiceErr(null);
    try {
      const data = await api.parseFoodText(t);
      pickFood(data);
    } catch (e: any) {
      setVoiceErr(e?.message?.includes("502") ? "Couldn't parse — try rephrasing." : "Parse failed.");
    } finally {
      setVoiceBusy(false);
    }
  };

  const onQuickSave = async () => {
    const name = qa.name.trim() || "Quick add";
    const cal = parseFloat(qa.calories) || 0;
    if (cal <= 0) return;
    try {
      await api.createFoodLog({
        date: targetDate,
        meal_type: meal,
        name,
        calories: cal,
        protein: parseFloat(qa.protein) || 0,
        carbs: parseFloat(qa.carbs) || 0,
        fat: parseFloat(qa.fat) || 0,
        serving_size: 1,
        serving_unit: "serving",
        servings: 1,
        benefits: [],
        ingredients_list: [],
      });
      router.back();
    } catch {}
  };

  const onLogSelected = async () => {
    if (!selected) return;
    // Compute grams-per-serving from the picked serving (or fallback to 100g for raw USDA)
    const ss = selected.serving_sizes;
    const grams = ss && servingIdx != null && ss[servingIdx] ? ss[servingIdx].grams : 100;
    const label = ss && servingIdx != null && ss[servingIdx] ? ss[servingIdx].label : `${selected.serving_size}${selected.serving_unit === "g" ? "g" : ` ${selected.serving_unit}`}`;
    // food.calories is per-100g. Convert to per-serving here so the log row is portable.
    const perServing = (val: number) => +(val * (grams / 100)).toFixed(2);
    try {
      await api.createFoodLog({
        date: targetDate,
        meal_type: meal,
        name: selected.brand ? `${selected.brand} – ${selected.name}` : selected.name,
        calories: perServing(selected.calories),
        protein: perServing(selected.protein),
        carbs: perServing(selected.carbs),
        fat: perServing(selected.fat),
        serving_size: grams,
        serving_unit: label,
        servings,
        benefits: selected.benefits || [],
        ingredients_list: selected.ingredients_list || [],
      });
      router.back();
    } catch {}
  };

  const TabBtn = ({ id, label, icon }: { id: Tab; label: string; icon: any }) => (
    <TouchableOpacity
      testID={`qa-tab-${id}`}
      onPress={() => { setTab(id); setSelected(null); }}
      style={[styles.tabBtn, { backgroundColor: tab === id ? colors.primary : colors.chipBg }]}
    >
      <Ionicons name={icon} size={14} color={tab === id ? "#fff" : colors.text} />
      <Text style={[styles.tabBtnTxt, { color: tab === id ? "#fff" : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} testID="qa-close" hitSlop={20} style={{ width: 44, height: 44, justifyContent: "center", alignItems: "center" }}>
            <Ionicons name="close" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Add Food</Text>
          <View style={{ width: 28 }} />
        </View>

        {/* Meal pill */}
        <View style={styles.mealRow}>
          {(["breakfast", "lunch", "dinner", "snack"] as Meal[]).map((m) => (
            <TouchableOpacity
              key={m}
              testID={`qa-meal-${m}`}
              onPress={() => setMeal(m)}
              style={[
                styles.mealChip,
                { backgroundColor: meal === m ? colors.primary : colors.chipBg },
              ]}
            >
              <Text style={[styles.mealChipTxt, { color: meal === m ? "#fff" : colors.text }]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tabs */}
        <View style={styles.tabRow}>
          <TabBtn id="search" label="Search" icon="search" />
          <TabBtn id="voice" label="Voice / AI" icon="mic" />
          <TabBtn id="quick" label="Quick" icon="flash" />
          <TabBtn id="recent" label="Recent" icon="time" />
        </View>

        {/* Selected food card (sticky) */}
        {selected && (
          <SelectedCard
            food={selected}
            servings={servings}
            onChangeServings={setServings}
            servingIdx={servingIdx}
            onChangeServingIdx={setServingIdx}
            onClear={() => setSelected(null)}
            onLog={onLogSelected}
          />
        )}

        {/* Tab content */}
        {!selected && tab === "search" && (
          <View style={{ flex: 1 }}>
            <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Ionicons name="search" size={18} color={colors.muted} />
              <TextInput
                testID="qa-search-input"
                value={q}
                onChangeText={setQ}
                placeholder="Search any food (apple, oreo, chicken breast)"
                placeholderTextColor={colors.muted}
                style={[styles.searchInput, { color: colors.text }]}
                autoFocus
                returnKeyType="search"
              />
              {searching ? <ActivityIndicator color={colors.primary} /> : null}
            </View>
            <FlatList
              keyboardShouldPersistTaps="handled"
              data={results}
              keyExtractor={(it, i) => `${it.code || i}`}
              ListEmptyComponent={
                <Text style={[styles.emptyTxt, { color: colors.muted }]}>
                  {q.length < 2 ? "Type at least 2 letters to search Open Food Facts (1M+ foods)." : searching ? "" : "No results. Try 'voice / AI' to parse a description."}
                </Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  testID={`qa-result-${item.code || item.name}`}
                  onPress={() => pickFood(item)}
                  style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
                >
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.rowImg} />
                  ) : (
                    <View style={[styles.rowImg, { backgroundColor: colors.chipBg, alignItems: "center", justifyContent: "center" }]}>
                      <Ionicons name="nutrition" size={16} color={colors.muted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.rowSub, { color: colors.muted }]} numberOfLines={1}>
                      {item.brand ? `${item.brand} · ` : ""}
                      {item.default_serving_label && item.default_serving_calories != null
                        ? `${item.default_serving_label} • ${item.default_serving_calories} cal`
                        : `${Math.round(item.calories)} kcal / 100g · P${Math.round(item.protein)} C${Math.round(item.carbs)} F${Math.round(item.fat)}`}
                    </Text>
                  </View>
                  <Ionicons name="add-circle" size={26} color={colors.primary} />
                </TouchableOpacity>
              )}
              contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
            />
          </View>
        )}

        {!selected && tab === "voice" && (
          <ScrollView contentContainerStyle={styles.tabBody} keyboardShouldPersistTaps="handled">
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                <Ionicons name="mic" size={14} color={colors.primary} /> Speak or type what you ate
              </Text>
              <Text style={[styles.muted, { color: colors.muted }]}> 
                Tap the mic on your keyboard 🎤 — say things like &quot;two slices of toast with peanut butter&quot; or &quot;5 gummy bears&quot;.
              </Text>
              <TextInput
                testID="qa-voice-input"
                value={voiceTxt}
                onChangeText={setVoiceTxt}
                placeholder="e.g. two scrambled eggs and one banana"
                placeholderTextColor={colors.muted}
                multiline
                autoFocus={String((params as any).autofocus || "") === "1"}
                style={[styles.textArea, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
              />
              {voiceErr && <Text style={{ color: colors.danger, fontWeight: "700" }}>{voiceErr}</Text>}
              <TouchableOpacity
                testID="qa-voice-parse"
                onPress={onParseVoice}
                disabled={voiceBusy || !voiceTxt.trim()}
                style={[styles.bigBtn, { backgroundColor: colors.primary, opacity: voiceBusy || !voiceTxt.trim() ? 0.6 : 1 }]}
              >
                {voiceBusy ? <ActivityIndicator color="#fff" /> : (
                  <>
                    <Ionicons name="sparkles" size={18} color="#fff" />
                    <Text style={styles.bigBtnTxt}>Parse with AI</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* NEW: Editable AI breakdown */}
              <TouchableOpacity
                testID="qa-meal-breakdown"
                disabled={voiceBusy || !voiceTxt.trim()}
                onPress={async () => {
                  const t = voiceTxt.trim();
                  if (!t) return;
                  setVoiceBusy(true); setVoiceErr(null);
                  try {
                    const data = await api.analyzeMealText(t);
                    const payload = JSON.stringify({
                      name: data.name,
                      calories: data.calories, protein: data.protein, carbs: data.carbs, fat: data.fat,
                      ingredients_list: data.ingredients_list || [],
                      source: "ai-text",
                    });
                    router.push({ pathname: "/meal-editor", params: { payload, meal, date: targetDate } });
                  } catch (e: any) {
                    setVoiceErr(e?.message?.includes("502") ? "AI couldn't break it down — try rephrasing." : "Breakdown failed.");
                  } finally { setVoiceBusy(false); }
                }}
                style={[styles.bigBtn, { backgroundColor: colors.text, opacity: voiceBusy || !voiceTxt.trim() ? 0.5 : 1, marginTop: 8 }]}
              >
                <Ionicons name="git-branch" size={18} color={colors.bg} />
                <Text style={[styles.bigBtnTxt, { color: colors.bg }]}>AI breakdown → edit ingredients</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {!selected && tab === "quick" && (
          <ScrollView contentContainerStyle={styles.tabBody} keyboardShouldPersistTaps="handled">
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Quick add (kcal only)</Text>
              <Text style={[styles.muted, { color: colors.muted }]}>Skip food details — just log calories and optional macros.</Text>
              <Field placeholder="Name (optional)" value={qa.name} onChangeText={(v: string) => setQa({ ...qa, name: v })} testID="qa-quick-name" />
              <View style={styles.gridRow}>
                <Field placeholder="kcal *" value={qa.calories} onChangeText={(v: string) => setQa({ ...qa, calories: v })} keyboardType="numeric" testID="qa-quick-cal" flex />
                <Field placeholder="P (g)" value={qa.protein} onChangeText={(v: string) => setQa({ ...qa, protein: v })} keyboardType="numeric" testID="qa-quick-p" flex />
              </View>
              <View style={styles.gridRow}>
                <Field placeholder="C (g)" value={qa.carbs} onChangeText={(v: string) => setQa({ ...qa, carbs: v })} keyboardType="numeric" testID="qa-quick-c" flex />
                <Field placeholder="F (g)" value={qa.fat} onChangeText={(v: string) => setQa({ ...qa, fat: v })} keyboardType="numeric" testID="qa-quick-f" flex />
              </View>
              <TouchableOpacity
                testID="qa-quick-save"
                style={[styles.bigBtn, { backgroundColor: colors.primary }]}
                onPress={onQuickSave}
              >
                <Ionicons name="checkmark" size={18} color="#fff" />
                <Text style={styles.bigBtnTxt}>Log quick entry</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {!selected && tab === "recent" && (
          <FlatList
            data={recent}
            keyExtractor={(it, i) => it.id || String(i)}
            ListEmptyComponent={<Text style={[styles.emptyTxt, { color: colors.muted }]}>No history yet. Log a meal first.</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity
                testID={`qa-recent-${item.id}`}
                onPress={() => pickFood(item)}
                style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
              >
                <View style={[styles.rowImg, { backgroundColor: colors.chipBg, alignItems: "center", justifyContent: "center" }]}>
                  <Ionicons name="repeat" size={16} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{item.name}</Text>
                  <Text style={[styles.rowSub, { color: colors.muted }]} numberOfLines={1}>
                    {Math.round(item.calories)} kcal · P{Math.round(item.protein)} C{Math.round(item.carbs)} F{Math.round(item.fat)}
                  </Text>
                </View>
                <Ionicons name="add-circle" size={26} color={colors.primary} />
              </TouchableOpacity>
            )}
            contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 40 }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function guessMealNow(): Meal {
  const h = new Date().getHours();
  if (h < 10) return "breakfast";
  if (h < 14) return "lunch";
  if (h < 21) return "dinner";
  return "snack";
}

function Field({ placeholder, value, onChangeText, keyboardType, testID, flex }: any) {
  const { colors } = useTheme();
  return (
    <TextInput
      testID={testID}
      placeholder={placeholder}
      value={value}
      onChangeText={onChangeText}
      keyboardType={keyboardType || "default"}
      placeholderTextColor={colors.muted}
      style={[
        { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, color: colors.text, fontWeight: "600", backgroundColor: colors.bg, minWidth: 0 },
        flex ? { flex: 1, flexBasis: 0 } : null,
      ]}
    />
  );
}

function SelectedCard({
  food,
  servings,
  onChangeServings,
  servingIdx,
  onChangeServingIdx,
  onClear,
  onLog,
}: {
  food: FoodProduct & { image_url?: string; serving_sizes?: { label: string; grams: number }[] };
  servings: number;
  onChangeServings: (n: number) => void;
  servingIdx: number | null;
  onChangeServingIdx: (i: number | null) => void;
  onClear: () => void;
  onLog: () => void;
}) {
  const { colors } = useTheme();
  const sizes = food.serving_sizes;
  const hasSizes = !!sizes && sizes.length > 0;
  const grams = hasSizes && servingIdx != null && sizes![servingIdx] ? sizes![servingIdx].grams : 100;
  const label = hasSizes && servingIdx != null && sizes![servingIdx]
    ? sizes![servingIdx].label
    : (food.serving_unit === "g" ? "100 g" : `1 ${food.serving_unit || "serving"}`);
  // food.calories is per-100g (USDA convention). Convert via gram weight.
  const factor = (grams / 100) * servings;
  const cal = Math.round(food.calories * factor);
  const p = Math.round(food.protein * factor);
  const c = Math.round(food.carbs * factor);
  const f = Math.round(food.fat * factor);

  return (
    <View style={[styles.selectedCard, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]} testID="qa-selected-card">
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={[styles.selImg, { backgroundColor: colors.chipBg }]}>
          {food.image_url ? (
            <Image source={{ uri: food.image_url }} style={styles.selImg} />
          ) : (
            <Ionicons name="nutrition" size={20} color={colors.primary} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.selName, { color: colors.text }]} numberOfLines={1}>{food.name}</Text>
          {food.brand ? <Text style={[styles.muted, { color: colors.muted }]}>{food.brand}</Text> : null}
          <Text style={[styles.muted, { color: colors.muted }]}>
            {label} · {Math.round(food.calories * (grams / 100))} kcal
          </Text>
        </View>
        <TouchableOpacity onPress={onClear} hitSlop={10} testID="qa-clear">
          <Ionicons name="close-circle" size={22} color={colors.muted} />
        </TouchableOpacity>
      </View>

      {/* Serving-size chips */}
      {hasSizes && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
          {sizes!.map((s, i) => {
            const active = servingIdx === i;
            return (
              <TouchableOpacity
                key={`${s.label}-${i}`}
                testID={`qa-serving-${i}`}
                onPress={() => onChangeServingIdx(i)}
                style={[
                  styles.servChip,
                  { backgroundColor: active ? colors.primary : colors.chipBg, borderColor: active ? colors.primary : colors.border },
                ]}
              >
                <Text style={[styles.servChipTxt, { color: active ? "#fff" : colors.text }]}>{s.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Qty stepper */}
      <View style={[styles.qtyBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
        <TouchableOpacity
          testID="qa-qty-dec"
          onPress={() => onChangeServings(Math.max(0.25, +(servings - (servings > 1 ? 1 : 0.25)).toFixed(2)))}
          style={[styles.qtyBtn, { backgroundColor: colors.chipBg }]}
        >
          <Ionicons name="remove" size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[styles.qtyVal, { color: colors.text }]}>{fmtQty(servings)}</Text>
          <Text style={[styles.qtyUnit, { color: colors.muted }]}>× {label}</Text>
        </View>
        <TouchableOpacity
          testID="qa-qty-inc"
          onPress={() => onChangeServings(+(servings + (servings >= 1 ? 1 : 0.25)).toFixed(2))}
          style={[styles.qtyBtn, { backgroundColor: colors.chipBg }]}
        >
          <Ionicons name="add" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {/* Macros preview */}
      <View style={styles.macroPreview}>
        <Stat label="kcal" val={cal} color={colors.primary} />
        <Stat label="P" val={`${p}g`} color={colors.protein} />
        <Stat label="C" val={`${c}g`} color={colors.carbs} />
        <Stat label="F" val={`${f}g`} color={colors.fat} />
      </View>

      <TouchableOpacity testID="qa-log-selected" style={[styles.bigBtn, { backgroundColor: colors.primary }]} onPress={onLog}>
        <Ionicons name="checkmark" size={18} color="#fff" />
        <Text style={styles.bigBtnTxt}>Log to diary</Text>
      </TouchableOpacity>
    </View>
  );
}

function Stat({ label, val, color }: any) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 6, backgroundColor: colors.chipBg, borderRadius: 10 }}>
      <Text style={{ color, fontWeight: "800", fontSize: 13 }}>{val}</Text>
      <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>{label}</Text>
    </View>
  );
}

function fmtQty(n: number) {
  if (Math.abs(n - Math.round(n)) < 0.01) return String(Math.round(n));
  return n.toFixed(2).replace(/0$/, "");
}

function pluralize(unit: string) {
  if (!unit || unit === "g") return "g";
  if (unit.endsWith("y")) return unit.slice(0, -1) + "ies";
  if (unit.endsWith("s")) return unit;
  return unit + "s";
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { fontSize: 20, fontWeight: "800" },
  mealRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 10, flexWrap: "wrap" },
  mealChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  mealChipTxt: { fontWeight: "700", textTransform: "capitalize", fontSize: 13 },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 10, borderRadius: 999 },
  tabBtnTxt: { fontWeight: "800", fontSize: 12 },
  searchBox: { marginHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 12 : 4, borderRadius: 16, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 15, fontWeight: "600" },
  emptyTxt: { textAlign: "center", paddingTop: 30, paddingHorizontal: 20, fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, padding: 10, borderRadius: 16, borderWidth: 1 },
  rowImg: { width: 44, height: 44, borderRadius: 10 },
  rowName: { fontWeight: "700", fontSize: 14 },
  rowSub: { fontSize: 12, fontWeight: "600", marginTop: 2 },
  tabBody: { padding: 16, gap: 12, paddingBottom: 60 },
  card: { borderRadius: radii.xl, padding: 16, gap: 12, borderWidth: 1 },
  cardTitle: { fontWeight: "800", fontSize: 14 },
  muted: { fontSize: 12, fontWeight: "600" },
  textArea: { minHeight: 100, borderWidth: 1, borderRadius: 14, padding: 14, fontSize: 14, fontWeight: "500", textAlignVertical: "top" },
  bigBtn: { paddingVertical: 14, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  bigBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },
  gridRow: { flexDirection: "row", gap: 8 },
  selectedCard: { margin: 16, padding: 16, borderRadius: radii.xl, borderWidth: 1, gap: 12 },
  selImg: { width: 56, height: 56, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  selName: { fontSize: 16, fontWeight: "800" },
  qtyBox: { flexDirection: "row", alignItems: "center", padding: 6, borderRadius: 999, borderWidth: 1 },
  servChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  servChipTxt: { fontWeight: "700", fontSize: 12 },
  qtyBtn: { width: 40, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  qtyVal: { fontSize: 22, fontWeight: "800" },
  qtyUnit: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  macroPreview: { flexDirection: "row", gap: 6 },
});
