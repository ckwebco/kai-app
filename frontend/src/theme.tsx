import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { storage } from "@/src/utils/storage";

export type ColorMode = "light" | "dark";

export type Palette = {
  primary: string;
  primaryHover: string;
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  protein: string;
  carbs: string;
  fat: string;
  danger: string;
  chipBg: string;
};

// 🎨 Clean cartoon palette — playful purple, no orange. Crisp & fun.
const LIGHT: Palette = {
  primary: "#8B5CF6",        // vibrant cartoon purple
  primaryHover: "#7C3AED",
  bg: "#FAFAFF",             // crisp cool cream
  surface: "#FFFFFF",
  text: "#1E1B4B",           // deep indigo — playful but readable
  muted: "#8B8FB1",          // soft slate-lavender
  border: "#EEF0FF",         // pastel lavender
  protein: "#3B82F6",        // friendly blue
  carbs: "#F59E0B",          // sunny yellow
  fat: "#10B981",            // fresh mint green
  danger: "#EF4444",
  chipBg: "#F3F0FF",         // very pale purple
};

const DARK: Palette = {
  primary: "#A78BFA",
  primaryHover: "#8B5CF6",
  bg: "#13102A",             // deep purple-night
  surface: "#1F1B3A",
  text: "#FAFAFF",
  muted: "#B8B5D9",
  border: "#2D2752",
  protein: "#60A5FA",
  carbs: "#FCD34D",
  fat: "#34D399",
  danger: "#F87171",
  chipBg: "#2D2752",
};

// Chunky cartoon radii — buttons & cards look "pushable" & sticker-like
export const radii = { sm: 16, md: 22, lg: 28, xl: 36, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const shadow = {
  card: {
    // Soft purple-tinted lift — like cartoon stickers
    shadowColor: "#8B5CF6",
    shadowOpacity: 0.10,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
};

const KEY = "macrotrack_color_mode_v1";

type Ctx = { mode: ColorMode; colors: Palette; toggle: () => void; setMode: (m: ColorMode) => void };
const ThemeCtx = createContext<Ctx>({ mode: "light", colors: LIGHT, toggle: () => {}, setMode: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ColorMode>("light");

  useEffect(() => {
    (async () => {
      const saved = await storage.getItem<string>(KEY, "");
      if (saved === "dark" || saved === "light") setMode(saved);
    })();
  }, []);

  const apply = useCallback((m: ColorMode) => {
    setMode(m);
    storage.setItem(KEY, m);
  }, []);

  const toggle = useCallback(() => apply(mode === "light" ? "dark" : "light"), [mode, apply]);
  const colors = mode === "dark" ? DARK : LIGHT;

  return <ThemeCtx.Provider value={{ mode, colors, toggle, setMode: apply }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}

// Static export for places that don't need reactive colors.
export const theme = LIGHT;
