import React, { createContext, useCallback, useContext, useRef, useState, useEffect } from "react";
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";

type UndoOpts = { message: string; onUndo: () => void | Promise<void>; durationMs?: number };
type Ctx = { show: (opts: UndoOpts) => void };
const UndoCtx = createContext<Ctx>({ show: () => {} });

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<UndoOpts | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const fade = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef<any>(null);

  const dismiss = useCallback(() => {
    Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true, easing: Easing.out(Easing.cubic) }).start(() => {
      setState(null);
    });
  }, [fade]);

  const show = useCallback((opts: UndoOpts) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setState(opts);
    Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true, easing: Easing.out(Easing.cubic) }).start();
    timeoutRef.current = setTimeout(dismiss, opts.durationMs || 4500);
  }, [fade, dismiss]);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const onUndoPress = async () => {
    if (!state) return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    try { await state.onUndo(); } catch {}
    dismiss();
  };

  return (
    <UndoCtx.Provider value={{ show }}>
      {children}
      {state && (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.wrap,
            { bottom: insets.bottom + 80, opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
          ]}
        >
          <View style={[styles.toast, { backgroundColor: colors.text }]} testID="undo-toast">
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
            <Text style={styles.msg} numberOfLines={1}>{state.message}</Text>
            <TouchableOpacity onPress={onUndoPress} hitSlop={12} testID="undo-btn">
              <Text style={[styles.undo, { color: colors.primary === "#3B82F6" ? "#93C5FD" : "#60A5FA" }]}>UNDO</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </UndoCtx.Provider>
  );
}

export function useUndo() {
  return useContext(UndoCtx);
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, alignItems: "center" },
  toast: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 999, minWidth: 240, maxWidth: 400, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  msg: { color: "#fff", fontWeight: "700", flex: 1, fontSize: 13 },
  undo: { fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },
});
