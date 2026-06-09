import Constants from "expo-constants";

function getBackendUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim().replace(/\/+$/g, "") || "";
  const extraUrl = String(
    Constants.expoConfig?.extra?.backendUrl || Constants.manifest?.extra?.backendUrl || ""
  ).trim().replace(/\/+$/g, "");
  const base = envUrl || extraUrl;
  if (!base) {
    const message =
      "EXPO_PUBLIC_BACKEND_URL is not configured. Set it in frontend/.env and app.config.js extra.backendUrl.";
    console.error("[api] missing backend url", { envUrl, extraUrl });
    throw new Error(message);
  }
  // Common local dev typo: someone may set :800 instead of :8000 — tolerate and fix.
  let fixed = base;
  try {
    const m = fixed.match(/^(https?:\/\/[^:\/]+):(\d+)$/);
    if (m) {
      const host = m[1];
      const port = parseInt(m[2], 10);
      if (port === 800) fixed = `${host}:8000`;
    }
    // If no explicit port and host is an IP, assume 8000 for local dev
    const noPort = /^https?:\/\/\d+\.\d+\.\d+\.\d+$/.test(fixed);
    if (noPort) fixed = fixed + ":8000";
  } catch {}
  return fixed;
}

const BASE = getBackendUrl();

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${BASE}/api${path}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });

  const text = await res.text().catch(() => "");
  const logContext = { url, status: res.status, statusText: res.statusText, body: text };

  if (!res.ok) {
    console.error("[api] fetch failed", logContext);
    let message = `Request failed ${res.status} ${res.statusText}`;
    try {
      const payload = text ? JSON.parse(text) : null;
      if (payload && typeof payload === "object" && "detail" in payload) {
        message = String((payload as any).detail || message);
      }
    } catch {
      // ignore parse failures; we already have raw response text
    }
    throw new Error(`${message} (${url})`);
  }

  if (!text) {
    console.warn("[api] empty JSON response", logContext);
    throw new Error(`Empty JSON response from ${url}`);
  }

  try {
    const parsed = JSON.parse(text) as T;
    console.info("[api] fetch success", { url, status: res.status, body: text.slice(0, 500) });
    return parsed;
  } catch (err) {
    console.error("[api] invalid JSON response", { ...logContext, parseError: err });
    throw new Error(`Invalid JSON response from ${url}: ${text.slice(0, 400)}`);
  }
}

export type FoodProduct = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  serving_size: number;
  serving_unit: string;
  benefits: string[];
  alternative_suggestion?: string | null;
  barcode?: string | null;
  brand?: string | null;
  fiber?: number;
  sugar?: number;
  sodium_mg?: number;
  caffeine_mg?: number;
  vitamins?: string[];
  ingredients_list: {
    name: string;
    weight_grams: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }[];
};

export type FoodLogEntry = FoodProduct & {
  id: string;
  date: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  servings: number;
  logged_at: string;
};

export const api = {
  analyzeFood: (image_base64: string, notes?: string) =>
    req<FoodProduct>("/analyze-food", {
      method: "POST",
      body: JSON.stringify({ image_base64, notes: notes || "" }),
    }),
  barcodeLookup: (barcode: string) => req<FoodProduct>(`/barcode-lookup/${barcode}`),
  foodSearch: (q: string) =>
    req<{ results: (FoodProduct & { image_url?: string; code?: string })[] }>(
      `/food-search?q=${encodeURIComponent(q)}`
    ),
  parseFoodText: (text: string) =>
    req<FoodProduct & { servings: number }>("/parse-food-text", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),

  listFoodLog: (date?: string) =>
    req<FoodLogEntry[]>(`/food-log${date ? `?date=${date}` : ""}`),
  createFoodLog: (entry: Partial<FoodLogEntry>) =>
    req<FoodLogEntry>("/food-log", { method: "POST", body: JSON.stringify(entry) }),
  deleteFoodLog: (id: string) =>
    req<{ deleted: number }>(`/food-log/${id}`, { method: "DELETE" }),

  listWeightLog: () => req<any[]>("/weight-log"),
  createWeightLog: (weight: number, date: string) =>
    req<any>("/weight-log", { method: "POST", body: JSON.stringify({ weight, date }) }),

  listWaterLog: (date?: string) =>
    req<any[]>(`/water-log${date ? `?date=${date}` : ""}`),
  createWaterLog: (date: string, cups: number, milliliters: number) =>
    req<any>("/water-log", {
      method: "POST",
      body: JSON.stringify({ date, cups, milliliters }),
    }),
  deleteWaterLog: (id: string) =>
    req<{ deleted: number }>(`/water-log/${id}`, { method: "DELETE" }),

  listActivityLog: (date?: string) =>
    req<any[]>(`/activity-log${date ? `?date=${date}` : ""}`),
  createActivityLog: (entry: any) =>
    req<any>("/activity-log", { method: "POST", body: JSON.stringify(entry) }),
  deleteActivityLog: (id: string) =>
    req<{ deleted: number }>(`/activity-log/${id}`, { method: "DELETE" }),

  listRecipes: () => req<any[]>("/recipes"),
  createRecipe: (r: any) => req<any>("/recipes", { method: "POST", body: JSON.stringify(r) }),
  deleteRecipe: (id: string) => req<any>(`/recipes/${id}`, { method: "DELETE" }),
  recipeScale: (recipe: any, factor: number) =>
    req<any>("/recipe-scale", { method: "POST", body: JSON.stringify({ recipe, factor }) }),

  analyzeMealText: (description: string, notes?: string) =>
    req<any>("/analyze-meal-text", { method: "POST", body: JSON.stringify({ description, notes }) }),

  weeklySummary: (endDate?: string) =>
    req<{ days: { date: string; calories: number; protein: number; carbs: number; fat: number; water_ml: number; burned: number }[] }>(
      `/weekly-summary${endDate ? `?end_date=${endDate}` : ""}`
    ),

  coachChat: (message: string, context: any, history: { role: string; content: string }[]) =>
    req<{ reply: string }>("/coach-chat", {
      method: "POST",
      body: JSON.stringify({ message, context, history }),
    }),
  exerciseEstimate: (description: string, intensity: "easy" | "moderate" | "hard", duration_minutes: number, weight_kg: number) =>
    req<{ activity: string; met: number; calories_burned: number; intensity: string; note: string; duration_minutes: number }>(
      "/exercise-estimate",
      { method: "POST", body: JSON.stringify({ description, intensity, duration_minutes, weight_kg }) }
    ),

  importRecipeUrl: (url: string) =>
    req<{
      name: string;
      summary: string;
      meal_type: "breakfast" | "lunch" | "dinner" | "snack";
      servings: number;
      tags: string[];
      ingredients: { name: string; amount: string; grams: number; alt: string }[];
      instructions: string[];
      per_serving: { calories: number; protein: number; carbs: number; fat: number };
      source_url: string;
      source: string;
      thumbnail: string;
      video_id: string | null;
      title_from_source: string;
    }>("/import-recipe-url", { method: "POST", body: JSON.stringify({ url }) }),

  featuredRecipes: (channel: string) =>
    req<{ channel: string; results: { video_id: string; url: string; thumbnail: string; channel: string }[] }>(
      `/featured-recipes?channel=${encodeURIComponent(channel)}`
    ),

  popularPicks: () =>
    req<{ results: { video_id: string; url: string; thumbnail: string; name: string | null; meal_type: string | null; tags: string[]; per_serving: any; cached: boolean }[] }>(
      "/popular-picks"
    ),

  recipeCache: (category?: string) =>
    req<{ category: string; results: any[] }>(
      `/recipe-cache${category ? `?category=${encodeURIComponent(category)}` : ""}`
    ),

  creators: () => req<{ results: { handle: string; label: string; note: string }[] }>("/creators"),

  recipeHelp: (recipe: any, question: string, history: { role: string; content: string }[]) =>
    req<{ reply: string }>("/recipe-help", {
      method: "POST",
      body: JSON.stringify({ recipe, question, history }),
    }),

  physiqueAnalyze: (image_base64: string, goal_mode: string, user_note?: string) =>
    req<{ analysis: string; log_id: string }>("/physique-analyze", {
      method: "POST",
      body: JSON.stringify({ image_base64, goal_mode, user_note: user_note || "" }),
    }),

  physiqueLog: () =>
    req<{ results: { id: string; image_base64: string; analysis: string; goal_mode: string; user_note: string; logged_at: string }[] }>(
      "/physique-log"
    ),

  deletePhysiqueLog: (id: string) =>
    req<{ deleted: number }>(`/physique-log/${id}`, { method: "DELETE" }),
};

// Returns the user's LOCAL calendar date in YYYY-MM-DD format.
// `toISOString()` would return UTC, which makes the app show tomorrow's date
// for anyone west of UTC after their local evening — classic off-by-one.
export const todayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
