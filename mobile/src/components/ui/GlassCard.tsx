import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BorderRadius, Colors, Shadow } from "../../theme";

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  tint?: "light" | "dark" | "default";
  noBorder?: boolean;
}

export function GlassCard({
  children,
  style,
  intensity = 0,
  tint = "light",
  noBorder = false,
}: GlassCardProps) {
  return (
    <View style={[styles.card, !noBorder && styles.border, Shadow.glass, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    backgroundColor: Colors.elevated,
  },
  border: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
