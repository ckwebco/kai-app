import React, { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme, radii, spacing, shadow } from "@/src/theme";
import { api, todayStr } from "@/src/api";
import { loadProfile, GOAL_META, computeGoalCalories, addBackCalories, type UserProfile } from "@/src/profile";
import { useFocusEffect } from "expo-router";
import { storage } from "@/src/utils/storage";
import { useRouter } from "expo-router";

const SUGGESTIONS = [
  "What should I eat post-workout?",
  "Am I on track for my goal today?",
  "Best pre-workout snack?",
  "How much protein do I need?",
  "How can I hit my macros better?",
];

type Msg = { role: "user" | "assistant"; content: string; ts: number };

const HIST_KEY = "macrotrack_coach_history_v1";

export default function Coach() {
  const { colors } = useTheme();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [todayTotals, setTodayTotals] = useState({ cal: 0, p: 0, c: 0, f: 0, burned: 0 });
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);

  useFocusEffect(React.useCallback(() => {
    (async () => {
      const [p, foods, acts, raw] = await Promise.all([
        loadProfile(),
        api.listFoodLog(todayStr()),
        api.listActivityLog(todayStr()),
        storage.getItem<string>(HIST_KEY, ""),
      ]);
      setProfile(p);
      const t = foods.reduce((a, e) => {
        const m = e.servings || 1;
        a.cal += (e.calories || 0) * m;
        a.p += (e.protein || 0) * m;
        a.c += (e.carbs || 0) * m;
        a.f += (e.fat || 0) * m;
        return a;
      }, { cal: 0, p: 0, c: 0, f: 0 });
      const burned = acts.reduce((s: number, x: any) => s + (x.calories_burned || 0), 0);
      setTodayTotals({ ...t, burned });
      if (raw) { try { setMessages(JSON.parse(raw)); } catch {} }
      else if (messages.length === 0) {
        setMessages([{ role: "assistant", ts: Date.now(), content: `Hey ${p.name || "there"} 👋 I'm MacroCoach. I can see today's logs and your goal — ask me anything: pre-workout snacks, protein, recovery, hydration, or how today's tracking.` }]);
      }
    })();
  }, []));

  useEffect(() => {
    storage.setItem(HIST_KEY, JSON.stringify(messages.slice(-30)));
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages]);

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || busy || !profile) return;
    setInput("");
    setBusy(true);
    const userMsg: Msg = { role: "user", content: text, ts: Date.now() };
    setMessages((m) => [...m, userMsg]);
    try {
      const goalCal = computeGoalCalories(profile);
      const adjusted = goalCal + addBackCalories(todayTotals.burned, profile.goal_mode, profile.custom_addback_pct);
      const context = {
        name: profile.name,
        goal_mode: profile.goal_mode,
        weight_kg: profile.current_weight,
        target_weight_kg: profile.target_weight,
        calorie_goal: goalCal,
        today_calories: Math.round(todayTotals.cal),
        today_protein: Math.round(todayTotals.p),
        today_carbs: Math.round(todayTotals.c),
        today_fat: Math.round(todayTotals.f),
        burned_today: Math.round(todayTotals.burned),
        adjusted_goal: adjusted,
      };
      const hist = messages.slice(-6).map((m) => ({ role: m.role, content: m.content }));
      const { reply } = await api.coachChat(text, context, hist);
      setMessages((m) => [...m, { role: "assistant", content: reply, ts: Date.now() }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: "Hmm, couldn't reach the coach right now. Try again in a sec.", ts: Date.now() }]);
    } finally {
      setBusy(false);
    }
  };

  const resetChat = () => {
    setMessages([{ role: "assistant", ts: Date.now(), content: "Fresh slate. What's on your mind?" }]);
    storage.removeItem(HIST_KEY);
  };

  const goal = profile ? GOAL_META[profile.goal_mode] : null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }} keyboardVerticalOffset={80}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.h1, { color: colors.text }]}>MacroCoach</Text>
            {goal && (
              <View style={styles.goalPill}>
                <View style={[styles.goalDot, { backgroundColor: goal.color }]} />
                <Text style={[styles.goalPillTxt, { color: colors.muted }]}>{goal.label} mode · {Math.round(todayTotals.cal)} / {profile ? computeGoalCalories(profile) : 0} kcal today</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <TouchableOpacity onPress={() => router.push("/physique")} hitSlop={10} testID="coach-physique">
              <Ionicons name="body" size={22} color={colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={resetChat} hitSlop={10} testID="coach-reset">
              <Ionicons name="refresh" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                m.role === "user"
                  ? { backgroundColor: colors.primary, alignSelf: "flex-end" }
                  : { backgroundColor: colors.surface, alignSelf: "flex-start", borderColor: colors.border, borderWidth: 1 },
              ]}
            >
              <Text style={[styles.bubbleTxt, { color: m.role === "user" ? "#fff" : colors.text }]}>
                {m.content}
              </Text>
            </View>
          ))}
          {busy && (
            <View style={[styles.bubble, { backgroundColor: colors.surface, alignSelf: "flex-start", borderColor: colors.border, borderWidth: 1 }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </ScrollView>

        {/* Suggestion chips */}
        {messages.length <= 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 8 }}>
            {SUGGESTIONS.map((s) => (
              <TouchableOpacity
                key={s}
                testID={`coach-suggestion-${s.slice(0, 10)}`}
                onPress={() => send(s)}
                style={[styles.suggestChip, { backgroundColor: colors.chipBg }]}
              >
                <Text style={[styles.suggestTxt, { color: colors.text }]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
          <TextInput
            testID="coach-input"
            value={input}
            onChangeText={setInput}
            placeholder="Ask MacroCoach anything…"
            placeholderTextColor={colors.muted}
            style={[styles.input, { backgroundColor: colors.bg, color: colors.text, borderColor: colors.border }]}
            multiline
            returnKeyType="send"
            onSubmitEditing={() => send()}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            testID="coach-send"
            onPress={() => send()}
            disabled={busy || !input.trim()}
            style={[styles.sendBtn, { backgroundColor: colors.primary, opacity: busy || !input.trim() ? 0.5 : 1 }]}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 12 },
  h1: { fontSize: 24, fontWeight: "800" },
  goalPill: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  goalDot: { width: 8, height: 8, borderRadius: 4 },
  goalPillTxt: { fontWeight: "600", fontSize: 11 },
  bubble: { maxWidth: "85%", padding: 12, borderRadius: 18 },
  bubbleTxt: { fontSize: 14, lineHeight: 20 },
  suggestChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  suggestTxt: { fontWeight: "700", fontSize: 12 },
  inputBar: { flexDirection: "row", alignItems: "flex-end", padding: 10, gap: 8, borderTopWidth: 1, paddingBottom: Platform.OS === "ios" ? 22 : 10 },
  input: { flex: 1, borderWidth: 1, borderRadius: 22, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, fontSize: 14, maxHeight: 120 },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
});
