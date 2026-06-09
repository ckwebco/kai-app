import React, { useEffect, useState, useRef } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator,
  KeyboardAvoidingView, Platform, Image, Linking, FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useTheme, radii, spacing, shadow } from "@/src/theme";
import { api, todayStr } from "@/src/api";

const CATEGORIES = [
  { key: "all", label: "All", icon: "grid" },
  { key: "breakfast", label: "Breakfast", icon: "sunny" },
  { key: "lunch", label: "Lunch", icon: "fast-food" },
  { key: "dinner", label: "Dinner", icon: "restaurant" },
  { key: "snack", label: "Sweet Treats", icon: "ice-cream" },
  { key: "savoury", label: "Savoury", icon: "pizza" },
  { key: "fast", label: "Fast & Simple", icon: "flash" },
] as const;

type Cat = typeof CATEGORIES[number]["key"];

export default function ImportRecipe() {
  const { colors } = useTheme();
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recipe, setRecipe] = useState<any | null>(null);
  const [scaling, setScaling] = useState(false);

  const [creators, setCreators] = useState<{ handle: string; label: string; note: string }[]>([]);
  const [selectedCreator, setSelectedCreator] = useState("panaceapalm");
  const [feed, setFeed] = useState<any[]>([]);
  const [feedBusy, setFeedBusy] = useState(false);

  const [popular, setPopular] = useState<any[]>([]);
  const [popularBusy, setPopularBusy] = useState(true);

  const [category, setCategory] = useState<Cat>("all");
  const [cached, setCached] = useState<any[]>([]);

  // ---- Need help chat ----
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpInput, setHelpInput] = useState("");
  const [helpBusy, setHelpBusy] = useState(false);
  const [helpMsgs, setHelpMsgs] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const helpScrollRef = useRef<ScrollView | null>(null);

  useEffect(() => {
    api.creators().then((d) => setCreators(d.results || [])).catch(() => setCreators([
      { handle: "panaceapalm", label: "Panacea Palm", note: "Simple ingredients" },
      { handle: "FlexibleDietingLifestyle", label: "Flexible Dieting", note: "Macro-friendly" },
    ]));
    api.popularPicks().then((d) => setPopular(d.results || [])).catch(() => setPopular([])).finally(() => setPopularBusy(false));
  }, []);

  useEffect(() => {
    setFeedBusy(true);
    api.featuredRecipes(selectedCreator).then((r) => setFeed(r.results || [])).catch(() => setFeed([])).finally(() => setFeedBusy(false));
  }, [selectedCreator]);

  useEffect(() => {
    api.recipeCache(category).then((r) => setCached(r.results || [])).catch(() => setCached([]));
  }, [category, recipe]);

  const importUrl = async (forceUrl?: string) => {
    const u = (forceUrl ?? url).trim();
    if (!u) return;
    setBusy(true); setErr(null); setRecipe(null);
    setHelpOpen(false); setHelpMsgs([]);
    try {
      const data = await api.importRecipeUrl(u);
      setRecipe(data);
      if (forceUrl) setUrl(forceUrl);
      const dt: any = data;
      if (dt?.ai_unavailable) {
        setErr(dt.message || "AI parsing unavailable for this URL. You can save the basic metadata.");
      }
    } catch (e: any) {
      const msg = String(e?.message || "");
      // Map backend detail messages to friendly UI text.
      if (msg.includes("Valid http/https url required")) {
        setErr("Enter a valid http(s) URL.");
      } else if (msg.includes("Could not extract recipe data")) {
        setErr("Couldn't extract recipe data (private video or no caption). Try another URL.");
      } else if (msg.includes("not_a_recipe") || msg.toLowerCase().includes("doesn't look like a recipe") || msg.toLowerCase().includes("not a recipe")) {
        setErr("This link doesn't look like a recipe video.");
      } else if (msg.includes("Could not parse recipe") || msg.includes("AI parse failed") || msg.includes("502")) {
        setErr("AI parsing failed. Try again in a moment.");
      } else {
        // Fallback: show original message if available to help debugging.
        setErr(msg ? `Import failed: ${msg}` : "Import failed. Check the URL.");
      }
    } finally { setBusy(false); }
  };

  const askHelp = async (override?: string) => {
    const q = (override ?? helpInput).trim();
    if (!q || helpBusy || !recipe) return;
    setHelpInput("");
    setHelpBusy(true);
    const next = [...helpMsgs, { role: "user" as const, content: q }];
    setHelpMsgs(next);
    try {
      const { reply } = await api.recipeHelp(recipe, q, helpMsgs);
      setHelpMsgs([...next, { role: "assistant", content: reply }]);
      setTimeout(() => helpScrollRef.current?.scrollToEnd({ animated: true }), 80);
    } catch {
      setHelpMsgs([...next, { role: "assistant", content: "Couldn't reach the coach. Try again." }]);
    } finally {
      setHelpBusy(false);
    }
  };

  const saveRecipe = async () => {
    if (!recipe) return;
    try {
      const ps = recipe.per_serving || {};
      const synthetic = {
        name: "(per serving — AI parsed)",
        calories: Number(ps.calories) || 0,
        protein: Number(ps.protein) || 0,
        carbs: Number(ps.carbs) || 0,
        fat: Number(ps.fat) || 0,
        servings: 1, serving_size: 1, serving_unit: "serving",
      };
      const ingredients = (recipe.ingredients || []).map((i: any) => ({
        name: `${i.name}${i.amount ? ` (${i.amount})` : ""}`,
        calories: 0, protein: 0, carbs: 0, fat: 0,
        servings: 1, serving_size: Math.max(1, Number(i.grams) || 50), serving_unit: "g",
      }));
      await api.createRecipe({
        name: recipe.name || "Imported recipe",
        ingredients: [synthetic, ...ingredients],
        total_servings: Math.max(1, Number(recipe.servings) || 1),
      });
      router.back();
    } catch {}
  };

  const logOneServing = async () => {
    if (!recipe) return;
    const ps = recipe.per_serving || {};
    try {
      await api.createFoodLog({
        date: todayStr(),
        meal_type: ["breakfast", "lunch", "dinner", "snack"].includes(recipe.meal_type) ? recipe.meal_type : "snack",
        name: recipe.name || "Imported recipe",
        calories: Number(ps.calories) || 0,
        protein: Number(ps.protein) || 0,
        carbs: Number(ps.carbs) || 0,
        fat: Number(ps.fat) || 0,
        serving_size: 1, serving_unit: "serving", servings: 1,
        benefits: recipe.tags || [],
        ingredients_list: [],
      });
      router.back();
    } catch {}
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={20} testID="import-close" style={{ width: 44, height: 44, justifyContent: "center", alignItems: "center" }}>
            <Ionicons name="close" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>Recipe library</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {/* URL paste */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Paste a link</Text>
            <Text style={[styles.muted, { color: colors.muted }]}>YouTube · TikTok · Instagram — AI parses transcript or caption.</Text>
            <View style={[styles.urlBox, { backgroundColor: colors.bg, borderColor: colors.border }]}>
              <Ionicons name="link" size={18} color={colors.muted} />
              <TextInput
                testID="import-url-input"
                value={url}
                onChangeText={setUrl}
                placeholder="https://youtube.com/shorts/... or tiktok.com/..."
                placeholderTextColor={colors.muted}
                style={[styles.urlInput, { color: colors.text }]}
                autoCapitalize="none"
                keyboardType="url"
                returnKeyType="go"
                onSubmitEditing={() => importUrl()}
              />
              {url ? (
                <TouchableOpacity onPress={() => setUrl("")} hitSlop={6}>
                  <Ionicons name="close-circle" size={18} color={colors.muted} />
                </TouchableOpacity>
              ) : null}
            </View>
            {err && <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 12 }}>{err}</Text>}
            <TouchableOpacity
              testID="import-go-btn"
              onPress={() => importUrl()}
              disabled={busy || !url.trim()}
              style={[styles.bigBtn, { backgroundColor: colors.primary, opacity: busy || !url.trim() ? 0.5 : 1 }]}
            >
              {busy ? <ActivityIndicator color="#fff" /> : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Ionicons name="sparkles" size={16} color="#fff" />
                  <Text style={styles.bigBtnTxt}>Parse with AI</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Popular Picks */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="flame" size={16} color={colors.danger} />
              <Text style={[styles.cardTitle, { color: colors.text }]}>Most popular picks</Text>
            </View>
            <Text style={[styles.muted, { color: colors.muted }]}>Hand-curated viral shorts. Tap to instantly load (cached after first parse).</Text>
            {popularBusy ? <ActivityIndicator color={colors.primary} /> : (
              <FlatList
                horizontal
                data={popular}
                keyExtractor={(it) => it.video_id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingVertical: 6 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    testID={`popular-${item.video_id}`}
                    onPress={() => importUrl(item.url)}
                    style={styles.popularBox}
                    activeOpacity={0.85}
                  >
                    <Image source={{ uri: item.thumbnail }} style={styles.popularThumb} />
                    <View style={styles.popularOverlay}>
                      {item.cached && (
                        <View style={[styles.cachedBadge, { backgroundColor: colors.fat }]}>
                          <Ionicons name="checkmark" size={10} color="#fff" />
                          <Text style={styles.cachedTxt}>READY</Text>
                        </View>
                      )}
                      {item.name && (
                        <Text style={styles.popularName} numberOfLines={2}>{item.name}</Text>
                      )}
                      {item.per_serving?.calories ? (
                        <Text style={styles.popularMacro}>{Math.round(item.per_serving.calories)} kcal · P{Math.round(item.per_serving.protein || 0)}</Text>
                      ) : (
                        <Text style={styles.popularMacro}>Tap to load</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>

          {/* Categories */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Filter saved recipes</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  testID={`cat-${c.key}`}
                  onPress={() => setCategory(c.key as Cat)}
                  style={[styles.catChip, { backgroundColor: category === c.key ? colors.primary : colors.chipBg }]}
                >
                  <Ionicons name={c.icon as any} size={12} color={category === c.key ? "#fff" : colors.text} />
                  <Text style={[styles.catTxt, { color: category === c.key ? "#fff" : colors.text }]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {cached.length === 0 ? (
              <Text style={[styles.muted, { color: colors.muted, paddingVertical: 8 }]}>
                No recipes in this category yet. Tap a popular pick or paste a link above.
              </Text>
            ) : (
              <View style={styles.cachedGrid}>
                {cached.slice(0, 10).map((r: any) => (
                  <TouchableOpacity
                    key={r.cache_key}
                    testID={`cached-${r.cache_key}`}
                    onPress={() => importUrl(r.source_url)}
                    style={[styles.cachedItem, { backgroundColor: colors.bg, borderColor: colors.border }]}
                  >
                    {r.thumbnail ? <Image source={{ uri: r.thumbnail }} style={styles.cachedThumb} /> : null}
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cachedName, { color: colors.text }]} numberOfLines={1}>{r.name}</Text>
                      <Text style={[styles.muted, { color: colors.muted }]} numberOfLines={1}>
                        {Math.round(r.per_serving?.calories || 0)} kcal · {r.meal_type}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Creators */}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Browse creators</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {creators.map((c) => (
                <TouchableOpacity
                  key={c.handle}
                  testID={`creator-${c.handle}`}
                  onPress={() => setSelectedCreator(c.handle)}
                  style={[styles.creatorChip, { backgroundColor: selectedCreator === c.handle ? colors.primary : colors.chipBg }]}
                >
                  <Text style={[styles.creatorLabel, { color: selectedCreator === c.handle ? "#fff" : colors.text }]}>{c.label}</Text>
                  <Text style={[styles.creatorNote, { color: selectedCreator === c.handle ? "#ffffffcc" : colors.muted }]}>{c.note}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {feedBusy ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 12 }} />
            ) : feed.length === 0 ? (
              <Text style={[styles.muted, { color: colors.muted, paddingVertical: 8 }]}>No videos found. Try another creator.</Text>
            ) : (
              <FlatList
                horizontal
                data={feed}
                keyExtractor={(it) => it.video_id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingVertical: 6 }}
                renderItem={({ item }) => (
                  <TouchableOpacity testID={`feed-${item.video_id}`} onPress={() => importUrl(item.url)} style={styles.feedBox}>
                    <Image source={{ uri: item.thumbnail }} style={styles.feedThumb} />
                    <View style={styles.feedOverlay}>
                      <Ionicons name="sparkles" size={12} color="#fff" />
                      <Text style={styles.feedTxt}>Import</Text>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>

          {/* Parsed recipe */}
          {recipe && (
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]} testID="import-result">
              {recipe.thumbnail ? <Image source={{ uri: recipe.thumbnail }} style={styles.heroImg} /> : null}
              {recipe.cached && (
                <View style={[styles.cachedBadge, { backgroundColor: colors.fat, alignSelf: "flex-start" }]}>
                  <Ionicons name="checkmark" size={10} color="#fff" />
                  <Text style={styles.cachedTxt}>FROM CACHE · INSTANT</Text>
                </View>
              )}
              <Text style={[styles.foodName, { color: colors.text }]}>{recipe.name}</Text>
              {recipe.summary ? <Text style={[styles.muted, { color: colors.muted }]}>{recipe.summary}</Text> : null}

              <View style={styles.tagRow}>
                {(recipe.tags || []).slice(0, 5).map((t: string) => (
                  <View key={t} style={[styles.tag, { backgroundColor: colors.chipBg }]}>
                    <Text style={[styles.tagTxt, { color: colors.text }]}>{t}</Text>
                  </View>
                ))}
              </View>

              <View style={[styles.macroBox, { backgroundColor: colors.chipBg }]}>
                <Macro label="kcal" val={Math.round(recipe.per_serving?.calories || 0)} color={colors.primary} />
                <Macro label="P" val={`${Math.round(recipe.per_serving?.protein || 0)}g`} color={colors.protein} />
                <Macro label="C" val={`${Math.round(recipe.per_serving?.carbs || 0)}g`} color={colors.carbs} />
                <Macro label="F" val={`${Math.round(recipe.per_serving?.fat || 0)}g`} color={colors.fat} />
              </View>
              <Text style={[styles.muted, { color: colors.muted }]}>Per serving · {recipe.servings || 1} servings total · {recipe.meal_type}</Text>

              {/* Scale recipe — Gemini-assisted */}
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  testID="scale-half-btn"
                  disabled={scaling}
                  onPress={async () => {
                    setScaling(true);
                    try {
                      const out = await api.recipeScale(recipe, 0.5);
                      setRecipe(out);
                    } catch {} finally { setScaling(false); }
                  }}
                  style={[styles.scaleBtn, { backgroundColor: colors.chipBg, borderColor: colors.border, opacity: scaling ? 0.6 : 1 }]}
                >
                  <Ionicons name="remove" size={14} color={colors.text} />
                  <Text style={[styles.scaleBtnTxt, { color: colors.text }]}>Half recipe</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID="scale-double-btn"
                  disabled={scaling}
                  onPress={async () => {
                    setScaling(true);
                    try {
                      const out = await api.recipeScale(recipe, 2.0);
                      setRecipe(out);
                    } catch {} finally { setScaling(false); }
                  }}
                  style={[styles.scaleBtn, { backgroundColor: colors.primary, borderColor: colors.primary, opacity: scaling ? 0.6 : 1 }]}
                >
                  {scaling ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="add" size={14} color="#fff" />}
                  <Text style={[styles.scaleBtnTxt, { color: "#fff" }]}>Double recipe</Text>
                </TouchableOpacity>
              </View>
              {recipe.scaled_from_factor && recipe.scaled_from_factor !== 1 && (
                <Text style={[styles.muted, { color: colors.primary, fontWeight: "700" }]}>
                  ✨ Scaled {recipe.scaled_from_factor === 2 ? "×2 (doubled)" : recipe.scaled_from_factor === 0.5 ? "÷2 (halved)" : `×${recipe.scaled_from_factor}`} — ingredients & instructions updated by Gemini
                </Text>
              )}

              <Text style={[styles.sectionTitle, { color: colors.text }]}>Ingredients</Text>
              {(recipe.ingredients || []).map((ing: any, i: number) => (
                <View key={i} style={[styles.ingRow, { borderColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.ingName, { color: colors.text }]}>{ing.name}</Text>
                    <Text style={[styles.muted, { color: colors.muted }]}>
                      {ing.amount}{ing.grams ? ` · ~${ing.grams}g` : ""}{ing.alt ? ` · ${ing.alt}` : ""}
                    </Text>
                  </View>
                </View>
              ))}

              <Text style={[styles.sectionTitle, { color: colors.text }]}>Instructions</Text>
              {(recipe.instructions || []).map((step: string, i: number) => (
                <View key={i} style={styles.stepRow}>
                  <View style={[styles.stepNum, { backgroundColor: colors.primary }]}>
                    <Text style={styles.stepNumTxt}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.stepTxt, { color: colors.text }]}>{step}</Text>
                </View>
              ))}

              {/* Need Help */}
              <TouchableOpacity
                testID="need-help-btn"
                onPress={() => setHelpOpen((v) => !v)}
                style={[styles.helpToggle, { backgroundColor: helpOpen ? colors.text : colors.chipBg }]}
              >
                <Ionicons name="chatbubbles" size={16} color={helpOpen ? "#fff" : colors.primary} />
                <Text style={[styles.helpToggleTxt, { color: helpOpen ? "#fff" : colors.text }]}>
                  {helpOpen ? "Hide chat" : "Need help with this recipe?"}
                </Text>
              </TouchableOpacity>

              {helpOpen && (
                <View style={[styles.helpBox, { backgroundColor: colors.bg, borderColor: colors.border }]} testID="recipe-help-box">
                  <ScrollView ref={helpScrollRef} style={{ maxHeight: 260 }} contentContainerStyle={{ padding: 10, gap: 8 }}>
                    {helpMsgs.length === 0 && (
                      <Text style={[styles.muted, { color: colors.muted, padding: 10 }]}>
                        Ask anything — substitutions, scaling, dairy-free swaps, doubling the recipe…
                      </Text>
                    )}
                    {helpMsgs.map((m, i) => (
                      <View key={i} style={[
                        styles.bubble,
                        m.role === "user"
                          ? { backgroundColor: colors.primary, alignSelf: "flex-end" }
                          : { backgroundColor: colors.surface, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.border },
                      ]}>
                        <Text style={{ color: m.role === "user" ? "#fff" : colors.text, fontSize: 13, lineHeight: 19 }}>{m.content}</Text>
                      </View>
                    ))}
                    {helpBusy && <View style={[styles.bubble, { backgroundColor: colors.surface, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.border }]}><ActivityIndicator size="small" color={colors.primary} /></View>}
                  </ScrollView>
                  {helpMsgs.length === 0 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, paddingBottom: 6, gap: 6 }}>
                      {["Make it dairy-free", "Double the recipe", "Higher protein swap", "Air fryer version", "What if I'm out of yogurt?"].map((s) => (
                        <TouchableOpacity key={s} onPress={() => askHelp(s)} style={[styles.suggestChip, { backgroundColor: colors.chipBg }]}>
                          <Text style={[styles.suggestTxt, { color: colors.text }]}>{s}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                  <View style={[styles.helpInputRow, { borderTopColor: colors.border }]}>
                    <TextInput
                      testID="recipe-help-input"
                      value={helpInput}
                      onChangeText={setHelpInput}
                      placeholder="Ask MacroCoach…"
                      placeholderTextColor={colors.muted}
                      style={[styles.helpInput, { color: colors.text }]}
                      multiline
                      onSubmitEditing={() => askHelp()}
                      blurOnSubmit={false}
                    />
                    <TouchableOpacity
                      testID="recipe-help-send"
                      onPress={() => askHelp()}
                      disabled={helpBusy || !helpInput.trim()}
                      style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: helpBusy || !helpInput.trim() ? 0.5 : 1 }]}
                    >
                      <Ionicons name="send" size={16} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {recipe.source_url ? (
                <TouchableOpacity onPress={() => {
                  // Convert YouTube shorts URL to m.youtube.com which opens reliably in browser
                  let openUrl = recipe.source_url as string;
                  const m = openUrl.match(/youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/);
                  if (m) openUrl = `https://m.youtube.com/watch?v=${m[1]}`;
                  Linking.openURL(openUrl).catch(() => {});
                }} testID="open-source-btn" style={[styles.linkBtn, { borderColor: colors.border }]}>
                  <Ionicons name="play-circle" size={16} color={colors.primary} />
                  <Text style={[styles.linkTxt, { color: colors.primary }]}>Watch original {recipe.source ? `(${recipe.source})` : ""}</Text>
                </TouchableOpacity>
              ) : null}

              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity testID="recipe-save-btn" onPress={saveRecipe} style={[styles.bigBtn, { backgroundColor: colors.text, flex: 1 }]}>
                  <Ionicons name="bookmark" size={16} color="#fff" />
                  <Text style={styles.bigBtnTxt}>Save</Text>
                </TouchableOpacity>
                <TouchableOpacity testID="recipe-log-btn" onPress={logOneServing} style={[styles.bigBtn, { backgroundColor: colors.primary, flex: 1.4 }]}>
                  <Ionicons name="add" size={16} color="#fff" />
                  <Text style={styles.bigBtnTxt}>Log 1 serving</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Macro({ label, val, color }: any) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", paddingVertical: 8 }}>
      <Text style={{ color, fontWeight: "800", fontSize: 16 }}>{val}</Text>
      <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase" }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16 },
  title: { fontSize: 20, fontWeight: "800" },
  card: { borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, gap: 10 },
  cardTitle: { fontWeight: "800", fontSize: 14 },
  muted: { fontSize: 12, fontWeight: "600" },
  urlBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 12 : 6, borderRadius: 14, borderWidth: 1 },
  urlInput: { flex: 1, fontWeight: "600", fontSize: 13 },
  bigBtn: { paddingVertical: 14, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  bigBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 14 },

  popularBox: { width: 140, height: 200, borderRadius: 16, overflow: "hidden", position: "relative" },
  popularThumb: { width: "100%", height: "100%", resizeMode: "cover" },
  popularOverlay: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: "#000000bb", gap: 2 },
  popularName: { color: "#fff", fontWeight: "800", fontSize: 11, lineHeight: 14 },
  popularMacro: { color: "#ffffffcc", fontWeight: "700", fontSize: 10 },
  cachedBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, alignSelf: "flex-start", marginBottom: 2 },
  cachedTxt: { color: "#fff", fontWeight: "800", fontSize: 9, letterSpacing: 0.5 },

  catChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  catTxt: { fontWeight: "800", fontSize: 12 },
  cachedGrid: { gap: 6 },
  cachedItem: { flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: 12, borderWidth: 1 },
  cachedThumb: { width: 44, height: 44, borderRadius: 8 },
  cachedName: { fontWeight: "700", fontSize: 13 },

  creatorChip: { padding: 10, borderRadius: 16, minWidth: 140 },
  creatorLabel: { fontWeight: "800", fontSize: 13 },
  creatorNote: { fontSize: 10, fontWeight: "600", marginTop: 2 },
  feedBox: { width: 100, height: 150, borderRadius: 14, overflow: "hidden", position: "relative" },
  feedThumb: { width: "100%", height: "100%", resizeMode: "cover" },
  feedOverlay: { position: "absolute", bottom: 4, left: 4, right: 4, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, backgroundColor: "#000000aa", paddingVertical: 4, borderRadius: 999 },
  feedTxt: { color: "#fff", fontWeight: "800", fontSize: 10 },

  heroImg: { width: "100%", height: 160, borderRadius: 16 },
  foodName: { fontSize: 22, fontWeight: "800" },
  tagRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  tagTxt: { fontSize: 11, fontWeight: "700" },
  macroBox: { flexDirection: "row", borderRadius: 14, padding: 4 },
  scaleBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 999, borderWidth: 1 },
  scaleBtnTxt: { fontWeight: "800", fontSize: 13 },
  sectionTitle: { fontWeight: "800", fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6 },
  ingRow: { paddingVertical: 8, borderTopWidth: 1 },
  ingName: { fontWeight: "700", fontSize: 13 },
  stepRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 4 },
  stepNum: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", marginTop: 1 },
  stepNumTxt: { color: "#fff", fontWeight: "800", fontSize: 11 },
  stepTxt: { flex: 1, fontSize: 13, lineHeight: 19 },

  helpToggle: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderRadius: 14, marginTop: 6 },
  helpToggleTxt: { fontWeight: "800", fontSize: 13 },
  helpBox: { borderRadius: 14, borderWidth: 1, overflow: "hidden", marginTop: 6 },
  bubble: { maxWidth: "88%", padding: 10, borderRadius: 14 },
  suggestChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  suggestTxt: { fontWeight: "700", fontSize: 11 },
  helpInputRow: { flexDirection: "row", alignItems: "flex-end", padding: 8, gap: 6, borderTopWidth: 1 },
  helpInput: { flex: 1, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, fontWeight: "500", maxHeight: 100 },
  sendBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },

  linkBtn: { flexDirection: "row", alignItems: "center", gap: 6, padding: 10, borderRadius: 12, borderWidth: 1, justifyContent: "center" },
  linkTxt: { fontWeight: "800", fontSize: 12 },
});
