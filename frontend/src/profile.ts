import { storage } from "@/src/utils/storage";

export type GoalMode = "cut" | "athletic" | "lean_gain" | "maintain";
export type WeightUnit = "kg" | "lb";

export type UserProfile = {
  name: string;
  current_weight: number; // always stored in kg
  target_weight: number;  // kg
  height: number; // cm
  age: number;
  gender: "male" | "female" | "other";
  activity_level: "sedentary" | "lightly_active" | "moderately_active" | "very_active" | "extremely_active";
  weekly_goal: "lose_1_lb" | "lose_0.5_lb" | "maintain" | "gain_0.5_lb" | "gain_1_lb";
  calorie_goal: number;
  protein_goal: number;
  carbs_goal: number;
  fat_goal: number;
  goal_mode: GoalMode;
  weight_unit: WeightUnit;
  weekly_exercises: number;
  custom_addback_pct: number | null;
  custom_water_goal_ml: number | null;
  // When true, calorie_goal / protein_goal / carbs_goal / fat_goal are user-set
  // and computeMacroGoals / computeGoalCalories return them as-is.
  use_custom_goals?: boolean;
};

export function computeWaterGoalMl(p: UserProfile): number {
  if (p.custom_water_goal_ml && p.custom_water_goal_ml > 0) return p.custom_water_goal_ml;
  const perKg: Record<GoalMode, number> = { cut: 35, athletic: 42, lean_gain: 38, maintain: 33 };
  const kg = p.current_weight || 70;
  const ml = Math.round(perKg[p.goal_mode] * kg);
  // Bump for high training frequency
  const bonus = Math.min(750, (p.weekly_exercises || 0) * 100);
  return Math.max(1500, ml + bonus);
}

export const cupsFromMl = (ml: number) => ml / 250;
export const mlFromCups = (cups: number) => cups * 250;

const KEY = "macrotrack_profile_v1";

export const defaultProfile: UserProfile = {
  name: "You",
  current_weight: 75,
  target_weight: 70,
  height: 175,
  age: 28,
  gender: "male",
  activity_level: "moderately_active",
  weekly_goal: "lose_0.5_lb",
  calorie_goal: 2200,
  protein_goal: 150,
  carbs_goal: 240,
  fat_goal: 75,
  goal_mode: "maintain",
  weight_unit: "kg",
  weekly_exercises: 3,
  custom_addback_pct: null,
  custom_water_goal_ml: null,
  use_custom_goals: false,
};

export async function loadProfile(): Promise<UserProfile> {
  const raw = await storage.getItem<string>(KEY, "");
  if (!raw) return defaultProfile;
  try {
    return { ...defaultProfile, ...JSON.parse(raw) };
  } catch {
    return defaultProfile;
  }
}

export async function saveProfile(p: UserProfile): Promise<boolean> {
  return storage.setItem(KEY, JSON.stringify(p));
}

// ---- Unit helpers ----
export const kgToLb = (kg: number) => kg * 2.2046226218;
export const lbToKg = (lb: number) => lb / 2.2046226218;
export const fmtWeight = (kg: number, unit: WeightUnit) =>
  unit === "lb" ? `${kgToLb(kg).toFixed(1)} lb` : `${kg.toFixed(1)} kg`;

// ---- Goal mode math ----
export const GOAL_META: Record<GoalMode, {
  label: string;
  icon: string;
  description: string;
  addBackPct: number;
  addBackRange: [number, number];
  calorieAdjustPct: number;
  proteinPerKg: number;
  color: string;
}> = {
  cut: {
    label: "Cut",
    icon: "trending-down",
    description: "Calorie deficit, protein-protected fat loss",
    addBackPct: 0.25,
    addBackRange: [0, 0.5],
    calorieAdjustPct: -0.20,
    proteinPerKg: 2.2,
    color: "#EF4444",
  },
  athletic: {
    label: "Athletic",
    icon: "flash",
    description: "Perform & stay lean — fuel around training",
    addBackPct: 0.65,
    addBackRange: [0.5, 0.9],
    calorieAdjustPct: 0,
    proteinPerKg: 2.0,
    color: "#3B82F6",
  },
  lean_gain: {
    label: "Lean Gain",
    icon: "trending-up",
    description: "Build muscle, minimize fat gain",
    addBackPct: 0.90,
    addBackRange: [0.75, 1.0],
    calorieAdjustPct: 0.10,
    proteinPerKg: 2.2,
    color: "#10B981",
  },
  maintain: {
    label: "Maintain",
    icon: "remove",
    description: "Hold weight, balanced macros",
    addBackPct: 0.50,
    addBackRange: [0.25, 0.75],
    calorieAdjustPct: 0,
    proteinPerKg: 1.6,
    color: "#F59E0B",
  },
};

// Mifflin-St Jeor BMR + activity multiplier -> TDEE
const ACT_MULT: Record<UserProfile["activity_level"], number> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extremely_active: 1.9,
};

export function computeTDEE(p: UserProfile): number {
  const w = Number(p?.current_weight) || 70;
  const h = Number(p?.height) || 170;
  const a = Number(p?.age) || 28;
  const gender = p?.gender || "male";
  const lvl = p?.activity_level || "moderately_active";
  const bmrBase = 10 * w + 6.25 * h - 5 * a;
  const bmr = gender === "female" ? bmrBase - 161 : bmrBase + 5;
  const tdee = bmr * (ACT_MULT[lvl] || 1.55);
  return Math.round(tdee);
}

export function computeGoalCalories(p: UserProfile): number {
  if (p?.use_custom_goals && p.calorie_goal > 0) return Math.round(p.calorie_goal);
  try {
    const tdee = computeTDEE(p);
    const mode = (p?.goal_mode && GOAL_META[p.goal_mode]) ? p.goal_mode : "maintain";
    const adj = GOAL_META[mode].calorieAdjustPct;
    return Math.max(1200, Math.round(tdee * (1 + adj)));
  } catch { return 2200; }
}

export function computeMacroGoals(p: UserProfile): { protein: number; carbs: number; fat: number; calories: number } {
  // If custom goals are enabled, return them as-is (user owns the numbers).
  if (p?.use_custom_goals) {
    return {
      calories: Math.max(1000, Math.round(p.calorie_goal || 2200)),
      protein: Math.max(0, Math.round(p.protein_goal || 150)),
      carbs: Math.max(0, Math.round(p.carbs_goal || 240)),
      fat: Math.max(0, Math.round(p.fat_goal || 75)),
    };
  }
  try {
    const cal = computeGoalCalories(p);
    const mode = (p?.goal_mode && GOAL_META[p.goal_mode]) ? p.goal_mode : "maintain";
    const protein = Math.round(GOAL_META[mode].proteinPerKg * (Number(p?.current_weight) || 70));
    const fatPct = mode === "cut" ? 0.25 : 0.28;
    const fat = Math.round((cal * fatPct) / 9);
    const carbs = Math.max(50, Math.round((cal - protein * 4 - fat * 9) / 4));
    return { protein, carbs, fat, calories: cal };
  } catch { return { protein: 150, carbs: 240, fat: 75, calories: 2200 }; }
}

// Quick reference for the UI: best protein g/kg per goal mode.
export const PROTEIN_BY_MODE: Record<GoalMode, { gPerKg: number; tip: string }> = {
  cut: { gPerKg: 2.2, tip: "Protein-protect lean mass" },
  athletic: { gPerKg: 2.0, tip: "Recover + perform" },
  lean_gain: { gPerKg: 2.2, tip: "Maximize muscle synthesis" },
  maintain: { gPerKg: 1.6, tip: "Healthy baseline" },
};

export function addBackCalories(burned: number, mode: GoalMode, customPct?: number | null): number {
  const pct = (typeof customPct === "number" && customPct >= 0 && customPct <= 1)
    ? customPct
    : GOAL_META[mode].addBackPct;
  return Math.round(burned * pct);
}
