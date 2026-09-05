import React from "react";
import {
  StyleSheet,
  Text,
  type StyleProp,
  View,
  type ViewStyle,
} from "react-native";
import { PressableFeedback } from "./ui/PressableFeedback";
import { BorderRadius, Colors, Spacing, Typography } from "../theme";

type Dificily = "easy" | "moderate" | "hard" | "expert";
type TrailCondition = "dry" | "muddy" | "snowy" | "overgrown" | "blocked";

export interface RouteCardProps {
  routeName: string;
  difficulty: Dificily | string;
  distanceKm: number;
  elevationGainM: number;
  estimatedDurationH: number;
  condition?: string | null;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

const DIFFICULTY_META: Record<
  Dificily,
  { label: string; color: string; backgroundColor: string }
> = {
  easy: {
    label: "UȘOR",
    color: Colors.riskLow,
    backgroundColor: "rgba(74,222,128,0.12)",
  },
  moderate: {
    label: "MODERAT",
    color: Colors.riskModerate,
    backgroundColor: "rgba(251,146,60,0.12)",
  },
  hard: {
    label: "GREU",
    color: Colors.riskHigh,
    backgroundColor: "rgba(248,113,113,0.12)",
  },
  expert: {
    label: "EXPERT",
    color: Colors.difficultyExpert,
    backgroundColor: "rgba(192,132,252,0.14)",
  },
};

const TRAIL_CONDITION_META: Record<
  TrailCondition,
  { label: string; color: string }
> = {
  dry: { label: "Uscat", color: "#4CAF50" },
  muddy: { label: "Noroios", color: "#FF9800" },
  snowy: { label: "Înzăpezit", color: "#2196F3" },
  overgrown: { label: "Năpădit", color: "#FFC107" },
  blocked: { label: "Blocat", color: "#F44336" },
};

function normalizeDificily(difficulty: string): Dificily {
  const normalized = difficulty.toLowerCase();
  if (
    normalized === "easy" ||
    normalized === "moderate" ||
    normalized === "hard" ||
    normalized === "expert"
  ) {
    return normalized;
  }

  return "moderate";
}

function getTrailConditionMeta(condition?: string | null) {
  if (
    condition === "dry" ||
    condition === "muddy" ||
    condition === "snowy" ||
    condition === "overgrown" ||
    condition === "blocked"
  ) {
    return TRAIL_CONDITION_META[condition];
  }

  return null;
}

function formatDuration(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (wholeHours === 0) return `${minutes}min`;
  if (minutes === 0) return `${wholeHours}h`;
  return `${wholeHours}h ${minutes}min`;
}

export default function RouteCard({
  routeName,
  difficulty,
  distanceKm,
  elevationGainM,
  estimatedDurationH,
  condition,
  onPress,
  style,
}: RouteCardProps) {
  const difficultyMeta = DIFFICULTY_META[normalizeDificily(difficulty)];
  const conditionMeta = getTrailConditionMeta(condition);
  const stats = `${distanceKm.toFixed(1)} km · +${Math.round(
    elevationGainM
  )}m · ${formatDuration(estimatedDurationH)}`;
  const accessibilityLabel = `${routeName}, ${difficultyMeta.label}, ${distanceKm.toFixed(
    1
  )} kilometri`;

  return (
    <PressableFeedback onPress={onPress} style={style}>
      <View
        accessible={true}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={styles.card}
      >
        <View style={styles.leftContent}>
          <View style={styles.nameRow}>
            <Text style={styles.routeName} numberOfLines={1} ellipsizeMode="tail">
              {routeName}
            </Text>
            <View
              style={[
                styles.difficultyBadge,
                { backgroundColor: difficultyMeta.backgroundColor },
              ]}
            >
              <Text
                style={[
                  styles.difficultyText,
                  { color: difficultyMeta.color },
                ]}
              >
                {difficultyMeta.label}
              </Text>
            </View>
          </View>
          <Text style={styles.statsText} numberOfLines={1}>
            {stats}
          </Text>
          {conditionMeta ? (
            <View style={styles.conditionRow}>
              <View
                style={[
                  styles.conditionDot,
                  { backgroundColor: conditionMeta.color },
                ]}
              />
              <Text style={[styles.conditionText, { color: conditionMeta.color }]}>
                {conditionMeta.label}
              </Text>
            </View>
          ) : null}
        </View>

      </View>
    </PressableFeedback>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
  },
  leftContent: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  routeName: {
    flex: 1,
    minWidth: 0,
    fontFamily: Typography.fontSemibold,
    fontSize: 14,
    color: Colors.textPrimary,
  },
  difficultyBadge: {
    flexShrink: 0,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  difficultyText: {
    fontFamily: Typography.fontSemibold,
    fontSize: 10,
    letterSpacing: 0,
  },
  statsText: {
    fontFamily: Typography.fontMono,
    fontSize: 13,
    color: Colors.textSecondary,
  },
  conditionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  conditionDot: {
    width: 7,
    height: 7,
    borderRadius: BorderRadius.full,
  },
  conditionText: {
    fontFamily: Typography.fontSemibold,
    fontSize: 11,
  },
});
