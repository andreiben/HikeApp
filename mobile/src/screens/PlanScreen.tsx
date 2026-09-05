import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  Easing,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Polyline } from "react-native-maps";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useNavigation,
  useRoute,
  type CompositeNavigationProp,
  type RouteProp,
} from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import Ionicons from "@expo/vector-icons/Ionicons";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { GlassButton } from "../components/ui/GlassButton";
import { GlassCard } from "../components/ui/GlassCard";
import { PressableFeedback } from "../components/ui/PressableFeedback";
import { RiskBadge, type RiskLevel } from "../components/ui/RiskBadge";
import {
  BorderRadius,
  Colors,
  Shadow,
  Spacing,
  Typography,
} from "../theme";
import { calculateUserCapacity } from "../utils/userCapacity";
import { api } from "../services/api";
import { getAccessToken } from "../services/authStorage";
import { addFavorite, fetchFavoriteIds, removeFavorite } from "../services/favorites";
import type { MainStackParamList, MainTabParamList } from "../navigation";

function sanitizeRouteName(name: string | null | undefined): string {
  if (!name) return "Traseu fara nume";

  return name
    .replaceAll("â€¢", "•")
    .replaceAll("â€“", "–")
    .replaceAll("â€™", "'")
    .replace(/[•·]/g, " - ")
    .replace(/^[([]+/, "")
    .replace(/[)\]]+$/, "")
    .trim();
}
type RouteData = {
  id: string;
  name: string;
  region: string;
  distanceKm: number;
  elevationGainM: number;
  maxElevation?: number | null;
  estimatedDurationH: number;
  difficulty: string;
  startLatitude: number;
  startLongitude: number;
  geometry: Array<{ latitude: number; longitude: number }>;
};

type UserProfile = {
  displayName: string;
  experienceLevel: string;
  typicalBackpackWeightKg: number | null;
  hikesSoloUsually: boolean;
};

type HikeHistoryItem = {
  id: string;
  status: string;
  durationS: number | null;
  elevationGainM: number | null;
};

type RiskFactorItem = {
  factor: string;
  label: string;
  value: number;
  description: string;
  suggestion?: string;
  severity?: FactorSeverity;
  category?: "risk" | "synergy";
};

type RiskPreview = {
  score: number;
  level: "Low" | "Moderate" | "High" | "Very High";
  counterfactuals?: string[];
  factors?: RiskFactorItem[];
  dataCompleteness?: {
    weather: boolean;
    personal: boolean;
    routeElevation: boolean;
    overall: "full" | "partial" | "limited";
  };
  confidence?: {
    score: number;
    level: "high" | "medium" | "low";
    missing: string[];
  };
  weather?: {
    sunrise: string | null;
    sunset: string | null;
    precipitationProbability: number | null;
    windspeedKmh: number | null;
    temperatureC: number | null;
    uvIndex: number | null;
    weatherDescription: string | null;
  } | null;
  subScores?: {
    terrain: number;
    weather: number;
    personal: number;
    conditions: number;
    timing: number;
  } | null;
  scoreDelta?: number | null;
  priorAssessmentDate?: string | null;
  trailCondition?: {
    condition: string;
    confidence: string;
    label: string;
    daysOld: number;
    isTrailVerified: boolean;
    notes: string | null;
  } | null;
};

type WeatherVântow = {
  startTime: string;
  score: number;
  summary: string;
  tempC: number;
  precipPct: number;
  windKmh: number;
};

type PlannedWeather = NonNullable<RiskPreview["weather"]>;

type AlternativeRoute = {
  id: string;
  name: string;
  region: string;
  distanceKm: number;
  elevationGainM: number;
  estimatedDurationH: number;
  difficulty: string;
  score?: number;
  level?: string;
};

type PlanNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Plan">,
  NativeStackNavigationProp<MainStackParamList>
>;

type FactorSeverity = "high" | "moderate" | "info";

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: Colors.difficultyEasy,
  moderate: Colors.difficultyModerate,
  hard: Colors.difficultyHard,
  expert: Colors.difficultyExpert,
};

const LEVEL_COLORS: Record<string, string> = {
  Low: Colors.riskLow,
  Moderate: Colors.riskModerate,
  High: Colors.riskHigh,
  "Very High": Colors.riskVeryHigh,
};

const EXPERIENCE_LABELS: Record<string, string> = {
  beginner: "Începător",
  intermediate: "Intermediar",
  advanced: "Avansat",
  expert: "Expert",
};

function translateExperience(level: string | null | undefined): string {
  if (!level) return "-";

  return EXPERIENCE_LABELS[level.trim().toLowerCase()] ?? level;
}

const RISK_LEVEL_LABELS: Record<string, string> = {
  Low: "Scăzut",
  Moderate: "Moderat",
  High: "Ridicat",
  "Very High": "Foarte-ridicat",
  "Very-High": "Foarte-ridicat",
};

const CONFIDENCE_LEVEL_RO: Record<NonNullable<RiskPreview["confidence"]>["level"], string> = {
  high: "Încredere estimare: ridicată",
  medium: "Încredere estimare: medie",
  low: "Încredere estimare: scăzută",
};

const CONFIDENCE_MISSING_RO: Record<string, string> = {
  weather: "prognoza meteo",
  personal_profile: "datele tale de profil",
  route_elevation: "datele de altitudine ale traseului",
  history_insufficient: "istoric de drumetii suficient",
  forecast_far: "prognoza la peste 4 zile",
  trail_report_stale: "raportul traseului este vechi",
  surface_unknown: "tipul de teren",
};

const PrecisionColors = {
  background: "#1C2A22",
  surface: "#243328",
  elevated: "#2D3E32",
  accent: "#52B788",
  textPrimary: "#F0EDE8",
  textSecondary: "#9BB5A0",
  textMuted: "#6B8A72",
  riskLow: "#4ADE80",
  riskMid: "#FB923C",
  riskModerate: "#FB923C",
  riskHigh: "#F87171",
  riskCritical: "#6a1b9a",
  surfaceSubtle: "rgba(255,255,255,0.08)",
  amberMuted: "#3D2E0E",
  amber: "#FBB024",
} as const;

const RISK_LEVEL_ORDER: RiskLevel[] = ["Low", "Moderate", "High", "Very High"];

const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: "Cer senin",
  1: "Predominant senin",
  2: "Partial noros",
  3: "Acoperit",
  45: "Ceata",
  48: "Ceata cu chiciura",
  51: "Burni tura usoara",
  53: "Burnita",
  55: "Burnita abundenta",
  61: "Ploaie usoara",
  63: "Ploaie",
  65: "Ploaie puternica",
  71: "Ninsoare usoara",
  73: "Ninsoare",
  75: "Ninsoare puternica",
  77: "Boabe de zapada",
  80: "Averse usoare",
  81: "Averse",
  82: "Averse puternice",
  85: "Averse de ninsoare",
  86: "Averse puternice de ninsoare",
  95: "Furtuna cu tunete",
  96: "Furtuna cu grindina",
  99: "Furtuna puternica",
};

type StepCardProps = {
  step: number;
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  summary?: string | null;
  statusIcon?: React.ComponentProps<typeof Ionicons>["name"];
  statusColor?: string;
  children: ReactNode;
};

function StepCard({
  step,
  title,
  isExpanded,
  onToggle,
  disabled = false,
  summary,
  statusIcon,
  statusColor = Colors.textTertiary,
  children,
}: StepCardProps) {
  return (
    <View style={[stepCardStyles.card, disabled ? stepCardStyles.disabled : null]}>
      <Pressable onPress={onToggle} disabled={disabled} style={stepCardStyles.header}>
        <View style={stepCardStyles.stepBadge}>
          <Text style={stepCardStyles.stepNumber}>{step}</Text>
        </View>
        <View style={stepCardStyles.headerText}>
          <Text style={stepCardStyles.headerTitle}>{title}</Text>
          {!isExpanded && summary ? (
            <Text style={stepCardStyles.summary}>{summary}</Text>
          ) : null}
        </View>
        {statusIcon ? (
          <Ionicons name={statusIcon} size={18} color={statusColor} />
        ) : null}
        <Ionicons
          name={isExpanded ? "chevron-up" : "chevron-down"}
          size={18}
          color={Colors.textSecondary}
        />
      </Pressable>
      {isExpanded ? <View style={stepCardStyles.body}>{children}</View> : null}
    </View>
  );
}

const stepCardStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    marginBottom: Spacing.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  disabled: {
    opacity: 0.55,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    padding: Spacing.base,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.forest,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textOnDark,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: Typography.size.md,
    fontWeight: Typography.weight.semibold,
    color: Colors.textPrimary,
  },
  summary: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  body: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: Spacing.md,
  },
});




function getUvColor(uvIndex: number): string {
  if (uvIndex < 3) return Colors.riskLow;
  if (uvIndex <= 5) return "#f9a825";
  if (uvIndex <= 7) return "#e65100";
  if (uvIndex <= 10) return Colors.riskHigh;
  return Colors.riskVeryHigh;
}

function getRiskColorFromLevel(level: RiskPreview["level"] | string | null | undefined): string {
  if (level === "Low") return PrecisionColors.riskLow;
  if (level === "Moderate") return PrecisionColors.riskMid;
  if (level === "High") return PrecisionColors.riskHigh;
  if (level === "Very High" || level === "Very-High") return PrecisionColors.riskCritical;
  return PrecisionColors.textMuted;
}

function formatSunsetTime(sunset: string): string {
  const match = sunset.match(/T(\d{2}:\d{2})/);
  if (match) return match[1];
  if (/^\d{2}:\d{2}/.test(sunset)) return sunset.slice(0, 5);
  return sunset;
}

function getTodayDate(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${d.getFullYear()}`;
}

function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${d.getFullYear()}`;
}

function formatDateForDisplay(ddmmyyyy: string): string {
  const [day, month, year] = ddmmyyyy.split("-");
  if (!day || !month || !year) return ddmmyyyy;
  return `${day}/${month}/${year}`;
}

function toISODate(ddmmyyyy: string): string {
  const [day, month, year] = ddmmyyyy.split("-");
  if (!day || !month || !year) return ddmmyyyy;
  return `${year}-${month}-${day}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getEroareMessage(error: unknown, fallback: string): string {
  if (isObject(error)) {
    const response = isObject(error.response) ? error.response : null;
    const data = response && isObject(response.data) ? response.data : null;

    if (typeof data?.error === "string" && data.error.trim()) {
      return data.error;
    }

    if (typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }
  }

  return fallback;
}

function isUserProfile(value: unknown): value is UserProfile {
  return (
    isObject(value) &&
    typeof value.displayName === "string" &&
    typeof value.experienceLevel === "string" &&
    (value.typicalBackpackWeightKg === null ||
      isFiniteNumber(value.typicalBackpackWeightKg)) &&
    typeof value.hikesSoloUsually === "boolean"
  );
}

function isHikeHistoryItem(value: unknown): value is HikeHistoryItem {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.status === "string" &&
    (value.durationS === null || isFiniteNumber(value.durationS)) &&
      (value.elevationGainM === null || isFiniteNumber(value.elevationGainM))
  );
}

function isRiskFactorItem(value: unknown): value is RiskFactorItem {
  return (
    isObject(value) &&
    typeof value.factor === "string" &&
    typeof value.label === "string" &&
    isFiniteNumber(value.value) &&
    typeof value.description === "string" &&
    (value.suggestion === undefined || typeof value.suggestion === "string") &&
    (value.severity === undefined ||
      value.severity === "high" ||
      value.severity === "moderate" ||
      value.severity === "info") &&
    (value.category === undefined ||
      value.category === "risk" ||
      value.category === "synergy")
  );
}

function normalizeRouteData(data: unknown): RouteData | null {
  if (!isObject(data)) return null;
  if (
    typeof data.id !== "string" ||
    typeof data.name !== "string" ||
    typeof data.region !== "string" ||
    !isFiniteNumber(data.distanceKm) ||
    !isFiniteNumber(data.elevationGainM) ||
    !isFiniteNumber(data.estimatedDurationH) ||
    typeof data.difficulty !== "string" ||
    !isFiniteNumber(data.startLatitude) ||
    !isFiniteNumber(data.startLongitude) ||
    !Array.isArray(data.geometry)
  ) {
    return null;
  }

  const geometry = data.geometry.filter(
    (
      point
    ): point is {
      latitude: number;
      longitude: number;
    } =>
      isObject(point) &&
      isFiniteNumber(point.latitude) &&
      isFiniteNumber(point.longitude)
  );

  return {
    id: data.id,
    name: data.name,
    region: data.region,
    distanceKm: data.distanceKm,
    elevationGainM: data.elevationGainM,
    maxElevation:
      isFiniteNumber(data.maxElevationM) || data.maxElevationM === null
        ? data.maxElevationM
        : isFiniteNumber(data.max_elevation_m) || data.max_elevation_m === null
          ? data.max_elevation_m
          : isFiniteNumber(data.maxElevation) || data.maxElevation === null
            ? data.maxElevation
            : null,
    estimatedDurationH: data.estimatedDurationH,
    difficulty: data.difficulty,
    startLatitude: data.startLatitude,
    startLongitude: data.startLongitude,
    geometry,
  };
}

function normalizeRiskPreview(data: unknown): RiskPreview | null {
  if (!isObject(data)) return null;

  const level = data.level;
  if (
    !isFiniteNumber(data.score) ||
    (level !== "Low" &&
      level !== "Moderate" &&
      level !== "High" &&
      level !== "Very High")
  ) {
    return null;
  }

  const dataCompleteness = isObject(data.dataCompleteness)
    ? {
        weather: data.dataCompleteness.weather,
        personal: data.dataCompleteness.personal,
        routeElevation: data.dataCompleteness.routeElevation,
        overall: data.dataCompleteness.overall,
      }
    : null;
  const normalizedDataCompleteness: RiskPreview["dataCompleteness"] =
    dataCompleteness &&
    typeof dataCompleteness.weather === "boolean" &&
    typeof dataCompleteness.personal === "boolean" &&
    typeof dataCompleteness.routeElevation === "boolean" &&
    (dataCompleteness.overall === "full" ||
      dataCompleteness.overall === "partial" ||
      dataCompleteness.overall === "limited")
      ? {
          weather: dataCompleteness.weather,
          personal: dataCompleteness.personal,
          routeElevation: dataCompleteness.routeElevation,
          overall: dataCompleteness.overall,
        }
      : undefined;

  const weather =
    data.weather == null || !isObject(data.weather)
      ? null
      : {
          sunrise:
            typeof data.weather.sunrise === "string" ||
            data.weather.sunrise === null
              ? data.weather.sunrise
              : null,
          sunset:
            typeof data.weather.sunset === "string" ||
            data.weather.sunset === null
              ? data.weather.sunset
              : null,
          precipitationProbability:
            isFiniteNumber(data.weather.precipitationProbability) ||
            data.weather.precipitationProbability === null
              ? data.weather.precipitationProbability
              : null,
          windspeedKmh:
            isFiniteNumber(data.weather.windspeedKmh) ||
            data.weather.windspeedKmh === null
              ? data.weather.windspeedKmh
              : null,
          temperatureC:
            isFiniteNumber(data.weather.temperatureC) ||
            data.weather.temperatureC === null
              ? data.weather.temperatureC
              : null,
          uvIndex:
            isFiniteNumber(data.weather.uvIndex) ||
            data.weather.uvIndex === null
              ? data.weather.uvIndex
              : null,
          weatherDescription:
            typeof data.weather.weatherDescription === "string" ||
            data.weather.weatherDescription === null
              ? data.weather.weatherDescription
              : null,
        };
  const confidence =
    data.confidence != null && isObject(data.confidence)
      ? {
          score: data.confidence.score,
          level: data.confidence.level,
          missing: data.confidence.missing,
        }
      : null;
  const normalizedConfidence: RiskPreview["confidence"] =
    confidence &&
    isFiniteNumber(confidence.score) &&
    (confidence.level === "high" ||
      confidence.level === "medium" ||
      confidence.level === "low") &&
    Array.isArray(confidence.missing)
      ? {
          score: confidence.score,
          level: confidence.level,
          missing: confidence.missing.filter(
            (item): item is string => typeof item === "string"
          ),
        }
      : undefined;

  return {
    score: data.score,
    level,
    counterfactuals: Array.isArray(data.counterfactuals)
      ? data.counterfactuals.filter(
          (item): item is string => typeof item === "string"
        )
      : [],
    factors: Array.isArray(data.factors)
      ? data.factors.filter(isRiskFactorItem)
      : [],
    dataCompleteness: normalizedDataCompleteness,
    confidence: normalizedConfidence,
    weather,
    subScores: data.subScores && typeof data.subScores === "object" ? {
      terrain: Number((data.subScores as Record<string, unknown>).terrain ?? 0),
      weather: Number((data.subScores as Record<string, unknown>).weather ?? 0),
      personal: Number((data.subScores as Record<string, unknown>).personal ?? 0),
      conditions: Number((data.subScores as Record<string, unknown>).conditions ?? 0),
      timing: Number((data.subScores as Record<string, unknown>).timing ?? 0),
    } : null,
    scoreDelta: typeof data.scoreDelta === "number" ? data.scoreDelta : null,
    priorAssessmentDate: typeof data.priorAssessmentDate === "string" ? data.priorAssessmentDate : null,
    trailCondition: data.trailCondition && typeof data.trailCondition === "object" ? {
      condition: String((data.trailCondition as Record<string, unknown>).condition ?? ""),
      confidence: String((data.trailCondition as Record<string, unknown>).confidence ?? ""),
      label: String((data.trailCondition as Record<string, unknown>).label ?? ""),
      daysOld: Number((data.trailCondition as Record<string, unknown>).daysOld ?? 0),
      isTrailVerified: Boolean((data.trailCondition as Record<string, unknown>).isTrailVerified),
      notes: typeof (data.trailCondition as Record<string, unknown>).notes === "string"
        ? ((data.trailCondition as Record<string, unknown>).notes as string)
        : null,
    } : null,
  };
}

function normalizeAlternatives(data: unknown): AlternativeRoute[] {
  if (!Array.isArray(data)) return [];

  return data.flatMap((item) => {
    if (
      !isObject(item) ||
      typeof item.id !== "string" ||
      typeof item.name !== "string" ||
      typeof item.region !== "string" ||
      !isFiniteNumber(item.distanceKm) ||
      !isFiniteNumber(item.elevationGainM) ||
      !isFiniteNumber(item.estimatedDurationH) ||
      typeof item.difficulty !== "string"
    ) {
      return [];
    }

    return [
      {
        id: item.id,
        name: item.name,
        region: item.region,
        distanceKm: item.distanceKm,
        elevationGainM: item.elevationGainM,
        estimatedDurationH: item.estimatedDurationH,
        difficulty: item.difficulty,
        score: isFiniteNumber(item.score) ? item.score : undefined,
        level: typeof item.level === "string" ? item.level : undefined,
      },
    ];
  });
}

function isWeatherVântow(value: unknown): value is WeatherVântow {
  return (
    isObject(value) &&
    typeof value.startTime === "string" &&
    isFiniteNumber(value.score) &&
    typeof value.summary === "string" &&
    isFiniteNumber(value.tempC) &&
    isFiniteNumber(value.precipPct) &&
    isFiniteNumber(value.windKmh)
  );
}

function normalizeWeatherVântows(data: unknown): WeatherVântow[] | null {
  if (!isObject(data) || !Array.isArray(data.windows)) {
    return null;
  }

  return data.windows.filter(isWeatherVântow);
}

function getStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function getHourlyNumber(
  hourly: Record<string, unknown>,
  key: string,
  index: number
): number | null {
  const values = hourly[key];
  if (!Array.isArray(values)) return null;

  const value = values[index];
  return isFiniteNumber(value) ? value : null;
}

function getFirstDailyString(
  daily: Record<string, unknown> | null,
  key: string
): string | null {
  const values = daily?.[key];
  if (!Array.isArray(values)) return null;

  const value = values[0];
  return typeof value === "string" ? value : null;
}

function withAlpha(hexColor: string, alpha: string): string {
  return `${hexColor}${alpha}`;
}

function formatDificultateLabel(difficulty: string): string {
  const map: Record<string, string> = {
    easy: 'Ușor',
    moderate: 'Moderat',
    hard: 'Dificil',
    expert: 'Extrem',
  };
  return map[difficulty?.toLowerCase()] ?? difficulty;
}

function getDificultateColor(difficulty: string): string {
  return DIFFICULTY_COLORS[difficulty.toLowerCase()] ?? Colors.textTertiary;
}

function getFactorAccent(severity: FactorSeverity): string {
  if (severity === "high") return Colors.danger;
  if (severity === "moderate") return Colors.warning;
  return Colors.info;
}

function getFactorSeverityFromValue(value: number): FactorSeverity {
  if (value >= 20) return "high";
  if (value >= 10) return "moderate";
  return "info";
}

function getFactorIcon(
  severity: FactorSeverity
): React.ComponentProps<typeof Ionicons>["name"] {
  return severity === "info" ? "information-circle" : "warning";
}

function isFatigueFactorModerateOrHigh(factor: RiskFactorItem): boolean {
  return factor.factor === "fatigue" && factor.value >= 0.2;
}

function formatWindowLabel(startTime: string): string {
  const date = new Date(startTime);
  return date.toLocaleString("ro-RO", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getWeatherVântowCoordinates(routeData: RouteData): {
  latitude: number;
  longitude: number;
} {
  const firstPoint = routeData.geometry[0];

  if (firstPoint) {
    return {
      latitude: firstPoint.latitude,
      longitude: firstPoint.longitude,
    };
  }

  return {
    latitude: routeData.startLatitude,
    longitude: routeData.startLongitude,
  };
}

function getVântowScoreColor(score: number): string {
  if (score >= 85) return Colors.riskLow;
  if (score >= 70) return Colors.riskModerate;
  return Colors.riskHigh;
}

function getSimplifiedRouteRiskLevel(routeData: RouteData): RiskLevel {
  if (
    routeData.difficulty.toLowerCase() === "hard" &&
    (routeData.elevationGainM >= 1500 || routeData.estimatedDurationH >= 8)
  ) {
    return "Very High";
  }

  if (
    routeData.difficulty.toLowerCase() === "hard" ||
    routeData.elevationGainM >= 1000 ||
    routeData.estimatedDurationH >= 6
  ) {
    return "High";
  }

  if (
    routeData.difficulty.toLowerCase() === "moderate" ||
    routeData.elevationGainM >= 600 ||
    routeData.estimatedDurationH >= 4
  ) {
    return "Moderate";
  }

  return "Low";
}

type RouteStatProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
};

function RouteStat({ icon, label }: RouteStatProps) {
  return (
    <View style={styles.routeStat}>
      <Ionicons name={icon} size={15} color={Colors.textSecondary} />
      <Text style={styles.routeStatText}>{label}</Text>
    </View>
  );
}

type WeatherRowProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
  valueColor?: string;
};

function WeatherRow({ icon, label, value, valueColor }: WeatherRowProps) {
  return (
    <View style={styles.weatherRow}>
      <View style={styles.weatherLabelWrap}>
        <Ionicons name={icon} size={16} color={Colors.forest} />
        <Text style={styles.weatherLabel}>{label}</Text>
      </View>
      <Text style={[styles.weatherValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  );
}

const SAFETY_CHECKLIST_ITEMS = [
  "Contact de urgenta informat",
  "Apa suficienta (500ml pe ora)",
  "Telefon incarcat peste 20%",
  "Conditii meteo acceptabile",
] as const;

export default function PlanScreen() {
  const navigation = useNavigation<PlanNavigation>();
  const route = useRoute<RouteProp<MainTabParamList, "Plan">>();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [historyHikes, setHistoryHikes] = useState<HikeHistoryItem[]>([]);

  const [selectedRoute, setSelectedRoute] = useState<RouteData | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [multiDayMode, setMultiDayMode] = useState(false);
  const [tripDays, setTripDays] = useState<Array<typeof selectedRoute>>([]);
  const [routeLoading, setRouteLoading] = useState(false);
  const [expandedStep, setExpandedStep] = useState<1 | 2 | 3 | null>(1);
  const [tripDaySelectionIndex, setTripDaySelectionIndex] = useState<number | null>(
    null
  );

  const [hikeDate, setHikeDate] = useState(getTomorrowDate);
  const [startTime, setStartTime] = useState("08:00");
  const [backpackWeightKg, setBackpackWeightKg] = useState("12");
  const [soloHiker, setSoloHiker] = useState(false);

  const [riskResult, setRiskResult] = useState<RiskPreview | null>(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [showAllFactors, setShowAllFactors] = useState(false);
  const [showBriefing, setShowBriefing] = useState(false);
  const [isConfidenceModalVisible, setIsConfidenceModalVisible] = useState(false);
  const [briefingStep, setBriefingStep] = useState(0);
  const [safetyChecklist, setSafetyChecklist] = useState<boolean[]>(
    () => SAFETY_CHECKLIST_ITEMS.map(() => false)
  );

  const [alternatives, setAlternatives] = useState<AlternativeRoute[]>([]);
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  const [weatherVântows, setWeatherVântows] = useState<WeatherVântow[] | null>(null);
  const [loadingVântows, setLoadingVântows] = useState(false);
  const [plannedWeather, setPlannedWeather] = useState<PlannedWeather | null>(
    null
  );
  const [plannedWeatherLoading, setPlannedWeatherLoading] = useState(false);

  const resultOpacity = useSharedValue(0);
  const riskBarWidth = useRef(new RNAnimated.Value(0)).current;
  const hasSelectedDateTime = hikeDate.trim().length > 0 && startTime.trim().length > 0;

  useEffect(() => {
    let active = true;

    const loadData = async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;

        const [profileRes, hikesRes] = await Promise.all([
          api.get("/profile/me", {
            headers: { Authorization: `Bearer ${token}` },
          }),
          api.get("/hikes", {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (!active) return;

        const profileData = isObject(profileRes.data)
          ? profileRes.data.profile
          : null;
        const hikesData = Array.isArray(hikesRes.data?.hikes)
          ? hikesRes.data.hikes.filter(isHikeHistoryItem)
          : [];

        setProfile(isUserProfile(profileData) ? profileData : null);
        setHistoryHikes(hikesData);
      } catch {
        if (active) {
          setProfile(null);
          setHistoryHikes([]);
        }
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadFavoriteIds = async () => {
      try {
        const ids = await fetchFavoriteIds();
        if (active) {
          setFavoriteIds(new Set(ids));
        }
      } catch {
      }
    };

    void loadFavoriteIds();

    const unsubscribe = navigation.addListener("focus", () => {
      void loadFavoriteIds();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [navigation]);

  useEffect(() => {
    if (profile?.typicalBackpackWeightKg != null) {
      setBackpackWeightKg(String(profile.typicalBackpackWeightKg));
    }
  }, [profile]);

  useEffect(() => {
    if (selectedRoute && expandedStep !== null && expandedStep <= 1) {
      const timeoutId = setTimeout(() => {
        setExpandedStep(2);
      }, 150);
      return () => clearTimeout(timeoutId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoute]);

  useEffect(() => {
    setShowAllFactors(false);
    if (riskResult) {
      setExpandedStep(3);
    }
  }, [riskResult]);

  useEffect(() => {
    if (riskResult) {
      resultOpacity.value = 0;
      resultOpacity.value = withTiming(1, { duration: 600 });
    } else {
      resultOpacity.value = 0;
    }
  }, [resultOpacity, riskResult]);

  useEffect(() => {
    if (!selectedRoute || !hasSelectedDateTime) {
      setPlannedWeather(null);
      setPlannedWeatherLoading(false);
      return;
    }

    let active = true;

    const loadPlannedWeather = async () => {
      try {
        setPlannedWeatherLoading(true);

        const coordinates = getWeatherVântowCoordinates(selectedRoute);
        const forecastDate = toISODate(hikeDate.trim());
        const targetHour = startTime.trim().slice(0, 2).padStart(2, "0");
        const params = new URLSearchParams({
          latitude: String(coordinates.latitude),
          longitude: String(coordinates.longitude),
          hourly:
            "temperature_2m,precipitation_probability,weather_code,wind_speed_10m,uv_index",
          daily: "sunrise,sunset",
          timezone: "auto",
          start_date: forecastDate,
          end_date: forecastDate,
        });

        const response = await fetch(
          `https://api.open-meteo.com/v1/forecast?${params.toString()}`
        );

        if (!response.ok) {
          throw new Error("Weather request failed");
        }

        const data: unknown = await response.json();
        const hourly = isObject(data) && isObject(data.hourly) ? data.hourly : null;
        if (!hourly) {
          throw new Error("Invalid weather response");
        }

        const times = getStringArray(hourly.time);
        const targetPrefix = `${forecastDate}T${targetHour}`;
        const weatherIndex = Math.max(
          0,
          times.findIndex((time) => time.startsWith(targetPrefix))
        );
        const weatherCode = getHourlyNumber(hourly, "weather_code", weatherIndex);
        const daily = isObject(data) && isObject(data.daily) ? data.daily : null;

        if (!active) return;

        setPlannedWeather({
          sunrise: getFirstDailyString(daily, "sunrise"),
          sunset: getFirstDailyString(daily, "sunset"),
          precipitationProbability: getHourlyNumber(
            hourly,
            "precipitation_probability",
            weatherIndex
          ),
          windspeedKmh: getHourlyNumber(hourly, "wind_speed_10m", weatherIndex),
          temperatureC: getHourlyNumber(hourly, "temperature_2m", weatherIndex),
          uvIndex: getHourlyNumber(hourly, "uv_index", weatherIndex),
          weatherDescription:
            weatherCode != null
              ? WEATHER_CODE_DESCRIPTIONS[weatherCode] ?? "Necunoscuta"
              : null,
        });
      } catch {
        if (active) {
          setPlannedWeather(null);
        }
      } finally {
        if (active) {
          setPlannedWeatherLoading(false);
        }
      }
    };

    void loadPlannedWeather();

    return () => {
      active = false;
    };
  }, [
    hasSelectedDateTime,
    hikeDate,
    selectedRoute,
    selectedRoute?.geometry,
    selectedRoute?.startLatitude,
    selectedRoute?.startLongitude,
    startTime,
  ]);

  useEffect(() => {
    const shouldLoadVântows =
      !!selectedRoute &&
      (riskResult?.level === "High" || riskResult?.level === "Very High");

    if (!shouldLoadVântows || !selectedRoute) {
      setWeatherVântows(null);
      setLoadingVântows(false);
      return;
    }

    let active = true;

    const loadWeatherVântows = async () => {
      try {
        setLoadingVântows(true);

        const coordinates = getWeatherVântowCoordinates(selectedRoute);
        const res = await api.get("/risk-assessments/weather-windows", {
          params: {
            lat: coordinates.latitude,
            lon: coordinates.longitude,
          },
        });

        if (!active) return;

        const normalized = normalizeWeatherVântows(res.data);
        if (!normalized) {
          throw new Error("Invalid weather windows response");
        }

        setWeatherVântows(normalized);
      } catch {
        if (active) {
          setWeatherVântows(null);
        }
      } finally {
        if (active) {
          setLoadingVântows(false);
        }
      }
    };

    void loadWeatherVântows();

    return () => {
      active = false;
    };
  }, [
    riskResult?.level,
    selectedRoute?.startLatitude,
    selectedRoute?.startLongitude,
    selectedRoute?.geometry,
  ]);

  useEffect(() => {
    const routeId = route.params?.selectedRouteId;
    if (!routeId) return;

    let active = true;

    const resetPlanningState = () => {
      setSelectedRoute(null);
      setRiskResult(null);
      setAlternatives([]);
      setAlternativesLoading(false);
      setHikeDate(getTodayDate());
      setStartTime("09:00");
      setBackpackWeightKg(
        profile?.typicalBackpackWeightKg != null
          ? String(profile.typicalBackpackWeightKg)
          : "12"
      );
    };

    const fetchRoute = async () => {
      try {
        resetPlanningState();
        setRouteLoading(true);

        const token = await getAccessToken();
        if (!token) {
          Alert.alert("Eroare", "Nu esti autentificat");
          return;
        }

        const res = await api.get(`/routes/${routeId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!active) return;

        const nextRoute = normalizeRouteData(res.data?.route);
        if (!nextRoute) {
          Alert.alert("Eroare", "Nu s-au putut incarca detaliile traseului");
          return;
        }

        if (multiDayMode && tripDaySelectionIndex != null) {
          // Explore returns a route id through navigation params; in multi-day
          // mode we map it back to the itinerary slot the user tapped.
          setTripDays((current) => {
            const nextTripDays = [...current];
            nextTripDays[tripDaySelectionIndex] = nextRoute;
            return nextTripDays.slice(0, 3);
          });
          setTripDaySelectionIndex(null);
        } else {
          setSelectedRoute(nextRoute);
        }
      } catch {
        if (active) {
          Alert.alert("Eroare", "Nu s-au putut incarca detaliile traseului");
        }
      } finally {
        if (active) {
          setRouteLoading(false);
          navigation.setParams({ selectedRouteId: undefined });
        }
      }
    };

    void fetchRoute();

    return () => {
      active = false;
    };
  }, [
    multiDayMode,
    navigation,
    profile?.typicalBackpackWeightKg,
    route.params?.selectedRouteId,
    tripDaySelectionIndex,
  ]);

  const learnedCapacity = useMemo(
    () => calculateUserCapacity(historyHikes),
    [historyHikes]
  );

  const mapRegion = useMemo(() => {
    if (!selectedRoute) return undefined;

    return {
      latitude: selectedRoute.startLatitude,
      longitude: selectedRoute.startLongitude,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };
  }, [selectedRoute]);

  const riskAnimStyle = useAnimatedStyle(() => ({
    opacity: resultOpacity.value,
  }));

  useEffect(() => {
    RNAnimated.timing(riskBarWidth, {
      toValue: riskResult?.score ?? 0,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [riskBarWidth, riskResult?.score]);

  const handleFavoritePress = async () => {
    if (!selectedRoute) return;

    const routeId = selectedRoute.id;
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
  };

  const handleCalculateRisk = async () => {
    if (!selectedRoute || !hasSelectedDateTime || riskLoading) return;

    try {
      setRiskLoading(true);
      setRiskResult(null);
      setAlternatives([]);

      const token = await getAccessToken();
      if (!token) {
        Alert.alert("Eroare", "Nu esti autentificat");
        return;
      }

      const res = await api.post(
        "/risk-assessments",
        {
          routeId: selectedRoute.id,
          startDate: toISODate(hikeDate),
          startTime,
          backpackWeightKg: Number(backpackWeightKg) || 0,
          soloHiker,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const assessment = normalizeRiskPreview(res.data?.assessment);
      if (!assessment) {
        throw new Error("Invalid risk assessment response");
      }

      setRiskResult(assessment);

      if (assessment.level === "High" || assessment.level === "Very High") {
        try {
          setAlternativesLoading(true);
          const altRes = await api.get(
            `/routes/${selectedRoute.id}/alternatives`,
            {
              headers: { Authorization: `Bearer ${token}` },
              params: {
                startDate: toISODate(hikeDate),
                startTime,
                backpackWeightKg: Number(backpackWeightKg) || 0,
              },
            }
          );
          setAlternatives(normalizeAlternatives(altRes.data?.alternatives));
        } catch (error) {
          Alert.alert(
            "Alternative indisponibile",
            getEroareMessage(error, "Nu s-au putut incarca rutele alternative")
          );
        } finally {
          setAlternativesLoading(false);
        }
      }
    } catch (error: unknown) {
      Alert.alert("Eroare", getEroareMessage(error, "Ceva a mers prost"));
    } finally {
      setRiskLoading(false);
    }
  };

  if (profileLoading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator size="large" color={Colors.forest} />
      </SafeAreaView>
    );
  }

  const routeDificultateColor = getDificultateColor(selectedRoute?.difficulty ?? "");
  const riskColor = riskResult
    ? LEVEL_COLORS[riskResult.level] ?? Colors.forest
    : Colors.forest;
  const structuredFactors = riskResult?.factors ?? [];
  const synergyFactors = structuredFactors.filter(
    (factor) => factor.category === "synergy"
  );
  const riskFactors = structuredFactors.filter(
    (factor) => (factor.category ?? "risk") !== "synergy"
  ).sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  const FACTOR_CAP = 7;
  const visibleFactors = showAllFactors
    ? riskFactors
    : riskFactors.slice(0, FACTOR_CAP);
  const terrainIsDominant = riskResult?.subScores
    ? riskResult.subScores.terrain >=
      Math.max(
        riskResult.subScores.weather,
        riskResult.subScores.personal,
        riskResult.subScores.conditions,
        riskResult.subScores.timing
      )
    : false;
  const limitedDataMissingItems = riskResult?.dataCompleteness
    ? [
        !riskResult.dataCompleteness.weather ? "prognoza meteo" : null,
        !riskResult.dataCompleteness.personal ? "datele tale de fitness/profil" : null,
        !riskResult.dataCompleteness.routeElevation ? "datele de altitudine ale traseului" : null,
      ].filter((item): item is string => item != null)
    : [];
  const limitedDataText =
    riskResult?.dataCompleteness &&
    riskResult.dataCompleteness.overall !== "full" &&
    limitedDataMissingItems.length > 0
      ? `Evaluat cu date incomplete -- ${limitedDataMissingItems.join(", ")} ${
          limitedDataMissingItems.length === 1 ? "a fost" : "au fost"
        } indisponibile. Trateaza scorul ca estimativ.`
      : null;
  const confidenceMissingItems = riskResult?.confidence
    ? riskResult.confidence.missing.map(
        (item) => CONFIDENCE_MISSING_RO[item] ?? item
      )
    : [];
  const confidenceText = riskResult?.confidence
    ? CONFIDENCE_LEVEL_RO[riskResult.confidence.level]
    : null;
  const confidenceMissingText =
    riskResult?.confidence &&
    riskResult.confidence.level !== "high" &&
    confidenceMissingItems.length > 0
      ? `Lipsesc: ${confidenceMissingItems.join(", ")}.`
      : null;
  const renderConfidenceBanner = () =>
    confidenceText ? (
      <GlassCard style={styles.limitedDataCard}>
        <View style={styles.betterTimeHeader}>
          <Ionicons
            name="shield-checkmark-outline"
            size={18}
            color={Colors.warning ?? Colors.alpine}
          />
          <View style={styles.confidenceTextBlock}>
            <Text style={styles.limitedDataText}>{confidenceText}</Text>
            {confidenceMissingText ? (
              <Text style={styles.confidenceMissingText}>{confidenceMissingText}</Text>
            ) : null}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Explicație pentru încrederea estimării"
            onPress={() => setIsConfidenceModalVisible(true)}
            style={styles.confidenceInfoButton}
          >
            <Ionicons
              name="information-circle-outline"
              size={20}
              color={Colors.warning ?? Colors.alpine}
            />
          </Pressable>
        </View>
      </GlassCard>
    ) : null;
  const routeSummary = selectedRoute
    ? `${sanitizeRouteName(selectedRoute.name)} • ${selectedRoute.distanceKm.toFixed(1)} km`
    : null;
  const conditionsSummary = selectedRoute ? `${formatDateForDisplay(hikeDate)} • ${startTime}` : null;
  const isSelectedRouteFavorite = selectedRoute
    ? favoriteIds.has(selectedRoute.id)
    : false;
  const hasLearnedCapability =
    learnedCapacity.sampleSize >= 3 &&
    (learnedCapacity.learnedComfortDistanceKm != null ||
      learnedCapacity.learnedComfortDurationH != null ||
      learnedCapacity.learnedComfortElevationGainM != null);
  const riskSummary = riskResult
    ? `${riskResult.level} • ${Math.round(riskResult.score)}`
    : null;
  const canAnalyzeRisk = !!selectedRoute && hasSelectedDateTime;
  const weatherData = plannedWeather ?? riskResult?.weather ?? null;
  const bestWeatherWindow = weatherVântows?.[0] ?? null;
  const canStartNormally =
    !riskResult ||
    riskResult.level === "Low" ||
    riskResult.level === "Moderate";
  const roundedRiskScore = riskResult ? Math.round(riskResult.score) : null;
  const riskHeroLevelLabel = riskResult
    ? RISK_LEVEL_LABELS[riskResult.level] ?? riskResult.level
    : "Neanalizat";
  const precisionRiskColor = getRiskColorFromLevel(riskResult?.level);
  const riskBarWidthInterpolated = riskBarWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ["0%", "100%"],
    extrapolate: "clamp",
  });
  const isHighRiskScore = roundedRiskScore != null && roundedRiskScore >= 66;
  const backpackWeightNumber = Number(backpackWeightKg);
  const backpackWeightDisplay = Number.isFinite(backpackWeightNumber)
    ? backpackWeightNumber
    : 0;
  const learnedFitnessTier = hasLearnedCapability ? "Calibrat" : "Profil de baza";
  const filledTripDays = tripDays.filter((day): day is RouteData => day != null);
  const filledTripDayCount = filledTripDays.length;
  const totalTripDistanță = filledTripDays.reduce(
    (total, day) => total + day.distanceKm,
    0
  );
  const totalTripElevation = filledTripDays.reduce(
    (total, day) => total + day.elevationGainM,
    0
  );
  const totalTripDurată = filledTripDays.reduce(
    (total, day) => total + day.estimatedDurationH,
    0
  );
  const combinedTripRisk = filledTripDays.reduce<RiskLevel>(
    (highest, day) => {
      const nextLevel = getSimplifiedRouteRiskLevel(day);
      return RISK_LEVEL_ORDER.indexOf(nextLevel) > RISK_LEVEL_ORDER.indexOf(highest)
        ? nextLevel
        : highest;
    },
    "Low"
  );

  const navigateToRecord = () => {
    const parsedBackpackWeightKg = Number(backpackWeightKg);

    navigation.navigate("Record", {
      routeName: selectedRoute?.name,
      routeId: selectedRoute?.id,
      routeCoordinates: selectedRoute?.geometry?.map((point) => ({
        lat: point.latitude,
        lon: point.longitude,
      })),
      routeDistanceKm: selectedRoute?.distanceKm,
      riskScore: riskResult?.score,
      backpackWeightKg:
        Number.isFinite(parsedBackpackWeightKg) && parsedBackpackWeightKg > 0
          ? parsedBackpackWeightKg
          : profile?.typicalBackpackWeightKg ?? undefined,
    });
  };

  const resetBriefing = () => {
    setShowBriefing(false);
    setBriefingStep(0);
    setSafetyChecklist(SAFETY_CHECKLIST_ITEMS.map(() => false));
  };

  const handleStartHike = () => {
    setShowBriefing(true);
  };

  const handleOpenTripDayPicker = (dayIndex: number) => {
    setTripDaySelectionIndex(dayIndex);
    navigation.navigate("MainTabs", { screen: "Explore" });
  };

  const handleRemoveTripDay = (dayIndex: number) => {
    setTripDays((current) => current.map((day, index) => (index === dayIndex ? null : day)));
  };

  const handlePlanTrip = () => {
    const firstDayRoute = tripDays[0];
    if (!firstDayRoute) return;
    const parsedBackpackWeightKg = Number(backpackWeightKg);

    navigation.navigate("Record", {
      routeName: firstDayRoute.name,
      routeId: firstDayRoute.id,
      routeCoordinates: firstDayRoute.geometry.map((point) => ({
        lat: point.latitude,
        lon: point.longitude,
      })),
      routeDistanceKm: firstDayRoute.distanceKm,
      riskScore: riskResult?.score,
      backpackWeightKg:
        Number.isFinite(parsedBackpackWeightKg) && parsedBackpackWeightKg > 0
          ? parsedBackpackWeightKg
          : profile?.typicalBackpackWeightKg ?? undefined,
    });
  };

  const handleDirectionsPress = () => {
    if (!selectedRoute) return;

    const { startLatitude, startLongitude } = selectedRoute;
    const url =
      Platform.OS === "ios"
        ? `maps://maps.apple.com/?daddr=${startLatitude},${startLongitude}`
        : `geo:${startLatitude},${startLongitude}?q=${startLatitude},${startLongitude}`;

    void Linking.openURL(url);
  };

  const handleCompleteBriefing = () => {
    resetBriefing();
    navigateToRecord();
  };

  const handleVeryHighRiskStart = () => {
    Alert.alert("Esti sigur? Riscul este foarte ridicat", undefined, [
      {
        text: "Anulează",
        style: "cancel",
      },
      {
        text: "Continua",
        style: "destructive",
        onPress: handleStartHike,
      },
    ]);
  };


  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.modeToggleRow}>
            <View style={styles.modeToggleLabelWrap}>
              <Ionicons name="calendar-outline" size={18} color={Colors.alpine} />
              <Text style={styles.modeToggleText}>O singura zi</Text>
            </View>
            <Switch
              value={multiDayMode}
              onValueChange={setMultiDayMode}
              trackColor={{
                false: withAlpha(Colors.textTertiary, "55"),
                true: withAlpha(Colors.forest, "66"),
              }}
              thumbColor={multiDayMode ? Colors.forest : Colors.surface}
              ios_backgroundColor={withAlpha(Colors.textTertiary, "55")}
            />
            <Text style={styles.modeToggleText}>Mai multe zile</Text>
          </View>

          {multiDayMode ? (
            <GlassCard style={styles.itineraryCard}>
              <Text style={styles.itineraryTitle}>Trip Itinerary</Text>

              {([0, 1, 2] as const).map((dayIndex) => {
                const tripRoute = tripDays[dayIndex];
                const tripRiskLevel = tripRoute
                  ? getSimplifiedRouteRiskLevel(tripRoute)
                  : null;

                return tripRoute ? (
                  <View key={dayIndex} style={styles.tripDayCard}>
                    <View style={styles.tripDayHeader}>
                      <Text style={styles.tripDayLabel}>Ziua {dayIndex + 1}</Text>
                      <Pressable
                        onPress={() => handleRemoveTripDay(dayIndex)}
                        style={styles.tripDayRemoveButton}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color={Colors.danger}
                        />
                      </Pressable>
                    </View>

                    <Text style={styles.tripDayRouteName}>{sanitizeRouteName(tripRoute.name)}</Text>

                    <View style={styles.tripDayStatsRow}>
                      <RouteStat
                        icon="trail-sign-outline"
                        label={`${tripRoute.distanceKm.toFixed(1)} km`}
                      />
                      <RouteStat
                        icon="trending-up-outline"
                        label={`${tripRoute.elevationGainM} m`}
                      />
                    </View>

                    {tripRiskLevel ? <RiskBadge level={tripRiskLevel} /> : null}
                  </View>
                ) : (
                  <TouchableOpacity
                    key={dayIndex}
                    activeOpacity={0.85}
                    onPress={() => handleOpenTripDayPicker(dayIndex)}
                    style={styles.tripDayEmptySlot}
                  >
                    <View style={styles.tripDayEmptyIconWrap}>
                      <Ionicons name="add" size={22} color={Colors.forest} />
                    </View>
                    <View style={styles.tripDayEmptyTextWrap}>
                      <Text style={styles.tripDayLabel}>Ziua {dayIndex + 1}</Text>
                      <Text style={styles.tripDayEmptyText}>Atinge pentru a adauga o ruta</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {routeLoading && tripDaySelectionIndex != null ? (
                <ActivityIndicator color={Colors.forest} style={styles.tripLoading} />
              ) : null}

              {filledTripDayCount >= 2 ? (
                <>
                  <View style={styles.tripSummaryCard}>
                    <View style={styles.tripSummaryHeader}>
                      <Text style={styles.tripSummaryTitle}>Rezumat excursie</Text>
                      <RiskBadge level={combinedTripRisk} />
                    </View>

                    <View style={styles.tripSummaryStatsRow}>
                      <RouteStat
                        icon="trail-sign-outline"
                        label={`${totalTripDistanță.toFixed(1)} km`}
                      />
                      <RouteStat
                        icon="trending-up-outline"
                        label={`${Math.round(totalTripElevation)} m`}
                      />
                      <RouteStat
                        icon="time-outline"
                        label={`~${totalTripDurată.toFixed(1)} h`}
                      />
                    </View>
                  </View>

                  <View style={styles.campingNoteRow}>
                    <Ionicons name="bed-outline" size={18} color={Colors.alpine} />
                    <Text style={styles.campingNoteText}>
                      Locuri de camping intre etape disponibile pe OSM. Verifica
                      AllTrails sau Wikiloc pentru optiuni de cazare.
                    </Text>
                  </View>
                </>
              ) : null}

              <GlassButton
                label="Planifica excursia"
                onPress={handlePlanTrip}
                disabled={!tripDays[0]}
                variant="primary"
                size="lg"
                style={styles.tripPlanButton}
              />
            </GlassCard>
          ) : (
            <View style={styles.precisionSingleDay}>
              <View style={styles.precisionSections}>
                <View style={styles.precisionSectionCard}>
                  <View style={styles.precisionSectionHeaderRow}>
                    <Text style={styles.precisionSectionHeader}>Detalii traseu</Text>
                    {selectedRoute ? (
                      <Pressable
                        accessibilityLabel={
                          isSelectedRouteFavorite ? "Elimina din salvate" : "Salveaza traseul"
                        }
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={handleFavoritePress}
                        style={styles.precisionIconButton}
                      >
                        <Ionicons
                          name={isSelectedRouteFavorite ? "bookmark" : "bookmark-outline"}
                          size={19}
                          color={PrecisionColors.accent}
                        />
                      </Pressable>
                    ) : null}
                  </View>

                  {routeLoading ? (
                    <ActivityIndicator color={PrecisionColors.accent} />
                  ) : selectedRoute ? (
                    <>
                      <Text style={styles.precisionRouteName}>
                        {sanitizeRouteName(selectedRoute.name)}
                      </Text>
                      <Text style={styles.precisionRouteRegion}>{selectedRoute.region}</Text>

                      <View style={styles.precisionDetailsGrid}>
                        <View style={styles.precisionDetailItem}>
                          <Text style={styles.precisionDetailLabel}>Dificultate</Text>
                          <Text
                            style={[
                              styles.precisionDetailValue,
                              { color: routeDificultateColor },
                            ]}
                          >
                            {formatDificultateLabel(selectedRoute.difficulty)}
                          </Text>
                        </View>
                        <View style={styles.precisionDetailItem}>
                          <Text style={styles.precisionDetailLabel}>Distanță</Text>
                          <Text style={styles.precisionNumericValue}>
                            {selectedRoute.distanceKm.toFixed(1)} km
                          </Text>
                        </View>
                        <View style={styles.precisionDetailItem}>
                          <Text style={styles.precisionDetailLabel}>Elevation</Text>
                          <Text style={styles.precisionNumericValue}>
                            {Math.round(selectedRoute.elevationGainM)} m
                          </Text>
                        </View>
                        <View style={styles.precisionDetailItem}>
                          <Text style={styles.precisionDetailLabel}>Durată</Text>
                          <Text style={styles.precisionNumericValue}>
                            {selectedRoute.estimatedDurationH.toFixed(1)} h
                          </Text>
                        </View>
                      </View>

                      {selectedRoute.geometry.length > 1 && mapRegion ? (
                        <View style={styles.precisionMapWrap}>
                          <MapView
                            style={styles.precisionMap}
                            initialRegion={mapRegion}
                            region={mapRegion}
                            scrollEnabled={false}
                            pointerEvents="none"
                            mapType="hybrid"
                          >
                            <Polyline
                              coordinates={selectedRoute.geometry}
                              strokeColor={PrecisionColors.accent}
                              strokeWidth={3}
                            />
                          </MapView>
                        </View>
                      ) : null}

                      <View style={styles.precisionActionRow}>
                        <Pressable
                          accessibilityRole="button"
                          onPress={handleDirectionsPress}
                          style={styles.precisionSecondaryButton}
                        >
                          <Ionicons
                            name="navigate-outline"
                            size={16}
                            color={PrecisionColors.accent}
                          />
                          <Text style={styles.precisionSecondaryButtonText}>Directii</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() =>
                            navigation.navigate("MainTabs", { screen: "Explore" })
                          }
                          style={styles.precisionSecondaryButton}
                        >
                          <Text style={styles.precisionSecondaryButtonText}>
                            Schimba ruta
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <View style={styles.emptyRouteState}>
                      <Text style={styles.emptyRouteText}>Niciun traseu selectat</Text>
                      <GlassButton
                        label="Rasfoieste traseele"
                        onPress={() =>
                          navigation.navigate("MainTabs", { screen: "Explore" })
                        }
                        variant="primary"
                      />
                    </View>
                  )}
                </View>

                {selectedRoute ? (
                  <View style={styles.precisionSectionCard}>
                    <Text style={styles.precisionSectionHeader}>
                      CONDIȚII METEOROLOGICE
                    </Text>

                    <View style={styles.precisionInputGrid}>
                      <View style={styles.precisionInputGroup}>
                        <Text style={styles.precisionInputLabel}>Data</Text>
                        <TextInput
                          value={hikeDate}
                          onChangeText={setHikeDate}
                          placeholder="15-06-2025"
                          placeholderTextColor={PrecisionColors.textMuted}
                          style={[styles.precisionInput, styles.precisionMonoInput]}
                        />
                      </View>
                      <View style={styles.precisionInputGroup}>
                        <Text style={styles.precisionInputLabel}>Ora</Text>
                        <TextInput
                          value={startTime}
                          onChangeText={setStartTime}
                          placeholder="09:00"
                          placeholderTextColor={PrecisionColors.textMuted}
                          style={[styles.precisionInput, styles.precisionMonoInput]}
                        />
                      </View>
                    </View>

                    {!hasSelectedDateTime ? (
                      <Text style={styles.precisionWeatherSummary}>
                        Selectează data și ora pentru condițiile meteo
                      </Text>
                    ) : plannedWeatherLoading ? (
                      <ActivityIndicator color={PrecisionColors.accent} />
                    ) : plannedWeather ? (
                      <>
                        <View style={styles.precisionWeatherGrid}>
                          <View style={styles.precisionWeatherItem}>
                            <Text style={styles.precisionDetailLabel}>Temperatură</Text>
                            <Text style={styles.precisionWeatherValue}>
                              {plannedWeather.temperatureC != null
                                ? `${plannedWeather.temperatureC}°C`
                                : "-"}
                            </Text>
                          </View>
                          <View style={styles.precisionWeatherItem}>
                            <Text style={styles.precisionDetailLabel}>Vânt</Text>
                            <Text style={styles.precisionWeatherValue}>
                              {plannedWeather.windspeedKmh != null
                                ? `${plannedWeather.windspeedKmh} km/h`
                                : "-"}
                            </Text>
                          </View>
                          <View style={styles.precisionWeatherItem}>
                            <Text style={styles.precisionDetailLabel}>
                              Precipitații
                            </Text>
                            <Text
                              style={[
                                styles.precisionWeatherValue,
                                plannedWeather.precipitationProbability != null
                                  ? {
                                      color:
                                        plannedWeather.precipitationProbability > 60
                                          ? PrecisionColors.riskHigh
                                          : plannedWeather.precipitationProbability > 30
                                            ? PrecisionColors.riskModerate
                                            : PrecisionColors.riskLow,
                                    }
                                  : null,
                              ]}
                            >
                              {plannedWeather.precipitationProbability != null
                                ? `${plannedWeather.precipitationProbability}%`
                                : "-"}
                            </Text>
                          </View>
                        </View>

                        {plannedWeather.weatherDescription ? (
                          <Text style={styles.precisionWeatherSummary}>
                            {plannedWeather.weatherDescription}
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <Text style={styles.precisionWeatherSummary}>
                        Vreme indisponibila
                      </Text>
                    )}
                  </View>
                ) : null}

                <View style={styles.precisionSectionCard}>
                  <Text style={styles.precisionSectionHeader}>
                    PREGĂTIRE PERSONALĂ
                  </Text>
                  <View style={styles.precisionPersonalRow}>
                    <View style={styles.precisionPersonalText}>
                      <Text style={styles.precisionDetailLabel}>Nivel fitness</Text>
                      <Text style={styles.precisionDetailValue}>{learnedFitnessTier}</Text>
                    </View>
                    <View style={styles.precisionPersonalText}>
                      <Text style={styles.precisionDetailLabel}>Experiență</Text>
                      <Text style={styles.precisionDetailValue}>
                        {translateExperience(profile?.experienceLevel)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.precisionStepperRow}>
                    <View>
                      <Text style={styles.precisionDetailLabel}>Rucsac</Text>
                      <Text style={styles.precisionStepperHint}>kg</Text>
                    </View>
                    <View style={styles.precisionStepper}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Scade greutatea rucsacului"
                        onPress={() =>
                          setBackpackWeightKg(
                            String(Math.max(0, backpackWeightDisplay - 1))
                          )
                        }
                        style={styles.precisionStepperButton}
                      >
                        <Ionicons
                          name="remove"
                          size={18}
                          color={PrecisionColors.textPrimary}
                        />
                      </Pressable>
                      <TextInput
                        value={backpackWeightKg}
                        onChangeText={setBackpackWeightKg}
                        placeholder="12"
                        placeholderTextColor={PrecisionColors.textMuted}
                        keyboardType="numeric"
                        style={styles.precisionStepperInput}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Creste greutatea rucsacului"
                        onPress={() =>
                          setBackpackWeightKg(String(backpackWeightDisplay + 1))
                        }
                        style={styles.precisionStepperButton}
                      >
                        <Ionicons
                          name="add"
                          size={18}
                          color={PrecisionColors.textPrimary}
                        />
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.precisionSwitchRow}>
                    <Text style={styles.precisionSwitchText}>
                      Merg singur pe acest traseu
                    </Text>
                    <Switch
                      value={soloHiker}
                      onValueChange={setSoloHiker}
                      trackColor={{
                        false: PrecisionColors.elevated,
                        true: PrecisionColors.accent,
                      }}
                      thumbColor={PrecisionColors.textPrimary}
                    />
                  </View>

                  <Text style={styles.precisionLearnedText}>
                    Învățat din{" "}
                    <Text style={styles.precisionInlineNumber}>
                      {learnedCapacity.sampleSize}
                    </Text>{" "}
                    trasee finalizate
                  </Text>
                </View>
              </View>

              {canAnalyzeRisk ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={handleCalculateRisk}
                  disabled={riskLoading}
                  style={({ pressed }) => [
                    styles.precisionAnalyzeButton,
                    riskLoading && styles.precisionButtonDisabled,
                    pressed && styles.precisionButtonPressed,
                  ]}
                >
                  {riskLoading ? (
                    <ActivityIndicator color={Colors.background} />
                  ) : (
                    <Text style={styles.precisionAnalyzeText}>
                      ANALIZEAZĂ RISCUL
                    </Text>
                  )}
                </Pressable>
              ) : null}

              <Reanimated.View style={[styles.precisionHeroCard, riskAnimStyle]}>
                <View style={styles.riskHeroRow}>
                  <View
                    accessible={true}
                    accessibilityLabel={
                      roundedRiskScore != null
                        ? `Scor de risc ${roundedRiskScore} din 100`
                        : "Scor de risc neanalizat"
                    }
                    style={styles.precisionScoreBlock}
                  >
                    <Text style={[styles.riskHeroScore, { color: precisionRiskColor }]}>
                      {roundedRiskScore ?? "--"}
                    </Text>
                  </View>

                  <View style={styles.riskHeroLevelBlock}>
                    <Text style={styles.riskHeroScoreUnit}>/100</Text>
                    <Text style={[styles.riskHeroLevel, { color: precisionRiskColor }]}>
                      {riskHeroLevelLabel}
                    </Text>
                  </View>
                </View>

                <View style={styles.riskHeroBarTrack}>
                  <RNAnimated.View
                    style={[
                      styles.riskHeroBarFill,
                      {
                        backgroundColor: precisionRiskColor,
                        width: riskBarWidthInterpolated,
                      },
                    ]}
                  />
                </View>

                <View style={styles.precisionRiskFooter}>
                  {riskResult?.scoreDelta != null && riskResult.scoreDelta !== 0 ? (
                    <Text
                      style={[
                        styles.riskHeroDelta,
                        {
                          color:
                            riskResult.scoreDelta < 0
                              ? PrecisionColors.riskLow
                              : PrecisionColors.riskHigh,
                        },
                      ]}
                    >
                      {riskResult.scoreDelta > 0
                        ? "Creștere față de evaluarea anterioară: "
                        : "Scădere față de evaluarea anterioară: "}
                      {Math.abs(Math.round(riskResult.scoreDelta))} pct
                    </Text>
                  ) : null}
                </View>
              </Reanimated.View>

              {isHighRiskScore ? (
                <View style={styles.highRiskBanner}>
                  <Ionicons
                    name="warning-outline"
                    size={18}
                    color={PrecisionColors.amber}
                  />
                  <Text style={styles.highRiskBannerText}>
                    Risc ridicat — continuați cu precauție
                  </Text>
                </View>
              ) : null}

            {riskResult ? (
              <>
                {limitedDataText ? (
                  <GlassCard style={styles.limitedDataCard}>
                    <View style={styles.betterTimeHeader}>
                      <Ionicons
                        name="information-circle-outline"
                        size={18}
                        color={Colors.warning ?? Colors.alpine}
                      />
                      <Text style={styles.limitedDataText}>{limitedDataText}</Text>
                    </View>
                  </GlassCard>
                ) : null}

                {renderConfidenceBanner()}

                {riskResult.subScores && (
                  <View style={styles.subScoresSection}>
                    <Text style={styles.subScoresTitle}>Defalcare risc</Text>
                    {([
                      { key: "terrain", label: "Teren" },
                      { key: "weather", label: "Vreme" },
                      { key: "personal", label: "Personal" },
                      { key: "conditions", label: "Conditii" },
                      { key: "timing", label: "Timp" },
                    ] as const).map(({ key, label }) => {
                      const val = riskResult.subScores![key] ?? 0;
                      const barColor = val >= 70 ? Colors.riskHigh : val >= 40 ? Colors.riskModerate : Colors.riskLow;
                      return (
                        <View key={key} style={styles.subScoreRow}>
                          <Text style={styles.subScoreLabel}>{label}</Text>
                          <View style={styles.subScoreBarTrack}>
                            <View style={[styles.subScoreBarFill, { width: `${Math.min(100, val)}%` as `${number}%`, backgroundColor: barColor }]} />
                          </View>
                          <Text style={styles.subScoreValue}>{Math.round(val)}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {(riskResult.level === "High" || riskResult.level === "Very High") &&
                selectedRoute ? (
                  <GlassCard style={styles.betterTimeCard}>
                    <View style={styles.betterTimeHeader}>
                      <Ionicons
                        name="time-outline"
                        size={18}
                        color={Colors.accent}
                      />
                      <Text style={styles.betterTimeTitle}>Fereastră favorabilă</Text>
                    </View>

                    {loadingVântows ? (
                      <ActivityIndicator color={Colors.accent} />
                    ) : bestWeatherWindow && weatherVântows ? (
                      <View style={styles.betterTimeContent}>
                        <Text style={styles.betterTimeBest}>
                          Cea mai bună fereastră: {formatWindowLabel(bestWeatherWindow.startTime)} -
                          {" "}Scor {bestWeatherWindow.score}/100 -{" "}
                          {bestWeatherWindow.summary}
                        </Text>

                        {weatherVântows.slice(0, 3).map((window) => {
                          const scoreColor = getVântowScoreColor(window.score);

                          return (
                            <View key={window.startTime} style={styles.betterTimeRow}>
                              <Text style={styles.betterTimeRowTime}>
                                {formatWindowLabel(window.startTime)}
                              </Text>
                              <View
                                style={[
                                  styles.betterTimeScoreBadge,
                                  { backgroundColor: withAlpha(scoreColor, "18") },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.betterTimeScoreText,
                                    { color: scoreColor },
                                  ]}
                                >
                                  {window.score}
                                </Text>
                              </View>
                              <Text style={styles.betterTimeRowSummary} numberOfLines={2}>
                                {window.summary}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : weatherVântows?.length === 0 ? (
                      <Text style={styles.betterTimeEmpty}>
                        Nicio fereastră favorabilă în următoarele 3 zile.
                      </Text>
                    ) : (
                      <Text style={styles.betterTimeEmpty}>
                        Nicio fereastră mai sigură în prognoza de 48h.
                      </Text>
                    )}
                  </GlassCard>
                ) : null}

                {riskResult.weather?.sunset && (
                  <GlassCard style={styles.sunsetNotice}>
                    <View style={styles.factorInnerRow}>
                      <Ionicons name="sunny" size={18} color={Colors.warning} />
                      <Text style={styles.sunsetNoticeText}>
                        Soarele apune la ora {formatSunsetTime(riskResult.weather.sunset)}. Planifică astfel încât să termini înainte de lăsarea întunericului.
                      </Text>
                    </View>
                  </GlassCard>
                )}

                {riskResult.trailCondition && (
                  <GlassCard style={styles.trailConditionChip}>
                    <View style={styles.factorInnerRow}>
                      <Ionicons name="leaf-outline" size={16} color={Colors.forest} />
                      <Text style={styles.trailConditionText}>
                        {riskResult.trailCondition.label}
                      </Text>
                      {riskResult.trailCondition.isTrailVerified && (
                        <Ionicons name="checkmark-circle" size={14} color={Colors.riskLow} />
                      )}
                    </View>
                    {riskResult.trailCondition.notes?.trim() ? (
                      <Text style={styles.trailConditionNote}>
                        {riskResult.trailCondition.notes.trim()}
                      </Text>
                    ) : null}
                  </GlassCard>
                )}

                {riskFactors.length > 0 && (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionTitle}>Factori de risc</Text>
                    {visibleFactors.map((factor, index) => {
                      const severity =
                        factor.severity ?? getFactorSeverityFromValue(factor.value);
                      const accentColor = isFatigueFactorModerateOrHigh(factor)
                        ? Colors.warning
                        : getFactorAccent(severity);
                      const iconSeverity = isFatigueFactorModerateOrHigh(factor)
                        ? "moderate"
                        : severity;

                      return (
                        <GlassCard
                          key={`${factor.factor}-${index}`}
                          style={[
                            styles.factorCard,
                            { borderLeftColor: accentColor },
                          ]}
                        >
                          <View style={styles.factorInnerRow}>
                            <Ionicons
                              name={getFactorIcon(iconSeverity)}
                              size={18}
                              color={accentColor}
                            />
                            <View style={styles.factorTextWrap}>
                              <Text style={styles.factorText}>
                                {factor.description}
                              </Text>
                              {factor.suggestion ? (
                                <Text style={styles.factorSuggestion}>
                                  {factor.suggestion}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        </GlassCard>
                      );
                    })}
                    {riskFactors.length > FACTOR_CAP ? (
                      <Pressable
                        onPress={() => setShowAllFactors((current) => !current)}
                        style={styles.factorToggle}
                      >
                        <Text style={styles.factorToggleText}>
                          {showAllFactors
                            ? "Arata mai putini"
                            : `Arata toti ${riskFactors.length} factorii`}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}

                {riskResult.counterfactuals &&
                  riskResult.counterfactuals.length > 0 && (
                    <View style={styles.sectionBlock}>
                      <Text style={styles.counterfactualsTitle}>
                        Ce ar reduce riscul tău
                      </Text>
                      {riskResult.counterfactuals.map((item, index) => (
                        <GlassCard
                          key={`${item}-${index}`}
                          style={styles.counterfactualCard}
                        >
                          <View style={styles.factorInnerRow}>
                            <Ionicons
                              name="checkmark-circle"
                              size={18}
                              color={Colors.accent}
                            />
                            <Text style={styles.factorText}>{item}</Text>
                          </View>
                        </GlassCard>
                      ))}
                    </View>
                  )}

                {synergyFactors.length > 0 && (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.synergyTitle}>Riscuri cumulate</Text>
                    {synergyFactors.map((factor, index) => (
                          <GlassCard
                            key={`${factor.factor}-${index}`}
                            style={styles.synergyCard}
                          >
                            <View style={styles.factorInnerRow}>
                              <Text style={styles.synergyIcon}>{"⚡"}</Text>
                              <Text style={styles.factorText}>{factor.description}</Text>
                            </View>
                          </GlassCard>
                    ))}
                  </View>
                )}

                {riskResult.weather && (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionTitle}>Context meteo</Text>
                    <GlassCard style={styles.weatherCard}>
                      {riskResult.weather.weatherDescription ? (
                        <WeatherRow
                          icon="sunny"
                          label="Conditie"
                          value={riskResult.weather.weatherDescription}
                        />
                      ) : null}

                      {riskResult.weather.temperatureC != null ? (
                        <WeatherRow
                          icon="thermometer"
                          label="Temperatură"
                          value={`${riskResult.weather.temperatureC} C`}
                        />
                      ) : null}

                      {riskResult.weather.precipitationProbability != null ? (
                        <WeatherRow
                          icon="rainy"
                          label="Sansa de ploaie"
                          value={`${riskResult.weather.precipitationProbability}%`}
                          valueColor={
                            riskResult.weather.precipitationProbability > 60
                              ? Colors.riskHigh
                              : riskResult.weather.precipitationProbability > 30
                                ? Colors.riskModerate
                                : Colors.riskLow
                          }
                        />
                      ) : null}

                      {riskResult.weather.windspeedKmh != null ? (
                        <WeatherRow
                          icon="speedometer"
                          label="Vânt"
                          value={`${riskResult.weather.windspeedKmh} km/h`}
                        />
                      ) : null}

                      {riskResult.weather.uvIndex != null ? (
                        <WeatherRow
                          icon="sunny-outline"
                          label="Indice UV"
                          value={String(riskResult.weather.uvIndex)}
                          valueColor={getUvColor(riskResult.weather.uvIndex)}
                        />
                      ) : null}

                      {riskResult.weather.sunrise ? (
                        <WeatherRow
                          icon="time-outline"
                          label="Rasarit"
                          value={formatSunsetTime(riskResult.weather.sunrise)}
                        />
                      ) : null}

                      {riskResult.weather.sunset ? (
                        <WeatherRow
                          icon="time-outline"
                          label="Apus"
                          value={formatSunsetTime(riskResult.weather.sunset)}
                        />
                      ) : null}
                    </GlassCard>
                  </View>
                )}
                {(riskResult.level === "High" || riskResult.level === "Very High") &&
                terrainIsDominant ? (
                  <View style={styles.sectionBlock}>
                    <Text
                      style={[
                        styles.alternativesTitle,
                        {
                          color:
                            riskResult.level === "Very High"
                              ? Colors.riskHigh
                              : Colors.riskModerate,
                        },
                      ]}
                    >
                      Alternative mai sigure
                    </Text>

                    {alternativesLoading ? (
                      <ActivityIndicator color={Colors.accent} />
                    ) : alternatives.length === 0 ? (
                      <Text style={styles.emptyAlternatives}>
                        Nu s-au gasit alternative.
                      </Text>
                    ) : (
                      alternatives.map((alt) => {
                        const altDiffColor = getDificultateColor(alt.difficulty);
                        const altRiskColor = alt.level
                          ? LEVEL_COLORS[alt.level] ?? Colors.textSecondary
                          : Colors.textSecondary;

                        return (
                          <PressableFeedback
                            key={alt.id}
                            onPress={() =>
                              navigation.navigate("MainTabs", {
                                screen: "Plan",
                                params: { selectedRouteId: alt.id },
                              })
                            }
                          >
                            <GlassCard style={styles.alternativeCard}>
                              <View
                                style={[
                                  styles.alternativeAccent,
                                  { backgroundColor: altDiffColor },
                                ]}
                              />
                              <View style={styles.alternativeContent}>
                                <Text style={styles.alternativeName}>{sanitizeRouteName(alt.name)}</Text>
                                <Text style={styles.alternativeRegion}>{alt.region}</Text>
                                <View style={styles.alternativeMetaRow}>
                                  <View style={styles.alternativeMetaItem}>
                                    <Ionicons name="map-outline" size={14} color={Colors.textSecondary} />
                                    <Text style={styles.alternativeMeta}>
                                      {alt.distanceKm.toFixed(1)} km
                                    </Text>
                                  </View>
                                  <View style={styles.alternativeMetaItem}>
                                    <Ionicons name="trending-up-outline" size={14} color={Colors.textSecondary} />
                                    <Text style={styles.alternativeMeta}>
                                      {Math.round(alt.elevationGainM)} m
                                    </Text>
                                  </View>
                                  {alt.score != null ? (
                                    <Text style={[styles.alternativeMeta, { color: altRiskColor }]}>
                                      {alt.level ? `${RISK_LEVEL_LABELS[alt.level] ?? alt.level} ` : ""}
                                      {Math.round(alt.score)}
                                    </Text>
                                  ) : null}
                                  <View
                                    style={[
                                      styles.difficultyPill,
                                      {
                                        backgroundColor: withAlpha(
                                          altDiffColor,
                                          "26"
                                        ),
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.difficultyPillText,
                                        { color: altDiffColor },
                                      ]}
                                    >
                                      {formatDificultateLabel(alt.difficulty)}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            </GlassCard>
                          </PressableFeedback>
                        );
                      })
                    )}
                  </View>
                ) : null}

              </>
            ) : (
              <Text style={styles.emptyRouteText}>
                Ruleaza o analiza pentru a vedea scorul, factorii, vremea si
                alternativele mai sigure.
              </Text>
            )}

              {Boolean(false) && selectedRoute ? (
            <>
          <StepCard
            step={1}
            title="Choose Route"
            isExpanded={expandedStep === 1}
            onToggle={() => setExpandedStep((current) => (current === 1 ? null : 1))}
            summary={routeSummary}
            statusIcon={selectedRoute ? "checkmark-circle" : "ellipse-outline"}
            statusColor={selectedRoute ? Colors.success : Colors.textTertiary}
          >
            {routeLoading ? (
              <ActivityIndicator color={Colors.forest} />
            ) : selectedRoute ? (
              <View style={styles.routeCardContent}>
                <View style={styles.routeHeader}>
                  <View style={styles.routeHeaderText}>
                    <Text style={styles.routeName}>{sanitizeRouteName(selectedRoute.name)}</Text>
                    <Text style={styles.routeRegion}>{selectedRoute.region}</Text>
                  </View>
                  <Pressable
                    accessibilityLabel={
                      isSelectedRouteFavorite ? "Elimina din salvate" : "Salveaza traseul"
                    }
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={handleFavoritePress}
                    style={styles.routeSaveButton}
                  >
                    <Ionicons
                      name={isSelectedRouteFavorite ? "bookmark" : "bookmark-outline"}
                      size={21}
                      color={Colors.forest}
                    />
                  </Pressable>
                  <View
                    style={[
                      styles.difficultyPill,
                      { backgroundColor: withAlpha(routeDificultateColor, "26") },
                    ]}
                  >
                    <Text
                      style={[
                        styles.difficultyPillText,
                        { color: routeDificultateColor },
                      ]}
                    >
                      {formatDificultateLabel(selectedRoute.difficulty)}
                    </Text>
                  </View>
                </View>

                <View style={styles.routeStatsRow}>
                  <RouteStat
                    icon="trail-sign-outline"
                    label={`${selectedRoute.distanceKm.toFixed(1)} km`}
                  />
                  <RouteStat
                    icon="trending-up-outline"
                    label={`${selectedRoute.elevationGainM} m`}
                  />
                  {selectedRoute.maxElevation != null ? (
                    <RouteStat
                      icon="flag-outline"
                      label={`${selectedRoute.maxElevation} m max`}
                    />
                  ) : null}
                  <RouteStat
                    icon="time-outline"
                    label={`~${selectedRoute.estimatedDurationH.toFixed(1)} h`}
                  />
                </View>

                {selectedRoute.geometry.length > 1 && mapRegion ? (
                  <View style={styles.mapPreviewWrap}>
                    <MapView
                      style={[styles.mapPreview, { height: 160 }]}
                      initialRegion={mapRegion}
                      region={mapRegion}
                      scrollEnabled={false}
                      pointerEvents="none"
                      mapType="hybrid"
                    >
                      <Polyline
                        coordinates={selectedRoute.geometry}
                        strokeColor={Colors.alpineLight}
                        strokeWidth={3}
                      />
                    </MapView>
                  </View>
                ) : null}

                <GlassButton
                  label="Get Directions"
                  onPress={handleDirectionsPress}
                  variant="ghost"
                  size="sm"
                  icon={
                    <Ionicons
                      name="navigate-outline"
                      size={16}
                      color={Colors.forest}
                    />
                  }
                  style={styles.routeActionButton}
                />

                <GlassButton
                  label="Change Route"
                  onPress={() =>
                    navigation.navigate("MainTabs", { screen: "Explore" })
                  }
                  variant="ghost"
                  style={styles.routeActionButton}
                />
              </View>
            ) : (
              <View style={styles.emptyRouteState}>
                <Text style={styles.emptyRouteText}>Niciun traseu selectat</Text>
                <GlassButton
                  label="Rasfoieste traseele"
                  onPress={() =>
                    navigation.navigate("MainTabs", { screen: "Explore" })
                  }
                  variant="primary"
                />
              </View>
            )}
          </StepCard>

          <StepCard
            step={2}
            title="Set Conditions"
            isExpanded={expandedStep === 2}
            onToggle={() => {
              if (selectedRoute) {
                setExpandedStep((current) => (current === 2 ? null : 2));
              }
            }}
            disabled={!selectedRoute}
            summary={conditionsSummary}
            statusIcon={selectedRoute ? "checkmark-circle" : "lock-closed-outline"}
            statusColor={selectedRoute ? Colors.success : Colors.textTertiary}
          >
            <Text style={styles.inputLabel}>Hike Date (DD-MM-YYYY)</Text>
            <TextInput
              value={hikeDate}
              onChangeText={setHikeDate}
              placeholder="15-06-2025"
              placeholderTextColor={Colors.textTertiary}
              style={styles.input}
            />

            <Text style={[styles.inputLabel, styles.spacedInputLabel]}>
              Start Time (HH:MM)
            </Text>
            <TextInput
              value={startTime}
              onChangeText={setStartTime}
              placeholder="09:00"
              placeholderTextColor={Colors.textTertiary}
              style={styles.input}
            />

            <Text style={[styles.inputLabel, styles.spacedInputLabel]}>
              Backpack Weight (kg)
            </Text>
            <TextInput
              value={backpackWeightKg}
              onChangeText={setBackpackWeightKg}
              placeholder="12"
              placeholderTextColor={Colors.textTertiary}
              keyboardType="numeric"
              style={styles.input}
            />

            <Text style={[styles.inputLabel, styles.spacedInputLabel]}>
              Hiking Group
            </Text>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 6,
              }}
            >
              <Text style={{ flex: 1, color: Colors.textTertiary, fontSize: 14 }}>
                Merg singur pe acest traseu
              </Text>
              <Switch
                value={soloHiker}
                onValueChange={setSoloHiker}
                trackColor={{ true: Colors.alpineLight }}
              />
            </View>

            <GlassCard style={styles.capabilityCard}>
              <View style={styles.capabilityHeader}>
                <Ionicons name="person" size={18} color={Colors.alpineLight} />
                <Text style={styles.capabilityTitle}>Your Capability</Text>
              </View>

              <View style={styles.capabilityBadge}>
                <Text style={styles.capabilityBadgeText}>
                  {translateExperience(profile?.experienceLevel)}
                </Text>
              </View>

              <View style={styles.learnedBlock}>
                <Text style={styles.learnedTitle}>
                  Learned from your {learnedCapacity.sampleSize} traseu finalizat
                  {learnedCapacity.sampleSize !== 1 ? "s" : ""}
                </Text>
                {hasLearnedCapability ? (
                  <>
                    {learnedCapacity.learnedComfortDistanceKm != null ? (
                      <Text style={styles.capabilityRow}>
                        Learned distance:{" "}
                        <Text style={styles.capabilityStrong}>
                          {learnedCapacity.learnedComfortDistanceKm.toFixed(1)} km
                        </Text>
                      </Text>
                    ) : null}
                    {learnedCapacity.learnedComfortDurationH != null ? (
                      <Text style={styles.capabilityRow}>
                        Learned duration:{" "}
                        <Text style={styles.capabilityStrong}>
                          {learnedCapacity.learnedComfortDurationH.toFixed(1)} h
                        </Text>
                      </Text>
                    ) : null}
                    {learnedCapacity.learnedComfortElevationGainM != null ? (
                      <Text style={styles.capabilityRow}>
                        Learned elevation:{" "}
                        <Text style={styles.capabilityStrong}>
                          {Math.round(learnedCapacity.learnedComfortElevationGainM)} m
                        </Text>
                      </Text>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.capabilityRow}>
                    Complete {Math.max(0, 3 - learnedCapacity.sampleSize)} more hikes to unlock your learned capabilities
                  </Text>
                )}
              </View>
            </GlassCard>
          </StepCard>

          <StepCard
            step={3}
            title="Analiză de Risc"
            isExpanded={expandedStep === 3}
            onToggle={() => {
              if (selectedRoute) {
                setExpandedStep((current) => (current === 3 ? null : 3));
              }
            }}
            disabled={!selectedRoute}
            summary={riskSummary}
            statusIcon={riskResult ? "shield-checkmark" : "shield-outline"}
            statusColor={riskResult ? riskColor : Colors.textTertiary}
          >

            {riskResult ? (
              <Reanimated.View style={[styles.riskCard, riskAnimStyle]}>
                {limitedDataText ? (
                  <GlassCard style={styles.limitedDataCard}>
                    <View style={styles.betterTimeHeader}>
                      <Ionicons
                        name="information-circle-outline"
                        size={18}
                        color={Colors.warning ?? Colors.alpine}
                      />
                      <Text style={styles.limitedDataText}>{limitedDataText}</Text>
                    </View>
                  </GlassCard>
                ) : null}

                {renderConfidenceBanner()}

                {riskResult.subScores && (
                  <View style={styles.subScoresSection}>
                    <Text style={styles.subScoresTitle}>Defalcare risc</Text>
                    {([
                      { key: "terrain", label: "Teren" },
                      { key: "weather", label: "Vreme" },
                      { key: "personal", label: "Personal" },
                      { key: "conditions", label: "Conditii" },
                      { key: "timing", label: "Timp" },
                    ] as const).map(({ key, label }) => {
                      const val = riskResult.subScores![key] ?? 0;
                      const barColor = val >= 70 ? Colors.riskHigh : val >= 40 ? Colors.riskModerate : Colors.riskLow;
                      return (
                        <View key={key} style={styles.subScoreRow}>
                          <Text style={styles.subScoreLabel}>{label}</Text>
                          <View style={styles.subScoreBarTrack}>
                            <View style={[styles.subScoreBarFill, { width: `${Math.min(100, val)}%` as `${number}%`, backgroundColor: barColor }]} />
                          </View>
                          <Text style={styles.subScoreValue}>{Math.round(val)}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {(riskResult.level === "High" || riskResult.level === "Very High") &&
                selectedRoute ? (
                  <GlassCard style={styles.betterTimeCard}>
                    <View style={styles.betterTimeHeader}>
                      <Ionicons
                        name="time-outline"
                        size={18}
                        color={Colors.accent}
                      />
                      <Text style={styles.betterTimeTitle}>Fereastră favorabilă</Text>
                    </View>

                    {loadingVântows ? (
                      <ActivityIndicator color={Colors.accent} />
                    ) : bestWeatherWindow && weatherVântows ? (
                      <View style={styles.betterTimeContent}>
                        <Text style={styles.betterTimeBest}>
                          Cea mai bună fereastră: {formatWindowLabel(bestWeatherWindow.startTime)} -
                          {" "}Scor {bestWeatherWindow.score}/100 -{" "}
                          {bestWeatherWindow.summary}
                        </Text>

                        {weatherVântows.slice(0, 3).map((window) => {
                          const scoreColor = getVântowScoreColor(window.score);

                          return (
                            <View key={window.startTime} style={styles.betterTimeRow}>
                              <Text style={styles.betterTimeRowTime}>
                                {formatWindowLabel(window.startTime)}
                              </Text>
                              <View
                                style={[
                                  styles.betterTimeScoreBadge,
                                  { backgroundColor: withAlpha(scoreColor, "18") },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.betterTimeScoreText,
                                    { color: scoreColor },
                                  ]}
                                >
                                  {window.score}
                                </Text>
                              </View>
                              <Text style={styles.betterTimeRowSummary} numberOfLines={2}>
                                {window.summary}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    ) : weatherVântows?.length === 0 ? (
                      <Text style={styles.betterTimeEmpty}>
                        Nicio fereastră favorabilă în următoarele 3 zile.
                      </Text>
                    ) : (
                      <Text style={styles.betterTimeEmpty}>
                        Nicio fereastră mai sigură în prognoza de 48h.
                      </Text>
                    )}
                  </GlassCard>
                ) : null}

                {riskResult.weather?.sunset && (
                  <GlassCard style={styles.sunsetNotice}>
                    <View style={styles.factorInnerRow}>
                      <Ionicons name="sunny" size={18} color={Colors.warning} />
                      <Text style={styles.sunsetNoticeText}>
                        Soarele apune la ora {formatSunsetTime(riskResult.weather.sunset)}. Planifică astfel încât să termini înainte de lăsarea întunericului.
                      </Text>
                    </View>
                  </GlassCard>
                )}

                {riskResult.trailCondition && (
                  <GlassCard style={styles.trailConditionChip}>
                    <View style={styles.factorInnerRow}>
                      <Ionicons name="leaf-outline" size={16} color={Colors.forest} />
                      <Text style={styles.trailConditionText}>
                        {riskResult.trailCondition.label}
                      </Text>
                      {riskResult.trailCondition.isTrailVerified && (
                        <Ionicons name="checkmark-circle" size={14} color={Colors.riskLow} />
                      )}
                    </View>
                    {riskResult.trailCondition.notes?.trim() ? (
                      <Text style={styles.trailConditionNote}>
                        {riskResult.trailCondition.notes.trim()}
                      </Text>
                    ) : null}
                  </GlassCard>
                )}

                {riskFactors.length > 0 && (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionTitle}>Factori de risc</Text>
                    {visibleFactors.map((factor, index) => {
                      const severity =
                        factor.severity ?? getFactorSeverityFromValue(factor.value);
                      const accentColor = isFatigueFactorModerateOrHigh(factor)
                        ? Colors.warning
                        : getFactorAccent(severity);
                      const iconSeverity = isFatigueFactorModerateOrHigh(factor)
                        ? "moderate"
                        : severity;

                      return (
                        <GlassCard
                          key={`${factor.factor}-${index}`}
                          style={[
                            styles.factorCard,
                            { borderLeftColor: accentColor },
                          ]}
                        >
                          <View style={styles.factorInnerRow}>
                            <Ionicons
                              name={getFactorIcon(iconSeverity)}
                              size={18}
                              color={accentColor}
                            />
                            <View style={styles.factorTextWrap}>
                              <Text style={styles.factorText}>
                                {factor.description}
                              </Text>
                              {factor.suggestion ? (
                                <Text style={styles.factorSuggestion}>
                                  {factor.suggestion}
                                </Text>
                              ) : null}
                            </View>
                          </View>
                        </GlassCard>
                      );
                    })}
                    {riskFactors.length > FACTOR_CAP ? (
                      <Pressable
                        onPress={() => setShowAllFactors((current) => !current)}
                        style={styles.factorToggle}
                      >
                        <Text style={styles.factorToggleText}>
                          {showAllFactors
                            ? "Arata mai putini"
                            : `Arata toti ${riskFactors.length} factorii`}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                )}

                {riskResult.counterfactuals &&
                  riskResult.counterfactuals.length > 0 && (
                    <View style={styles.sectionBlock}>
                      <Text style={styles.counterfactualsTitle}>
                        Ce ar reduce riscul tău
                      </Text>
                      {riskResult.counterfactuals.map((item, index) => (
                        <GlassCard
                          key={`${item}-${index}`}
                          style={styles.counterfactualCard}
                        >
                          <View style={styles.factorInnerRow}>
                            <Ionicons
                              name="checkmark-circle"
                              size={18}
                              color={Colors.accent}
                            />
                            <Text style={styles.factorText}>{item}</Text>
                          </View>
                        </GlassCard>
                      ))}
                    </View>
                  )}

                {synergyFactors.length > 0 && (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.synergyTitle}>Riscuri cumulate</Text>
                    {synergyFactors.map((factor, index) => (
                          <GlassCard
                            key={`${factor.factor}-${index}`}
                            style={styles.synergyCard}
                          >
                            <View style={styles.factorInnerRow}>
                              <Text style={styles.synergyIcon}>{"⚡"}</Text>
                              <Text style={styles.factorText}>{factor.description}</Text>
                            </View>
                          </GlassCard>
                    ))}
                  </View>
                )}

                {riskResult.weather && (
                  <View style={styles.sectionBlock}>
                    <Text style={styles.sectionTitle}>Context meteo</Text>
                    <GlassCard style={styles.weatherCard}>
                      {riskResult.weather.weatherDescription ? (
                        <WeatherRow
                          icon="sunny"
                          label="Conditie"
                          value={riskResult.weather.weatherDescription}
                        />
                      ) : null}

                      {riskResult.weather.temperatureC != null ? (
                        <WeatherRow
                          icon="thermometer"
                          label="Temperatură"
                          value={`${riskResult.weather.temperatureC} C`}
                        />
                      ) : null}

                      {riskResult.weather.precipitationProbability != null ? (
                        <WeatherRow
                          icon="rainy"
                          label="Sansa de ploaie"
                          value={`${riskResult.weather.precipitationProbability}%`}
                          valueColor={
                            riskResult.weather.precipitationProbability > 60
                              ? Colors.riskHigh
                              : riskResult.weather.precipitationProbability > 30
                                ? Colors.riskModerate
                                : Colors.riskLow
                          }
                        />
                      ) : null}

                      {riskResult.weather.windspeedKmh != null ? (
                        <WeatherRow
                          icon="speedometer"
                          label="Vânt"
                          value={`${riskResult.weather.windspeedKmh} km/h`}
                        />
                      ) : null}

                      {riskResult.weather.uvIndex != null ? (
                        <WeatherRow
                          icon="sunny-outline"
                          label="Indice UV"
                          value={String(riskResult.weather.uvIndex)}
                          valueColor={getUvColor(riskResult.weather.uvIndex)}
                        />
                      ) : null}

                      {riskResult.weather.sunrise ? (
                        <WeatherRow
                          icon="time-outline"
                          label="Rasarit"
                          value={formatSunsetTime(riskResult.weather.sunrise)}
                        />
                      ) : null}

                      {riskResult.weather.sunset ? (
                        <WeatherRow
                          icon="time-outline"
                          label="Apus"
                          value={formatSunsetTime(riskResult.weather.sunset)}
                        />
                      ) : null}
                    </GlassCard>
                  </View>
                )}
                {(riskResult.level === "High" || riskResult.level === "Very High") &&
                terrainIsDominant ? (
                  <View style={styles.sectionBlock}>
                    <Text
                      style={[
                        styles.alternativesTitle,
                        {
                          color:
                            riskResult.level === "Very High"
                              ? Colors.riskHigh
                              : Colors.riskModerate,
                        },
                      ]}
                    >
                      Alternative mai sigure
                    </Text>

                    {alternativesLoading ? (
                      <ActivityIndicator color={Colors.accent} />
                    ) : alternatives.length === 0 ? (
                      <Text style={styles.emptyAlternatives}>
                        Nu s-au gasit alternative.
                      </Text>
                    ) : (
                      alternatives.map((alt) => {
                        const altDiffColor = getDificultateColor(alt.difficulty);
                        const altRiskColor = alt.level
                          ? LEVEL_COLORS[alt.level] ?? Colors.textSecondary
                          : Colors.textSecondary;

                        return (
                          <PressableFeedback
                            key={alt.id}
                            onPress={() =>
                              navigation.navigate("MainTabs", {
                                screen: "Plan",
                                params: { selectedRouteId: alt.id },
                              })
                            }
                          >
                            <GlassCard style={styles.alternativeCard}>
                              <View
                                style={[
                                  styles.alternativeAccent,
                                  { backgroundColor: altDiffColor },
                                ]}
                              />
                              <View style={styles.alternativeContent}>
                                <Text style={styles.alternativeName}>{sanitizeRouteName(alt.name)}</Text>
                                <Text style={styles.alternativeRegion}>{alt.region}</Text>
                                <View style={styles.alternativeMetaRow}>
                                  <View style={styles.alternativeMetaItem}>
                                    <Ionicons name="map-outline" size={14} color={Colors.textSecondary} />
                                    <Text style={styles.alternativeMeta}>
                                      {alt.distanceKm.toFixed(1)} km
                                    </Text>
                                  </View>
                                  <View style={styles.alternativeMetaItem}>
                                    <Ionicons name="trending-up-outline" size={14} color={Colors.textSecondary} />
                                    <Text style={styles.alternativeMeta}>
                                      {Math.round(alt.elevationGainM)} m
                                    </Text>
                                  </View>
                                  {alt.score != null ? (
                                    <Text style={[styles.alternativeMeta, { color: altRiskColor }]}>
                                      {alt.level ? `${RISK_LEVEL_LABELS[alt.level] ?? alt.level} ` : ""}
                                      {Math.round(alt.score)}
                                    </Text>
                                  ) : null}
                                  <View
                                    style={[
                                      styles.difficultyPill,
                                      {
                                        backgroundColor: withAlpha(
                                          altDiffColor,
                                          "26"
                                        ),
                                      },
                                    ]}
                                  >
                                    <Text
                                      style={[
                                        styles.difficultyPillText,
                                        { color: altDiffColor },
                                      ]}
                                    >
                                      {formatDificultateLabel(alt.difficulty)}
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            </GlassCard>
                          </PressableFeedback>
                        );
                      })
                    )}
                  </View>
                ) : null}

              </Reanimated.View>
            ) : (
              <Text style={styles.emptyRouteText}>
                Ruleaza o analiza pentru a vedea scorul, factorii, vremea si
                alternativele mai sigure.
              </Text>
            )}
          </StepCard>
            </>
              ) : null}
            </View>
          )}
        </ScrollView>
        {!multiDayMode && selectedRoute ? (
          <View style={[styles.bottomCTA, { paddingBottom: insets.bottom + 4 }]}>
            <Pressable
              accessibilityRole="button"
              onPress={
                riskResult?.level === "Very High"
                  ? handleVeryHighRiskStart
                  : handleStartHike
              }
              disabled={riskLoading}
              style={({ pressed }) => [
                styles.precisionStartButton,
                riskLoading && styles.precisionButtonDisabled,
                pressed && styles.precisionButtonPressed,
              ]}
            >
              <Text style={styles.precisionStartButtonText}>
                {isHighRiskScore ? "PORNEȘTE ORICUM" : "PORNEȘTE"}
              </Text>
            </Pressable>
          </View>
        ) : null}
        <Modal
          visible={isConfidenceModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setIsConfidenceModalVisible(false)}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Închide explicația pentru încrederea estimării"
            onPress={() => setIsConfidenceModalVisible(false)}
            style={styles.confidenceModalBackdrop}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={styles.confidenceModalCard}
            >
              <Text style={styles.confidenceModalTitle}>
                Încrederea estimării
              </Text>
              <Text style={styles.confidenceModalBody}>
                Ridicată: avem date suficiente despre vreme, traseu și profilul tău.
                Medie: estimarea este utilă, dar lipsesc unele date relevante.
                Scăzută: lipsesc date importante, deci tratează scorul ca orientativ și
                planifică mai conservator.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setIsConfidenceModalVisible(false)}
                style={styles.confidenceModalCloseButton}
              >
                <Text style={styles.confidenceModalCloseText}>Închide</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
        <Modal
          visible={showBriefing}
          animationType="slide"
          presentationStyle="fullScreen"
          onRequestClose={resetBriefing}
        >
          <SafeAreaView style={styles.briefingModal}>
            <View style={styles.briefingHeader}>
              <View style={styles.briefingHeaderSpacer} />
              <Pressable onPress={resetBriefing} style={styles.briefingCloseButton}>
                <Ionicons name="close" size={22} color={Colors.textPrimary} />
              </Pressable>
            </View>

            <View style={styles.briefingBody}>
              {briefingStep === 0 ? (
                <GlassCard style={styles.briefingCard}>
                  <Text style={styles.briefingTitle}>Prognoza meteo</Text>
                  {weatherData ? (
                    <View style={styles.briefingContent}>
                      <WeatherRow
                        icon="thermometer"
                        label="Temperatură"
                        value={
                          weatherData.temperatureC != null
                            ? `${weatherData.temperatureC} C`
                            : "Indisponibil"
                        }
                      />
                      <WeatherRow
                        icon="sunny"
                        label="Conditie"
                        value={weatherData.weatherDescription ?? "Indisponibil"}
                      />
                      <WeatherRow
                        icon="speedometer"
                        label="Viteza vantului"
                        value={
                          weatherData.windspeedKmh != null
                            ? `${weatherData.windspeedKmh} km/h`
                            : "Indisponibil"
                        }
                      />
                      <WeatherRow
                        icon="rainy"
                        label="Precipitatii"
                        value={
                          weatherData.precipitationProbability != null
                            ? `${weatherData.precipitationProbability}%`
                            : "Indisponibil"
                        }
                      />
                    </View>
                  ) : (
                    <Text style={styles.briefingEmptyText}>Vreme indisponibila</Text>
                  )}
                </GlassCard>
              ) : null}

              {briefingStep === 1 ? (
                <GlassCard style={styles.briefingCard}>
                  <Text style={styles.briefingTitle}>Rezumat traseu</Text>
                  <View style={styles.briefingContent}>
                    <Text style={styles.briefingPrimaryText}>
                      {selectedRoute ? sanitizeRouteName(selectedRoute.name) : "Ruta indisponibila"}
                    </Text>
                    <Text style={styles.briefingDetailText}>
                      Distanță:{" "}
                      {selectedRoute ? `${selectedRoute.distanceKm.toFixed(1)} km` : "-"}
                    </Text>
                    <Text style={styles.briefingDetailText}>
                      Castig de altitudine:{" "}
                      {selectedRoute ? `${selectedRoute.elevationGainM} m` : "-"}
                    </Text>
                    {selectedRoute?.maxElevation != null ? (
                      <Text style={styles.briefingDetailText}>
                        Altitudine maxima: {selectedRoute.maxElevation}m
                      </Text>
                    ) : null}
                    <Text style={styles.briefingDetailText}>
                      Dificultate:{" "}
                      {selectedRoute
                        ? formatDificultateLabel(selectedRoute.difficulty)
                        : "-"}
                    </Text>
                    <Text style={styles.briefingDetailText}>
                      Durata estimata:{" "}
                      {riskResult
                        ? `${Math.max(
                            selectedRoute?.estimatedDurationH ?? 0,
                            0
                          ).toFixed(1)} h`
                        : selectedRoute
                          ? `~${selectedRoute.estimatedDurationH.toFixed(1)} h`
                          : "-"}
                    </Text>
                  </View>
                </GlassCard>
              ) : null}

              {briefingStep === 2 ? (
                <GlassCard style={styles.briefingCard}>
                  <Text style={styles.briefingTitle}>Verificare siguranta</Text>
                  <View style={styles.briefingChecklist}>
                    {SAFETY_CHECKLIST_ITEMS.map((item, index) => {
                      const checked = safetyChecklist[index];

                      return (
                        <Pressable
                          key={item}
                          onPress={() =>
                            setSafetyChecklist((current) =>
                              current.map((value, itemIndex) =>
                                itemIndex === index ? !value : value
                              )
                            )
                          }
                          style={styles.checklistItem}
                        >
                          <Ionicons
                            name={checked ? "checkbox-outline" : "square-outline"}
                            size={22}
                            color={checked ? Colors.forest : Colors.textSecondary}
                          />
                          <Text style={styles.checklistLabel}>{item}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </GlassCard>
              ) : null}
            </View>

            <View style={styles.briefingFooter}>
              {briefingStep < 2 ? (
                <GlassButton
                  label="Urmator"
                  onPress={() => setBriefingStep((prev) => prev + 1)}
                  variant="primary"
                  size="lg"
                  style={styles.briefingButton}
                />
              ) : (
                <GlassButton
                  label="Pornește Traseul"
                  onPress={handleCompleteBriefing}
                  variant="primary"
                  size="lg"
                  style={styles.briefingButton}
                />
              )}
            </View>
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: PrecisionColors.background,
  },
  loadingScreen: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: PrecisionColors.background,
  },
  scrollContent: {
    padding: 16,
    paddingTop: 10,
    paddingBottom: 96,
  },
  precisionSingleDay: {
    gap: 24,
  },
  precisionHeroCard: {
    backgroundColor: PrecisionColors.surface,
    padding: 20,
    borderRadius: 12,
    gap: 14,
  },
  riskHeroRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
  },
  precisionScoreBlock: {
    flex: 1,
  },
  riskHeroScore: {
    fontSize: 72,
    lineHeight: 76,
    fontFamily: "JetBrainsMono_600SemiBold",
  },
  riskHeroLevelBlock: {
    alignItems: "flex-end",
    justifyContent: "flex-end",
    paddingBottom: 8,
    gap: 4,
  },
  riskHeroScoreUnit: {
    color: PrecisionColors.textMuted,
    fontSize: 14,
    fontFamily: "JetBrainsMono_600SemiBold",
  },
  riskHeroLevel: {
    fontSize: 18,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  riskHeroBarTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: PrecisionColors.surfaceSubtle,
  },
  riskHeroBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  precisionRiskFooter: {
    minHeight: 18,
    justifyContent: "center",
  },
  riskHeroDelta: {
    fontSize: 12,
    fontFamily: "JetBrainsMono_600SemiBold",
  },
  precisionAnalyzeButton: {
    width: "100%",
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  precisionAnalyzeText: {
    color: Colors.background,
    fontSize: 13,
    fontFamily: "PlusJakartaSans_700Bold",
    letterSpacing: 0.6,
  },
  precisionButtonDisabled: {
    opacity: 0.5,
  },
  precisionButtonPressed: {
    opacity: 0.85,
  },
  highRiskBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: PrecisionColors.amberMuted,
    borderRadius: 12,
    padding: 12,
  },
  highRiskBannerText: {
    flex: 1,
    color: PrecisionColors.amber,
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  precisionSections: {
    gap: 24,
  },
  precisionSectionCard: {
    backgroundColor: PrecisionColors.surface,
    padding: 14,
    borderRadius: 12,
    gap: 12,
  },
  precisionSectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  precisionSectionHeader: {
    fontSize: 12,
    fontFamily: "PlusJakartaSans_600SemiBold",
    color: PrecisionColors.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  precisionIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PrecisionColors.elevated,
  },
  precisionRouteName: {
    color: PrecisionColors.textPrimary,
    fontSize: 20,
    lineHeight: 26,
    fontFamily: "PlusJakartaSans_700Bold",
  },
  precisionRouteRegion: {
    color: PrecisionColors.textSecondary,
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  precisionDetailsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  precisionDetailItem: {
    minWidth: "47%",
    flex: 1,
    backgroundColor: PrecisionColors.elevated,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  precisionDetailLabel: {
    color: PrecisionColors.textMuted,
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  precisionDetailValue: {
    color: PrecisionColors.textPrimary,
    fontSize: 15,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  precisionNumericValue: {
    color: PrecisionColors.textPrimary,
    fontSize: 15,
    fontFamily: "JetBrainsMono_600SemiBold",
  },
  precisionMapWrap: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: PrecisionColors.elevated,
  },
  precisionMap: {
    height: 130,
  },
  precisionActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  precisionSecondaryButton: {
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: PrecisionColors.elevated,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  precisionSecondaryButtonText: {
    color: PrecisionColors.accent,
    fontSize: 13,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  precisionWeatherGrid: {
    flexDirection: "row",
    gap: 8,
  },
  precisionWeatherItem: {
    flex: 1,
    backgroundColor: PrecisionColors.elevated,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  precisionWeatherValue: {
    color: PrecisionColors.textPrimary,
    fontSize: 14,
    fontFamily: "JetBrainsMono_600SemiBold",
  },
  precisionWeatherSummary: {
    color: PrecisionColors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  precisionInputGrid: {
    flexDirection: "row",
    gap: 10,
  },
  precisionInputGroup: {
    flex: 1,
    gap: 6,
  },
  precisionInputLabel: {
    color: PrecisionColors.textMuted,
    fontSize: 11,
    fontFamily: "PlusJakartaSans_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  precisionInput: {
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: PrecisionColors.elevated,
    color: PrecisionColors.textPrimary,
    fontSize: 14,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  precisionMonoInput: {
    fontFamily: "JetBrainsMono_400Regular",
  },
  precisionPersonalRow: {
    flexDirection: "row",
    gap: 10,
  },
  precisionPersonalText: {
    flex: 1,
    backgroundColor: PrecisionColors.elevated,
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  precisionStepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  precisionStepperHint: {
    color: PrecisionColors.textSecondary,
    fontSize: 14,
    fontFamily: "JetBrainsMono_400Regular",
  },
  precisionStepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: PrecisionColors.elevated,
    borderRadius: 12,
    padding: 4,
  },
  precisionStepperButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: PrecisionColors.surface,
  },
  precisionStepperInput: {
    width: 64,
    minHeight: 38,
    textAlign: "center",
    color: PrecisionColors.textPrimary,
    fontSize: 16,
    fontFamily: "JetBrainsMono_600SemiBold",
  },
  precisionSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  precisionSwitchText: {
    flex: 1,
    color: PrecisionColors.textSecondary,
    fontSize: 13,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  precisionLearnedText: {
    color: PrecisionColors.textSecondary,
    fontSize: 12,
    fontFamily: "PlusJakartaSans_400Regular",
  },
  precisionInlineNumber: {
    color: PrecisionColors.textPrimary,
    fontFamily: "JetBrainsMono_600SemiBold",
  },
  modeToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  modeToggleLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  modeToggleText: {
    fontSize: Typography.size.sm,
    color: PrecisionColors.textPrimary,
    fontFamily: "PlusJakartaSans_600SemiBold",
  },
  bottomCTA: {
    paddingHorizontal: 24,
    paddingTop: 6,
    backgroundColor: PrecisionColors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: PrecisionColors.elevated,
  },
  ctaButton: {
    borderRadius: BorderRadius.lg,
  },
  precisionStartButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: PrecisionColors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  precisionStartButtonText: {
    color: PrecisionColors.background,
    fontSize: 16,
    fontFamily: "PlusJakartaSans_700Bold",
    letterSpacing: 0.8,
  },
  startCtaWrap: {
    gap: Spacing.xs,
  },
  highRiskStartButton: {
    backgroundColor: "#F57C00",
    borderColor: "#F57C00",
  },
  highRiskStartButtonLabel: {
    color: Colors.textOnDark,
  },
  startWarningText: {
    color: Colors.warning,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.medium,
  },
  routeCardContent: {
    gap: Spacing.md,
  },
  routeHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  routeHeaderText: {
    flex: 1,
    gap: Spacing.xs,
  },
  routeSaveButton: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(Colors.forestMuted, "18"),
  },
  routeName: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  routeRegion: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  routeStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: Spacing.md,
  },
  routeStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  routeStatText: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    fontFamily: "JetBrainsMono_400Regular",
  },
  difficultyPill: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 5,
    alignSelf: "flex-start",
  },
  difficultyPillText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
  },
  mapPreviewWrap: {
    borderRadius: BorderRadius.lg,
    overflow: "hidden",
  },
  mapPreview: {
    height: 168,
  },
  routeActionButton: {
    alignSelf: "flex-start",
    borderRadius: BorderRadius.full,
  },
  itineraryCard: {
    padding: Spacing.base,
    gap: Spacing.md,
  },
  itineraryTitle: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  tripDayCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: withAlpha(Colors.surface, "EE"),
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  tripDayHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  tripDayLabel: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.weight.semibold,
  },
  tripDayRemoveButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.dangerLight,
  },
  tripDayRouteName: {
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
    fontWeight: Typography.weight.semibold,
  },
  tripDayStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  tripDayEmptySlot: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.glassBorderDark,
    borderStyle: "dashed",
    backgroundColor: withAlpha(Colors.mist, "CC"),
  },
  tripDayEmptyIconWrap: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(Colors.forestMuted, "22"),
  },
  tripDayEmptyTextWrap: {
    gap: 2,
  },
  tripDayEmptyText: {
    fontSize: Typography.size.md,
    color: Colors.textPrimary,
    fontWeight: Typography.weight.medium,
  },
  tripLoading: {
    marginTop: Spacing.xs,
  },
  tripSummaryCard: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: withAlpha(Colors.alpineLight, "12"),
    borderWidth: 1,
    borderColor: withAlpha(Colors.alpineLight, "24"),
    gap: Spacing.sm,
  },
  tripSummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  tripSummaryTitle: {
    fontSize: Typography.size.md,
    color: Colors.textPrimary,
    fontWeight: Typography.weight.bold,
  },
  tripSummaryStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  campingNoteRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: withAlpha(Colors.warning, "12"),
    borderWidth: 1,
    borderColor: withAlpha(Colors.warning, "26"),
  },
  campingNoteText: {
    flex: 1,
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  tripPlanButton: {
    borderRadius: BorderRadius.lg,
  },
  briefingModal: {
    flex: 1,
    backgroundColor: Colors.stone,
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.base,
  },
  briefingHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: Spacing.base,
    paddingBottom: Spacing.sm,
  },
  briefingHeaderSpacer: {
    flex: 1,
  },
  briefingCloseButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(Colors.surface, "EE"),
    borderWidth: 1,
    borderColor: Colors.border,
  },
  briefingBody: {
    flex: 1,
    justifyContent: "center",
  },
  briefingCard: {
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  briefingTitle: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  briefingContent: {
    gap: Spacing.sm,
  },
  briefingEmptyText: {
    color: Colors.textSecondary,
    fontSize: Typography.size.md,
  },
  briefingPrimaryText: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    color: Colors.textPrimary,
  },
  briefingDetailText: {
    color: Colors.textPrimary,
    fontSize: Typography.size.md,
    lineHeight: 22,
  },
  briefingChecklist: {
    gap: Spacing.sm,
  },
  checklistItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  checklistLabel: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.size.md,
    lineHeight: 22,
  },
  briefingFooter: {
    paddingTop: Spacing.md,
  },
  briefingButton: {
    borderRadius: BorderRadius.lg,
  },
  emptyRouteState: {
    gap: Spacing.md,
    alignItems: "center",
  },
  emptyRouteText: {
    color: Colors.textSecondary,
    fontSize: Typography.size.md,
  },
  sectionTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    color: Colors.textPrimary,
    marginBottom: Spacing.sm,
  },
  inputLabel: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
    fontWeight: Typography.weight.semibold,
  },
  spacedInputLabel: {
    marginTop: Spacing.sm + 2,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.glassBorderDark,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.mist,
    fontSize: Typography.size.md,
    color: Colors.textPrimary,
  },
  capabilityCard: {
    padding: Spacing.base,
  },
  capabilityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.sm,
  },
  capabilityTitle: {
    fontSize: Typography.size.lg,
    color: Colors.alpine,
    fontWeight: Typography.weight.bold,
  },
  capabilityBadge: {
    alignSelf: "flex-start",
    backgroundColor: Colors.alpineLight,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 4,
    marginBottom: Spacing.sm,
  },
  capabilityBadgeText: {
    color: Colors.textOnDark,
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
    textTransform: "capitalize",
  },
  capabilityRow: {
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  capabilityStrong: {
    fontWeight: Typography.weight.semibold,
  },
  learnedBlock: {
    marginTop: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.glassBorder,
    gap: 4,
  },
  learnedTitle: {
    fontSize: Typography.size.xs,
    color: Colors.alpineLight,
    fontWeight: Typography.weight.semibold,
    marginBottom: 2,
  },
  riskCard: {
    gap: Spacing.base,
  },
  riskGaugeWrap: {
    alignItems: "center",
  },
  riskSummary: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  betterTimeCard: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  betterTimeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  betterTimeTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.accent,
  },
  betterTimeContent: {
    gap: Spacing.sm,
  },
  betterTimeBest: {
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
    lineHeight: 20,
    fontWeight: Typography.weight.semibold,
  },
  betterTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.glassBorder,
  },
  betterTimeRowTime: {
    width: 64,
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
  },
  betterTimeScoreBadge: {
    minWidth: 42,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    alignItems: "center",
  },
  betterTimeScoreText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.bold,
  },
  betterTimeRowSummary: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: Typography.size.sm,
    lineHeight: 18,
  },
  betterTimeEmpty: {
    color: Colors.textSecondary,
    fontSize: Typography.size.sm,
  },
  limitedDataCard: {
    padding: Spacing.md,
    gap: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    backgroundColor: withAlpha(Colors.warning, "12"),
  },
  limitedDataText: {
    flex: 1,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  confidenceTextBlock: {
    flex: 1,
    gap: 2,
  },
  confidenceMissingText: {
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  confidenceInfoButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: withAlpha(Colors.warning, "18"),
  },
  confidenceModalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.lg,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  confidenceModalCard: {
    width: "100%",
    maxWidth: 360,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    gap: Spacing.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  confidenceModalTitle: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  confidenceModalBody: {
    fontSize: Typography.size.md,
    lineHeight: 22,
    color: Colors.textSecondary,
  },
  confidenceModalCloseButton: {
    alignSelf: "flex-end",
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.accent,
  },
  confidenceModalCloseText: {
    color: Colors.background,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
  riskScoreValue: {
    fontSize: Typography.size["4xl"],
    fontWeight: Typography.weight.bold,
    lineHeight: 40,
  },
  sunsetNotice: {
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
    backgroundColor: withAlpha(Colors.warning, "12"),
  },
  sunsetNoticeText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.medium,
  },
  sectionBlock: {
    gap: Spacing.sm,
  },
  factorCard: {
    padding: Spacing.md,
    borderLeftWidth: 3,
  },
  factorInnerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
  },
  factorTextWrap: {
    flex: 1,
    gap: 4,
  },
  factorText: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
    lineHeight: 20,
  },
  factorSuggestion: {
    color: Colors.textSecondary,
    fontSize: Typography.size.xs,
    lineHeight: 17,
  },
  factorToggle: {
    alignSelf: "flex-start",
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.sm,
  },
  factorToggleText: {
    color: Colors.accent,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.semibold,
  },
  counterfactualsTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    color: Colors.accent,
  },
  counterfactualCard: {
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  synergyTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.semibold,
    color: Colors.warning,
  },
  synergyCard: {
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  synergyIcon: {
    fontSize: Typography.size.md,
    lineHeight: 20,
  },
  weatherCard: {
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  weatherRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  weatherLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    flex: 1,
  },
  weatherLabel: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  weatherValue: {
    fontSize: Typography.size.sm,
    color: Colors.textPrimary,
    fontFamily: "JetBrainsMono_600SemiBold",
  },
  alternativesTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
  },
  emptyAlternatives: {
    color: Colors.textSecondary,
    fontSize: Typography.size.sm,
  },
  alternativeCard: {
    flexDirection: "row",
    alignItems: "stretch",
    padding: Spacing.md,
  },
  alternativeAccent: {
    width: 4,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.md,
  },
  alternativeContent: {
    flex: 1,
    gap: Spacing.xs,
  },
  alternativeName: {
    fontSize: Typography.size.md,
    color: Colors.textPrimary,
    fontWeight: Typography.weight.semibold,
  },
  alternativeRegion: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  alternativeMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  alternativeMetaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  alternativeMeta: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  subScoresSection: { marginVertical: 12, gap: 6 },
  subScoresTitle: { fontSize: Typography.size.xs, color: Colors.textSecondary, marginBottom: 4 },
  subScoreRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  subScoreLabel: { fontSize: Typography.size.xs, color: Colors.textSecondary, width: 72 },
  subScoreBarTrack: { flex: 1, height: 6, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 3, overflow: "hidden" },
  subScoreBarFill: { height: 6, borderRadius: 3 },
  subScoreValue: { fontSize: Typography.size.xs, color: Colors.textSecondary, width: 28, textAlign: "right", fontFamily: "JetBrainsMono_400Regular" },
  scoreDeltaBadge: { fontSize: Typography.size.xs, fontFamily: "JetBrainsMono_600SemiBold", marginLeft: 8 },
  trailConditionChip: { padding: Spacing.sm, gap: 4 },
  trailConditionText: { fontSize: Typography.size.xs, color: Colors.textSecondary, flex: 1, marginLeft: 4 },
  trailConditionNote: { fontSize: Typography.size.xs, color: Colors.textTertiary, lineHeight: 17 },
});
