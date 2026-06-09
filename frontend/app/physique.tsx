import React, { useRef, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Image, TextInput, Platform,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useTheme, radii, spacing, shadow } from "@/src/theme";
import { api } from "@/src/api";
import { loadProfile, GOAL_META } from "@/src/profile";

export default function Physique() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const router = useRouter();
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<"back" | "front">("front");
  const [captured, setCaptured] = useState<string | null>(null);
  const [b64, setB64] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

  const loadHistory = async () => {
    try {
      const resp: any = await api.physiqueLog();
      // Backend returns { results: [...] }; tolerate either shape defensively
      const list = Array.isArray(resp) ? resp : Array.isArray(resp?.results) ? resp.results : [];
      setHistory(list);
    } catch (e) {
      console.warn("physique history load failed", e);
      setHistory([]);
    }
  };

  const close = () => router.back();

  const onCapture = async () => {
    setErr(null);
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        setErr("Camera permission denied.");
        return;
      }
    }
    try {
      const photo = await cameraRef.current?.takePictureAsync({ quality: 0.6, base64: true });
      if (!photo?.base64) {
        setErr("Couldn't capture. Try again.");
        return;
      }
      setCaptured(`data:image/jpeg;base64,${photo.base64}`);
      setB64(photo.base64);
    } catch (e: any) {
      setErr(e?.message || "Capture failed.");
    }
  };

  const onAnalyze = async () => {
    if (!b64) return;
    setBusy(true); setErr(null);
    try {
      const p = await loadProfile();
      const goalMode = p?.goal_mode || "maintain";
      const { analysis: text } = await api.physiqueAnalyze(b64, goalMode, note);
      setAnalysis(text);
    } catch (e: any) {
      const message = typeof e?.message === "string" ? e.message : String(e || "Analysis failed.");
      if (message.includes("AI service not configured") || message.includes("AI integration package not installed")) {
        setErr(message);
      } else if (message.includes("502")) {
        setErr("AI couldn't analyze. Try a clearer photo.");
      } else {
        setErr(message || "Analysis failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  const retake = () => { setCaptured(null); setB64(null); setAnalysis(null); setErr(null); };

  const pickFromGallery = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErr("Photo library access denied. Enable it in Settings to upload from gallery.");
        return;
      }
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        base64: true,
        allowsEditing: false,
      });
      if (r.canceled || !r.assets?.[0]?.base64) return;
      const b = r.assets[0].base64;
      setB64(b);
      setCaptured(`data:image/jpeg;base64,${b}`);
    } catch (e: any) {
      setErr(e?.message || "Couldn't load image from gallery.");
    }
  };

  if (!permission) return <View style={styles.fill}><ActivityIndicator color={colors.primary} /></View>;
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.permWrap}>
        <Ionicons name="body-outline" size={56} color="#fff" />
        <Text style={styles.permTitle}>Camera access</Text>
        <Text style={styles.permSub}>To analyze your physique, we need your camera.</Text>
        <TouchableOpacity testID="grant-camera-btn" style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnTxt}>Grant access</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={close} style={{ marginTop: 16 }}>
          <Text style={styles.linkLight}>Cancel</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (historyOpen) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
        <View style={styles.resultHeader}>
          <TouchableOpacity onPress={() => setHistoryOpen(false)} testID="close-history-btn"><Ionicons name="chevron-back" size={28} color={colors.text} /></TouchableOpacity>
          <Text style={[styles.resultTitle, { color: colors.text }]}>Progress timeline</Text>
          <View style={{ width: 28 }} />
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
          {history.length === 0 ? (
            <Text style={{ color: colors.muted, textAlign: "center", paddingVertical: 40 }}>No progress photos yet. Take one to start tracking.</Text>
          ) : history.map((h: any) => (
            <View key={h.id || Math.random()} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
              <View style={{ flexDirection: "row", gap: 12 }}>
                {h.image_base64 ? (
                  <Image source={{ uri: `data:image/jpeg;base64,${h.image_base64}` }} style={{ width: 100, height: 130, borderRadius: 12 }} />
                ) : (
                  <View style={{ width: 100, height: 130, borderRadius: 12, backgroundColor: colors.chipBg, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="body-outline" size={32} color={colors.muted} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.muted, fontWeight: "700", fontSize: 11 }}>
                    {h.logged_at ? new Date(h.logged_at).toLocaleString() : "Unknown date"}
                  </Text>
                  <Text style={{ color: colors.text, fontWeight: "700", fontSize: 12, textTransform: "uppercase" }}>{h.goal_mode || "—"}</Text>
                  <Text style={{ color: colors.text, fontSize: 12, lineHeight: 17 }} numberOfLines={6}>{h.analysis || "(no analysis)"}</Text>
                  <TouchableOpacity onPress={async () => { try { if (h.id) await api.deletePhysiqueLog(h.id); await loadHistory(); } catch {} }} testID={`del-physique-${h.id}`}>
                    <Text style={{ color: colors.danger, fontWeight: "800", fontSize: 11, marginTop: 4 }}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (analysis) {
    return (
      <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.resultHeader}>
            <TouchableOpacity onPress={retake} testID="physique-back-btn"><Ionicons name="chevron-back" size={28} color={colors.text} /></TouchableOpacity>
            <Text style={[styles.resultTitle, { color: colors.text }]}>Coach analysis</Text>
            <View style={{ width: 28 }} />
          </View>
          {captured ? <Image source={{ uri: captured }} style={styles.preview} /> : null}
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
            <Text style={[styles.analysisTxt, { color: colors.text }]}>{analysis}</Text>
          </View>
          <TouchableOpacity testID="retake-btn" onPress={retake} style={[styles.bigBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="camera" size={18} color="#fff" />
            <Text style={styles.bigBtnTxt}>Take another</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="view-progress-btn" onPress={async () => { await loadHistory(); setHistoryOpen(true); }} style={[styles.bigBtn, { backgroundColor: colors.chipBg }]}>
            <Ionicons name="time" size={18} color={colors.text} />
            <Text style={[styles.bigBtnTxt, { color: colors.text }]}>View progress timeline</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Capture flow
  return (
    <View style={styles.fill}>
      {!captured ? (
        <>
          <CameraView ref={cameraRef} style={StyleSheet.absoluteFillObject} facing={facing} />
          <SafeAreaView style={[styles.topBar, { paddingTop: Math.max(insets.top, 16) + 12 }]} edges={["top"]}>
            <TouchableOpacity onPress={close} style={styles.iconBtn} testID="close-btn"><Ionicons name="close" size={22} color="#fff" /></TouchableOpacity>
            <View style={styles.pill}><Ionicons name="body" size={14} color="#fff" /><Text style={styles.pillTxt}>PHYSIQUE COACH</Text></View>
            <TouchableOpacity onPress={() => setFacing(f => f === "back" ? "front" : "back")} style={styles.iconBtn} testID="flip-btn"><Ionicons name="camera-reverse" size={22} color="#fff" /></TouchableOpacity>
          </SafeAreaView>
          <View pointerEvents="none" style={styles.frameWrap}>
            <View style={styles.frame}>
              <View style={[styles.corner, styles.cTL]} /><View style={[styles.corner, styles.cTR]} />
              <View style={[styles.corner, styles.cBL]} /><View style={[styles.corner, styles.cBR]} />
            </View>
            <Text style={styles.hint}>Mirror selfie, well-lit, full body if possible</Text>
          </View>
          <SafeAreaView style={styles.bottomBar} edges={["bottom"]}>
            <View style={styles.shutterRow}>
              <TouchableOpacity testID="gallery-btn" onPress={pickFromGallery} hitSlop={10} style={styles.iconBtn}><Ionicons name="images" size={22} color="#fff" /></TouchableOpacity>
              <TouchableOpacity testID="capture-btn" onPress={onCapture} style={styles.shutter} activeOpacity={0.8}>
                <View style={styles.shutterInner} />
              </TouchableOpacity>
              <TouchableOpacity testID="flip-btn" onPress={() => setFacing(f => f === "back" ? "front" : "back")} style={styles.iconBtn}><Ionicons name="camera-reverse" size={22} color="#fff" /></TouchableOpacity>
            </View>
          </SafeAreaView>
        </>
      ) : (
        <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]} edges={["top", "bottom"]}>
          <ScrollView contentContainerStyle={styles.scroll}>
            <View style={styles.resultHeader}>
              <TouchableOpacity onPress={retake} testID="back-btn"><Ionicons name="chevron-back" size={28} color={colors.text} /></TouchableOpacity>
              <Text style={[styles.resultTitle, { color: colors.text }]}>Ready?</Text>
              <View style={{ width: 28 }} />
            </View>
            <Image source={{ uri: captured }} style={styles.preview} />
            <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Optional context</Text>
              <TextInput
                testID="physique-note"
                value={note}
                onChangeText={setNote}
                placeholder="e.g. 'training 4×/week, want abs by summer'"
                placeholderTextColor={colors.muted}
                multiline
                style={[styles.textArea, { borderColor: colors.border, color: colors.text, backgroundColor: colors.bg }]}
              />
              {err && <Text style={{ color: colors.danger, fontWeight: "700", fontSize: 12 }}>{err}</Text>}
              <TouchableOpacity
                testID="analyze-btn"
                onPress={onAnalyze}
                disabled={busy}
                style={[styles.bigBtn, { backgroundColor: colors.primary, opacity: busy ? 0.5 : 1 }]}
              >
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Ionicons name="sparkles" size={18} color="#fff" />
                    <Text style={styles.bigBtnTxt}>Analyze with AI</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={retake} testID="retake-before-btn" style={[styles.bigBtn, { backgroundColor: colors.chipBg }]}>
                <Text style={[styles.bigBtnTxt, { color: colors.text }]}>Retake</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#000" },
  permWrap: { flex: 1, backgroundColor: "#0F172A", alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  permTitle: { color: "#fff", fontSize: 22, fontWeight: "800" },
  permSub: { color: "#ffffffaa", textAlign: "center" },
  permBtn: { backgroundColor: "#2563EB", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 999, marginTop: 8 },
  permBtnTxt: { color: "#fff", fontWeight: "800" },
  linkLight: { color: "#ffffffaa", fontWeight: "600" },

  topBar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#00000088", alignItems: "center", justifyContent: "center" },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#00000088", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  pillTxt: { color: "#fff", fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  frameWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  frame: { width: "70%", height: "60%", borderRadius: 24 },
  corner: { position: "absolute", width: 32, height: 32, borderColor: "#fff" },
  cTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4 },
  cTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4 },
  cBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4 },
  hint: { color: "#fff", marginTop: 18, fontWeight: "700", fontSize: 13, opacity: 0.85, textAlign: "center", paddingHorizontal: 30 },
  bottomBar: { position: "absolute", bottom: 0, left: 0, right: 0, padding: 16 },
  shutterRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20 },
  shutter: { width: 76, height: 76, borderRadius: 38, backgroundColor: "#ffffff22", borderWidth: 4, borderColor: "#fff", alignItems: "center", justifyContent: "center" },
  shutterInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff" },

  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: 60 },
  resultHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  resultTitle: { fontSize: 18, fontWeight: "800" },
  preview: { width: "100%", aspectRatio: 3 / 4, borderRadius: radii.xl, backgroundColor: "#000" },
  card: { borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, gap: 10 },
  cardTitle: { fontWeight: "800", textTransform: "uppercase", fontSize: 12, letterSpacing: 0.5 },
  textArea: { borderWidth: 1, borderRadius: 14, padding: 14, minHeight: 80, fontSize: 14, fontWeight: "500", textAlignVertical: "top" },
  analysisTxt: { fontSize: 14, lineHeight: 22 },
  bigBtn: { paddingVertical: 14, borderRadius: 999, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  bigBtnTxt: { color: "#fff", fontWeight: "800" },
});
