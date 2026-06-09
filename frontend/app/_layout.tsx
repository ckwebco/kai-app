import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { ThemeProvider, useTheme } from "@/src/theme";
import UndoSnackbar from "@/src/ui/UndoSnackbar";

SplashScreen.preventAutoHideAsync();

function Shell() {
  const { mode, colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="scan-camera" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="scan-barcode" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="quick-add" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="recipes" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="import-recipe" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="physique" options={{ presentation: "fullScreenModal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="meal-editor" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="activity-history" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
      </Stack>
      <UndoSnackbar />
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useIconFonts();

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
