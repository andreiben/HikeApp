import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { BorderRadius, Colors, Spacing, Typography } from "../../theme";

export type RiskLevel = "Low" | "Moderate" | "High" | "Very High";

const RISK_CONFIG: Record<RiskLevel, { color: string; bg: string; dot: string; label: string }> = {
  Low: {
    color: Colors.riskLow,
    bg: Colors.riskLowBg,
    dot: Colors.riskLow,
    label: "Risc scăzut",
  },
  Moderate: {
    color: Colors.riskModerate,
    bg: Colors.riskModerateBg,
    dot: Colors.riskModerate,
    label: "Risc moderat",
  },
  High: {
    color: Colors.riskHigh,
    bg: Colors.riskHighBg,
    dot: Colors.riskHigh,
    label: "Risc ridicat",
  },
  "Very High": {
    color: Colors.riskVeryHigh,
    bg: Colors.riskVeryHighBg,
    dot: Colors.riskVeryHigh,
    label: "Risc foarte ridicat",
  },
};

interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function RiskBadge({
  level,
  score,
  compact = false,
  style,
}: RiskBadgeProps) {
  const cfg = RISK_CONFIG[level];
  const displayLabel = cfg.label;
  const label = score !== undefined ? `${displayLabel} ${score}` : displayLabel;

  return (
    <View
      accessible={true}
      accessibilityLabel={label}
      style={[styles.badge, { backgroundColor: cfg.bg }, style]}
    >
      <View style={[styles.dot, { backgroundColor: cfg.dot }]} />
      {!compact && <Text style={[styles.label, { color: cfg.color }]}>{label}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    letterSpacing: 0.3,
  },
});
