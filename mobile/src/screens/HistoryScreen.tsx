import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Swipeable from "react-native-gesture-handler/Swipeable";
import { Ionicons } from "@expo/vector-icons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";
import type { MainStackParamList, MainTabParamList } from "../navigation";
import {
  AnimatedListItem,
  GlassCard,
  SkeletonLoader,
} from "../components/ui";
import { PressableFeedback } from "../components/ui/PressableFeedback";
import {
  BorderRadius,
  Colors,
  Spacing,
  Typography,
} from "../theme";
import { api } from "../services/api";
import { getAccessToken } from "../services/authStorage";
import { addFavorite, fetchFavoriteIds, removeFavorite } from "../services/favorites";

const TRAIL_CONDITION_META: Record<string, { color: string; label: string; icon: string }> = {
  dry: { color: "#4CAF50", label: "Uscat", icon: "sunny-outline" },
  muddy: { color: "#FF9800", label: "Noroios", icon: "water-outline" },
  snowy: { color: "#2196F3", label: "Înzăpezit", icon: "snow-outline" },
  overgrown: { color: "#FFC107", label: "Năpădit", icon: "leaf-outline" },
  blocked: { color: "#F44336", label: "Blocat", icon: "close-circle-outline" },
};

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, "History">,
  NativeStackScreenProps<MainStackParamList>
>;

type HikeItem = {
  id: string;
  routeId?: string | null;
  routeName: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  distanceM: number | null;
  elevationGainM: number | null;
  durationS: number | null;
  avgPaceMinKm: number | null;
  difficulty?: string | null;
  completionScore?: number | null;
};

type HikeStats = {
  totalHikes: number;
  totalDistanceKm: number;
  totalElevationGainM: number;
  totalDurationH: number;
  longestHikeKm: number;
  highestElevationGainM: number;
  avgPaceMinKm: number;
};

type BadgeItem = {
  id: string;
  label: string;
  earned: boolean;
  tint: string;
  progressHint: string;
  earnedAt: string | null;
  progressValue: number;
  progressTarget: number;
};

type PersonalBest = {
  id: string;
  label: string;
  value: string;
  unit: string;
};

type WeeklyDistanțăPoint = {
  key: string;
  label: string;
  distanceKm: number;
};

type WeeklyTrendMetric = {
  icon: ComponentProps<typeof Ionicons>["name"];
  color: string;
  changeLabel: string;
  currentValueLabel: string;
};

type PeriodSummary = {
  km: number;
  elevationM: number;
  hikeCount: number;
};

type MonthComparison = {
  currentMonth: PeriodSummary;
  previousMonth: PeriodSummary;
};

type DifficultyBucket = "easy" | "moderate" | "hard" | "veryHard";

type DifficultyRowDefinition = {
  key: DifficultyBucket;
  label: string;
  color: string;
  count: number;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDurată(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

function formatRitm(minPerKm: number): string {
  if (minPerKm <= 0) return "-";

  const totalSeconds = Math.round(minPerKm * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")} /km`;
}

function formatChartAxisValue(value: number): string {
  return value >= 10 ? value.toFixed(0) : value.toFixed(1);
}

function formatPercentChange(value: number): string {
  const rounded = Math.round(value);
  if (rounded === 0) return "0%";
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function extractPeriodSummary(value: unknown): PeriodSummary | null {
  if (
    !isObject(value) ||
    !isFiniteNumber(value.km) ||
    !isFiniteNumber(value.elevationM) ||
    !isFiniteNumber(value.hikeCount)
  ) {
    return null;
  }

  return {
    km: value.km,
    elevationM: value.elevationM,
    hikeCount: value.hikeCount,
  };
}

function extractMonthComparison(value: unknown): MonthComparison | null {
  if (!isObject(value)) {
    return null;
  }

  const currentMonth = extractPeriodSummary(value.currentMonth);
  const previousMonth = extractPeriodSummary(value.previousMonth);

  if (!currentMonth || !previousMonth) {
    return null;
  }

  return {
    currentMonth,
    previousMonth,
  };
}

function isHikeItem(value: unknown): value is HikeItem {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    (typeof value.routeId === "string" ||
      value.routeId === null ||
      value.routeId === undefined) &&
    (typeof value.routeName === "string" || value.routeName === null) &&
    typeof value.status === "string" &&
    typeof value.startedAt === "string" &&
    (typeof value.endedAt === "string" || value.endedAt === null) &&
    (value.distanceM === null || isFiniteNumber(value.distanceM)) &&
    (value.elevationGainM === null || isFiniteNumber(value.elevationGainM)) &&
    (value.durationS === null || isFiniteNumber(value.durationS)) &&
    (value.avgPaceMinKm === null || isFiniteNumber(value.avgPaceMinKm)) &&
    (value.difficulty === undefined ||
      value.difficulty === null ||
      typeof value.difficulty === "string") &&
    (value.completionScore === undefined ||
      value.completionScore === null ||
      isFiniteNumber(value.completionScore))
  );
}

function isHikeStats(value: unknown): value is HikeStats {
  return (
    isObject(value) &&
    isFiniteNumber(value.totalHikes) &&
    isFiniteNumber(value.totalDistanceKm) &&
    isFiniteNumber(value.totalElevationGainM) &&
    isFiniteNumber(value.totalDurationH) &&
    isFiniteNumber(value.longestHikeKm) &&
    isFiniteNumber(value.highestElevationGainM) &&
    (value.avgPaceMinKm === null || isFiniteNumber(value.avgPaceMinKm))
  );
}

function clampDisplayValue(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

function formatBadgeDate(iso: string | null): string {
  return iso ? formatDate(iso) : "Câștigat recent";
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfIsoWeek(dateInput: Date): Date {
  const date = new Date(dateInput);
  date.setHours(0, 0, 0, 0);
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  return date;
}

function getIsoWeekLabel(weekStartKey: string): string {
  const weekStart = new Date(`${weekStartKey}T00:00:00`);
  return weekStart.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getFinalizatHikes(hikes: HikeItem[]): HikeItem[] {
  return hikes.filter((hike) => hike.status === "completed");
}

function getWeekTotals(
  hikes: HikeItem[]
): Map<string, { distanceKm: number; elevationM: number }> {
  const totals = new Map<string, { distanceKm: number; elevationM: number }>();

  for (const hike of getFinalizatHikes(hikes)) {
    const weekKey = toLocalDateKey(startOfIsoWeek(new Date(hike.startedAt)));
    const current = totals.get(weekKey) ?? { distanceKm: 0, elevationM: 0 };
    current.distanceKm += (hike.distanceM ?? 0) / 1000;
    current.elevationM += hike.elevationGainM ?? 0;
    totals.set(weekKey, current);
  }

  return totals;
}

function getLastNWeekStarts(count: number): string[] {
  const currentWeek = startOfIsoWeek(new Date());

  return Array.from({ length: count }, (_, index) => {
    const weekStart = new Date(currentWeek);
    weekStart.setDate(currentWeek.getDate() - (count - 1 - index) * 7);
    return toLocalDateKey(weekStart);
  });
}

function getWeeklyDistanțăSeries(hikes: HikeItem[], count: number): WeeklyDistanțăPoint[] {
  const weekTotals = getWeekTotals(hikes);

  return getLastNWeekStarts(count).map((weekKey) => ({
    key: weekKey,
    label: getIsoWeekLabel(weekKey),
    distanceKm: weekTotals.get(weekKey)?.distanceKm ?? 0,
  }));
}

function getWeeklyTrendMetric(
  metric: "distance" | "elevation",
  hikes: HikeItem[]
): WeeklyTrendMetric {
  const [lastWeekKey, thisWeekKey] = getLastNWeekStarts(2);
  const weekTotals = getWeekTotals(hikes);
  const currentValue =
    metric === "distance"
      ? weekTotals.get(thisWeekKey)?.distanceKm ?? 0
      : weekTotals.get(thisWeekKey)?.elevationM ?? 0;
  const previousValue =
    metric === "distance"
      ? weekTotals.get(lastWeekKey)?.distanceKm ?? 0
      : weekTotals.get(lastWeekKey)?.elevationM ?? 0;
  const change =
    previousValue === 0
      ? currentValue === 0
        ? 0
        : 100
      : ((currentValue - previousValue) / previousValue) * 100;

  if (currentValue > previousValue) {
    return {
      icon: "trending-up",
      color: Colors.success,
      changeLabel: `${formatPercentChange(change)}% față de săptămâna trecută`,
      currentValueLabel:
        metric === "distance"
          ? `${currentValue.toFixed(1)} km această săptămână`
          : `${Math.round(currentValue)} m această săptămână`,
    };
  }

  if (currentValue < previousValue) {
    return {
      icon: "trending-down",
      color: Colors.warning,
      changeLabel: `${formatPercentChange(change)}% față de săptămâna trecută`,
      currentValueLabel:
        metric === "distance"
          ? `${currentValue.toFixed(1)} km această săptămână`
          : `${Math.round(currentValue)} m această săptămână`,
    };
  }

  return {
    icon: "remove",
    color: Colors.textSecondary,
    changeLabel: "0% față de săptămâna trecută",
    currentValueLabel:
      metric === "distance"
        ? `${currentValue.toFixed(1)} km această săptămână`
        : `${Math.round(currentValue)} m această săptămână`,
  };
}

function mapDifficultyBucket(difficulty: string): DifficultyBucket {
  const normalized = difficulty.trim().toLowerCase();

  if (
    normalized.includes("very hard") ||
    normalized.includes("very_hard") ||
    normalized.includes("veryhard") ||
    normalized.includes("demanding alpine")
  ) {
    return "veryHard";
  }

  if (
    normalized.includes("hard") ||
    normalized.includes("difficult") ||
    normalized === "t4" ||
    normalized === "t5"
  ) {
    return "hard";
  }

  if (
    normalized.includes("moderate") ||
    normalized.includes("medium") ||
    normalized.includes("intermediate") ||
    normalized === "t2" ||
    normalized === "t3"
  ) {
    return "moderate";
  }

  return "easy";
}

function formatDifficultyLabel(difficulty: string): string {
  const labels: Record<string, string> = {
    easy: "Ușor",
    moderate: "Moderat",
    hard: "Greu",
    expert: "Extrem",
  };
  return labels[difficulty.toLowerCase()] ?? (difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase());
}

function getDifficultyColor(difficulty: string): string {
  if (difficulty.trim().toLowerCase() === "expert") return "#8B5CF6";

  const bucket = mapDifficultyBucket(difficulty);

  if (bucket === "easy") return Colors.difficultyEasy;
  if (bucket === "moderate") return Colors.difficultyModerate;
  if (bucket === "hard") return Colors.difficultyHard;
  return "#8B5CF6";
}

function getCompletionScoreColor(score: number): string {
  if (score >= 80) return Colors.accent;
  if (score >= 50) return Colors.riskModerate;
  return Colors.textSecondary;
}

function getComparisonDeltaMeta(delta: number | null): {
  icon: ComponentProps<typeof Ionicons>["name"];
  color: string;
} {
  if (delta == null || delta === 0) {
    return { icon: "remove", color: Colors.textSecondary };
  }

  return delta > 0
    ? { icon: "arrow-up", color: Colors.success }
    : { icon: "arrow-down", color: Colors.warning };
}

function formatComparisonDelta(delta: number | null, unit: string): string {
  if (delta == null) {
    return "-";
  }

  const value = unit === "km" ? Number(delta.toFixed(1)) : Math.round(delta);

  if (value === 0) {
    return unit ? `0 ${unit}` : "0";
  }

  return `${value > 0 ? "+" : ""}${value}${unit ? ` ${unit}` : ""}`;
}

function getBadgeIconName(badgeId: string): ComponentProps<typeof Ionicons>["name"] {
  switch (badgeId) {
    case "trailhead": return "footsteps-outline";
    case "wanderer": return "map-outline";
    case "summit": return "trending-up-outline";
    case "endurance": return "timer-outline";
    case "long-haul": return "trail-sign-outline";
    case "swift": return "speedometer";
    default: return "ribbon-outline";
  }
}

function buildBadges(stats: HikeStats | null, hikes: HikeItem[]): BadgeItem[] {
  const safeStats =
    stats ?? {
      totalHikes: 0,
      totalDistanceKm: 0,
      totalElevationGainM: 0,
      totalDurationH: 0,
      longestHikeKm: 0,
      highestElevationGainM: 0,
      avgPaceMinKm: 0,
    };

  const chronologicalHikes = [...hikes].sort(
    (left, right) =>
      new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime()
  );

  const findCumulativeDate = (
    selector: (hike: HikeItem) => number | null,
    threshold: number
  ): string | null => {
    let total = 0;
    for (const hike of chronologicalHikes) {
      total += selector(hike) ?? 0;
      if (total >= threshold) return hike.startedAt;
    }
    return null;
  };

  const findFirstDate = (predicate: (hike: HikeItem) => boolean): string | null => {
    const match = chronologicalHikes.find(predicate);
    return match?.startedAt ?? null;
  };

  return [
    {
      id: "trailhead",
      label: "Primul pas",
      earned: safeStats.totalHikes >= 1,
      tint: Colors.forestMuted,
      earnedAt: chronologicalHikes[0]?.startedAt ?? null,
      progressHint:
        safeStats.totalHikes >= 1
          ? "Primul tău traseu a fost înregistrat."
          : "Finalizează primul tău traseu.",
      progressValue: Math.min(safeStats.totalHikes, 1),
      progressTarget: 1,
    },
    {
      id: "wanderer",
      label: "Drumeț de 25 km",
      earned: safeStats.totalDistanceKm >= 25,
      tint: Colors.info,
      earnedAt: findCumulativeDate(
        (hike) => (hike.distanceM != null ? hike.distanceM / 1000 : null),
        25
      ),
      progressHint: `${safeStats.totalDistanceKm.toFixed(1)} / 25,0 km înregistrați`,
      progressValue: Math.min(safeStats.totalDistanceKm, 25),
      progressTarget: 25,
    },
    {
      id: "summit",
      label: "Alpinist de 1.000 m",
      earned: safeStats.totalElevationGainM >= 1000,
      tint: Colors.earth,
      earnedAt: findCumulativeDate((hike) => hike.elevationGainM, 1000),
      progressHint: `${Math.round(safeStats.totalElevationGainM)} / 1000 m urcați`,
      progressValue: Math.min(safeStats.totalElevationGainM, 1000),
      progressTarget: 1000,
    },
    {
      id: "endurance",
      label: "Rezistență de 10 ore",
      earned: safeStats.totalDurationH >= 10,
      tint: Colors.warning,
      earnedAt: findCumulativeDate(
        (hike) => (hike.durationS != null ? hike.durationS / 3600 : null),
        10
      ),
      progressHint: `${safeStats.totalDurationH.toFixed(1)} / 10,0 ore înregistrate`,
      progressValue: Math.min(safeStats.totalDurationH, 10),
      progressTarget: 10,
    },
    {
      id: "long-haul",
      label: "Traseu lung de 15 km",
      earned: safeStats.longestHikeKm >= 15,
      tint: Colors.alpineLight,
      earnedAt: findFirstDate(
        (hike) => hike.distanceM != null && hike.distanceM / 1000 >= 15
      ),
      progressHint: `${safeStats.longestHikeKm.toFixed(1)} / 15,0 km cel mai lung traseu`,
      progressValue: Math.min(safeStats.longestHikeKm, 15),
      progressTarget: 15,
    },
    {
      id: "swift",
      label: "Bocanci rapizi",
      earned: safeStats.avgPaceMinKm > 0 && safeStats.avgPaceMinKm <= 8,
      tint: Colors.forestLight,
      earnedAt: findFirstDate(
        (hike) =>
          hike.avgPaceMinKm != null && hike.avgPaceMinKm > 0 && hike.avgPaceMinKm <= 8
      ),
      progressHint:
        safeStats.avgPaceMinKm > 0
          ? `Cel mai bun ritm: ${formatRitm(safeStats.avgPaceMinKm)}`
          : "Finalizează un traseu pentru a-ți stabili ritmul.",
      progressValue:
        safeStats.avgPaceMinKm > 0 ? Math.min((8 / safeStats.avgPaceMinKm) * 8, 8) : 0,
      progressTarget: 8,
    },
  ];
}

function buildPersonalBests(hikes: HikeItem[]): PersonalBest[] {
  const completedHikes = getFinalizatHikes(hikes);
  const bestDistanțăM = completedHikes.reduce(
    (best, hike) => Math.max(best, hike.distanceM ?? 0),
    0
  );
  const bestAltitudineM = completedHikes.reduce(
    (best, hike) => Math.max(best, hike.elevationGainM ?? 0),
    0
  );
  const bestDuratăS = completedHikes.reduce(
    (best, hike) => Math.max(best, hike.durationS ?? 0),
    0
  );

  return [
    {
      id: "best-distance",
      label: "Cea mai lungă distanță",
      value: (bestDistanțăM / 1000).toFixed(1),
      unit: "km",
    },
    {
      id: "best-elevation",
      label: "Cel mai mare câștig de altitudine",
      value: `${Math.round(bestAltitudineM)}`,
      unit: "m",
    },
    {
      id: "best-duration",
      label: "Cea mai lungă durată",
      value: bestDuratăS > 0 ? formatDurată(bestDuratăS) : "0m",
      unit: "",
    },
  ];
}

function LoadingList() {
  return (
    <View style={styles.listSection}>
      {Array.from({ length: 3 }).map((_, index) => (
        <SkeletonLoader
          key={index}
          height={90}
          borderRadius={16}
          width="100%"
          style={index > 0 ? { marginTop: Spacing.md } : undefined}
        />
      ))}
    </View>
  );
}

function StatMetric({
  label,
  unit,
  value,
  decimals = 0,
  animationTrigger,
}: {
  label: string;
  unit: string;
  value: number;
  decimals?: number;
  animationTrigger: number;
}) {
  const animatedValue = useSharedValue(0);
  const [displayValue, setDisplayValue] = useState("0");

  useEffect(() => {
    animatedValue.value = 0;
    setDisplayValue(clampDisplayValue(0, decimals));
    animatedValue.value = withTiming(value, { duration: 800 });
  }, [animatedValue, animationTrigger, decimals, value]);

  useAnimatedReaction(
    () => animatedValue.value,
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setDisplayValue)(current.toFixed(decimals));
      }
    },
    [decimals]
  );

  return (
    <GlassCard style={styles.statCard}>
      <Text style={styles.statValue}>{displayValue}</Text>
      <Text style={styles.statUnit}>{unit}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </GlassCard>
  );
}

function AchievementBadge({ badge }: { badge: BadgeItem }) {
  const progressRatio =
    badge.progressTarget > 0
      ? Math.max(0, Math.min(1, badge.progressValue / badge.progressTarget))
      : 0;

  return (
    <GlassCard
      style={[styles.badgeCard, !badge.earned && styles.badgeCardLocked]}
      intensity={18}
    >
      {badge.earned ? (
        <View style={styles.badgeCheckIcon}>
          <Ionicons name="checkmark-circle" size={18} color={badge.tint} />
        </View>
      ) : null}
      <View
        style={[
          styles.badgeIconWrap,
          { backgroundColor: `${badge.tint}1A` },
        ]}
      >
        <Ionicons
          name={getBadgeIconName(badge.id)}
          size={26}
          color={badge.tint}
        />
      </View>
      <View style={styles.badgeTextBlock}>
        <Text style={styles.badgeLabel}>{badge.label}</Text>
        <Text
          style={[
            styles.badgeState,
            badge.earned ? styles.badgeEarned : styles.badgeLocked,
          ]}
        >
          {badge.earned ? `Câștigat ${formatBadgeDate(badge.earnedAt)}` : badge.progressHint}
        </Text>
      </View>
      {!badge.earned ? (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${progressRatio * 100}%`,
                backgroundColor: badge.tint,
              },
            ]}
          />
        </View>
      ) : null}
    </GlassCard>
  );
}

function renderBadgeRows(badges: BadgeItem[]) {
  const rows: BadgeItem[][] = [];

  for (let index = 0; index < badges.length; index += 2) {
    rows.push(badges.slice(index, index + 2));
  }

  return rows.map((row, rowIndex) => (
    <View key={`badge-row-${rowIndex}`} style={styles.achievementsRow}>
      {row.map((badge) => (
        <AchievementBadge key={badge.id} badge={badge} />
      ))}
      {row.length === 1 ? <View style={styles.badgeSpacer} /> : null}
    </View>
  ));
}

function WeeklyDistanțăChart({
  data,
  chartWidth,
}: {
  data: WeeklyDistanțăPoint[];
  chartWidth: number;
}) {
  const chartHeight = 250;
  const leftAxisWidth = 44;
  const rightPadding = 12;
  const topPadding = 20;
  const bottomPadding = 52;
  const barsAreaHeight = chartHeight - topPadding - bottomPadding;
  const barsAreaWidth = chartWidth - leftAxisWidth - rightPadding;
  const maxValue = Math.max(...data.map((item) => item.distanceKm), 1);
  const yTickCount = 4;
  const barGap = 12;
  const barWidth = (barsAreaWidth - barGap * (data.length - 1)) / data.length;

  return (
    <Svg width={chartWidth} height={chartHeight}>
      <G x={leftAxisWidth}>
        {Array.from({ length: yTickCount + 1 }, (_, index) => {
          const value = (maxValue / yTickCount) * (yTickCount - index);
          const y = topPadding + (barsAreaHeight / yTickCount) * index;

          return (
            <G key={`tick-${index}`}>
              <Line
                x1={0}
                y1={y}
                x2={barsAreaWidth}
                y2={y}
                stroke={Colors.border}
                strokeWidth={1}
              />
              <SvgText
                x={-8}
                y={y + 4}
                fontSize={10}
                fill={Colors.textSecondary}
                textAnchor="end"
              >
                {formatChartAxisValue(value)}
              </SvgText>
            </G>
          );
        })}

        {data.map((item, index) => {
          const barHeight = (item.distanceKm / maxValue) * barsAreaHeight;
          const x = index * (barWidth + barGap);
          const y = topPadding + (barsAreaHeight - barHeight);
          const isTallest = item.distanceKm === maxValue && item.distanceKm > 0;

          return (
            <G key={item.key}>
              <Rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={8}
                fill={isTallest ? Colors.accent : "rgba(82, 183, 136, 0.35)"}
                strokeWidth={0}
              />
              <SvgText
                x={x + barWidth / 2}
                y={Math.max(12, y - 8)}
                fontSize={10}
                fill={Colors.textSecondary}
                textAnchor="middle"
              >
                {item.distanceKm.toFixed(1)}
              </SvgText>
              <SvgText
                x={x + barWidth / 2}
                y={chartHeight - 18}
                fontSize={10}
                fill={Colors.textSecondary}
                textAnchor="middle"
              >
                {item.label}
              </SvgText>
            </G>
          );
        })}
      </G>
    </Svg>
  );
}

export default function IstoricScreen({ navigation }: Props) {
  const { width } = useWindowDimensions();
  const [hikes, setHikes] = useState<HikeItem[]>([]);
  const [stats, setStats] = useState<HikeStats | null>(null);
  const [activeTab, setActiveTab] = useState<"hikes" | "stats" | "achievements">("hikes");
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hikeConditions, setHikeConditions] = useState<Record<string, string>>({});
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [monthComparison, setMonthComparison] = useState<MonthComparison | null>(null);
  const [statsAnimationTrigger, setStatsAnimationTrigger] = useState(0);
  const isMountedRef = useRef(true);

  const loadFavoriteIds = useCallback(async () => {
    try {
      const ids = await fetchFavoriteIds();
      if (isMountedRef.current) {
        setFavoriteIds(new Set(ids));
      }
    } catch {
      // Saved-route state is non-blocking for the history list.
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) {
        if (isMountedRef.current) {
          setErrorMessage("Trebuie să te autentifici pentru a vedea traseele.");
          setHikes([]);
          setStats(null);
          setHikeConditions({});
          setMonthComparison(null);
        }
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };
      const [hikesRes, statsRes, fitnessTrendRes] = await Promise.all([
        api.get("/hikes", { headers }),
        api.get("/hikes/stats", { headers }),
        api.get("/profile/fitness-trend", { headers }).catch(() => null),
      ]);

      if (!isMountedRef.current) return;

      const nextHikes: HikeItem[] = Array.isArray(hikesRes.data?.hikes)
        ? hikesRes.data.hikes.filter(isHikeItem)
        : [];
      const nextStats = isHikeStats(statsRes.data?.stats) ? (statsRes.data.stats as HikeStats) : null;
      const nextMonthComparison = extractMonthComparison(
        fitnessTrendRes?.data?.monthComparison
      );

      setHikes(nextHikes);
      setMonthComparison(nextMonthComparison);

      const routeIds = Array.from(
        new Set(
          nextHikes
            .map((hike) => hike.routeId)
            .filter((routeId): routeId is string => typeof routeId === "string" && routeId.length > 0)
        )
      );

      if (routeIds.length > 0) {
        try {
          const conditionsRes = await api.get<Record<string, string>>(
            `/routes/my-conditions/batch?ids=${routeIds.map(encodeURIComponent).join(",")}`,
            { headers }
          );

          if (isMountedRef.current) {
            setHikeConditions(conditionsRes.data ?? {});
          }
        } catch {
          // Ignore condition loading errors; history can render without chips.
        }
      } else {
        setHikeConditions({});
      }

      if (!isMountedRef.current) return;

      setStats(nextStats);
      setErrorMessage(null);
    } catch {
      if (isMountedRef.current) {
        setErrorMessage("Nu s-a putut încărca istoricul. Trage în jos pentru a reîncerca.");
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadFavoriteIds();

    return () => {
      isMountedRef.current = false;
    };
  }, [loadFavoriteIds]);

  useFocusEffect(
    useCallback(() => {
      setStatsAnimationTrigger((current) => current + 1);
      void load();
      void loadFavoriteIds();
    }, [load, loadFavoriteIds])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    void Promise.all([load(), loadFavoriteIds()]);
  };

  const handleToggleFavorite = useCallback(
    async (routeId: string) => {
      const wasFavorite = favoriteIds.has(routeId);

      setFavoriteIds((current) => {
        const next = new Set(current);
        if (wasFavorite) {
          next.delete(routeId);
        } else {
          next.add(routeId);
        }
        return next;
      });

      try {
        if (wasFavorite) {
          await removeFavorite(routeId);
        } else {
          await addFavorite(routeId);
        }
      } catch {
        setFavoriteIds((current) => {
          const next = new Set(current);
          if (wasFavorite) {
            next.add(routeId);
          } else {
            next.delete(routeId);
          }
          return next;
        });
      }
    },
    [favoriteIds]
  );

  const handleDeleteHike = useCallback((hikeId: string) => {
    Alert.alert("Ștergi traseul?", "Această acțiune nu poate fi anulată.", [
      { text: "Anulează" },
      {
        text: "Șterge",
        style: "destructive",
        onPress: async () => {
          try {
            const token = await getAccessToken();
            if (!token) return;

            await api.delete(`/hikes/${hikeId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            setHikes((current) => current.filter((hike) => hike.id !== hikeId));
            void load();
          } catch {
            Alert.alert("Eroare", "Nu s-a putut șterge traseul. Încearcă din nou.");
          }
        },
      },
    ]);
  }, []);

  const renderRightActions = useCallback(
    (hikeId: string) => (
      <PressableFeedback
        style={styles.deleteAction}
        onPress={() => handleDeleteHike(hikeId)}
      >
        <Ionicons name="trash-outline" size={20} color={Colors.danger} />
        <Text style={styles.deleteActionText}>Sterge</Text>
      </PressableFeedback>
    ),
    [handleDeleteHike]
  );

  const badges = buildBadges(stats, hikes).sort((left, right) => {
    if (left.earned === right.earned) return left.label.localeCompare(right.label);
    return left.earned ? -1 : 1;
  });
  const earnedBadges = badges.filter((badge) => badge.earned);
  const lockedBadges = badges.filter((badge) => !badge.earned);
  const personalBests = buildPersonalBests(hikes);
  const distanceTrend = getWeeklyTrendMetric("distance", hikes);
  const elevationTrend = getWeeklyTrendMetric("elevation", hikes);
  const weeklyDistanțăData = getWeeklyDistanțăSeries(hikes, 8);
  const weeklyChartWidth = Math.max(width - Spacing.base * 2 - Spacing.md * 2, 620);
  const comfortZoneRows: DifficultyRowDefinition[] = (() => {
    const counts: Record<DifficultyBucket, number> = {
      easy: 0,
      moderate: 0,
      hard: 0,
      veryHard: 0,
    };

    const hikesWithDifficulty = hikes.filter(
      (hike): hike is HikeItem & { difficulty: string } =>
        hike.status === "completed" && typeof hike.difficulty === "string"
    );

    hikesWithDifficulty.forEach((hike) => {
      counts[mapDifficultyBucket(hike.difficulty)] += 1;
    });

    return [
      {
        key: "easy",
        label: "Ușor",
        color: "#4CAF50",
        count: counts.easy,
      },
      {
        key: "moderate",
        label: "Moderat",
        color: "#FFC107",
        count: counts.moderate,
      },
      {
        key: "hard",
        label: "Greu",
        color: "#FF9800",
        count: counts.hard,
      },
      {
        key: "veryHard",
        label: "Foarte greu",
        color: "#F44336",
        count: counts.veryHard,
      },
    ];
  })();
  const completedHikesWithDifficulty = hikes.filter(
    (hike): hike is HikeItem & { difficulty: string } =>
      hike.status === "completed" && typeof hike.difficulty === "string"
  );
  const maxComfortCount = Math.max(...comfortZoneRows.map((row) => row.count), 0);
  const completedHikesCount = hikes.filter((hike) => hike.status === "completed").length;
  const hasDifficultyData = completedHikesCount > 0;
  const monthComparisonRows = [
    {
      key: "distance",
      label: "Distanță",
      current: monthComparison
        ? `${monthComparison.currentMonth.km.toFixed(1)} km`
        : "-",
      delta: monthComparison
        ? monthComparison.currentMonth.km - monthComparison.previousMonth.km
        : null,
      unit: "km",
    },
    {
      key: "elevation",
      label: "Altitudine",
      current: monthComparison
        ? `${Math.round(monthComparison.currentMonth.elevationM)} m`
        : "-",
      delta: monthComparison
        ? monthComparison.currentMonth.elevationM -
          monthComparison.previousMonth.elevationM
        : null,
      unit: "m",
    },
    {
      key: "hikes", label: "Trasee",
      current: monthComparison ? String(monthComparison.currentMonth.hikeCount) : "-",
      delta: monthComparison
        ? monthComparison.currentMonth.hikeCount -
          monthComparison.previousMonth.hikeCount
        : null,
      unit: "",
    },
  ];
  const tabs: Array<{
    key: "hikes" | "stats" | "achievements";
    label: string;
  }> = [
    { key: "hikes", label: "Trasee" },
    { key: "stats", label: "Statistici" },
    { key: "achievements", label: "Realizări" },
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.segmentedControl}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;

          return (
            <PressableFeedback
              key={tab.key}
              onPress={() => setActiveTab(tab.key)}
              style={[
                styles.segmentButton,
                isActive ? styles.segmentButtonActive : null,
              ]}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  isActive ? styles.segmentLabelActive : null,
                ]}
              >
                {tab.label}
              </Text>
            </PressableFeedback>
          );
        })}
      </View>

      {activeTab === "hikes" ? (
        <FlatList
          data={isLoading ? [] : hikes}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={Colors.accent}
            />
          }
          ListHeaderComponent={
            <View style={styles.headerContainer}>
              <View style={styles.titleBlock}>
                <Text style={styles.screenTitle}>Istoric</Text>
              </View>

              {errorMessage ? (
                <GlassCard style={styles.errorCard} intensity={18}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </GlassCard>
              ) : null}

              {stats ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.statsScrollContent}
                >
                  <StatMetric
                    label="Total trasee"
                    value={stats.totalHikes}
                    unit="trasee"
                    animationTrigger={statsAnimationTrigger}
                  />
                  <StatMetric
                    label="Distanță"
                    value={stats.totalDistanceKm}
                    unit="km"
                    decimals={1}
                    animationTrigger={statsAnimationTrigger}
                  />
                  <StatMetric
                    label="Altitudine"
                    value={stats.totalElevationGainM}
                    unit="m"
                    animationTrigger={statsAnimationTrigger}
                  />
                  <StatMetric
                    label="Timp"
                    value={stats.totalDurationH}
                    unit="h"
                    decimals={1}
                    animationTrigger={statsAnimationTrigger}
                  />
                  <StatMetric
                    label="Cel mai lung traseu"
                    value={stats.longestHikeKm}
                    unit="km"
                    decimals={1}
                    animationTrigger={statsAnimationTrigger}
                  />
                  <StatMetric
                    label="Cel mai bun ritm"
                    value={stats.avgPaceMinKm > 0 ? stats.avgPaceMinKm : 0}
                    unit="min/km"
                    decimals={1}
                    animationTrigger={statsAnimationTrigger}
                  />
                </ScrollView>
              ) : null}

              {isLoading ? <LoadingList /> : null}
            </View>
          }
          ListEmptyComponent={
            isLoading ? null : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Niciun traseu înregistrat</Text>
                <Text style={styles.emptySubtitle}>
                  Înregistrează primul tău traseu din tab-ul Înregistrare
                </Text>
              </View>
            )
          }
          ItemSeparatorComponent={() => <View style={styles.listSeparator} />}
          renderItem={({ item, index }) => {
            const distanceKm =
              item.distanceM != null ? (item.distanceM / 1000).toFixed(2) : null;
            const elevation =
              item.elevationGainM != null ? Math.round(item.elevationGainM) : null;
            const statusLabel =
              item.status.charAt(0).toUpperCase() + item.status.slice(1);
            const conditionMeta = item.routeId
              ? TRAIL_CONDITION_META[hikeConditions[item.routeId]]
              : null;
            const routeId = item.routeId ?? null;
            const isFavorite = routeId != null && favoriteIds.has(routeId);
            const paceMinKm =
              distanceKm != null && Number(distanceKm) > 0 && item.durationS != null && item.durationS > 0
                ? item.durationS / 60 / Number(distanceKm)
                : null;
            const paceLabel =
              paceMinKm != null
                ? `${Math.floor(paceMinKm)}:${String(Math.round((paceMinKm % 1) * 60)).padStart(2, "0")} min/km`
                : null;
            const statsLabel = [
              distanceKm != null ? `${distanceKm} km` : null,
              elevation != null ? `${elevation} m` : null,
              item.durationS != null ? formatDurată(item.durationS) : null,
              paceLabel,
            ]
              .filter(Boolean)
              .join(" · ");
            const completionScore =
              item.completionScore != null ? Math.round(item.completionScore) : null;
            const completionScoreColor =
              completionScore != null ? getCompletionScoreColor(completionScore) : null;
            const difficultyColor =
              item.difficulty != null ? getDifficultyColor(item.difficulty) : null;
            const accessibilityLabel = [
              item.routeName ?? "Traseu liber",
              formatDate(item.startedAt),
              statsLabel,
              item.difficulty ? `${formatDifficultyLabel(item.difficulty)} difficulty` : null,
              completionScore != null ? `${completionScore}% completion score` : null,
              statusLabel,
            ]
              .filter(Boolean)
              .join(", ");

            return (
              <AnimatedListItem index={index} style={styles.listItem}>
                <Swipeable
                  overshootRight={false}
                  renderRightActions={() => renderRightActions(item.id)}
                >
                  <View style={{ position: "relative", width: "100%" }}>
                    <PressableFeedback
                      onPress={() =>
                        navigation.navigate("HikeDetails", { hikeId: item.id })
                      }
                      style={styles.cardPressable}
                    >
                      <View
                        accessible={true}
                        accessibilityRole="button"
                        accessibilityLabel={accessibilityLabel}
                      >
                        <GlassCard style={styles.hikeCard}>
                          <View style={styles.cardContent}>
                            <View style={styles.cardTopRow}>
                              <View style={styles.routeBlock}>
                                <Text
                                  style={styles.routeName}
                                  numberOfLines={1}
                                  ellipsizeMode="tail"
                                >
                                  {item.routeName ?? "Traseu liber"}
                                </Text>
                                <Text style={styles.hikeDate}>
                                  {formatDate(item.startedAt)}
                                </Text>
                              </View>
                            </View>

                            {statsLabel ? (
                              <Text style={styles.metaText}>{statsLabel}</Text>
                            ) : null}

                            <View style={styles.cardBottomRow}>
                              <View style={styles.cardBadgeRow}>
                                {item.difficulty && difficultyColor ? (
                                  <View
                                    style={[
                                      styles.statusBadge,
                                      { borderColor: difficultyColor },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.statusText,
                                        { color: difficultyColor },
                                      ]}
                                    >
                                      {formatDifficultyLabel(item.difficulty)}
                                    </Text>
                                  </View>
                                ) : null}
                                {conditionMeta ? (
                                  <View
                                    style={[
                                      styles.trailConditionChip,
                                      { backgroundColor: `${conditionMeta.color}26` },
                                    ]}
                                  >
                                    <Ionicons
                                      name={conditionMeta.icon as any}
                                      size={12}
                                      color={conditionMeta.color}
                                    />
                                    <Text
                                      style={[
                                        styles.statusText,
                                        { color: conditionMeta.color },
                                      ]}
                                    >
                                      {conditionMeta.label}
                                    </Text>
                                  </View>
                                ) : null}
                                {item.status === "partial" && (
                                  <View style={[styles.statusBadge, { borderColor: Colors.warning }]}>
                                    <Text style={[styles.statusText, { color: Colors.warning }]}>
                                      {completionScore != null && completionScore > 0 && completionScore < 100
                                        ? `PARȚIAL (${completionScore}%)`
                                        : "PARȚIAL"}
                                    </Text>
                                  </View>
                                )}
                              </View>
                            </View>
                          </View>
                          <View style={{ alignSelf: "center", paddingRight: 8 }}>
                            <Ionicons
                              name="chevron-forward"
                              size={18}
                              color={Colors.textMuted}
                            />
                          </View>
                        </GlassCard>
                      </View>
                    </PressableFeedback>
                    {routeId ? (
                      <View style={{ position: "absolute", top: 10, right: 12 }}>
                        <Pressable
                          onPress={() => { void handleToggleFavorite(routeId); }}
                          hitSlop={10}
                          accessibilityRole="button"
                          accessibilityLabel={isFavorite ? "Elimină din salvate" : "Salvează ruta"}
                          style={({ pressed }) => [
                            styles.favoriteButton,
                            pressed ? styles.favoriteButtonPressed : null,
                          ]}
                        >
                          <Ionicons
                            name={isFavorite ? "bookmark" : "bookmark-outline"}
                            size={19}
                            color={isFavorite ? Colors.accent : Colors.textMuted}
                          />
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </Swipeable>
              </AnimatedListItem>
            );
          }}
        />
      ) : null}

      {activeTab === "stats" ? (
        <ScrollView
          contentContainerStyle={styles.statsTabContent}
          showsVerticalScrollIndicator={false}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.personalBestRow}
          >
            {personalBests.map((best) => (
              <GlassCard key={best.id} style={styles.personalBestCard}>
                <Text style={styles.personalBestLabel}>{best.label}</Text>
                <View style={styles.personalBestValueRow}>
                  <Text style={styles.personalBestValue}>{best.value}</Text>
                  {best.unit ? <Text style={styles.personalBestUnit}>{best.unit}</Text> : null}
                </View>
              </GlassCard>
            ))}
          </ScrollView>

          <View style={styles.trendsRow}>
            <GlassCard style={styles.trendCard}>
              <View style={styles.trendHeader}>
                <Text style={styles.trendTitle}>Distanță</Text>
                <Ionicons
                  name={distanceTrend.icon}
                  size={20}
                  color={distanceTrend.color}
                />
              </View>
              <Text style={[styles.trendChange, { color: distanceTrend.color }]}>
                {distanceTrend.changeLabel}
              </Text>
              <Text style={styles.trendValue}>{distanceTrend.currentValueLabel}</Text>
            </GlassCard>

            <GlassCard style={styles.trendCard}>
              <View style={styles.trendHeader}>
                <Text style={styles.trendTitle}>Altitudine</Text>
                <Ionicons
                  name={elevationTrend.icon}
                  size={20}
                  color={elevationTrend.color}
                />
              </View>
              <Text style={[styles.trendChange, { color: elevationTrend.color }]}>
                {elevationTrend.changeLabel}
              </Text>
              <Text style={styles.trendValue}>{elevationTrend.currentValueLabel}</Text>
            </GlassCard>
          </View>

          <GlassCard style={styles.chartCard}>
            <Text style={styles.chartTitle}>Distanță săptămânală</Text>
            <Text style={styles.chartSubtitle}>
              Ultimele 8 saptamani, grupate de luni
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <WeeklyDistanțăChart
                data={weeklyDistanțăData}
                chartWidth={weeklyChartWidth}
              />
            </ScrollView>
          </GlassCard>

          <GlassCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Luna aceasta vs luna trecută</Text>
            <View style={styles.fitnessComparisonRows}>
              {monthComparisonRows.map((row) => {
                const deltaMeta = getComparisonDeltaMeta(row.delta);

                return (
                  <View key={row.key} style={styles.fitnessComparisonRow}>
                    <Text style={styles.fitnessComparisonLabel}>{row.label}</Text>
                    <Text style={styles.fitnessComparisonCurrent}>{row.current}</Text>
                    <View style={styles.fitnessComparisonDelta}>
                      <Ionicons
                        name={deltaMeta.icon}
                        size={15}
                        color={deltaMeta.color}
                      />
                      <Text
                        style={[
                          styles.fitnessComparisonDeltaText,
                          { color: deltaMeta.color },
                        ]}
                      >
                        {formatComparisonDelta(row.delta, row.unit)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </GlassCard>

          <GlassCard style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Zona ta de confort</Text>
            <Text style={styles.sectionSubtitle}>
              {hasDifficultyData
                ? `Bazat pe ${completedHikesCount} trasee finalizate`
                : "Datele de dificultate vor fi disponibile după mai multe trasee"}
            </Text>
            {hasDifficultyData ? (
              <View style={styles.comfortZoneChart}>
                {comfortZoneRows.map((row) => {
                  const widthPercent = (
                    maxComfortCount > 0 ? `${(row.count / maxComfortCount) * 100}%` : "0%"
                  ) as `${number}%`;
                  const percent =
                    completedHikesWithDifficulty.length > 0
                      ? Math.round((row.count / completedHikesWithDifficulty.length) * 100)
                      : 0;

                  return (
                    <View key={row.key} style={styles.comfortZoneRow}>
                      <Text style={styles.comfortZoneLabel}>{row.label}</Text>
                      <View style={styles.comfortZoneBarTrack}>
                        <View
                          style={[
                            styles.comfortZoneBarFill,
                            {
                              width: widthPercent,
                              backgroundColor: row.color,
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.comfortZoneCount}>{percent}%</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
            {hasDifficultyData && completedHikesWithDifficulty.length === 0 ? (
              <Text style={styles.sectionSubtitle}>
                Asociază rutele în Planifică pentru a vedea distribuția dificultății.
              </Text>
            ) : null}
          </GlassCard>
        </ScrollView>
      ) : null}

      {activeTab === "achievements" ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.achievementsContent}
        >
          {earnedBadges.length > 0 ? (
            <View style={styles.achievementSection}>
              <Text style={styles.achievementSectionTitle}>Câștigate</Text>
              {renderBadgeRows(earnedBadges)}
            </View>
          ) : null}

          {lockedBadges.length > 0 ? (
            <View style={styles.achievementSection}>
              <Text style={styles.achievementSectionTitle}>În progres</Text>
              {renderBadgeRows(lockedBadges)}
            </View>
          ) : null}
        </ScrollView>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  segmentedControl: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: Spacing.base,
    marginTop: 0,
    marginBottom: Spacing.xs,
    padding: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  segmentButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
  },
  segmentButtonActive: {
    backgroundColor: Colors.elevated,
  },
  segmentLabel: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontSemibold,
    fontWeight: Typography.weight.semibold,
    color: Colors.textSecondary,
  },
  segmentLabelActive: {
    color: Colors.textPrimary,
  },
  contentContainer: {
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    flexGrow: 1,
  },
  headerContainer: {
    gap: Spacing.base,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.base,
  },
  titleBlock: {
    gap: Spacing.xs,
  },
  screenTitle: {
    fontSize: Typography.size["2xl"],
    fontFamily: Typography.fontBold,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  screenSubtitle: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontRegular,
    color: Colors.textSecondary,
  },
  errorCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  errorText: {
    color: Colors.danger,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontMedium,
    fontWeight: Typography.weight.medium,
  },
  statsScrollContent: {
    gap: Spacing.sm,
    paddingRight: Spacing.xs,
  },
  statCard: {
    minWidth: 118,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    alignItems: "center",
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  statValue: {
    fontSize: 22,
    fontFamily: Typography.fontMonoBold,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  statUnit: {
    marginTop: 4,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontMedium,
    color: Colors.textSecondary,
  },
  statLabel: {
    marginTop: 4,
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontMedium,
    fontWeight: Typography.weight.medium,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  statsTabContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  personalBestRow: {
    gap: Spacing.md,
    paddingRight: Spacing.xs,
  },
  personalBestCard: {
    minWidth: 148,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.base,
    gap: Spacing.sm,
  },
  personalBestLabel: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  personalBestValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
  },
  personalBestValue: {
    fontSize: Typography.size["2xl"],
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  personalBestUnit: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    paddingBottom: 3,
  },
  trendsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  trendCard: {
    flex: 1,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.base,
    gap: Spacing.xs,
  },
  trendHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  trendTitle: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  trendChange: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
  trendValue: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  chartCard: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.base,
    gap: Spacing.sm,
  },
  chartTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  chartSubtitle: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  sectionCard: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.base,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },
  sectionSubtitle: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  fitnessComparisonRows: {
    gap: Spacing.xs,
  },
  fitnessComparisonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: 4,
  },
  fitnessComparisonLabel: {
    flex: 1,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  fitnessComparisonCurrent: {
    minWidth: 70,
    textAlign: "right",
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    fontWeight: Typography.weight.semibold,
  },
  fitnessComparisonDelta: {
    minWidth: 78,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 3,
  },
  fitnessComparisonDeltaText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
  },
  comfortZoneChart: {
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  comfortZoneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  comfortZoneLabel: {
    width: 80,
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.weight.medium,
  },
  comfortZoneBarTrack: {
    flex: 1,
    height: 12,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.48)",
    borderWidth: 1,
    borderColor: Colors.glassBorder,
  },
  comfortZoneBarFill: {
    height: "100%",
    borderRadius: BorderRadius.full,
  },
  comfortZoneCount: {
    width: 42,
    textAlign: "right",
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    fontWeight: Typography.weight.semibold,
  },
  achievementsContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.lg,
    gap: Spacing.md,
  },
  achievementSection: {
    gap: Spacing.md,
  },
  achievementSectionTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  achievementsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  badgeCard: {
    flex: 1,
    minHeight: 140,
    gap: Spacing.base,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
    position: "relative",
  },
  badgeCardLocked: {
    opacity: 0.6,
  },
  badgeSpacer: {
    flex: 1,
  },
  badgeCheckIcon: {
    position: "absolute",
    top: Spacing.sm,
    right: Spacing.sm,
    zIndex: 1,
  },
  badgeIconWrap: {
    width: 42,
    height: 42,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTextBlock: {
    gap: Spacing.xs,
  },
  badgeLabel: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
    color: Colors.textPrimary,
  },
  badgeState: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
    lineHeight: 18,
  },
  badgeEarned: {
    color: Colors.textPrimary,
  },
  badgeLocked: {
    color: Colors.textSecondary,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    overflow: "hidden",
    marginTop: "auto",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  listSection: {
    marginTop: Spacing.xs,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 360,
    paddingHorizontal: Spacing["2xl"],
    paddingVertical: Spacing["5xl"],
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.fontSemibold,
    fontWeight: Typography.weight.semibold,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: Typography.fontRegular,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  listItem: {
    paddingHorizontal: Spacing.base,
  },
  cardPressable: {
    borderRadius: BorderRadius.md,
  },
  cardPressablePressed: {
    opacity: 0.92,
  },
  deleteAction: {
    width: 80,
    height: "100%",
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.dangerLight,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  deleteActionText: {
    color: Colors.danger,
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontBold,
    fontWeight: Typography.weight.bold,
  },
  hikeCard: {
    minHeight: 80,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  cardAccent: {
    width: 4,
    borderRadius: BorderRadius.full,
    alignSelf: "stretch",
  },
  cardContent: {
    flex: 1,
    gap: 8,
    paddingRight: 44,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  routeBlock: {
    flex: 1,
    minWidth: 0,
  },
  routeName: {
    fontSize: 15,
    fontFamily: Typography.fontSemibold,
    fontWeight: Typography.weight.semibold,
    color: Colors.textPrimary,
  },
  cardTopActions: {
    alignItems: "flex-end",
    gap: Spacing.xs,
  },
  favoriteButton: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  favoriteButtonPressed: {
    opacity: 0.72,
  },
  hikeDate: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontRegular,
    color: Colors.textSecondary,
  },
  cardMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    fontFamily: Typography.fontMono,
    color: Colors.textSecondary,
  },
  cardBottomRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flexWrap: "wrap",
  },
  statusBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    backgroundColor: Colors.elevated,
  },
  trailConditionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statusText: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontSemibold,
    fontWeight: Typography.weight.semibold,
  },
  partialBadge: {
    alignSelf: "flex-start",
    backgroundColor: Colors.warningLight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  partialBadgeText: {
    color: Colors.warning,
    fontSize: 10,
    fontFamily: Typography.fontBold,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  completionBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    backgroundColor: Colors.elevated,
  },
  completionBadgeText: {
    fontSize: 11,
    fontFamily: Typography.fontMonoBold,
    fontWeight: Typography.weight.semibold,
  },
  listSeparator: {
    height: 1,
    backgroundColor: Colors.border,
    marginHorizontal: Spacing.base,
    marginVertical: Spacing.md,
  },
});
