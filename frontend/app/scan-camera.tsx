import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  ScrollView,
  TextInput,
  Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, radii, spacing, shadow } from "@/src/theme";
import { api, todayStr, type FoodProduct } from "@/src/api";

export default function ScanCamera() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"back" | "front">("back");
  const [captured, setCaptured] = useState<string | null>(null);
  const [rawB64, setRawB64] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<FoodProduct | null>(null);
  const [notes, setNotes] = useState("");
  const [servings, setServings] = useState("1");
  const [meal, setMeal] = useState<"breakfast" | "lunch" | "dinner" | "snack">("snack");
  const [error, setError] = useState<string | null>(null);
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineNote, setRefineNote] = useState("");
  const [removedIngs, setRemovedIngs] = useState<Set<string>>(new Set());

  const close = () => router.back();

  const ensurePermission = async () => {
    if (!permission) return false;
    if (permission.granted) return true;
    const res = await requestPermission();
    return res.granted;
  };

  const onCapture = useCallback(async () => {
    setError(null);
    const ok = await ensurePermission();
    if (!ok) {
      setError("Camera permission denied. Enable it in your device settings.");
      return;
    }
    try {
      const photo = await cameraRef.current?.takePictureAsync({
        quality: 0.6,
        base64: true,
        skipProcessing: false,
      });
      if (!photo?.base64) {
        setError("Couldn't capture frame. Try again.");
        return;
      }
      setCaptured(`data:image/jpeg;base64,${photo.base64}`);
      setRawB64(photo.base64);
      setAnalyzing(true);
      const product = await api.analyzeFood(photo.base64, notes);
      setResult(product);
      setRefineOpen(false);
      setRefineNote("");
      setRemovedIngs(new Set());
    } catch (e: any) {
      // Backend now sends meaningful messages like "Image is too small or corrupted"
      // or "AI is busy right now". Pull the cleanest part out of the FastAPI error envelope.
      const raw = String(e?.message || e || "");
      const friendly = raw
        .replace(/^HTTP \d+:?\s*/i, "")
        .replace(/^\{.*?"detail":\s*"?/, "")
        .replace(/"?\}\s*$/, "")
        .trim() || "Analysis failed. Try a clearer photo or log it manually.";
      setError(friendly);
    } finally {
      setAnalyzing(false);
    }
  }, [notes, permission]);

  const onSave = async () => {
    if (!result) return;
    const s = Math.max(0.1, parseFloat(servings) || 1);
    try {
      await api.createFoodLog({
        date: todayStr(),
        meal_type: meal,
        name: result.name,
        calories: result.calories,
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fat,
        serving_size: result.serving_size,
        serving_unit: result.serving_unit,
        servings: s,
        benefits: result.benefits,
        alternative_suggestion: result.alternative_suggestion || undefined,
        ingredients_list: result.ingredients_list,
      });
      router.back();
    } catch (e) {
      setError("Could not save. Check connection.");
    }
  };

  const retake = () => {
    setCaptured(null);
    setRawB64(null);
    setResult(null);
    setError(null);
    setRefineOpen(false);
    setRefineNote("");
    setRemovedIngs(new Set());
  };

  const toggleRemove = (name: string) => {
    setRemovedIngs((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name); else n.add(name);
      return n;
    });
  };

  const onReanalyze = async () => {
    if (!rawB64) return;
    setAnalyzing(true);
    setError(null);
    try {
      const removeList = Array.from(removedIngs);
      const parts: string[] = [];
      if (refineNote.trim()) parts.push(`User correction: ${refineNote.trim()}.`);
      if (removeList.length) parts.push(`REMOVE these ingredients (you misidentified them): ${removeList.join(", ")}. Recompute macros without them.`);
      if (notes.trim()) parts.push(`Original note: ${notes.trim()}.`);
      const fullNote = parts.join(" ");
      const product = await api.analyzeFood(rawB64, fullNote);
      setResult(product);
      setRefineOpen(false);
      setRefineNote("");
      setRemovedIngs(new Set());
    } catch (e: any) {
      setError(e?.message || "Re-analysis failed.");
    } finally {
      setAnalyzing(false);
    }
  };

  // No permission yet
  if (!permission) {
    return <View style={styles.fill}><ActivityIndicator color={theme.primary} /></View>;
  }
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permWrap}>
        <Ionicons name="camera-outline" size={56} color="#fff" />
        <Text style={styles.permTitle}>Camera access</Text>
        <Text style={styles.permSub}>MacroTrack AI needs your camera to scan food and identify nutrition.</Text>
        <TouchableOpacity testID="grant-camera-btn" style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnTxt}>Grant access</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={close} style={{ marginTop: 16 }}>
          <Text style={styles.linkLight}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Result screen
  if (result && captured) {
    const s = Math.max(0.1, parseFloat(servings) || 1);
    return (
      <SafeAreaView style={styles.fill} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.resultScroll} testID="scan-result-view">
          <View style={[styles.resultHeader, { paddingTop: 8 }]}>
            <TouchableOpacity onPress={retake} testID="result-back-btn" hitSlop={20} style={{ width: 44, height: 44, justifyContent: "center", alignItems: "center" }}>
              <Ionicons name="chevron-back" size={28} color={theme.text} />
            </TouchableOpacity>
            <Text style={styles.resultTitle}>Scan result</Text>
            <View style={{ width: 44 }} />
          </View>

          <Image source={{ uri: captured }} style={styles.preview} />

          <View style={[styles.card, shadow.card]}>
            <Text style={styles.foodName}>{result.name}</Text>
            {result.brand ? <Text style={styles.muted}>{result.brand}</Text> : null}
            <View style={styles.macroGrid}>
              <Macro label="kcal" value={Math.round(result.calories * s)} color={theme.primary} />
              <Macro label="Protein" value={`${Math.round(result.protein * s)}g`} color={theme.protein} />
              <Macro label="Carbs" value={`${Math.round(result.carbs * s)}g`} color={theme.carbs} />
              <Macro label="Fat" value={`${Math.round(result.fat * s)}g`} color={theme.fat} />
            </View>
            <Text style={styles.muted}>Per {result.serving_size}{result.serving_unit} · {s} serving{s !== 1 ? 's' : ''}</Text>
          </View>

          {/* Edit ingredients in tree editor */}
          <TouchableOpacity
            testID="edit-breakdown-btn"
            style={[styles.card, shadow.card, { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.primary }]}
            onPress={() => {
              const payload = JSON.stringify({
                name: result.name,
                calories: result.calories * s,
                protein: result.protein * s,
                carbs: result.carbs * s,
                fat: result.fat * s,
                ingredients_list: (result.ingredients_list || []).map((ing) => ({
                  ...ing,
                  // Scale by serving multiplier so editor totals match what user sees
                  weight_grams: ((ing as any).weight_grams || 0) * s,
                  calories: ((ing as any).calories || 0) * s,
                  protein: ((ing as any).protein || 0) * s,
                  carbs: ((ing as any).carbs || 0) * s,
                  fat: ((ing as any).fat || 0) * s,
                })),
                source: "ai-photo",
              });
              router.push({ pathname: "/meal-editor", params: { payload, meal, notes } });
            }}
          >
            <Ionicons name="git-branch" size={20} color="#fff" />
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#fff", fontWeight: "800", fontSize: 14 }}>Edit ingredient breakdown</Text>
              <Text style={{ color: "#fff", fontSize: 11, opacity: 0.85 }}>Fix mistakes, remove items, recompute totals live</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#fff" />
          </TouchableOpacity>

          {result.ingredients_list?.length > 0 && (
            <View style={[styles.card, shadow.card]}>
              <Text style={styles.cardTitle}>Ingredients detected</Text>
              <Text style={styles.muted}>Tap × to mark wrong — then &quot;Re-analyze&quot; to recompute macros without them.</Text>
              {result.ingredients_list.map((ing, i) => {
                const removed = removedIngs.has(ing.name);
                return (
                  <View key={i} style={[styles.ingRow, { flexDirection: "row", alignItems: "center", gap: 8 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.ingName, removed && { textDecorationLine: "line-through", opacity: 0.5 }]}>{ing.name}</Text>
                      <Text style={[styles.muted, removed && { opacity: 0.5 }]}>{Math.round(ing.weight_grams)}g · {Math.round(ing.calories)} kcal</Text>
                    </View>
                    <TouchableOpacity testID={`remove-ing-${i}`} onPress={() => toggleRemove(ing.name)} hitSlop={8}>
                      <Ionicons name={removed ? "refresh-circle" : "close-circle"} size={22} color={removed ? theme.fat : theme.danger} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Refine card */}
          <View style={[styles.card, shadow.card]}>
            <TouchableOpacity testID="refine-toggle" onPress={() => setRefineOpen(v => !v)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons name={refineOpen ? "chevron-down" : "chevron-forward"} size={18} color={theme.text} />
              <Text style={styles.cardTitle}>AI got it wrong? Refine ✨</Text>
            </TouchableOpacity>
            {refineOpen && (
              <>
                <Text style={styles.muted}>Add details like &quot;cooked in butter&quot;, &quot;extra cheese&quot;, &quot;no oil&quot; — AI re-analyzes with your notes + removes any ingredients you crossed out above.</Text>
                <TextInput
                  testID="refine-note-input"
                  placeholder="e.g. 'cooked in butter', 'sugar-free', 'add 2 eggs'"
                  placeholderTextColor={theme.muted}
                  value={refineNote}
                  onChangeText={setRefineNote}
                  multiline
                  style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 12, minHeight: 70, color: theme.text, backgroundColor: theme.bg, textAlignVertical: "top", fontWeight: "500" }}
                />
                <TouchableOpacity
                  testID="reanalyze-btn"
                  onPress={onReanalyze}
                  disabled={analyzing || (!refineNote.trim() && removedIngs.size === 0)}
                  style={[styles.saveBtn, { backgroundColor: theme.primary, opacity: analyzing || (!refineNote.trim() && removedIngs.size === 0) ? 0.5 : 1 }]}
                >
                  {analyzing ? <ActivityIndicator color="#fff" /> : (
                    <>
                      <Ionicons name="sparkles" size={16} color="#fff" />
                      <Text style={styles.saveBtnTxt}>Re-analyze with notes</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>

          {result.benefits?.length > 0 && (
            <View style={[styles.card, shadow.card]}>
              <Text style={styles.cardTitle}>Benefits ✨</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {result.benefits.map((b, i) => {
                  const colors = [
                    ["#FDE68A", "#F59E0B"], ["#FCA5A5", "#EF4444"],
                    ["#A7F3D0", "#10B981"], ["#BFDBFE", "#3B82F6"],
                  ][i % 4];
                  const icons = ["sparkles", "flash", "leaf", "moon"] as const;
                  return (
                    <View key={i} style={{ flexBasis: "47%", flexGrow: 1, backgroundColor: colors[0], borderRadius: 16, padding: 12, gap: 4 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors[1], alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name={icons[i % 4]} size={14} color="#fff" />
                      </View>
                      <Text style={{ color: "#0F172A", fontWeight: "800", fontSize: 13, lineHeight: 17 }}>{b}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {(result.fiber || result.sodium_mg || result.caffeine_mg || (result.vitamins && result.vitamins.length > 0)) ? (
            <View style={[styles.card, shadow.card]}>
              <Text style={styles.cardTitle}>Micronutrients</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {result.fiber ? <View style={{ backgroundColor: "#F1F5F9", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}><Text style={{ fontWeight: "700", fontSize: 11 }}>Fiber {Math.round(result.fiber)}g</Text></View> : null}
                {result.sugar ? <View style={{ backgroundColor: "#F1F5F9", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}><Text style={{ fontWeight: "700", fontSize: 11 }}>Sugar {Math.round(result.sugar)}g</Text></View> : null}
                {result.sodium_mg ? <View style={{ backgroundColor: "#F1F5F9", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}><Text style={{ fontWeight: "700", fontSize: 11 }}>Sodium {Math.round(result.sodium_mg)}mg</Text></View> : null}
                {result.caffeine_mg ? <View style={{ backgroundColor: "#F1F5F9", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}><Text style={{ fontWeight: "700", fontSize: 11 }}>Caffeine {Math.round(result.caffeine_mg)}mg</Text></View> : null}
                {(result.vitamins || []).map((v, i) => <View key={i} style={{ backgroundColor: "#DCFCE7", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 }}><Text style={{ fontWeight: "700", fontSize: 11, color: "#065F46" }}>{v}</Text></View>)}
              </View>
            </View>
          ) : null}

          <View style={[styles.card, shadow.card]}>
            <Text style={styles.cardTitle}>Log it</Text>
            <View style={styles.mealRow}>
              {(["breakfast", "lunch", "dinner", "snack"] as const).map((m) => (
                <TouchableOpacity
                  key={m}
                  testID={`meal-${m}`}
                  onPress={() => setMeal(m)}
                  style={[styles.mealChip, meal === m && styles.mealChipActive]}
                >
                  <Text style={[styles.mealChipTxt, meal === m && { color: "#fff" }]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.servingsRow}>
              <Text style={styles.servingsLabel}>Servings</Text>
              <TextInput
                testID="result-servings"
                value={servings}
                onChangeText={setServings}
                keyboardType="decimal-pad"
                style={styles.servingsInput}
              />
            </View>
            <TouchableOpacity testID="log-food-submit" style={styles.saveBtn} onPress={onSave}>
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.saveBtnTxt}>Save to log</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Live camera
  return (
    <View style={styles.fill}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing={facing}
      />

      {/* Top bar */}
      <SafeAreaView style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 12 }]} edges={["top"]}>
        <TouchableOpacity onPress={close} style={styles.iconBtn} testID="close-camera-btn">
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.pill}>
          <Ionicons name="sparkles" size={14} color="#fff" />
          <Text style={styles.pillTxt}>AI FOOD SCAN</Text>
        </View>
        <TouchableOpacity onPress={() => setFacing(f => f === "back" ? "front" : "back")} style={styles.iconBtn} testID="flip-camera-btn">
          <Ionicons name="camera-reverse" size={22} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Viewfinder frame */}
      <View pointerEvents="none" style={styles.frameWrap}>
        <View style={styles.frame}>
          <View style={[styles.corner, styles.cTL]} />
          <View style={[styles.corner, styles.cTR]} />
          <View style={[styles.corner, styles.cBL]} />
          <View style={[styles.corner, styles.cBR]} />
        </View>
        <Text style={styles.hint}>Point at your meal and capture</Text>
      </View>

      {/* Bottom controls */}
      <SafeAreaView style={styles.bottomBar} edges={["bottom"]}>
        <View style={styles.notesWrap}>
          <TextInput
            testID="scan-notes-input"
            placeholder="Optional note (e.g. 'large bowl, with cheese')"
            placeholderTextColor="#ffffff99"
            value={notes}
            onChangeText={setNotes}
            style={styles.notes}
          />
        </View>
        {error && (
          <View style={styles.errBox}>
            <Text style={styles.errTxt}>{error}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                testID="err-retry-btn"
                onPress={() => { setError(null); }}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center" }}
              >
                <Text style={{ color: "#fff", fontWeight: "800", fontSize: 13 }}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="err-manual-btn"
                onPress={() => router.replace({ pathname: "/quick-add", params: { tab: "quick", meal } as any })}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 999, backgroundColor: "#fff", alignItems: "center" }}
              >
                <Text style={{ color: "#000", fontWeight: "800", fontSize: 13 }}>Log manually</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        <View style={styles.shutterRow}>
          <View style={{ width: 56 }} />
          <TouchableOpacity
            testID="capture-btn"
            onPress={onCapture}
            disabled={analyzing}
            style={[styles.shutter, analyzing && { opacity: 0.5 }]}
            activeOpacity={0.8}
          >
            {analyzing ? <ActivityIndicator color={theme.primary} /> : <View style={styles.shutterInner} />}
          </TouchableOpacity>
          <View style={{ width: 56 }} />
        </View>
        <Text style={styles.statusTxt}>
          {analyzing ? "Gemini 3 Pro analyzing…" : "Hold steady and tap the shutter"}
        </Text>
      </SafeAreaView>

      {analyzing && captured && (
        <View style={styles.analyzeOverlay}>
          <Image source={{ uri: captured }} style={styles.analyzePreview} />
          <ActivityIndicator color="#fff" size="large" />
          <Text style={styles.analyzeTxt}>Identifying food and macros…</Text>
        </View>
      )}
    </View>
  );
}

function Macro({ label, value, color }: { label: string; value: any; color: string }) {
  return (
    <View style={styles.macroCell}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroVal}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  permWrap: { flex: 1, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  permTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  permSub: { color: "#ffffffaa", textAlign: "center", fontSize: 14, lineHeight: 20 },
  permBtn: { backgroundColor: theme.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999, marginTop: 8 },
  permBtnTxt: { color: "#fff", fontWeight: "800" },
  linkLight: { color: "#ffffffaa", fontWeight: "600" },

  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#00000088", alignItems: "center", justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#00000088", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  pillTxt: { color: "#fff", fontWeight: "800", fontSize: 11, letterSpacing: 1 },

  frameWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  frame: { width: "78%", aspectRatio: 1, borderRadius: 32 },
  corner: { position: "absolute", width: 32, height: 32, borderColor: "#fff" },
  cTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 24 },
  cTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 24 },
  cBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 24 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 24 },
  hint: { color: "#fff", marginTop: 18, fontWeight: "700", fontSize: 13, opacity: 0.85, textAlign: "center" },

  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, gap: 10 },
  notesWrap: { backgroundColor: "#00000088", borderRadius: 16, paddingHorizontal: 14, paddingVertical: Platform.OS === "ios" ? 12 : 6 },
  notes: { color: "#fff", fontSize: 14 },
  errBox: { backgroundColor: "#ef4444cc", borderRadius: 12, padding: 10 },
  errTxt: { color: "#fff", fontWeight: "700", fontSize: 12, textAlign: "center" },
  shutterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20 },
  shutter: { width: 76, height: 76, borderRadius: 38, backgroundColor: "#ffffff22", borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff" },
  statusTxt: { color: "#ffffffcc", fontSize: 12, textAlign: "center", fontWeight: "600" },

  analyzeOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "#000000dd", alignItems: "center", justifyContent: "center", gap: 16 },
  analyzePreview: { width: 220, height: 220, borderRadius: 24 },
  analyzeTxt: { color: "#fff", fontWeight: "700" },

  resultScroll: { padding: spacing.md, gap: spacing.md, paddingBottom: 60, backgroundColor: theme.bg },
  resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  resultTitle: { color: theme.text, fontSize: 18, fontWeight: "800" },
  preview: { width: "100%", aspectRatio: 1, borderRadius: radii.xl },
  card: { backgroundColor: theme.surface, borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, borderColor: theme.border, gap: 10 },
  cardTitle: { fontWeight: "800", color: theme.text, textTransform: "uppercase", fontSize: 12, letterSpacing: 0.5 },
  foodName: { fontSize: 22, fontWeight: "800", color: theme.text },
  muted: { color: theme.muted, fontSize: 12, fontWeight: "600" },
  macroGrid: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 8 },
  macroCell: { flex: 1, padding: 10, borderRadius: radii.md, backgroundColor: "#F1F5F9", alignItems: "center", gap: 4 },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroLabel: { color: theme.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  macroVal: { color: theme.text, fontWeight: "800", fontSize: 15 },
  ingRow: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: theme.border },
  ingName: { color: theme.text, fontWeight: "700" },
  benefitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  benefitTxt: { color: theme.text, flex: 1 },
  mealRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  mealChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#F1F5F9" },
  mealChipActive: { backgroundColor: theme.primary },
  mealChipTxt: { color: theme.text, fontWeight: "700", textTransform: "capitalize", fontSize: 12 },
  servingsRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  servingsLabel: { color: theme.text, fontWeight: "700", flex: 1 },
  servingsInput: { borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, width: 100, textAlign: "center", fontWeight: "700", color: theme.text },
  saveBtn: { backgroundColor: theme.primary, paddingVertical: 14, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  saveBtnTxt: { color: "#fff", fontWeight: "800" },
});
