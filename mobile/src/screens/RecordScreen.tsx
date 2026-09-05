import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Linking,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import type { LocationSubscription } from "expo-location";
import { BlurView } from "expo-blur";
import * as SecureStore from "expo-secure-store";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { CompositeNavigationProp, RouteProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import MapView, { Marker, Polyline } from "react-native-maps";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BorderRadius,
  Colors,
  Glass,
  Shadow,
  Spacing,
  Typography,
} from "../theme";
import { calculateHikeMetrics, type TrackedPoint } from "../utils/hikeMetrics";
import { api } from "../services/api";
import { getAccessToken } from "../services/authStorage";
import { showError, showSuccess } from "../services/toast";
import {
  clearBackgroundLocationQueue,
  drainBackgroundLocationQueue,
  startBackgroundLocationUpdates,
  stopBackgroundLocationUpdates,
} from "../services/backgroundLocation";
import type { MainStackParamList, MainTabParamList } from "../navigation";

type RecordNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Record">,
  NativeStackNavigationProp<MainStackParamList>
>;

type HikeHistoryItem = {
  id: string;
  status: string;
  distanceM: number | null;
  elevationGainM: number | null;
  durationS: number | null;
  avgPaceMinKm: number | null;
};

type PersonalBestSnapshot = {
  longestDistanțăM: number;
  highestAltitudineGainM: number;
  longestDuratăS: number;
  bestRitmMinKm: number | null;
};

type CompletedHikeSummary = {
  hikeId: string;
  distanceM: number;
  elevationGainM: number;
  durationS: number;
  avgPaceMinKm: number | null;
};

type RecordToast = {
  id: string;
  message: string;
};

type PoiType = "viewpoint" | "spring" | "drinking_water";

type Poi = {
  lat: number;
  lon: number;
  name: string | null;
  type: PoiType;
};

type UserProfileWeight = {
  weightKg: number | null;
};


function formatDistanță(meters: number): string {
  return (meters / 1000).toFixed(2);
}

function formatDurată(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

function formatAltitudine(meters: number): string {
  return Math.round(meters).toString();
}

function formatRitm(paceMinKm: number | null): string {
  if (!paceMinKm || paceMinKm <= 0 || !Number.isFinite(paceMinKm)) return "--";
  const totalSeconds = Math.round(paceMinKm * 60);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isUserProfileWeight(value: unknown): value is UserProfileWeight {
  return (
    isObject(value) &&
    (value.weightKg === null || isFiniteNumber(value.weightKg))
  );
}

function isHikeHistoryItem(value: unknown): value is HikeHistoryItem {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.status === "string" &&
    (value.distanceM === null || isFiniteNumber(value.distanceM)) &&
    (value.elevationGainM === null || isFiniteNumber(value.elevationGainM)) &&
    (value.durationS === null || isFiniteNumber(value.durationS)) &&
    (value.avgPaceMinKm === null || isFiniteNumber(value.avgPaceMinKm))
  );
}

function buildPersonalBestSnapshot(
  hikes: HikeHistoryItem[],
  excludedHikeId?: string
): PersonalBestSnapshot {
  const completedHikes = hikes.filter(
    (hike) => hike.status.toLowerCase() === "completed" && hike.id !== excludedHikeId
  );

  return completedHikes.reduce<PersonalBestSnapshot>(
    (best, hike) => ({
      longestDistanțăM: Math.max(best.longestDistanțăM, hike.distanceM ?? 0),
      highestAltitudineGainM: Math.max(
        best.highestAltitudineGainM,
        hike.elevationGainM ?? 0
      ),
      longestDuratăS: Math.max(best.longestDuratăS, hike.durationS ?? 0),
      bestRitmMinKm:
        hike.avgPaceMinKm != null && hike.avgPaceMinKm > 0
          ? best.bestRitmMinKm == null
            ? hike.avgPaceMinKm
            : Math.min(best.bestRitmMinKm, hike.avgPaceMinKm)
          : best.bestRitmMinKm,
    }),
    {
      longestDistanțăM: 0,
      highestAltitudineGainM: 0,
      longestDuratăS: 0,
      bestRitmMinKm: null,
    }
  );
}

async function fetchPersonalBestSnapshot(
  token: string,
  excludedHikeId?: string
): Promise<PersonalBestSnapshot | null> {
  try {
    const response = await api.get("/hikes", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const hikes = Array.isArray(response.data?.hikes)
      ? response.data.hikes.filter(isHikeHistoryItem)
      : [];

    return buildPersonalBestSnapshot(hikes, excludedHikeId);
  } catch {
    return null;
  }
}

function formatRecordDistanță(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatRecordAltitudine(meters: number): string {
  return `${Math.round(meters)} m`;
}

function formatRecordDurată(seconds: number): string {
  return formatDurată(Math.round(seconds));
}

function formatRecordRitm(paceMinKm: number): string {
  return `${formatRitm(paceMinKm)} /km`;
}

function buildRecordToasts(
  summary: CompletedHikeSummary,
  snapshot: PersonalBestSnapshot
): RecordToast[] {
  const toasts: RecordToast[] = [];

  if (summary.distanceM > snapshot.longestDistanțăM) {
    toasts.push({
      id: `distance-${summary.hikeId}`,
      message: `Record nou! Cel mai lung traseu: ${formatRecordDistanță(summary.distanceM)}`,
    });
  }

  if (summary.elevationGainM > snapshot.highestAltitudineGainM) {
    toasts.push({
      id: `elevation-${summary.hikeId}`,
      message: `Record nou! Cel mai mare castig de altitudine: ${formatRecordAltitudine(
        summary.elevationGainM
      )}`,
    });
  }

  if (summary.durationS > snapshot.longestDuratăS) {
    toasts.push({
      id: `duration-${summary.hikeId}`,
      message: `Record nou! Cea mai lunga durata: ${formatRecordDurată(
        summary.durationS
      )}`,
    });
  }

  if (
    summary.avgPaceMinKm != null &&
    summary.avgPaceMinKm > 0 &&
    (snapshot.bestRitmMinKm == null || summary.avgPaceMinKm < snapshot.bestRitmMinKm)
  ) {
    toasts.push({
      id: `pace-${summary.hikeId}`,
      message: `Record nou! Cel mai bun ritm: ${formatRecordRitm(summary.avgPaceMinKm)}`,
    });
  }

  return toasts;
}

function applyCompletedHikeToSnapshot(
  snapshot: PersonalBestSnapshot,
  summary: CompletedHikeSummary
): PersonalBestSnapshot {
  return {
    longestDistanțăM: Math.max(snapshot.longestDistanțăM, summary.distanceM),
    highestAltitudineGainM: Math.max(
      snapshot.highestAltitudineGainM,
      summary.elevationGainM
    ),
    longestDuratăS: Math.max(snapshot.longestDuratăS, summary.durationS),
    bestRitmMinKm:
      summary.avgPaceMinKm != null && summary.avgPaceMinKm > 0
        ? snapshot.bestRitmMinKm == null
          ? summary.avgPaceMinKm
          : Math.min(snapshot.bestRitmMinKm, summary.avgPaceMinKm)
        : snapshot.bestRitmMinKm,
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
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

export default function RecordScreen() {
  const navigation = useNavigation<RecordNavigation>();
  const route = useRoute<RouteProp<MainTabParamList, "Record">>();
  const insets = useSafeAreaInsets();
  const routeId = route.params?.routeId;
  const routeName = route.params?.routeName;
  const routeCoordinates = route.params?.routeCoordinates as
    | Array<{ lat: number; lon: number }>
    | undefined;
  const routeDistanceKm = route.params?.routeDistanceKm;
  const riskScore = route.params?.riskScore;
  const backpackWeightKg = route.params?.backpackWeightKg;

  const mapRef = useRef<MapView>(null);
  const locationSubRef = useRef<LocationSubscription | null>(null);
  const weatherIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCameraUpdateRef = useRef<number>(0);
  const latestCoordsRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const pausedDuratăRef = useRef(0);
  const pauseStartRef = useRef<number | null>(null);
  const personalBestsRef = useRef<PersonalBestSnapshot | null>(null);
  const recordToastTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const hasFitRouteRef = useRef(false);
  const offTrailSecondsRef = useRef(0);
  const offTrailHapticFiredRef = useRef(false);
  const trackedPointsRef = useRef<TrackedPoint[]>([]);

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.5);
  const recordToastTranslateY = useSharedValue(-100);
  const recordToastOpacity = useSharedValue(0);

  const [locationGranted, setLocationGranted] = useState<boolean | null>(null);
  const [currentLatitude, setCurrentLatitude] = useState<number | null>(null);
  const [currentLongitude, setCurrentLongitude] = useState<number | null>(null);

  const [trackedPoints, setTrackedPoints] = useState<TrackedPoint[]>([]);
  const [activeHikeId, setActiveHikeId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isOprireping, setIsOprireping] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isPauzăd, setIsPauzăd] = useState(false);
  const [currentVreme, setCurrentVreme] = useState<{ tempC: number; weatherCode: number; description: string; windKmh?: number; humidityPct?: number; feelsLikeC?: number; precipitationMm?: number } | null>(null);
  const [completionSummary, setCompletionSummary] = useState<CompletedHikeSummary | null>(null);
  const [activeRecordToast, setActiveRecordToast] = useState<RecordToast | null>(null);
  const [emergencyContact, setEmergencyContact] = useState<{ name: string; phone: string } | null>(null);
  const [profileWeightKg, setProfileWeightKg] = useState<number | null>(null);
  const [offTrailSeconds, setOffTrailSeconds] = useState(0);
  const [showOffTrailBanner, setShowOffTrailBanner] = useState(false);
  const [showPOIs, setShowPOIs] = useState(false);
  const [isFetchingPOIs, setIsFetchingPOIs] = useState(false);
  const [pois, setPois] = useState<Poi[]>([]);

  const clearRecordToastQueue = () => {
    recordToastTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    recordToastTimeoutsRef.current = [];
    cancelAnimation(recordToastTranslateY);
    cancelAnimation(recordToastOpacity);
    recordToastTranslateY.value = -100;
    recordToastOpacity.value = 0;
    setActiveRecordToast(null);
  };

  const mergeBackgroundLocationsWithPoints = (
    points: TrackedPoint[],
    queuedLocations: Awaited<ReturnType<typeof drainBackgroundLocationQueue>>
  ): TrackedPoint[] => {
    if (queuedLocations.length === 0) {
      return points;
    }

    const pointByKey = new Map<string, TrackedPoint>();
    const addPoint = (point: TrackedPoint) => {
      pointByKey.set(
        `${point.timestamp}:${point.latitude.toFixed(7)}:${point.longitude.toFixed(7)}`,
        point
      );
    };

    points.forEach(addPoint);
    queuedLocations.forEach((location) => {
      addPoint({
        latitude: location.latitude,
        longitude: location.longitude,
        altitude: location.altitude,
        timestamp: location.timestamp,
      });
    });

    return Array.from(pointByKey.values()).sort(
      (a, b) => a.timestamp - b.timestamp
    );
  };

  const drainAndMergeBackgroundLocations = async (
    basePoints = trackedPointsRef.current
  ) => {
    const queuedLocations = await drainBackgroundLocationQueue();
    if (queuedLocations.length === 0) {
      return basePoints;
    }

    const mergedPoints = mergeBackgroundLocationsWithPoints(
      basePoints,
      queuedLocations
    );
    const latestPoint = mergedPoints[mergedPoints.length - 1];

    if (latestPoint) {
      latestCoordsRef.current = {
        latitude: latestPoint.latitude,
        longitude: latestPoint.longitude,
      };
      setCurrentLatitude(latestPoint.latitude);
      setCurrentLongitude(latestPoint.longitude);
    }

    trackedPointsRef.current = mergedPoints;
    setTrackedPoints(mergedPoints);

    return mergedPoints;
  };

  useEffect(() => {
    trackedPointsRef.current = trackedPoints;
  }, [trackedPoints]);

  useEffect(() => {
    let active = true;

    const checkActiveHike = async () => {
      const savedHikeId = await SecureStore.getItemAsync("ACTIVE_HIKE_ID");
      if (!active || !savedHikeId) return;

      Alert.alert(
        "Traseu neterminat",
        "Ai un traseu neterminat. Vrei să îl oprești acum?",
        [
          {
            text: "Oprire & salvare",
            onPress: async () => {
              try {
                try {
                  await stopBackgroundLocationUpdates();
                  await clearBackgroundLocationQueue();
                } catch {
                  // Best effort only.
                }
                const token = await getAccessToken();
                if (token) {
                  await api.post(
                    `/hikes/${savedHikeId}/stop`,
                    { status: "partial", durationS: 0, distanceM: 0, elevationGainM: 0 },
                    { headers: { Authorization: `Bearer ${token}` } }
                  );
                }
                await SecureStore.deleteItemAsync("ACTIVE_HIKE_ID");
                showSuccess("Salvat", "Traseul tău a fost salvat ca incomplet.");
              } catch {
                showError("Eroare", "Nu s-a putut salva traseul. Încearcă din nou.");
              }
            },
          },
          {
            text: "Renunță",
            style: "destructive",
            onPress: async () => {
              try {
                await stopBackgroundLocationUpdates();
                await clearBackgroundLocationQueue();
              } catch {
                // Best effort only.
              }
              await SecureStore.deleteItemAsync("ACTIVE_HIKE_ID");
            },
          },
        ]
      );
    };

    void checkActiveHike();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadProfileWeight = async () => {
      try {
        const token = await getAccessToken();
        if (!token) {
          if (active) {
            setProfileWeightKg(null);
          }
          return;
        }

        const response = await api.get("/profile/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!active) return;

        const profileData = isObject(response.data) ? response.data.profile : null;
        setProfileWeightKg(
          isUserProfileWeight(profileData) ? profileData.weightKg : null
        );
      } catch {
        if (active) {
          setProfileWeightKg(null);
        }
      }
    };

    const loadEmergencyContact = async () => {
      try {
        const [name, phone] = await Promise.all([
          SecureStore.getItemAsync("settings_emergency_name"),
          SecureStore.getItemAsync("settings_emergency_phone"),
        ]);

        if (!active) return;

        const trimmedName = name?.trim() ?? "";
        const trimmedPhone = phone?.trim() ?? "";

        if (trimmedName && trimmedPhone) {
          setEmergencyContact({ name: trimmedName, phone: trimmedPhone });
          return;
        }

        const token = await getAccessToken();

        if (token) {
          try {
            const response = await api.get("/profile/emergency-contact", {
              headers: { Authorization: `Bearer ${token}` },
            });

            if (!active) return;

            const backendName =
              typeof response.data?.name === "string" ? response.data.name.trim() : "";
            const backendPhone =
              typeof response.data?.phone === "string" ? response.data.phone.trim() : "";

            if (backendName || backendPhone) {
              setEmergencyContact({ name: backendName, phone: backendPhone });
              return;
            }
          } catch {
            // Best effort only.
          }
        }

        setEmergencyContact(null);
      } catch {
        // Best effort only.
      }
    };

    const loadInitialLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        const granted = status === "granted";

        if (!active) return;
        setLocationGranted(granted);

        if (granted) {
          try {
            const pos = await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            });
            if (!active) return;
            setCurrentLatitude(pos.coords.latitude);
            setCurrentLongitude(pos.coords.longitude);
          } catch {
            // Best effort only.
          }
        }
      } catch {
        if (active) {
          setLocationGranted(false);
        }
      }
    };

    void loadProfileWeight();
    void loadEmergencyContact();
    void loadInitialLocation();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    const loadPersonalBests = async () => {
      const token = await getAccessToken();
      if (!token || !active) return;

      const snapshot = await fetchPersonalBestSnapshot(token);
      if (active && snapshot) {
        personalBestsRef.current = snapshot;
      }
    };

    void loadPersonalBests();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!activeHikeId) {
      setElapsedSeconds(0);
      return;
    }

    const timer = setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [activeHikeId]);

  useEffect(() => {
    hasFitRouteRef.current = false;
  }, [routeId]);

  useEffect(() => {
    if (!routeCoordinates?.length || hasFitRouteRef.current) return;

    const routeCoords = routeCoordinates.map((coordinate) => ({
      latitude: coordinate.lat,
      longitude: coordinate.lon,
    }));

    const timeout = setTimeout(() => {
      mapRef.current?.fitToCoordinates(routeCoords, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
      });
      hasFitRouteRef.current = true;
    }, 0);

    return () => clearTimeout(timeout);
  }, [routeCoordinates]);

  useEffect(() => {
    if (offTrailSeconds === 0 && !showOffTrailBanner) {
      offTrailHapticFiredRef.current = false;
    }
  }, [offTrailSeconds, showOffTrailBanner]);

  useEffect(() => {
    if (!activeHikeId) return;
    if (currentLatitude === null || currentLongitude === null) return;

    latestCoordsRef.current = {
      latitude: currentLatitude,
      longitude: currentLongitude,
    };

    const now = Date.now();
    if (now - lastCameraUpdateRef.current < 5000) return;
    lastCameraUpdateRef.current = now;

    mapRef.current?.animateToRegion(
      {
        latitude: currentLatitude,
        longitude: currentLongitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      },
      500
    );
  }, [activeHikeId, currentLatitude, currentLongitude]);

  useEffect(() => {
    return () => {
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      if (weatherIntervalRef.current) {
        clearInterval(weatherIntervalRef.current);
        weatherIntervalRef.current = null;
      }
      clearRecordToastQueue();
    };
  }, []);

  useEffect(() => {
    if (activeHikeId && !isPauzăd) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.3, {
            duration: 600,
            easing: Easing.out(Easing.quad),
          }),
          withTiming(1, {
            duration: 600,
            easing: Easing.inOut(Easing.quad),
          })
        ),
        -1,
        false
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) }),
          withTiming(0.5, { duration: 600, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      );
      return;
    }

    cancelAnimation(pulseScale);
    cancelAnimation(pulseOpacity);
    pulseScale.value = 1;
    pulseOpacity.value = 0;
  }, [activeHikeId, isPauzăd, pulseOpacity, pulseScale]);

  const startLocationTracking = async () => {
    locationSubRef.current?.remove();

    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 3000,
        distanceInterval: 5,
      },
      (location) => {
        const { latitude, longitude, altitude } = location.coords;
        latestCoordsRef.current = { latitude, longitude };
        setCurrentLatitude(latitude);
        setCurrentLongitude(longitude);

        if (routeCoordinates?.length) {
          const minDistanță = routeCoordinates.reduce((minimum, coordinate) => {
            const distance = haversineM(
              latitude,
              longitude,
              coordinate.lat,
              coordinate.lon
            );
            return Math.min(minimum, distance);
          }, Number.POSITIVE_INFINITY);

          if (minDistanță > 150) {
            const nextOffTrailSeconds = offTrailSecondsRef.current + 5;
            offTrailSecondsRef.current = nextOffTrailSeconds;
            setOffTrailSeconds(nextOffTrailSeconds);

            if (nextOffTrailSeconds >= 90) {
              setShowOffTrailBanner((previous) => {
                if (!previous && !offTrailHapticFiredRef.current) {
                  offTrailHapticFiredRef.current = true;
                  void Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Warning
                  );
                }

                return true;
              });
            }
          } else {
            offTrailSecondsRef.current = 0;
            offTrailHapticFiredRef.current = false;
            setOffTrailSeconds(0);
            setShowOffTrailBanner(false);
          }
        }

        const nextPoint: TrackedPoint = {
          latitude,
          longitude,
          altitude: altitude ?? null,
          timestamp: location.timestamp,
        };

        setTrackedPoints((previous) => {
          const nextPoints = [...previous, nextPoint];
          trackedPointsRef.current = nextPoints;
          return nextPoints;
        });
      }
    );

    locationSubRef.current = sub;
  };

  const fetchCurrentVreme = async (latitude: number, longitude: number) => {
    try {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`
      );

      if (!response.ok) {
        return;
      }

      const data: unknown = await response.json();
      if (!isObject(data) || !isObject(data.current)) {
        return;
      }

      const temperature = data.current.temperature_2m;
      const weatherCode = data.current.weather_code;
      const windViteză = data.current.wind_speed_10m;
      const humidity = data.current.relative_humidity_2m;
      const feelsLike = data.current.apparent_temperature;
      const precipitation = data.current.precipitation;

      if (typeof temperature === "number" && typeof weatherCode === "number") {
        const WMO: Record<number, string> = { 0: "Cer senin", 1: "Predominant senin", 2: "Partial noros", 3: "Acoperit", 45: "Ceata", 48: "Ceata cu chiciura", 51: "Burnita usoara", 53: "Burnita", 55: "Burnita abundenta", 61: "Ploaie usoara", 63: "Ploaie", 65: "Ploaie puternica", 71: "Ninsoare usoara", 73: "Ninsoare", 75: "Ninsoare puternica", 80: "Averse usoare", 81: "Averse", 82: "Averse puternice", 95: "Furtuna" };
        setCurrentVreme({
          tempC: temperature,
          weatherCode,
          description: WMO[weatherCode] ?? "Necunoscuta",
          ...(typeof windViteză === "number" ? { windKmh: windViteză } : {}),
          ...(typeof humidity === "number" ? { humidityPct: humidity } : {}),
          ...(typeof feelsLike === "number" ? { feelsLikeC: feelsLike } : {}),
          ...(typeof precipitation === "number" ? { precipitationMm: precipitation } : {}),
        });
      }
    } catch {
      // Best effort only.
    }
  };

  useEffect(() => {
    if (!activeHikeId) {
      if (weatherIntervalRef.current) {
        clearInterval(weatherIntervalRef.current);
        weatherIntervalRef.current = null;
      }
      return;
    }

    if (weatherIntervalRef.current) {
      clearInterval(weatherIntervalRef.current);
    }

    weatherIntervalRef.current = setInterval(() => {
      const coords = latestCoordsRef.current;
      if (!coords) return;
      void fetchCurrentVreme(coords.latitude, coords.longitude);
    }, 600000);

    return () => {
      if (weatherIntervalRef.current) {
        clearInterval(weatherIntervalRef.current);
        weatherIntervalRef.current = null;
      }
    };
  }, [activeHikeId]);

  const getPauzădSeconds = () => {
    const currentPauzăSeconds =
      isPauzăd && pauseStartRef.current !== null
        ? (Date.now() - pauseStartRef.current) / 1000
        : 0;

    return pausedDuratăRef.current + currentPauzăSeconds;
  };

  const isÎnregistrare = activeHikeId !== null;

  useEffect(() => {
    if (!isÎnregistrare) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        void drainAndMergeBackgroundLocations().catch(() => undefined);
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);

    return () => {
      subscription.remove();
    };
  }, [isÎnregistrare]);

  const fetchPOIs = async () => {
    if (!isÎnregistrare || currentLatitude === null || currentLongitude === null) {
      return;
    }

    try {
      const response = await api.get<Poi[]>("/pois", {
        params: {
          lat: currentLatitude,
          lon: currentLongitude,
          radius_km: 3,
        },
      });
      setPois(Array.isArray(response.data) ? response.data : []);
    } catch {
      setPois([]);
    }
  };

  const metrics = useMemo(() => calculateHikeMetrics(trackedPoints), [trackedPoints]);
  const currentDistanțăM = metrics.distanceM;
  const currentAltitudineGain = metrics.elevationGainM;
  const currentRitmMinKm = useMemo(() => {
    if (trackedPoints.length < 2) {
      return null;
    }

    const previousPoint = trackedPoints[trackedPoints.length - 2];
    const latestPoint = trackedPoints[trackedPoints.length - 1];
    const segmentDistanțăM = haversineM(
      previousPoint.latitude,
      previousPoint.longitude,
      latestPoint.latitude,
      latestPoint.longitude
    );
    const segmentDuratăS = (latestPoint.timestamp - previousPoint.timestamp) / 1000;

    if (segmentDistanțăM < 3 || segmentDuratăS <= 0) {
      return null;
    }

    const paceMinKm = (segmentDuratăS / 60) / (segmentDistanțăM / 1000);
    return Number.isFinite(paceMinKm) && paceMinKm > 0 ? paceMinKm : null;
  }, [trackedPoints]);
  const latestTrackedPoint = trackedPoints[trackedPoints.length - 1] ?? null;
  const currentAltitudineM = latestTrackedPoint?.altitude ?? null;
  const caloriesBurned =
    profileWeightKg !== null
      ? Math.round((currentDistanțăM / 1000) * profileWeightKg * 0.9)
      : null;
  const activeElapsedSeconds = Math.max(
    0,
    elapsedSeconds - Math.round(getPauzădSeconds())
  );

  const routePolylineCoords =
    routeCoordinates?.map((coordinate) => ({
      latitude: coordinate.lat,
      longitude: coordinate.lon,
    })) ?? [];
  const polylineCoords = trackedPoints.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }));

  const pulseRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const recordToastStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: recordToastTranslateY.value }],
    opacity: recordToastOpacity.value,
  }));

  const initialRegion =
    currentLatitude !== null && currentLongitude !== null
      ? {
          latitude: currentLatitude,
          longitude: currentLongitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        }
      : {
          latitude: 45.5,
          longitude: 24.5,
          latitudeDelta: 0.5,
          longitudeDelta: 0.5,
        };

  const handleStart = async () => {
    if (isStarting || activeHikeId) return;

    if (locationGranted === false) {
      showError(
        "Permisiune necesară",
        "Acordă acces la locație pentru a înregistra un traseu."
      );
      return;
    }

    try {
      setIsStarting(true);

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationGranted(false);
        showError("Permisiune refuzată", "Permisiunea de locație este necesară.");
        return;
      }

      setLocationGranted(true);

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      const token = await getAccessToken();
      if (!token) {
        showError("Autentificare necesară", "Te rugăm să te autentifici din nou.");
        return;
      }

      const firstPoint: TrackedPoint = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        altitude: pos.coords.altitude ?? null,
        timestamp: pos.timestamp,
      };

      clearRecordToastQueue();
      setCompletionSummary(null);
      pausedDuratăRef.current = 0;
      pauseStartRef.current = null;
      offTrailSecondsRef.current = 0;
      offTrailHapticFiredRef.current = false;
      setIsPauzăd(false);
      setElapsedSeconds(0);
      setOffTrailSeconds(0);
      setShowOffTrailBanner(false);
      lastCameraUpdateRef.current = 0;

      setCurrentLatitude(pos.coords.latitude);
      setCurrentLongitude(pos.coords.longitude);
      latestCoordsRef.current = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
      trackedPointsRef.current = [firstPoint];
      setTrackedPoints([firstPoint]);
      await fetchCurrentVreme(pos.coords.latitude, pos.coords.longitude);

      const response = await api.post(
        "/hikes/start",
        {
          routeName: routeName ?? undefined,
          routeId: routeId ?? undefined,
          riskScore,
          backpackWeightKg,
          startedAt: new Date().toISOString(),
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const hikeId =
        isObject(response.data) &&
        isObject(response.data.hike) &&
        typeof response.data.hike.id === "string"
          ? response.data.hike.id
          : null;

      if (!hikeId) {
        throw new Error("Invalid hike start response");
      }

      await SecureStore.setItemAsync("ACTIVE_HIKE_ID", hikeId);
      setActiveHikeId(hikeId);
      await clearBackgroundLocationQueue();
      let backgroundTrackingStarted = false;
      try {
        backgroundTrackingStarted = await startBackgroundLocationUpdates();
      } catch {
        backgroundTrackingStarted = false;
      }
      if (!backgroundTrackingStarted) {
        showError(
          "Urmărire în fundal indisponibilă",
          "Permisiunea de locație în fundal este necesară pentru a continua urmărirea când aplicația nu este activă."
        );
      }
      await startLocationTracking();
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error: unknown) {
      try {
        await stopBackgroundLocationUpdates();
      } catch {
        // Best effort only.
      }
      try {
        await SecureStore.deleteItemAsync("ACTIVE_HIKE_ID");
        await clearBackgroundLocationQueue();
      } catch {
        // Best effort only.
      }
      setActiveHikeId(null);
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      showError(
        "Nu s-a putut porni traseul",
        getErrorMessage(error, "Ceva a mers prost.")
      );
    } finally {
      setIsStarting(false);
    }
  };

  const handlePauză = async () => {
    if (!activeHikeId || isPauzăd) return;

    setIsPauzăd(true);
    pauseStartRef.current = Date.now();
    try {
      await stopBackgroundLocationUpdates();
    } catch {
      // Best effort only.
    }
    try {
      await drainAndMergeBackgroundLocations();
    } catch {
      // Best effort only.
    }
    locationSubRef.current?.remove();
    locationSubRef.current = null;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleContinuă = async () => {
    if (!activeHikeId || !isPauzăd || pauseStartRef.current === null) return;

    try {
      pausedDuratăRef.current +=
        (Date.now() - pauseStartRef.current) / 1000;
      pauseStartRef.current = null;
      await clearBackgroundLocationQueue();
      let backgroundTrackingStarted = false;
      try {
        backgroundTrackingStarted = await startBackgroundLocationUpdates();
      } catch {
        backgroundTrackingStarted = false;
      }
      if (!backgroundTrackingStarted) {
        showError(
          "Urmărire în fundal indisponibilă",
          "Permisiunea de locație în fundal este necesară pentru a continua urmărirea când aplicația nu este activă."
        );
      }
      await startLocationTracking();
      setIsPauzăd(false);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error: unknown) {
      pauseStartRef.current = Date.now();
      showError(
        "Nu s-a putut relua traseul",
        getErrorMessage(error, "Ceva a mers prost.")
      );
    }
  };

  const handleOprire = async () => {
    if (!activeHikeId || isOprireping) return;

    setIsOprireping(true);
    let points = trackedPointsRef.current;
    try {
      await stopBackgroundLocationUpdates();
    } catch {
      // Best effort only.
    }
    try {
      points = await drainAndMergeBackgroundLocations(points);
    } catch {
      points = trackedPointsRef.current;
    }
    locationSubRef.current?.remove();
    locationSubRef.current = null;

    const pausedSeconds = getPauzădSeconds();
    const durationS = Math.max(0, elapsedSeconds - Math.round(pausedSeconds));
    const finalMetrics = calculateHikeMetrics(points);
    const weatherSnapshotStart = currentVreme;
    const finalOffTrailSeconds = offTrailSeconds;

    const doOprire = async (
      status: "completed" | "partial",
      userDifficultyRating?: number
    ) => {
      try {
        const token = await getAccessToken();
        if (!token) {
          showError("Autentificare necesară", "Te rugăm să te autentifici din nou.");
          return;
        }

        if (points.length > 0) {
          await api.post(
            `/hikes/${activeHikeId}/points`,
            { points },
            { headers: { Authorization: `Bearer ${token}` } }
          );
        }

        console.log("[RecordScreen] stopping hike, sending status:", status);
        const stopResponse = await api.post(
          `/hikes/${activeHikeId}/stop`,
          {
            durationS,
            movingTimeS: Math.min(Math.round(finalMetrics.movingTimeS), durationS),
            distanceM: finalMetrics.distanceM,
            elevationGainM: finalMetrics.elevationGainM,
            elevationLossM: finalMetrics.elevationLossM,
            avgSpeedKmh: finalMetrics.avgSpeedKmh,
            avgPaceMinKm: finalMetrics.avgPaceMinKm,
            minAltitudeM: finalMetrics.minAltitudeM,
            maxAltitudeM: finalMetrics.maxAltitudeM,
            status,
            ...(weatherSnapshotStart !== null ? { weatherSnapshotStart } : {}),
            offTrailSeconds: finalOffTrailSeconds,
            userDifficultyRating,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const savedStatus = (stopResponse.data as { hike?: { status?: string } })?.hike?.status;
        console.log("[RecordScreen] backend returned status:", savedStatus);
        await SecureStore.deleteItemAsync("ACTIVE_HIKE_ID");

        const completedHikeId = activeHikeId;
        const completedSummary: CompletedHikeSummary = {
          hikeId: completedHikeId,
          distanceM: finalMetrics.distanceM,
          elevationGainM: finalMetrics.elevationGainM,
          durationS,
          avgPaceMinKm:
            finalMetrics.avgPaceMinKm > 0 && Number.isFinite(finalMetrics.avgPaceMinKm)
              ? finalMetrics.avgPaceMinKm
              : null,
        };
        const previousSnapshot =
          (await fetchPersonalBestSnapshot(token, completedHikeId)) ??
          personalBestsRef.current;
        if (previousSnapshot) {
          const toasts = buildRecordToasts(completedSummary, previousSnapshot);
          clearRecordToastQueue();

          toasts.forEach((toast, index) => {
            const showDelayMs = index * 3500;
            const showTimeout = setTimeout(() => {
              setActiveRecordToast(toast);
              recordToastTranslateY.value = -100;
              recordToastOpacity.value = 0;
              recordToastTranslateY.value = withTiming(0, { duration: 280 });
              recordToastOpacity.value = withTiming(1, { duration: 220 });
            }, showDelayMs);

            const hideTimeout = setTimeout(() => {
              recordToastTranslateY.value = withTiming(-100, { duration: 280 });
              recordToastOpacity.value = withTiming(0, { duration: 220 });
            }, showDelayMs + 3000);

            recordToastTimeoutsRef.current.push(showTimeout, hideTimeout);
          });

          const finalClearTimeout = setTimeout(() => {
            setActiveRecordToast(null);
          }, toasts.length * 3500);
          recordToastTimeoutsRef.current.push(finalClearTimeout);
          personalBestsRef.current = applyCompletedHikeToSnapshot(
            previousSnapshot,
            completedSummary
          );
        }

        pausedDuratăRef.current = 0;
        pauseStartRef.current = null;
        offTrailSecondsRef.current = 0;
        offTrailHapticFiredRef.current = false;
        setCurrentVreme(null);
        setIsPauzăd(false);
        setActiveHikeId(null);
        setOffTrailSeconds(0);
        setShowOffTrailBanner(false);
        trackedPointsRef.current = [];
        setTrackedPoints([]);
        setElapsedSeconds(0);
        setCompletionSummary(completedSummary);
      } catch (error: unknown) {
        showError(
          "Nu s-a putut opri traseul",
          getErrorMessage(error, "Ceva a mers prost.")
        );
      } finally {
        setIsOprireping(false);
      }
    };

    const showDifficultyRatingAlert = (status: "completed" | "partial") => {
      const finishHike = (rating?: number) => void doOprire(status, rating);

      Alert.alert(
        'Evaluează acest traseu',
        'Cât de dificilă ți s-a părut această rută?',
        [
          { text: '1 - Ușor', onPress: () => finishHike(1) },
          { text: '2 - Moderat', onPress: () => finishHike(2) },
          { text: '3 - Greu', onPress: () => finishHike(3) },
          { text: '4 - Foarte greu', onPress: () => finishHike(4) },
          { text: '5 - Extrem', onPress: () => finishHike(5) },
          { text: 'Omite', onPress: () => finishHike(undefined) },
        ]
      );
    };

    if (routeId && routeDistanceKm && routeDistanceKm > 0) {
      const coveragePct = Math.round(
        (finalMetrics.distanceM / (routeDistanceKm * 1000)) * 100
      );
      if (coveragePct < 70) {
        Alert.alert(
          "Oprire înregistrare",
          `Ai parcurs doar ${coveragePct}% din traseu. Sigur dorești să oprești înregistrarea?`,
          [
            { text: "Continuă", style: "cancel" },
            { text: "Oprește", style: "destructive", onPress: () => showDifficultyRatingAlert("partial") },
          ]
        );
        return;
      }
    }

    showDifficultyRatingAlert("completed");
  };

  const handleSOS = async () => {
    if (!emergencyContact) {
      showError(
        "Niciun contact de urgență setat",
        "Mergi la Setări pentru a adăuga un contact de urgență."
      );
      return;
    }

    if (currentLatitude === null || currentLongitude === null) {
      showError(
        "Locație indisponibilă",
        "Nu se poate determina locația ta actuală."
      );
      return;
    }

    const message = `EMERGENCY: I need help. My current location: https://maps.google.com/?q=${currentLatitude},${currentLongitude} - Sent from HikeApp`;

    try {
      await Linking.openURL(
        `sms:${emergencyContact.phone}?body=${encodeURIComponent(message)}`
      );
    } catch {
      showError(
        "Nu s-a putut deschide SMS",
        "Încearcă din nou sau contactează direct serviciile de urgență."
      );
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />

      <View style={styles.mapShell}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          showsUserLocation
          showsMyLocationButton={false}
          mapType="terrain"
        >
          {routePolylineCoords.length > 0 && (
            <Polyline
              coordinates={routePolylineCoords}
              strokeColor={`${Colors.alpine}B3`}
              strokeWidth={3}
            />
          )}
          {polylineCoords.length > 1 && (
            <Polyline
              coordinates={polylineCoords}
              strokeColor={Colors.danger}
              strokeWidth={5}
            />
          )}
          {trackedPoints.length > 0 && (
            <Marker
              coordinate={{
                latitude: trackedPoints[0].latitude,
                longitude: trackedPoints[0].longitude,
              }}
              pinColor={Colors.forestMuted}
              title="Start"
            />
          )}
          {showPOIs &&
            pois.map((poi, index) => (
              <Marker
                key={`${poi.type}-${poi.lat}-${poi.lon}-${index}`}
                coordinate={{
                  latitude: poi.lat,
                  longitude: poi.lon,
                }}
                title={poi.name ?? poi.type}
                pinColor={poi.type === "viewpoint" ? "blue" : "#0891B2"}
              />
            ))}
        </MapView>

        <View pointerEvents="box-none" style={styles.mapOverlay}>
          {activeRecordToast ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.recordToastWrap,
                { top: insets.top + 12 },
                recordToastStyle,
              ]}
            >
              <View style={styles.recordToastCard}>
                <Ionicons name="trophy" size={20} color="#FFD700" />
                <Text style={styles.recordToastText}>{activeRecordToast.message}</Text>
              </View>
            </Animated.View>
          ) : null}

          {isÎnregistrare && (
            <View
              accessible
              accessibilityLabel={isPauzăd ? "Pauzăd" : "Înregistrare active"}
              style={[styles.recordingStatus, { top: insets.top + 16 }]}
            >
              <View style={styles.recordingDotWrap}>
                {!isPauzăd && (
                  <Animated.View style={[styles.recordingPulseRing, pulseRingStyle]} />
                )}
                <View
                  style={[
                    styles.recordingStatusDot,
                    isPauzăd
                      ? styles.recordingStatusDotPauzăd
                      : styles.recordingStatusDotActive,
                  ]}
                />
              </View>
              <Text style={styles.recordingStatusText}>
                {isPauzăd ? "PAUZĂ" : "REC"}
              </Text>
            </View>
          )}

          {routeName ? (
            <View
              pointerEvents="none"
              style={[
                styles.routeLabelWrap,
                { top: isÎnregistrare ? insets.top + 12 : insets.top + 18 },
              ]}
            >
              <BlurView intensity={Glass.blurIntensityLight} tint="dark" style={styles.routeLabel}>
                <Text style={styles.routeLabelText} numberOfLines={1}>
                  {routeName}
                </Text>
              </BlurView>
            </View>
          ) : null}

          {isÎnregistrare && (
            <Pressable
              accessibilityLabel={
                showPOIs ? "Puncte de interes vizibile, apasă pentru a ascunde" : "Puncte de interes ascunse, apasă pentru a afișa"
              }
              onPress={() => {
                const nextValue = !showPOIs;
                setShowPOIs(nextValue);

                if (nextValue) {
                  void fetchPOIs();
                }
              }}
              style={({ pressed }) => [
                styles.poiButton,
                showPOIs ? styles.poiButtonActive : styles.poiButtonInactive,
                { transform: [{ scale: pressed ? 0.96 : 1 }] },
              ]}
            >
              <Ionicons
                name="layers-outline"
                size={20}
                color={showPOIs ? Colors.background : Colors.textPrimary}
              />
            </Pressable>
          )}

          {isÎnregistrare && (
            <Pressable
              onPress={() => void handleSOS()}
              style={({ pressed }) => [
                styles.sosButton,
                { transform: [{ scale: pressed ? 0.96 : 1 }] },
              ]}
            >
              <Ionicons name="alert-circle" size={20} color={Colors.background} />
              <Text style={styles.sosButtonLabel}>SOS</Text>
            </Pressable>
          )}

        </View>
      </View>

      <View
        style={[
          styles.content,
          { paddingBottom: Spacing.sm },
        ]}
      >
        {showOffTrailBanner ? (
          <View style={styles.offTrailBanner}>
            <View style={styles.offTrailBannerContent}>
              <Ionicons name="warning-outline" size={16} color={Colors.amber} />
              <Text style={styles.offTrailBannerText}>În afara traseului</Text>
            </View>
            <Pressable
              onPress={() => {
                offTrailSecondsRef.current = 0;
                offTrailHapticFiredRef.current = false;
                setOffTrailSeconds(0);
                setShowOffTrailBanner(false);
              }}
              hitSlop={8}
              style={styles.offTrailBannerClose}
            >
              <Ionicons name="close" size={16} color={Colors.amber} />
            </Pressable>
          </View>
        ) : null}

        {isÎnregistrare ? (
          <>
            <View style={styles.statsHud}>
              <View style={styles.statsGrid}>
                <View
                  accessible
                  accessibilityLabel={`Distanță: ${formatDistanță(currentDistanțăM)} km`}
                  style={[styles.statCell, styles.statCellRightBorder, styles.statCellBottomBorder]}
                >
                  <Text style={styles.statValue}>{formatDistanță(currentDistanțăM)}</Text>
                  <Text style={styles.statLabel}>DISTANȚĂ (KM)</Text>
                </View>
                <View
                  accessible
                  accessibilityLabel={`Durată: ${formatDurată(activeElapsedSeconds)}`}
                  style={[styles.statCell, styles.statCellRightBorder, styles.statCellBottomBorder]}
                >
                  <Text style={styles.statValue}>
                    {formatDurată(activeElapsedSeconds)}
                  </Text>
                  <Text style={styles.statLabel}>DURATĂ</Text>
                </View>
                <View
                  accessible
                  accessibilityLabel={`Altitudine gain: ${formatAltitudine(currentAltitudineGain)} meters`}
                  style={[styles.statCell, styles.statCellBottomBorder]}
                >
                  <Text style={styles.statValue}>
                    {formatAltitudine(currentAltitudineGain)}
                  </Text>
                  <Text style={styles.statLabel}>CÂȘTIG ALT. (M)</Text>
                </View>
                <View
                  accessible
                  accessibilityLabel={`Current pace: ${formatRitm(currentRitmMinKm)} minutes per kilometer`}
                  style={[styles.statCell, styles.statCellRightBorder]}
                >
                  <Text style={styles.statValue}>{formatRitm(currentRitmMinKm)}</Text>
                  <Text style={styles.statLabel}>RITM (MIN/KM)</Text>
                </View>
                <View
                  accessible
                  accessibilityLabel={
                    caloriesBurned !== null
                      ? `Calorii arse: ${caloriesBurned}`
                      : "Calorii burned unavailable"
                  }
                  style={[styles.statCell, styles.statCellRightBorder]}
                >
                  <Text style={styles.statValue}>
                    {caloriesBurned !== null ? caloriesBurned : "--"}
                  </Text>
                  <Text style={styles.statLabel}>CALORII</Text>
                </View>
                <View
                  accessible
                  accessibilityLabel={
                    currentAltitudineM !== null
                      ? `Current altitude: ${formatAltitudine(currentAltitudineM)} meters`
                      : "Current altitude unavailable"
                  }
                  style={styles.statCell}
                >
                  <Text style={styles.statValue}>
                    {currentAltitudineM !== null ? formatAltitudine(currentAltitudineM) : "--"}
                  </Text>
                  <Text style={styles.statLabel}>ALTITUDINE (M)</Text>
                </View>
              </View>
            </View>
          </>
        ) : null}

        {!isÎnregistrare ? completionSummary ? (
          <View style={styles.completionWrap}>
            <Text style={styles.completionTitle}>Traseu finalizat</Text>
            <View style={styles.completionStatsGrid}>
              <View style={styles.completionStatCard}>
                <Text style={styles.completionStatLabel}>Distanță</Text>
                <Text style={styles.completionStatValue}>
                  {formatDistanță(completionSummary.distanceM)} km
                </Text>
              </View>
              <View style={styles.completionStatCard}>
                <Text style={styles.completionStatLabel}>Altitudine</Text>
                <Text style={styles.completionStatValue}>
                  {formatAltitudine(completionSummary.elevationGainM)} m
                </Text>
              </View>
              <View style={styles.completionStatCard}>
                <Text style={styles.completionStatLabel}>Durată</Text>
                <Text style={styles.completionStatValue}>
                  {formatDurată(completionSummary.durationS)}
                </Text>
              </View>
              <View style={styles.completionStatCard}>
                <Text style={styles.completionStatLabel}>Ritm</Text>
                <Text style={styles.completionStatValue}>
                  {formatRitm(completionSummary.avgPaceMinKm)} /km
                </Text>
              </View>
            </View>

            <View style={styles.completionActions}>
              <Pressable
                onPress={() => setCompletionSummary(null)}
                style={({ pressed }) => [
                  styles.completionSecondaryAction,
                  { transform: [{ scale: pressed ? 0.98 : 1 }] },
                ]}
              >
                <Text style={styles.completionSecondaryLabel}>Gata</Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  const hikeId = completionSummary.hikeId;
                  setCompletionSummary(null);
                  navigation.navigate("HikeDetails", { hikeId });
                }}
                style={({ pressed }) => [
                  styles.completionPrimaryAction,
                  { transform: [{ scale: pressed ? 0.98 : 1 }] },
                ]}
              >
                <Ionicons name="arrow-forward" size={16} color={Colors.background} />
                <Text style={styles.completionPrimaryLabel}>Vezi detaliile</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.startRow}>
            <Pressable
              onPress={handleStart}
              disabled={isStarting}
              style={({ pressed }) => [
                styles.primaryControl,
                {
                  opacity: isStarting ? 0.9 : 1,
                  transform: [{ scale: pressed ? 0.96 : 1 }],
                },
              ]}
            >
              {isStarting ? (
                <ActivityIndicator color={Colors.background} />
              ) : (
                <>
                  <Ionicons
                    name="play"
                    size={22}
                    color={Colors.background}
                  />
                  <Text style={styles.primaryControlLabel}>Pornește Traseul</Text>
                </>
              )}
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.activeActions}>
              {isPauzăd ? (
                <Pressable
                  onPress={() => void handleContinuă()}
                  onLongPress={() => void handleSOS()}
                  style={({ pressed }) => [
                    styles.secondaryControl,
                    styles.resumeControl,
                    { transform: [{ scale: pressed ? 0.98 : 1 }] },
                  ]}
                >
                  <Ionicons name="play" size={18} color={Colors.background} />
                  <Text style={styles.secondaryControlLabelActive}>RELUARE</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => void handlePauză()}
                  onLongPress={() => void handleSOS()}
                  style={({ pressed }) => [
                    styles.secondaryControl,
                    styles.pauseControl,
                    { transform: [{ scale: pressed ? 0.98 : 1 }] },
                  ]}
                >
                  <Ionicons
                    name="pause"
                    size={18}
                    color={Colors.textPrimary}
                  />
                  <Text style={styles.secondaryControlLabel}>PAUZĂ</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.startRow}>
              <Pressable
                onPress={() => void handleOprire()}
                disabled={isOprireping}
                style={({ pressed }) => [
                  styles.primaryControl,
                  {
                    backgroundColor: Colors.danger,
                    opacity: isOprireping ? 0.85 : 1,
                    transform: [{ scale: pressed ? 0.98 : 1 }],
                  },
                ]}
              >
                {isOprireping ? (
                  <ActivityIndicator color={Colors.background} />
                ) : (
                  <Text style={styles.primaryControlLabel}>OPRIRE</Text>
                )}
              </Pressable>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  mapShell: {
    flex: 1,
    overflow: "hidden",
    borderBottomLeftRadius: BorderRadius.sm,
    borderBottomRightRadius: BorderRadius.sm,
    backgroundColor: Colors.elevated,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  offTrailBanner: {
    marginHorizontal: 12,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.amber,
    backgroundColor: Colors.amberMuted,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  offTrailBannerContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  offTrailBannerText: {
    flex: 1,
    color: Colors.amber,
    fontFamily: Typography.fontSemibold,
    fontSize: 13,
  },
  offTrailBannerClose: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingStatus: {
    position: "absolute",
    left: 12,
    minHeight: 28,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "rgba(28,42,34,0.76)",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    zIndex: 12,
  },
  recordingDotWrap: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingPulseRing: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.dangerLight,
  },
  recordingStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  recordingStatusDotActive: {
    backgroundColor: Colors.danger,
  },
  recordingStatusDotPauzăd: {
    backgroundColor: Colors.amber,
  },
  recordingStatusText: {
    color: Colors.textMuted,
    fontFamily: Typography.fontSemibold,
    fontSize: 11,
    letterSpacing: 0,
  },
  routeLabelWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
  },
  recordToastWrap: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 20,
  },
  recordToastCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: Colors.elevated,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    maxWidth: "96%",
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.glass,
  },
  recordToastText: {
    flexShrink: 1,
    color: Colors.textPrimary,
    fontFamily: Typography.fontMono,
    fontSize: Typography.size.sm,
  },
  routeLabel: {
    maxWidth: "62%",
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.base,
    paddingVertical: 7,
    backgroundColor: "rgba(28,42,34,0.58)",
  },
  routeLabelText: {
    color: Colors.textPrimary,
    fontFamily: Typography.fontSemibold,
    fontSize: Typography.size.sm,
    letterSpacing: 0,
  },
  sosButton: {
    position: "absolute",
    right: 16,
    bottom: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    ...Shadow.glass,
  },
  poiButton: {
    position: "absolute",
    left: 16,
    bottom: 16,
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.glass,
  },
  poiButtonActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  poiButtonInactive: {
    backgroundColor: Colors.elevated,
    borderColor: Colors.border,
  },
  sosButtonLabel: {
    color: Colors.background,
    fontFamily: Typography.fontBold,
    fontSize: 10,
    letterSpacing: 0,
  },
  content: {
    flex: 0,
    backgroundColor: Colors.background,
  },
  startRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  completionWrap: {
    gap: Spacing.base,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.base,
  },
  completionTitle: {
    color: Colors.textPrimary,
    fontFamily: Typography.fontBold,
    fontSize: Typography.size.xl,
    textAlign: "center",
  },
  completionStatsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  completionStatCard: {
    width: "48%",
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  completionStatLabel: {
    color: Colors.textMuted,
    fontFamily: Typography.fontMedium,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  completionStatValue: {
    marginTop: 4,
    color: Colors.textPrimary,
    fontFamily: Typography.fontMonoBold,
    fontSize: Typography.size.md,
  },
  completionActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  completionSecondaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
  },
  completionSecondaryLabel: {
    color: Colors.textPrimary,
    fontFamily: Typography.fontSemibold,
    fontSize: Typography.size.sm,
  },
  completionPrimaryAction: {
    flex: 1.2,
    minHeight: 48,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  completionPrimaryLabel: {
    color: Colors.background,
    fontFamily: Typography.fontSemibold,
    fontSize: Typography.size.sm,
  },
  primaryControl: {
    width: "100%",
    minHeight: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    ...Shadow.glass,
  },
  primaryControlLabel: {
    color: Colors.background,
    fontFamily: Typography.fontBold,
    fontSize: Typography.size.sm,
    letterSpacing: 0,
  },
  pausedBanner: {
    marginHorizontal: Spacing.lg,
    marginTop: 12,
    marginBottom: 10,
    minHeight: 44,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: `${Colors.elevated}E6`,
    paddingHorizontal: Spacing.base,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  pausedTitle: {
    color: Colors.amber,
    fontFamily: Typography.fontBold,
    fontSize: Typography.size.xl,
    letterSpacing: 0,
  },
  pausedContinuăButton: {
    minHeight: 38,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.accent,
    paddingHorizontal: Spacing.base,
    alignItems: "center",
    justifyContent: "center",
  },
  pausedContinuăLabel: {
    color: Colors.background,
    fontFamily: Typography.fontBold,
    fontSize: Typography.size.sm,
    letterSpacing: 0,
  },
  statsHud: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.xs,
    borderTopWidth: 1,
    borderColor: Colors.border,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "stretch",
  },
  statCell: {
    width: "33.333%",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  statCellRightBorder: {
    borderRightWidth: 1,
    borderRightColor: Colors.border,
  },
  statCellBottomBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  statValue: {
    color: Colors.textPrimary,
    fontFamily: Typography.fontMonoBold,
    fontSize: Typography.size.xl,
    letterSpacing: 0,
  },
  statUnit: {
    color: Colors.textSecondary,
    fontFamily: Typography.fontMedium,
    fontSize: 12,
    letterSpacing: 0,
  },
  statLabel: {
    marginTop: 3,
    color: Colors.textMuted,
    fontFamily: Typography.fontRegular,
    fontSize: 11,
    letterSpacing: 0,
    textAlign: "center",
  },
  statSeparator: {
    width: 1,
    backgroundColor: Colors.border,
    marginVertical: 8,
  },
  activeActions: {
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xs,
    gap: Spacing.xs,
  },
  secondaryControl: {
    minHeight: 40,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    borderWidth: 1,
  },
  pauseControl: {
    backgroundColor: Colors.elevated,
    borderColor: Colors.border,
  },
  resumeControl: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  secondaryControlLabel: {
    color: Colors.textPrimary,
    fontFamily: Typography.fontBold,
    fontSize: Typography.size.sm,
    letterSpacing: 0,
  },
  secondaryControlLabelActive: {
    color: Colors.background,
    fontFamily: Typography.fontBold,
    fontSize: Typography.size.sm,
    letterSpacing: 0,
  },
  stopControl: {
    minHeight: 46,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 0,
  },
  stopControlLabel: {
    color: Colors.background,
    fontFamily: Typography.fontBold,
    fontSize: Typography.size.lg,
    letterSpacing: 0,
  },
});











