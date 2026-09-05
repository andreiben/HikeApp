import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Ionicons } from "@expo/vector-icons";
import HartăView, { Marker, Polyline } from "react-native-maps";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MainStackParamList } from "../navigation";
import ElevationProfile from "../components/ElevationProfile";
import {
  GlassButton,
  GlassCard,
  RiskBadge,
  SkeletonLoader,
  type RiskLevel,
} from "../components/ui";
import {
  BorderRadius,
  Colors,
  Spacing,
  Typography,
} from "../theme";
import { api } from "../services/api";
import { getAccessToken } from "../services/authStorage";
import { showError, showSuccess } from "../services/toast";

function sanitizeTraseuName(name: string | null | undefined): string {
  if (!name) return "Traseu fără nume";

  return name
    .replaceAll("Ã¢â‚¬Â¢", "â€¢")
    .replaceAll("Ã¢â‚¬â€œ", "â€“")
    .replaceAll("Ã¢â‚¬â„¢", "'")
    .replaceAll("•", " - ")
    .replaceAll("·", " - ")
    .replace(/^[([]+/, "")
    .replace(/[)\]]+$/, "")
    .trim();
}
type Props = NativeStackScreenProps<MainStackParamList, "HikeDetails">;

type Hike = {
  id: string;
  routeId: string | null;
  routeName: string | null;
  status: string;
  startedAt: string;
  endedAt: string | null;
  durationS: number | null;
  movingTimeS: number | null;
  distanceM: number | null;
  elevationGainM: number | null;
  elevationLossM: number | null;
  avgSpeedKmh: number | null;
  avgPaceMinKm: number | null;
  minAltitudeM: number | null;
  maxAltitudeM: number | null;
  weightKg?: number | null;
  backpackWeightKg: number | null;
  riskScoreAtStart?: number | null;
  completionScore?: number | null;
  weatherSnapshotStart?: Record<string, unknown> | null;
  offTrailSeconds?: number | null;
  userDificilyRating?: number | null;
  notes?: string | null;
};

type HikePoint = {
  id: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  recordedAt: string;
};

type StatItem = {
  key: string;
  label: string;
  value: string;
  unit: string;
};

type TrailCondition = "dry" | "muddy" | "snowy" | "overgrown" | "blocked";

const EMPTY_VALUE = "—";

const STATUS_LABELS: Record<string, string> = {
  completed: "finalizat",
  partial: "parțial",
  active: "activ",
  paused: "în pauză",
};

const TRAIL_CONDITION_OPTIONS: Array<{
  value: TrailCondition;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  color: string;
}> = [
  { value: "dry", label: "Uscat", icon: "sunny-outline", color: "#4CAF50" },
  { value: "muddy", label: "Noroios", icon: "water-outline", color: "#FF9800" },
  { value: "snowy", label: "Înzăpezit", icon: "snow-outline", color: "#2196F3" },
  {
    value: "overgrown",
    label: "Năpădit",
    icon: "leaf-outline",
    color: "#FFC107",
  },
  {
    value: "blocked",
    label: "Blocat",
    icon: "close-circle-outline",
    color: "#F44336",
  },
];

function formatDate(value: string | null | undefined) {
  if (!value) return EMPTY_VALUE;
  const d = new Date(value);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatDistanțăValue(distanceM: number | null) {
  if (distanceM == null) return EMPTY_VALUE;
  return (distanceM / 1000).toFixed(2);
}

function formatDuratăValue(durationS: number | null) {
  if (durationS == null) return EMPTY_VALUE;
  const hours = Math.floor(durationS / 3600);
  const minutes = Math.floor((durationS % 3600) / 60);
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

function formatNumber(value: number | null, decimals = 2) {
  if (value == null) return EMPTY_VALUE;
  return value.toFixed(decimals);
}

function formatMeters(value: number | null) {
  if (value == null) return EMPTY_VALUE;
  return `${Math.round(value)}`;
}

function formatPaceValue(value: number | null) {
  if (value == null || value <= 0 || !Number.isFinite(value)) return EMPTY_VALUE;
  const totalSeconds = Math.round(value * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function calculateAveragePaceMinKm(durationS: number | null, distanceM: number | null) {
  if (durationS == null || distanceM == null || durationS <= 0 || distanceM <= 0) {
    return null;
  }

  return durationS / 60 / (distanceM / 1000);
}

const WMO_LABELS: Record<number, string> = { 0: "Cer senin", 1: "Predominant senin", 2: "Parțial noros", 3: "Acoperit", 45: "Ceață", 48: "Ceață cu chiciură", 51: "Burniță ușoară", 53: "Burniță", 55: "Burniță abundentă", 61: "Ploaie ușoară", 63: "Ploaie", 65: "Ploaie puternică", 71: "Ninsoare ușoară", 73: "Ninsoare", 75: "Ninsoare puternică", 77: "Boabe de zăpadă", 80: "Averse ușoare", 81: "Averse", 82: "Averse puternice", 85: "Averse de ninsoare", 86: "Averse puternice de ninsoare", 95: "Furtună cu tunete", 96: "Furtună cu grindină", 99: "Furtună puternică" };

function formatWeatherSnapshot(value: Record<string, unknown> | null | undefined) {
  if (!value) return null;

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  let condition: string | null =
    typeof value.description === "string" && value.description.trim()
      ? value.description.trim()
      : null;
  const code = num(value.weatherCode);
  if (!condition && code !== null) {
    condition = WMO_LABELS[code] ?? `Code ${code}`;
  }

  const parts: string[] = [];
  if (condition) parts.push(condition);

  const temp = num(value.tempC);
  if (temp !== null) parts.push(`${Math.round(temp)}C`);

  const feelsLike = num(value.feelsLikeC);
  if (feelsLike !== null) parts.push(`Simțit ca ${Math.round(feelsLike)}C`);

  const wind = num(value.windKmh);
  if (wind !== null) parts.push(`Vânt ${Math.round(wind)} km/h`);

  const humidity = num(value.humidityPct);
  if (humidity !== null) parts.push(`Umiditate ${Math.round(humidity)}%`);

  const precip = num(value.precipitationMm);
  if (precip !== null && precip > 0) parts.push(`precip. ${precip.toFixed(1)} mm`);

  return parts.length > 0 ? parts.join(" | ") : null;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function extractProfileWeightKg(value: unknown) {
  if (!value || typeof value !== "object" || !("profile" in value)) {
    return null;
  }

  const profile = value.profile;
  if (!profile || typeof profile !== "object" || !("weightKg" in profile)) {
    return null;
  }

  return typeof profile.weightKg === "number" && Number.isFinite(profile.weightKg)
    ? profile.weightKg
    : null;
}

function calculateCalorii({
  distanceM,
  weightKg,
}: {
  distanceM: number | null;
  weightKg: number | null;
}) {
  if (distanceM == null || weightKg == null || distanceM <= 0 || weightKg <= 0) {
    return null;
  }

  const distanceKm = distanceM / 1000;
  const totalCalorii = Math.round(distanceKm * weightKg * 0.9);

  return totalCalorii > 0 ? totalCalorii : null;
}

function getRiskLevel(score: number): RiskLevel {
  if (score < 25) return "Low";
  if (score < 50) return "Moderate";
  if (score < 75) return "High";
  return "Very High";
}

function LoadingState() {
  return (
    <View style={styles.loadingContainer}>
      <SkeletonLoader
        height={260}
        borderRadius={BorderRadius.xl}
        style={styles.loadingHartă}
      />
      <View style={styles.statsGrid}>
        {Array.from({ length: 6 }).map((_, index) => (
          <SkeletonLoader
            key={index}
            height={80}
            borderRadius={BorderRadius.xl}
            style={styles.loadingStatCard}
          />
        ))}
      </View>
    </View>
  );
}

export default function HikeDetailsScreen({ route }: Props) {
  const { hikeId } = route.params;

  const [hike, setHike] = useState<Hike | null>(null);
  const [points, setPoints] = useState<HikePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingNotițe, setIsEditingNotițe] = useState(false);
  const [notesDraft, setNotițeDraft] = useState("");
  const [isSavingNotițe, setIsSavingNotițe] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState<TrailCondition | null>(
    null
  );
  const [conditionNotițe, setConditionNotițe] = useState("");
  const [isTrimitetingCondition, setIsTrimitetingCondition] = useState(false);
  const [profileWeightKg, setProfileWeightKg] = useState<number | null>(null);

  useEffect(() => {
    const loadDetails = async () => {
      try {
        const token = await getAccessToken();

        if (!token) return;

        const [hikeResponse, pointsResponse, profileResponse] = await Promise.all([
          api.get(`/hikes/${hikeId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          api.get(`/hikes/${hikeId}/points`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          api
            .get("/profile/me", {
              headers: { Authorization: `Bearer ${token}` },
            })
            .catch(() => null),
        ]);

        setHike(hikeResponse.data.hike);
        setPoints(pointsResponse.data.points);
        setProfileWeightKg(extractProfileWeightKg(profileResponse?.data));

        if (hikeResponse.data.hike.routeId) {
          const conditionResponse = await api.get(
            `/routes/${hikeResponse.data.hike.routeId}/conditions/mine`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          if (conditionResponse.data?.condition) {
            setSelectedCondition(conditionResponse.data.condition as TrailCondition);
            setConditionNotițe(conditionResponse.data.notes ?? "");
          }
        }
      } catch (error) {
        // error handled Ã¢â‚¬â€ user sees empty state
      } finally {
        setIsLoading(false);
      }
    };

    void loadDetails();
  }, [hikeId]);

  useEffect(() => {
    if (!isEditingNotițe) {
      setNotițeDraft(hike?.notes ?? "");
    }
  }, [hike?.notes, isEditingNotițe]);

  const coordinates = points.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));

  const mapRegion = useMemo(() => {
    if (coordinates.length > 0) {
      return {
        latitude: coordinates[0].latitude,
        longitude: coordinates[0].longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
    }

    return {
      latitude: 45.6525,
      longitude: 25.6106,
      latitudeDelta: 0.2,
      longitudeDelta: 0.2,
    };
  }, [coordinates]);

  const startPoint = coordinates[0];
  const endPoint = coordinates[coordinates.length - 1];

  const weightKg = hike?.weightKg ?? profileWeightKg;
  const calories = calculateCalorii({
    distanceM: hike?.distanceM ?? null,
    weightKg,
  });
  const weatherAtStart = formatWeatherSnapshot(hike?.weatherSnapshotStart);

  const stats = useMemo<StatItem[]>(() => {
    return [
      {
        key: "distance",
        label: "Distanță",
        value: formatDistanțăValue(hike?.distanceM ?? null),
        unit: "km",
      },
      {
        key: "duration",
        label: "Durată",
        value: formatDuratăValue(hike?.durationS ?? null),
        unit: "h:mm",
      },
      {
        key: "elevation-gain",
        label: "Diferență de Nivel",
        value: formatMeters(hike?.elevationGainM ?? null),
        unit: "m",
      },
      {
        key: "avg-pace",
        label: "Ritm Mediu",
        value: formatPaceValue(
          calculateAveragePaceMinKm(hike?.durationS ?? null, hike?.distanceM ?? null)
        ),
        unit: "min/km",
      },
      {
        key: "max-altitude",
        label: "Altitudine Max",
        value: formatMeters(hike?.maxAltitudeM ?? null),
        unit: "m",
      },
      {
        key: "calories",
        label: "Calorii arse",
        value: calories != null ? `${calories}` : EMPTY_VALUE,
        unit: "kcal",
      },
    ];
  }, [calories, hike]);

  const handleShare = async () => {
    const shareTitle = hike?.routeName ?? "Traseu";
    const shareMessage = [
      `${shareTitle}`,
      `Data: ${formatDate(hike?.startedAt)}`,
      `Distanță: ${formatDistanțăValue(hike?.distanceM ?? null)} km`,
      `Durată: ${formatDuratăValue(hike?.durationS ?? null)}`,
      `Castig altitudine: ${formatMeters(hike?.elevationGainM ?? null)} m`,
      calories != null ? `Calorii: ${calories} kcal` : null,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await Share.share({
        title: shareTitle,
        message: shareMessage,
      });
    } catch (error) {
      // share failed silently Ã¢â‚¬â€ sharing is non-critical
    }
  };

  const handleExportGPX = async () => {
    try {
      const trackName = escapeXml(hike?.routeName ?? "Traseu");
      const startedAt = hike?.startedAt ? `<time>${hike.startedAt}</time>` : "";
      const endedAt = hike?.endedAt ? `<time>${hike.endedAt}</time>` : "";
      const trackPoints = points
        .map((point) => {
          const elevation =
            point.altitude != null ? `<ele>${point.altitude}</ele>` : "";
          const recordedAt = point.recordedAt
            ? `<time>${point.recordedAt}</time>`
            : "";

          return `<trkpt lat="${point.latitude}" lon="${point.longitude}">${elevation}${recordedAt}</trkpt>`;
        })
        .join("");

      const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="HikeApp" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${trackName}</name>
    ${startedAt}
  </metadata>
  <trk>
    <name>${trackName}</name>
    ${endedAt}
    <trkseg>${trackPoints}</trkseg>
  </trk>
</gpx>`;
      const filePath = `${FileSystem.cacheDirectory}hike.gpx`;

      await FileSystem.writeAsStringAsync(filePath, gpx, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      await Sharing.shareAsync(filePath);
    } catch (error) {
      // export failed silently Ã¢â‚¬â€ sharing is non-critical
    }
  };

  const handleStartNotițeEdit = () => {
    setNotițeDraft(hike?.notes ?? "");
    setIsEditingNotițe(true);
  };

  const handleAnuleazăNotițeEdit = () => {
    setNotițeDraft(hike?.notes ?? "");
    setIsEditingNotițe(false);
  };

  const handleSaveNotițe = async () => {
    if (!hike || isSavingNotițe) {
      return;
    }

    try {
      setIsSavingNotițe(true);
      const token = await getAccessToken();

      if (!token) {
        return;
      }

      const response = await api.patch(
        `/hikes/${hike.id}`,
        { notes: notesDraft },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      setHike(response.data.hike);
      setIsEditingNotițe(false);
    } catch (error) {
      showError("Eroare", "Nu s-au putut salva notițele. Încearcă din nou.");
    } finally {
      setIsSavingNotițe(false);
    }
  };

  const handleTrimiteCondition = async () => {
    if (!hike?.routeId || !selectedCondition || isTrimitetingCondition) {
      return;
    }

    try {
      setIsTrimitetingCondition(true);
      const token = await getAccessToken();

      if (!token) {
        showError("Autentificare necesară", "Trebuie să te autentifici pentru a raporta condiția traseului.");
        return;
      }

      await api.post(
        `/routes/${hike.routeId}/conditions`,
        {
          condition: selectedCondition,
          notes: conditionNotițe.trim() || undefined,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      showSuccess("Raport trimis", "Condiția traseului a fost salvată cu succes.");
    } catch (error) {
      console.error("Condition submit error:", error);
      showError(
        "Eroare",
        "Nu s-a putut trimite raportul. Încearcă din nou."
      );
    } finally {
      setIsTrimitetingCondition(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {isLoading ? (
          <LoadingState />
        ) : (
          <>
            <View style={styles.titleBlock}>
              <Text style={styles.screenTitle}>
                {hike?.routeName ? sanitizeTraseuName(hike.routeName) : "Traseu necunoscut"}
              </Text>
              <Text style={styles.screenSubtitle}>
                Status: {hike?.status ? (STATUS_LABELS[hike.status] ?? hike.status) : EMPTY_VALUE}
              </Text>
            </View>

            <View style={styles.statsGrid}>
              {stats.map((stat) => (
                <View key={stat.key} style={styles.statCard}>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statUnit}>{stat.unit}</Text>
                </View>
              ))}
            </View>

            <View style={styles.routeSection}>
              <Text style={styles.sectionTitle}>Rută</Text>
              <View style={styles.mapContainer}>
                <HartăView style={styles.map} initialRegion={mapRegion} region={mapRegion}>
                  {coordinates.length > 1 ? (
                    <Polyline
                      coordinates={coordinates}
                      strokeWidth={4}
                      strokeColor={Colors.accent}
                    />
                  ) : null}
                  {startPoint ? <Marker coordinate={startPoint} title="Start" /> : null}
                  {endPoint && endPoint !== startPoint ? (
                    <Marker coordinate={endPoint} title="Sosire" />
                  ) : null}
                </HartăView>

                <BlurView intensity={40} tint="dark" style={styles.mapOverlay}>
                  <View style={styles.mapOverlayHeader}>
                    <View style={styles.mapOverlayTextBlock}>
                      <Text style={styles.mapOverlayTitle}>
                        {hike?.routeName ? sanitizeTraseuName(hike.routeName) : "Traseu necunoscut"}
                      </Text>
                      <Text style={styles.mapOverlayDate}>
                        {formatDate(hike?.startedAt)}
                      </Text>
                    </View>
                    {hike?.riskScoreAtStart != null ? (
                      <View style={styles.riskBlock}>
                        <Text style={styles.riskLabel}>Risk at start</Text>
                        <RiskBadge
                          level={getRiskLevel(hike.riskScoreAtStart)}
                          score={Math.round(hike.riskScoreAtStart)}
                        />
                      </View>
                    ) : null}
                  </View>
                </BlurView>
              </View>
            </View>

            {points.some((point) => point.altitude != null) ? (
              <GlassCard style={styles.elevationCard}>
                <Text style={styles.sectionTitle}>Profil de altitudine</Text>
                <ElevationProfile points={points} />
                <View style={styles.elevationMetaRow}>
                  <Text style={styles.elevationMetaText}>
                    Min:{" "}
                    {Math.round(
                      Math.min(
                        ...points
                          .filter((point) => point.altitude != null)
                          .map((point) => point.altitude as number)
                      )
                    )}{" "}
                    m
                  </Text>
                  <Text style={styles.elevationMetaText}>
                    Max:{" "}
                    {Math.round(
                      Math.max(
                        ...points
                          .filter((point) => point.altitude != null)
                          .map((point) => point.altitude as number)
                      )
                    )}{" "}
                    m
                  </Text>
                </View>
              </GlassCard>
            ) : null}

            <GlassCard style={styles.detailCard}>
              <Text style={styles.detailText}>
                Altitudine min/max: {formatNumber(hike?.minAltitudeM ?? null)} /{" "}
                {formatNumber(hike?.maxAltitudeM ?? null)} m
              </Text>
              <Text style={styles.detailText}>Puncte înregistrate: {points.length}</Text>
            </GlassCard>

            <View style={styles.actionRow}>
              <GlassButton
                label="Distribuie traseul"
                onPress={handleShare}
                variant="secondary"
                size="sm"
                style={styles.actionButton}
                labelStyle={styles.actionButtonLabel}
              />
              <GlassButton
                label="Export GPX"
                onPress={handleExportGPX}
                variant="secondary"
                size="sm"
                style={styles.actionButton}
                labelStyle={styles.actionButtonLabel}
              />
            </View>

            {weatherAtStart ? (
              <View style={styles.weatherSection}>
                <Text style={styles.sectionTitle}>Vreme</Text>
                <View style={styles.weatherCard}>
                  <Text style={styles.weatherText}>{weatherAtStart}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.notesSection}>
              <Text style={styles.sectionTitle}>Notițe</Text>
              {isEditingNotițe ? (
                <GlassCard style={styles.notesEditorCard}>
                  <TextInput
                    value={notesDraft}
                    onChangeText={setNotițeDraft}
                    placeholder="Adaugă notițe despre traseu..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    maxLength={2000}
                    textAlignVertical="top"
                    style={styles.notesInput}
                  />
                  <Text style={styles.notesCounter}>{notesDraft.length}/2000</Text>
                  <View style={styles.notesActionRow}>
                    <GlassButton
                      label="Anulează"
                      onPress={handleAnuleazăNotițeEdit}
                      variant="ghost"
                      size="sm"
                      style={styles.notesActionButton}
                      labelStyle={styles.actionButtonLabel}
                    />
                    <GlassButton
                      label={isSavingNotițe ? "Se salvează..." : "Salvează"}
                      onPress={handleSaveNotițe}
                      variant="secondary"
                      size="sm"
                      disabled={isSavingNotițe}
                      style={styles.notesActionButton}
                      labelStyle={styles.actionButtonLabel}
                    />
                  </View>
                </GlassCard>
              ) : hike?.notes ? (
                <GlassCard style={styles.notesCard}>
                  <View style={styles.notesHeader}>
                    <Text style={styles.notesLabel}>Jurnal de traseu</Text>
                    <Pressable
                      onPress={handleStartNotițeEdit}
                      style={styles.notesEditButton}
                      hitSlop={10}
                    >
                      <Ionicons name="pencil" size={18} color={Colors.accent} />
                    </Pressable>
                  </View>
                  <Text style={styles.notesText}>{hike.notes}</Text>
                </GlassCard>
              ) : (
                <GlassButton
                  label="Adaugă o notiță..."
                  onPress={handleStartNotițeEdit}
                  variant="ghost"
                  size="sm"
                  style={styles.addNoteButton}
                  labelStyle={styles.actionButtonLabel}
                />
              )}
            </View>

            {hike?.routeId ? (
              <View style={styles.conditionSection}>
                <Text style={styles.sectionTitle}>Raportează condiția traseului</Text>
                <View style={styles.conditionChipsRow}>
                  {TRAIL_CONDITION_OPTIONS.map((option) => {
                    const isSelected = selectedCondition === option.value;

                    return (
                      <TouchableOpacity
                        key={option.value}
                        activeOpacity={0.9}
                        onPress={() => setSelectedCondition(option.value)}
                        style={[
                          styles.conditionOptionChip,
                          isSelected
                            ? {
                                backgroundColor: option.color,
                                borderColor: option.color,
                              }
                            : styles.conditionOptionChipInactive,
                        ]}
                      >
                        <Ionicons
                          name={option.icon}
                          size={16}
                          color={isSelected ? Colors.textOnDark : option.color}
                        />
                        <Text
                          style={[
                            styles.conditionOptionChipText,
                            { color: isSelected ? Colors.textOnDark : option.color },
                          ]}
                        >
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <GlassCard style={styles.conditionCard}>
                  <TextInput
                    value={conditionNotițe}
                    onChangeText={setConditionNotițe}
                    placeholder="Adaugă notițe (opțional)"
                    placeholderTextColor={Colors.textTertiary}
                    multiline
                    textAlignVertical="top"
                    style={styles.conditionInput}
                  />
                  <GlassButton
                    label={isTrimitetingCondition ? "Se trimite..." : "Trimite raportul"}
                    onPress={handleTrimiteCondition}
                    variant="secondary"
                    size="sm"
                    disabled={!selectedCondition || isTrimitetingCondition}
                    style={styles.conditionTrimiteButton}
                    labelStyle={styles.actionButtonLabel}
                  />
                </GlassCard>
              </View>
            ) : (
              <View style={styles.conditionInfoBanner}>
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={Colors.textSecondary}
                />
                <Text style={styles.conditionInfoText}>
                  Rapoartele de condiție sunt disponibile doar pentru trasee planificate.
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  contentContainer: {
    paddingBottom: Spacing["4xl"],
    gap: Spacing.base,
  },
  loadingContainer: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    gap: Spacing.base,
  },
  loadingHartă: {
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  loadingStatCard: {
    width: "48%",
  },
  titleBlock: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
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
  routeSection: {
    marginHorizontal: Spacing.base,
    gap: Spacing.sm,
  },
  mapContainer: {
    height: 240,
    overflow: "hidden",
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  map: {
    flex: 1,
  },
  mapOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.14)",
  },
  mapOverlayHeader: {
    gap: Spacing.sm,
  },
  mapOverlayTextBlock: {
    gap: 2,
  },
  mapOverlayTitle: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.fontBold,
    fontWeight: Typography.weight.bold,
    color: Colors.textOnDark,
  },
  mapOverlayDate: {
    fontSize: Typography.size.sm,
    color: "rgba(255,255,255,0.78)",
  },
  riskBlock: {
    alignSelf: "flex-start",
    gap: 6,
  },
  riskLabel: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontSemibold,
    fontWeight: Typography.weight.semibold,
    color: "rgba(255,255,255,0.78)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: Spacing.sm,
    padding: Spacing.base,
    marginHorizontal: Spacing.base,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statCard: {
    width: "48%",
    minHeight: 94,
    justifyContent: "flex-start",
    gap: 5,
  },
  statValue: {
    fontSize: Typography.size["2xl"],
    fontFamily: Typography.fontMonoBold,
    fontWeight: Typography.weight.semibold,
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontSemibold,
    fontWeight: Typography.weight.semibold,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  statUnit: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontRegular,
    color: Colors.textSecondary,
  },
  elevationCard: {
    marginHorizontal: Spacing.base,
    padding: Spacing.base,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  sectionTitle: {
    marginBottom: Spacing.xs,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontSemibold,
    fontWeight: Typography.weight.semibold,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  elevationMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  elevationMetaText: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontMono,
    color: Colors.textSecondary,
  },
  detailCard: {
    marginHorizontal: Spacing.base,
    padding: Spacing.base,
    gap: Spacing.xs,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  detailText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontMono,
    color: Colors.textPrimary,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.xs,
  },
  actionButton: {
    flex: 1,
    backgroundColor: Colors.elevated,
    borderColor: Colors.border,
  },
  actionButtonLabel: {
    color: Colors.textPrimary,
    fontFamily: Typography.fontSemibold,
  },
  notesSection: {
    marginHorizontal: Spacing.base,
    gap: Spacing.sm,
  },
  notesCard: {
    padding: Spacing.base,
    gap: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  notesEditorCard: {
    padding: Spacing.base,
    gap: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  notesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  notesLabel: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontSemibold,
    fontWeight: Typography.weight.semibold,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  notesEditButton: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notesText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontRegular,
    lineHeight: 22,
    color: Colors.textPrimary,
  },
  notesInput: {
    minHeight: 140,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.elevated,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontRegular,
    color: Colors.textPrimary,
  },
  notesCounter: {
    alignSelf: "flex-end",
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontMono,
    color: Colors.textMuted,
  },
  notesActionRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  notesActionButton: {
    flex: 1,
    backgroundColor: Colors.elevated,
    borderColor: Colors.border,
  },
  addNoteButton: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  weatherSection: {
    marginHorizontal: Spacing.base,
    gap: Spacing.sm,
  },
  weatherCard: {
    padding: Spacing.base,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  weatherText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontRegular,
    lineHeight: 21,
    color: Colors.textSecondary,
  },
  conditionSection: {
    marginHorizontal: Spacing.base,
    gap: Spacing.sm,
  },
  conditionInfoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    backgroundColor: Colors.elevated,
  },
  conditionInfoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: Typography.fontRegular,
    lineHeight: 19,
    color: Colors.textSecondary,
  },
  conditionChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  conditionOptionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  conditionOptionChipInactive: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  conditionOptionChipText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontSemibold,
    fontWeight: Typography.weight.semibold,
  },
  conditionCard: {
    padding: Spacing.base,
    gap: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  conditionInput: {
    minHeight: 96,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.elevated,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontRegular,
    color: Colors.textPrimary,
  },
  conditionTrimiteButton: {
    backgroundColor: Colors.elevated,
    borderColor: Colors.border,
  },
});


