import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Dimensions, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { useTheme, radii, spacing, shadow } from "@/src/theme";
import { api, todayStr, type FoodLogEntry } from "@/src/api";
import { loadProfile, computeWaterGoalMl, computeMacroGoals, type UserProfile } from "@/src/profile";
import { MacrosDonut, WeeklyBars } from "@/src/ui/charts";
import { useUndo } from "@/src/ui/undo";
import { storage } from "@/src/utils/storage";

const screenW = Dimensions.get("window").width;

// ---------------------------------------------------------------------------
// Layout persistence — order + hidden cards
// ---------------------------------------------------------------------------
type CardKey = "calories" | "macros" | "weekly" | "water" | "quick" | "meals";
const DEFAULT_ORDER: CardKey[] = ["calories", "macros", "weekly", "water", "quick", "meals"];
const LAYOUT_KEY = "macrotrack_dashboard_layout_v1";

type Layout = { order: CardKey[]; hidden: CardKey[] };

async function loadLayout(): Promise<Layout> {
  const raw = await storage.getItem<string>(LAYOUT_KEY, "");
  if (!raw) return { order: DEFAULT_ORDER, hidden: [] };
  try {
    const parsed = JSON.parse(raw);
    // Validate + merge with defaults so newly-added cards still show
    const order: CardKey[] = Array.isArray(parsed.order)
      ? parsed.order.filter((k: any) => DEFAULT_ORDER.includes(k))
      : DEFAULT_ORDER;
    // Append any missing default keys (new cards)
    for (const k of DEFAULT_ORDER) if (!order.includes(k)) order.push(k);
    const hidden: CardKey[] = Array.isArray(parsed.hidden)
      ? parsed.hidden.filter((k: any) => DEFAULT_ORDER.includes(k))
      : [];
    return { order, hidden };
  } catch {
    return { order: DEFAULT_ORDER, hidden: [] };
  }
}

async function saveLayout(layout: Layout) {
  await storage.setItem(LAYOUT_KEY, JSON.stringify(layout));
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
function dateNDaysFromToday(n: number): string {
  // Use LOCAL date components — toISOString() returns UTC which causes off-by-one
  // for users west of UTC after their local evening.
  const d = new Date();
  d.setDate(d.getDate() + n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateLabel(iso: string): { weekday: string; day: number; isToday: boolean; isFuture: boolean } {
  const d = new Date(iso + "T12:00:00");
  const todayIso = todayStr();
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
    day: d.getDate(),
    isToday: iso === todayIso,
    isFuture: iso > todayIso,
  };
}

function MacroBar({ label, value, goal, color }: { label: string; value: number; goal: number; color: string }) {
  const { colors } = useTheme();
  const pct = goal > 0 ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <View style={{ gap: 6, marginTop: 4 }} testID={`macro-${label.toLowerCase()}`}>
      <View style={styles.macroBarHeader}>
        <Text style={[styles.macroLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.macroValue, { color: colors.text }]}>
          {Math.round(value)}<Text style={{ color: colors.muted, fontWeight: "500" }}> / {goal}g</Text>
        </Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Date scrubber strip
// ---------------------------------------------------------------------------
function DateScrubber({ selected, onChange }: { selected: string; onChange: (iso: string) => void }) {
  const { colors } = useTheme();
  // Show -7 .. +3 days. Center scrolls to today on mount.
  const days = useMemo(() => Array.from({ length: 11 }, (_, i) => dateNDaysFromToday(i - 7)), []);
  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 4, gap: 6 }}
        contentOffset={{ x: 7 * 56 - screenW / 2 + 28, y: 0 }}
      >
        {days.map((iso) => {
          const { weekday, day, isToday, isFuture } = dateLabel(iso);
          const active = iso === selected;
          return (
            <TouchableOpacity
              key={iso}
              testID={`date-${iso}`}
              onPress={() => onChange(iso)}
              style={[
                styles.dateChip,
                {
                  backgroundColor: active ? colors.primary : colors.surface,
                  borderColor: active ? colors.primary : colors.border,
                  opacity: isFuture && !active ? 0.55 : 1,
                },
              ]}
            >
              <Text style={[styles.dateWeekday, { color: active ? "#fff" : colors.muted }]}>{weekday}</Text>
              <Text style={[styles.dateDay, { color: active ? "#fff" : colors.text }]}>{day}</Text>
              {isToday && <View style={[styles.dateDot, { backgroundColor: active ? "#fff" : colors.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Edit bar — reorder + show/hide
// ---------------------------------------------------------------------------
const CARD_LABELS: Record<CardKey, string> = {
  calories: "Today's Calories",
  macros: "Macros",
  weekly: "Last 7 days",
  water: "Water",
  quick: "Quick actions",
  meals: "Meals",
};

function EditBar({
  layout,
  onChange,
  onDone,
}: {
  layout: Layout;
  onChange: (l: Layout) => void;
  onDone: () => void;
}) {
  const { colors } = useTheme();
  const moveUp = (k: CardKey) => {
    const i = layout.order.indexOf(k);
    if (i <= 0) return;
    const next = [...layout.order];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    onChange({ ...layout, order: next });
  };
  const moveDown = (k: CardKey) => {
    const i = layout.order.indexOf(k);
    if (i < 0 || i >= layout.order.length - 1) return;
    const next = [...layout.order];
    [next[i + 1], next[i]] = [next[i], next[i + 1]];
    onChange({ ...layout, order: next });
  };
  const toggleHide = (k: CardKey) => {
    const hidden = layout.hidden.includes(k)
      ? layout.hidden.filter((x) => x !== k)
      : [...layout.hidden, k];
    onChange({ ...layout, hidden });
  };
  const reset = () => onChange({ order: DEFAULT_ORDER, hidden: [] });

  return (
    <View style={[styles.editCard, { backgroundColor: colors.surface, borderColor: colors.primary }, shadow.card]} testID="edit-bar">
      <View style={styles.rowBetween}>
        <Text style={[styles.cardTitle, { color: colors.primary }]}>Reorder & toggle cards</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity testID="edit-reset" onPress={reset} hitSlop={10}>
            <Text style={{ color: colors.muted, fontWeight: "800", fontSize: 12 }}>RESET</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="edit-done" onPress={onDone} hitSlop={10}>
            <Text style={{ color: colors.primary, fontWeight: "800", fontSize: 12 }}>DONE</Text>
          </TouchableOpacity>
        </View>
      </View>
      {layout.order.map((k, idx) => {
        const hidden = layout.hidden.includes(k);
        return (
          <View key={k} style={[styles.editRow, { borderTopColor: colors.border, opacity: hidden ? 0.5 : 1 }]}>
            <View style={{ flexDirection: "row", gap: 4 }}>
              <TouchableOpacity testID={`edit-up-${k}`} disabled={idx === 0} onPress={() => moveUp(k)} style={[styles.editIcon, { backgroundColor: colors.chipBg, opacity: idx === 0 ? 0.3 : 1 }]}>
                <Ionicons name="chevron-up" size={16} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity testID={`edit-down-${k}`} disabled={idx === layout.order.length - 1} onPress={() => moveDown(k)} style={[styles.editIcon, { backgroundColor: colors.chipBg, opacity: idx === layout.order.length - 1 ? 0.3 : 1 }]}>
                <Ionicons name="chevron-down" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: colors.text, fontWeight: "700", flex: 1 }}>{CARD_LABELS[k]}</Text>
            <TouchableOpacity testID={`edit-hide-${k}`} onPress={() => toggleHide(k)} style={[styles.editIcon, { backgroundColor: hidden ? colors.chipBg : colors.primary + "1A" }]}>
              <Ionicons name={hidden ? "eye-off" : "eye"} size={16} color={hidden ? colors.muted : colors.primary} />
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const { colors } = useTheme();
  const router = useRouter();
  const undo = useUndo();
  const [entries, setEntries] = useState<FoodLogEntry[]>([]);
  const [water, setWater] = useState<{ cups: number; ml: number; entries: any[] }>({ cups: 0, ml: 0, entries: [] });
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [weekly, setWeekly] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [layout, setLayout] = useState<Layout>({ order: DEFAULT_ORDER, hidden: [] });
  const [editMode, setEditMode] = useState(false);

  useEffect(() => { loadLayout().then(setLayout); }, []);

  const load = useCallback(async (dateOverride?: string) => {
    const d = dateOverride ?? selectedDate;
    try {
      const [foods, waters, prof, week] = await Promise.all([
        api.listFoodLog(d),
        api.listWaterLog(d),
        loadProfile(),
        api.weeklySummary(d),
      ]);
      setEntries(foods);
      const totalCups = (waters || []).reduce((s: number, w: any) => s + (w.cups || 0), 0);
      const totalMl = (waters || []).reduce((s: number, w: any) => s + (w.milliliters || 0), 0);
      setWater({ cups: totalCups, ml: totalMl, entries: waters || [] });
      setProfile(prof);
      setWeekly(week.days || []);
    } catch (e) {
      console.warn("dashboard load failed", e);
    }
  }, [selectedDate]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onChangeDate = (iso: string) => {
    setSelectedDate(iso);
    load(iso);
  };

  const isFutureDate = selectedDate > todayStr();
  const isPastDate = selectedDate < todayStr();

  const totals = entries.reduce(
    (a, e) => {
      const m = e.servings || 1;
      a.cal += (e.calories || 0) * m;
      a.p += (e.protein || 0) * m;
      a.c += (e.carbs || 0) * m;
      a.f += (e.fat || 0) * m;
      return a;
    },
    { cal: 0, p: 0, c: 0, f: 0 }
  );

  const calGoal = profile ? computeMacroGoals(profile).calories : 2200;
  const calPct = Math.min(100, (totals.cal / calGoal) * 100);
  const remaining = Math.max(0, calGoal - totals.cal);
  const macroG = profile ? computeMacroGoals(profile) : { protein: 150, carbs: 240, fat: 75, calories: 2200 };

  const addWater = async (ml: number) => {
    try {
      await api.createWaterLog(selectedDate, ml === 250 ? 1 : 0.5, ml);
      await load();
    } catch {}
  };

  const onDeleteMeal = async (entry: FoodLogEntry) => {
    try {
      await api.deleteFoodLog(entry.id);
      setEntries((arr) => arr.filter((x) => x.id !== entry.id));
      undo.show({
        message: `Removed ${entry.name}`,
        onUndo: async () => {
          try {
            await api.createFoodLog({
              date: entry.date, meal_type: entry.meal_type, name: entry.name,
              calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat,
              serving_size: entry.serving_size, serving_unit: entry.serving_unit, servings: entry.servings,
              benefits: entry.benefits,
            });
            load();
          } catch (undoError) {
            console.warn("undo delete food log failed", undoError, { id: entry.id });
          }
        },
      });
    } catch (e) {
      console.warn("delete food log failed", e, { id: entry.id });
    }
  };

  const onRepeat = async (entry: FoodLogEntry) => {
    try {
      await api.createFoodLog({
        date: selectedDate, meal_type: entry.meal_type, name: entry.name,
        calories: entry.calories, protein: entry.protein, carbs: entry.carbs, fat: entry.fat,
        serving_size: entry.serving_size, serving_unit: entry.serving_unit, servings: entry.servings,
        benefits: entry.benefits,
      });
      load();
      undo.show({
        message: `Repeated ${entry.name}`,
        onUndo: async () => {
          try {
            const list = await api.listFoodLog(selectedDate);
            if (list[0]?.name === entry.name) await api.deleteFoodLog(list[0].id);
            load();
          } catch (undoError) {
            console.warn("undo repeat food log failed", undoError, { name: entry.name });
          }
        },
      });
    } catch (e) {
      console.warn("repeat food log failed", e, { name: entry.name });
    }
  };

  const onUndoWater = async () => {
    if (water.entries.length === 0) return;
    const last = water.entries[0];
    try {
      await api.deleteWaterLog(last.id);
    } catch (e) {
      console.warn("undo water delete failed", e, { id: last?.id });
    } finally {
      load();
    }
  };

  const weeklyForChart = weekly.map((d) => ({ date: d.date, calories: d.calories || 0 }));

  const titleText = isFutureDate ? "Planning ahead" : isPastDate ? "Catch-up log" : `Hi ${profile?.name || "there"} 👋`;

  // ----- Card renderers -----
  const renderCard = (k: CardKey) => {
    if (layout.hidden.includes(k)) return null;
    switch (k) {
      case "calories":
        return (
          <View key={k} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]} testID="calorie-card">
            <Text style={[styles.cardTitle, { color: colors.text }]}>{isFutureDate ? "Planned Calories" : "Today's Calories"}</Text>
            <View style={styles.calRow}>
              <Text style={[styles.calBig, { color: colors.text }]}>{Math.round(totals.cal)}</Text>
              <Text style={[styles.calGoal, { color: colors.muted }]}>/ {calGoal} kcal</Text>
            </View>
            <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
              <View style={[styles.barFill, { width: `${calPct}%`, backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.remaining, { color: colors.muted }]}>
              {isFutureDate
                ? `${Math.round(calGoal - totals.cal)} kcal headroom · pre-log meals for this day`
                : remaining > 0
                ? `${Math.round(remaining)} kcal remaining`
                : "🎯 Daily goal reached"}
            </Text>
          </View>
        );

      case "macros":
        return (
          <View key={k} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Macros</Text>
            <View style={{ alignItems: "center", marginVertical: 8 }}>
              <MacrosDonut protein={totals.p} carbs={totals.c} fat={totals.f} size={170} />
            </View>
            <MacroBar label="Protein" value={totals.p} goal={macroG.protein} color={colors.protein} />
            <MacroBar label="Carbs" value={totals.c} goal={macroG.carbs} color={colors.carbs} />
            <MacroBar label="Fat" value={totals.f} goal={macroG.fat} color={colors.fat} />
          </View>
        );

      case "weekly":
        if (weeklyForChart.length === 0) return null;
        return (
          <View key={k} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Last 7 days</Text>
            <WeeklyBars days={weeklyForChart} goal={calGoal} width={Math.min(screenW - 64, 360)} />
            <Text style={[styles.muted, { color: colors.muted }]}>Daily calories vs your {calGoal} kcal goal</Text>
          </View>
        );

      case "water": {
        const goalMl = profile ? computeWaterGoalMl(profile) : 2500;
        const goalCups = Math.max(1, Math.round(goalMl / 250));
        const filled = Math.min(goalCups, Math.floor(water.cups));
        const half = water.cups - Math.floor(water.cups) >= 0.5;
        const pct = Math.min(100, Math.round((water.ml / goalMl) * 100));
        return (
          <View key={k} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: colors.text }]}>💧 Water · {pct}%</Text>
                <Text style={[styles.muted, { color: colors.muted }]}>
                  {water.ml} / {goalMl} ml · {water.cups.toFixed(1)} of {goalCups} cups
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {water.entries.length > 0 && (
                  <TouchableOpacity onPress={onUndoWater} testID="undo-water-btn" style={[styles.waterBtn, { backgroundColor: colors.chipBg, borderColor: colors.border }]}>
                    <Ionicons name="arrow-undo" size={14} color={colors.danger} />
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => addWater(125)} testID="add-water-half" style={[styles.waterBtn, { backgroundColor: colors.chipBg, borderColor: colors.border }]}>
                  <Text style={[styles.waterBtnTxt, { color: colors.text }]}>½ cup</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => addWater(250)} testID="add-water-btn" style={[styles.waterBtn, { backgroundColor: colors.protein, borderColor: colors.protein }]}>
                  <Ionicons name="water" size={14} color="#fff" />
                  <Text style={[styles.waterBtnTxt, { color: "#fff" }]}>1 cup</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {Array.from({ length: goalCups }).map((_, i) => {
                const isFull = i < filled;
                const isHalf = !isFull && i === filled && half;
                return (
                  <View key={i} style={{ width: 26, height: 32, borderRadius: 6, borderWidth: 2, borderColor: colors.protein, overflow: "hidden", justifyContent: "flex-end" }}>
                    <View style={{ height: isFull ? "100%" : isHalf ? "50%" : "0%", backgroundColor: colors.protein }} />
                  </View>
                );
              })}
              {water.cups > goalCups && (
                <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: colors.fat + "33", justifyContent: "center" }}>
                  <Text style={{ color: colors.fat, fontWeight: "800", fontSize: 11 }}>+{Math.round(water.cups - goalCups)} 🎉</Text>
                </View>
              )}
            </View>
          </View>
        );
      }

      case "quick":
        return (
          <View key={k} style={styles.quickRow}>
            <TouchableOpacity testID="scan-ai-btn" style={[styles.qBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/scan-camera")}>
              <Ionicons name="sparkles" size={20} color="#fff" />
              <Text style={styles.qBtnTxt}>AI Scan</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="voice-log-btn" style={[styles.qBtn, { backgroundColor: colors.fat }]} onPress={() => router.push({ pathname: "/quick-add", params: { date: selectedDate, tab: "voice", autofocus: "1" } as any })}>
              <Ionicons name="mic" size={20} color="#fff" />
              <Text style={styles.qBtnTxt}>Voice</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="scan-barcode-btn" style={[styles.qBtn, { backgroundColor: colors.text }]} onPress={() => router.push("/scan-barcode")}>
              <Ionicons name="barcode" size={20} color={colors.bg} />
              <Text style={[styles.qBtnTxt, { color: colors.bg }]}>Barcode</Text>
            </TouchableOpacity>
          </View>
        );

      case "meals":
        return (
          <View key={k} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              {isFutureDate ? "Planned meals" : isPastDate ? "Meals on this day" : "Today's meals"}
            </Text>
            {entries.length === 0 ? (
              <Text style={[styles.muted, { color: colors.muted }]}>
                {isFutureDate ? "No meals planned yet. Tap + above to pre-log." : "No meals logged. Tap + above to add."}
              </Text>
            ) : (
              entries.map((e) => (
                <View key={e.id} style={[styles.mealRow, { borderTopColor: colors.border }]} testID={`meal-row-${e.id}`}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Text style={[styles.mealName, { color: colors.text }]}>{e.name}</Text>
                      {typeof (e as any).health_score === "number" && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: ((e as any).health_color || colors.muted) + "22", borderWidth: 1, borderColor: (e as any).health_color || colors.muted }}>
                          <Text style={{ color: (e as any).health_color || colors.muted, fontWeight: "800", fontSize: 11 }}>★ {(e as any).health_score}/10</Text>
                          <Text style={{ color: (e as any).health_color || colors.muted, fontWeight: "700", fontSize: 10 }}>{(e as any).health_label || ""}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={[styles.muted, { color: colors.muted }]}>
                      {e.meal_type} · ×{e.servings} · {Math.round((e.calories || 0) * (e.servings || 1))} kcal · P{Math.round((e.protein || 0) * (e.servings || 1))} C{Math.round((e.carbs || 0) * (e.servings || 1))} F{Math.round((e.fat || 0) * (e.servings || 1))}
                    </Text>
                    {Array.isArray(e.benefits) && e.benefits.length > 0 && (
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {e.benefits.slice(0, 3).map((b, i) => (
                          <View key={i} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.chipBg, borderWidth: 1, borderColor: colors.primary + "33" }}>
                            <Text style={{ color: colors.primary, fontSize: 10, fontWeight: "800" }}>{b}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                  <TouchableOpacity testID={`repeat-meal-${e.id}`} onPress={() => onRepeat(e)} hitSlop={10} style={{ padding: 6 }}>
                    <Ionicons name="repeat" size={18} color={colors.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity testID={`delete-meal-${e.id}`} onPress={() => onDeleteMeal(e)} hitSlop={10} style={{ padding: 6 }}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.hello, { color: colors.text }]} numberOfLines={1}>{titleText}</Text>
            <Text style={[styles.date, { color: colors.muted }]}>
              {new Date(selectedDate + "T12:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
            </Text>
          </View>
          <TouchableOpacity
            testID="edit-toggle-btn"
            style={[styles.iconBtn, { backgroundColor: editMode ? colors.primary : colors.surface, borderColor: editMode ? colors.primary : colors.border }]}
            onPress={() => {
              if (editMode) {
                saveLayout(layout);
                setEditMode(false);
              } else {
                setEditMode(true);
              }
            }}
          >
            <Ionicons name={editMode ? "checkmark" : "options"} size={20} color={editMode ? "#fff" : colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="scan-quick-btn"
            style={[styles.iconBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => router.push({ pathname: "/quick-add", params: { date: selectedDate } as any })}
          >
            <Ionicons name="add" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Date scrubber */}
        <DateScrubber selected={selectedDate} onChange={onChangeDate} />
        {selectedDate !== todayStr() && (
          <TouchableOpacity testID="jump-today" onPress={() => onChangeDate(todayStr())} style={[styles.jumpBtn, { backgroundColor: colors.primary }]}>
            <Ionicons name="today" size={14} color="#fff" />
            <Text style={styles.jumpBtnTxt}>Jump to today</Text>
          </TouchableOpacity>
        )}

        {/* Edit mode bar */}
        {editMode && (
          <EditBar
            layout={layout}
            onChange={(l) => { setLayout(l); saveLayout(l); }}
            onDone={() => setEditMode(false)}
          />
        )}

        {/* Cards in user-defined order */}
        {layout.order.map((k) => renderCard(k))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: spacing.md, gap: spacing.md, paddingBottom: 100 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8 },
  hello: { fontSize: 22, fontWeight: "800" },
  date: { marginTop: 2, fontSize: 12 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, justifyContent: "center", alignItems: "center", borderWidth: 1 },
  card: { borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, gap: 10 },
  editCard: { borderRadius: radii.xl, padding: spacing.md, borderWidth: 2, gap: 6 },
  editRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: 1 },
  editIcon: { width: 32, height: 32, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  cardTitle: { fontWeight: "800", fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5 },
  calRow: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  calBig: { fontSize: 40, fontWeight: "800", lineHeight: 44 },
  calGoal: { fontWeight: "600", marginBottom: 6 },
  barTrack: { height: 10, borderRadius: 999, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 999 },
  remaining: { fontSize: 12, fontWeight: "600" },
  macroBarHeader: { flexDirection: "row", justifyContent: "space-between" },
  macroLabel: { fontWeight: "700" },
  macroValue: { fontWeight: "700" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  muted: { marginTop: 2, fontSize: 13 },
  waterBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1 },
  waterBtnTxt: { fontWeight: "800", fontSize: 12 },
  quickRow: { flexDirection: "row", gap: spacing.md },
  qBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 16, borderRadius: radii.lg },
  qBtnTxt: { color: "#fff", fontWeight: "800" },
  mealRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10, borderTopWidth: 1, gap: 4 },
  mealName: { fontWeight: "700", marginBottom: 2 },
  // Date scrubber
  dateChip: { width: 52, paddingVertical: 8, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  dateWeekday: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  dateDay: { fontSize: 18, fontWeight: "800", marginTop: 2 },
  dateDot: { width: 4, height: 4, borderRadius: 2, marginTop: 3 },
  jumpBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 999, alignSelf: "flex-start", paddingHorizontal: 14 },
  jumpBtnTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
});
