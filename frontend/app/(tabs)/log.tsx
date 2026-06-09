import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useTheme, radii, spacing, shadow } from "@/src/theme";
import { api, todayStr, type FoodLogEntry } from "@/src/api";
import { useUndo } from "@/src/ui/undo";

type Method = {
  key: "search" | "voice" | "manual" | "scan" | "barcode" | "recipes";
  title: string;
  sub: string;
  icon: any;
  bg: string;
  route: any;
};

export default function LogFood() {
  const { colors } = useTheme();
  const router = useRouter();
  const undo = useUndo();
  const [presets, setPresets] = useState<FoodLogEntry[]>([]);

  const load = useCallback(async () => {
    try {
      const last = await api.listFoodLog();
      // de-dup by name, keep most recent — top 8 presets
      const seen = new Set<string>();
      const uniq: FoodLogEntry[] = [];
      for (const e of last) {
        const k = e.name.toLowerCase();
        if (!seen.has(k)) { seen.add(k); uniq.push(e); }
        if (uniq.length >= 8) break;
      }
      setPresets(uniq);
    } catch {}
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const methods: Method[] = [
    { key: "search", title: "Search foods", sub: "Type to find any food (Open Food Facts)", icon: "search", bg: colors.primary, route: { pathname: "/quick-add", params: { tab: "search" } } },
    { key: "voice", title: "Voice / AI log", sub: 'Say "two eggs and toast" — AI parses it', icon: "mic", bg: colors.fat, route: { pathname: "/quick-add", params: { tab: "voice" } } },
    { key: "scan", title: "AI Camera scan", sub: "Snap a meal — Gemini identifies it", icon: "sparkles", bg: colors.carbs, route: "/scan-camera" },
    { key: "barcode", title: "Barcode scan", sub: "Live scan packaged foods", icon: "barcode", bg: colors.text, route: "/scan-barcode" },
    { key: "manual", title: "Quick add", sub: "Just kcal + macros", icon: "create", bg: colors.protein, route: { pathname: "/quick-add", params: { tab: "manual" } } },
    { key: "recipes", title: "My recipes", sub: "Build & save custom recipes", icon: "book", bg: colors.danger, route: "/recipes" },
    { key: "import" as any, title: "Import from YouTube / TikTok", sub: "Paste any link — AI builds recipe + macros", icon: "logo-youtube", bg: "#EC4899", route: "/import-recipe" },
  ];

  const importMethod = { key: "import", title: "Import from YouTube / TikTok", sub: "Paste any link — AI builds the recipe + macros", icon: "logo-youtube", bg: "#EC4899", route: "/import-recipe" } as const;

  const repeatPreset = async (e: FoodLogEntry) => {
    await api.createFoodLog({
      date: todayStr(), meal_type: e.meal_type, name: e.name,
      calories: e.calories, protein: e.protein, carbs: e.carbs, fat: e.fat,
      serving_size: e.serving_size, serving_unit: e.serving_unit, servings: e.servings,
      benefits: e.benefits,
    });
    undo.show({
      message: `Logged ${e.name}`,
      onUndo: async () => { const list = await api.listFoodLog(todayStr()); if (list[0]?.name === e.name) await api.deleteFoodLog(list[0].id); },
    });
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={[styles.h1, { color: colors.text }]}>Log food</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>Pick your favorite way to log.</Text>

        <View style={styles.grid}>
          {methods.map((m) => (
            <TouchableOpacity
              key={m.key}
              testID={`log-${m.key}-btn`}
              style={[styles.tile, { backgroundColor: m.bg }, shadow.card]}
              activeOpacity={0.85}
              onPress={() => router.push(m.route as any)}
            >
              <View style={styles.iconCircle}>
                <Ionicons name={m.icon} size={22} color={m.bg} />
              </View>
              <Text style={styles.tileTitle}>{m.title}</Text>
              <Text style={styles.tileSub} numberOfLines={2}>{m.sub}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {presets.length > 0 && (
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Repeat recent</Text>
            {presets.map((p) => (
              <View key={p.id} style={[styles.presetRow, { borderTopColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: "700" }} numberOfLines={1}>{p.name}</Text>
                  <Text style={[styles.muted, { color: colors.muted }]}>{Math.round(p.calories * (p.servings || 1))} kcal · {p.meal_type}</Text>
                </View>
                <TouchableOpacity onPress={() => repeatPreset(p)} testID={`preset-log-${p.id}`} style={[styles.iconBtn, { backgroundColor: colors.primary }]}>
                  <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={[styles.tip, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
          <Ionicons name="bulb" size={18} color={colors.carbs} />
          <Text style={[styles.tipTxt, { color: colors.muted }]}>Voice tip: in &quot;Voice / AI&quot;, tap the mic key on your phone keyboard and just talk.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: 120 },
  h1: { fontSize: 28, fontWeight: "800" },
  sub: { marginBottom: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { width: "47%", flexGrow: 1, borderRadius: radii.xl, padding: 16, gap: 6, minHeight: 130 },
  iconCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", marginBottom: 4 },
  tileTitle: { color: "#fff", fontSize: 16, fontWeight: "800" },
  tileSub: { color: "#ffffffcc", fontSize: 12, lineHeight: 16 },
  card: { borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, gap: 6 },
  cardTitle: { fontWeight: "800", textTransform: "uppercase", fontSize: 12, letterSpacing: 0.5 },
  presetRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  muted: { fontSize: 12, marginTop: 2 },
  tip: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: radii.lg, borderWidth: 1 },
  tipTxt: { fontSize: 12, flex: 1, lineHeight: 18 },
});
