import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { subscribeUndo, dismissUndo, type UndoMsg } from "@/src/undo";
import { useTheme } from "@/src/theme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function UndoSnackbar() {
  const [msg, setMsg] = useState<UndoMsg | null>(null);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const fade = useState(new Animated.Value(0))[0];

  useEffect(() => subscribeUndo((m) => setMsg(m)), []);

  useEffect(() => {
    Animated.timing(fade, {
      toValue: msg ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [msg]);

  if (!msg) return null;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { bottom: insets.bottom + 80, opacity: fade, transform: [{ translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] },
      ]}
    >
      <View style={[styles.bar, { backgroundColor: colors.text }]}>
        <Ionicons name="checkmark-circle" size={18} color="#fff" />
        <Text style={styles.txt} numberOfLines={1}>{msg.text}</Text>
        <TouchableOpacity
          testID="undo-btn"
          onPress={async () => {
            await msg.onUndo();
            dismissUndo();
          }}
        >
          <Text style={[styles.undoTxt, { color: colors.primary }]}>UNDO</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, zIndex: 9999 },
  bar: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 16 },
  txt: { color: "#fff", flex: 1, fontWeight: "600", fontSize: 13 },
  undoTxt: { fontWeight: "800", letterSpacing: 1 },
});
