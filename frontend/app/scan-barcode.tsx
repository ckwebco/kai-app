import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { theme, radii, spacing, shadow } from "@/src/theme";
import { api, todayStr, type FoodProduct } from "@/src/api";

const BARCODE_TYPES = ["ean13", "ean8", "upc_e", "code128", "qr"] as const;

export default function ScanBarcode() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);
  const [result, setResult] = useState<FoodProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [servings, setServings] = useState("1");
  const [meal, setMeal] = useState<"breakfast" | "lunch" | "dinner" | "snack">("snack");
  const handlingRef = useRef(false);

  const close = () => router.back();

  const onBarcode = useCallback(
    async (res: BarcodeScanningResult) => {
      if (handlingRef.current || scanned) return;
      const raw = (res.data || "").trim();
      if (!raw) return;
      // Normalize: strip any leading/trailing whitespace, keep digits only.
      const code = raw.replace(/[^0-9]/g, "");
      if (!/^\d{6,}$/.test(code)) return;
      handlingRef.current = true;
      setScanned(code);
      setError(null);
      setLooking(true);
      try {
        const prod = await api.barcodeLookup(code);
        setResult(prod);
      } catch (e: any) {
        setError(e?.message?.includes("404") ? `Barcode ${code} not in database. Try AI Food Scan instead.` : "Lookup failed. Try again.");
      } finally {
        setLooking(false);
      }
    },
    [scanned]
  );

  const retry = () => {
    setScanned(null);
    setResult(null);
    setError(null);
    handlingRef.current = false;
  };

  const onSave = async () => {
    if (!result) return;
    const s = Math.max(0.1, parseFloat(servings) || 1);
    try {
      await api.createFoodLog({
        date: todayStr(),
        meal_type: meal,
        name: result.brand ? `${result.brand} – ${result.name}` : result.name,
        calories: result.calories,
        protein: result.protein,
        carbs: result.carbs,
        fat: result.fat,
        serving_size: result.serving_size,
        serving_unit: result.serving_unit,
        servings: s,
        benefits: result.benefits,
      });
      router.back();
    } catch {
      setError("Could not save. Check connection.");
    }
  };

  if (!permission) {
    return <View style={styles.fill}><ActivityIndicator color={theme.primary} /></View>;
  }
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permWrap}>
        <Ionicons name="barcode-outline" size={56} color="#fff" />
        <Text style={styles.permTitle}>Camera access</Text>
        <Text style={styles.permSub}>Needed to read barcodes on food packaging.</Text>
        <TouchableOpacity testID="grant-camera-btn" style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnTxt}>Grant access</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={close} style={{ marginTop: 16 }}>
          <Text style={styles.linkLight}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (result) {
    const s = Math.max(0.1, parseFloat(servings) || 1);
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.resultScroll} testID="barcode-result-view">
          <View style={styles.resultHeader}>
            <TouchableOpacity onPress={retry} testID="result-back-btn">
              <Ionicons name="chevron-back" size={28} color={theme.text} />
            </TouchableOpacity>
            <Text style={styles.resultTitle}>Product found</Text>
            <View style={{ width: 28 }} />
          </View>
          <View style={[styles.card, shadow.card]}>
            <Text style={styles.foodName}>{result.name}</Text>
            {result.brand ? <Text style={styles.muted}>{result.brand}</Text> : null}
            {result.barcode ? <Text style={styles.muted}>UPC: {result.barcode}</Text> : null}
            <View style={styles.macroGrid}>
              <Macro label="kcal" value={Math.round(result.calories * s)} color={theme.primary} />
              <Macro label="Protein" value={`${Math.round(result.protein * s)}g`} color={theme.protein} />
              <Macro label="Carbs" value={`${Math.round(result.carbs * s)}g`} color={theme.carbs} />
              <Macro label="Fat" value={`${Math.round(result.fat * s)}g`} color={theme.fat} />
            </View>
            <Text style={styles.muted}>Per {result.serving_size}{result.serving_unit}</Text>
          </View>

          {result.benefits.length > 0 && (
            <View style={[styles.card, shadow.card]}>
              <Text style={styles.cardTitle}>Highlights</Text>
              {result.benefits.map((b, i) => (
                <View key={i} style={styles.benefitRow}>
                  <Ionicons name="checkmark-circle" size={16} color={theme.fat} />
                  <Text style={styles.benefitTxt}>{b}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={[styles.card, shadow.card]}>
            <Text style={styles.cardTitle}>Log it</Text>
            <View style={styles.mealRow}>
              {(["breakfast", "lunch", "dinner", "snack"] as const).map((m) => (
                <TouchableOpacity key={m} testID={`meal-${m}`} onPress={() => setMeal(m)} style={[styles.mealChip, meal === m && styles.mealChipActive]}>
                  <Text style={[styles.mealChipTxt, meal === m && { color: "#fff" }]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.servingsRow}>
              <Text style={styles.servingsLabel}>Servings</Text>
              <TextInput testID="barcode-servings" value={servings} onChangeText={setServings} keyboardType="decimal-pad" style={styles.servingsInput} />
            </View>
            <TouchableOpacity testID="barcode-log-submit" style={styles.saveBtn} onPress={onSave}>
              <Ionicons name="checkmark" size={18} color="#fff" />
              <Text style={styles.saveBtnTxt}>Save to log</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.fill}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...BARCODE_TYPES] as any }}
        onBarcodeScanned={onBarcode}
      />

      <SafeAreaView style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 12 }]} edges={["top"]}>
        <TouchableOpacity onPress={close} style={styles.iconBtn} testID="close-barcode-btn">
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.pill}>
          <Ionicons name="barcode" size={14} color="#fff" />
          <Text style={styles.pillTxt}>BARCODE</Text>
        </View>
        <View style={styles.iconBtn} />
      </SafeAreaView>

      <View pointerEvents="none" style={styles.frameWrap}>
        <View style={styles.barFrame}>
          <View style={[styles.corner, styles.cTL]} />
          <View style={[styles.corner, styles.cTR]} />
          <View style={[styles.corner, styles.cBL]} />
          <View style={[styles.corner, styles.cBR]} />
          <View style={styles.laser} />
        </View>
        <Text style={styles.hint}>Center the barcode in the box</Text>
      </View>

      <SafeAreaView style={styles.bottomBar} edges={["bottom"]}>
        {scanned && (
          <View style={styles.scannedBox} testID="scanned-pill">
            {looking ? (
              <>
                <ActivityIndicator color="#fff" />
                <Text style={styles.scannedTxt}>Looking up {scanned}…</Text>
              </>
            ) : error ? (
              <>
                <Ionicons name="alert-circle" size={18} color="#fff" />
                <Text style={styles.scannedTxt}>{error}</Text>
                <TouchableOpacity onPress={retry} style={styles.retryBtn} testID="retry-scan-btn">
                  <Text style={styles.retryTxt}>Try again</Text>
                </TouchableOpacity>
              </>
            ) : null}
          </View>
        )}
        <Text style={styles.statusTxt}>{scanned ? "" : "Live scan — hold steady on the barcode"}</Text>
      </SafeAreaView>
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
  permSub: { color: "#ffffffaa", textAlign: "center" },
  permBtn: { backgroundColor: theme.primary, paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999, marginTop: 8 },
  permBtnTxt: { color: "#fff", fontWeight: "800" },
  linkLight: { color: "#ffffffaa", fontWeight: "600" },

  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#00000088", alignItems: "center", justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#00000088", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  pillTxt: { color: "#fff", fontWeight: "800", fontSize: 11, letterSpacing: 1 },

  frameWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  barFrame: { width: "84%", height: 180, borderRadius: 24, position: "relative" },
  corner: { position: "absolute", width: 28, height: 28, borderColor: "#10B981" },
  cTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  cTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  cBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  laser: { position: "absolute", left: 16, right: 16, top: "50%", height: 2, backgroundColor: "#10B981", opacity: 0.85 },
  hint: { color: "#fff", marginTop: 18, fontWeight: "700", fontSize: 13, opacity: 0.85, textAlign: "center" },

  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16, gap: 10 },
  scannedBox: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#000000bb", borderRadius: 16, padding: 14 },
  scannedTxt: { color: "#fff", flex: 1, fontWeight: "600", fontSize: 13 },
  retryBtn: { backgroundColor: theme.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  retryTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  statusTxt: { color: "#ffffffcc", fontSize: 12, textAlign: "center", fontWeight: "600" },

  resultScroll: { padding: spacing.md, gap: spacing.md, paddingBottom: 60 },
  resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  resultTitle: { color: theme.text, fontSize: 18, fontWeight: "800" },
  card: { backgroundColor: theme.surface, borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, borderColor: theme.border, gap: 10 },
  cardTitle: { fontWeight: "800", color: theme.text, textTransform: "uppercase", fontSize: 12, letterSpacing: 0.5 },
  foodName: { fontSize: 22, fontWeight: "800", color: theme.text },
  muted: { color: theme.muted, fontSize: 12, fontWeight: "600" },
  macroGrid: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 8 },
  macroCell: { flex: 1, padding: 10, borderRadius: radii.md, backgroundColor: "#F1F5F9", alignItems: "center", gap: 4 },
  macroDot: { width: 8, height: 8, borderRadius: 4 },
  macroLabel: { color: theme.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  macroVal: { color: theme.text, fontWeight: "800", fontSize: 15 },
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
