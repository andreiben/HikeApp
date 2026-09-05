import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Polyline as MapPolyline } from "react-native-maps";
import BottomSheet, {
  BottomSheetFlatList,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import Svg, { Polyline as SvgPolyline } from "react-native-svg";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MainStackParamList } from "../navigation";
import { api, type Route } from "../services/api";
import { getAccessToken } from "../services/authStorage";
import {
  addFavorite,
  fetchFavoriteIds,
  removeFavorite,
} from "../services/favorites";
import { getRoutes } from "../services/routesCache";
import { showError, showSuccess } from "../services/toast";
import RouteCard from "../components/RouteCard";
import {
  GlassButton,
  GlassCard,
} from "../components/ui";
import { PressableFeedback } from "../components/ui/PressableFeedback";
import {
  BorderRadius,
  Colors,
  Shadow,
  Spacing,
  Typography,
} from "../theme";

const TAG_LABELS: Record<string, string> = {
  alpine: "Alpin",
  scenic: "Panoramic",
  forest: "Pădure",
  mountain: "Munte",
  ridge: "Creastă",
  summit: "Vârf",
  river: "Râu",
  lake: "Lac",
  waterfall: "Cascadă",
  cave: "Peșteră",
  rocky: "Stâncos",
  meadow: "Pajiște",
  family: "Familie",
  loop: "Circuit",
  technical: "Tehnic",
  exposed: "Expus",
  refuge: "Refugiu",
  hut: "Cabană",
  glacier: "Ghețar",
  via_ferrata: "Via ferrata",
  popular: "Popular",
  remote: "Izolat",
  historic: "Istoric",
  panoramic: "Panoramic",
  challenging: "Solicitant",
  easy: "Ușor",
  moderate: "Moderat",
  hard: "Dificil",
  expert: "Extrem",
};

function translateTag(tag: string): string {
  const key = tag.toLowerCase();
  return TAG_LABELS[key] ?? tag;
}

const SEASON_LABELS: Record<string, string> = {
  spring: "Primăvară",
  summer: "Vară",
  autumn: "Toamnă",
  fall: "Toamnă",
  winter: "Iarnă",
  january: "Ianuarie",
  february: "Februarie",
  march: "Martie",
  april: "Aprilie",
  may: "Mai",
  june: "Iunie",
  july: "Iulie",
  august: "August",
  september: "Septembrie",
  october: "Octombrie",
  november: "Noiembrie",
  december: "Decembrie",
  "all year": "Tot anul",
  "all-year": "Tot anul",
  "year-round": "Tot anul",
};

function translateSeason(value: string): string {
  // Handle ranges like "Spring–Autumn", "Summer-Autumn", "July–August" (en-dash, em-dash or hyphen).
  const parts = value.split(/\s*[–—\-]\s*/);
  if (parts.length > 1) {
    return parts.map((part) => translateSeason(part)).join(" – ");
  }
  const key = value.trim().toLowerCase();
  return SEASON_LABELS[key] ?? value;
}


type HikeItem = {
  id: string;
  routeId: string | null;
  status: string;
  distanceM: number | null;
  elevationGainM: number | null;
};

type RouteHistory = {
  count: number;
  lastHikedAt: string | null;
};

type Dificultate = "easy" | "moderate" | "hard" | "expert";
type TrailCondition = "dry" | "muddy" | "snowy" | "overgrown" | "blocked";
type PoiType = "viewpoint" | "spring" | "drinking_water";
type Poi = { lat: number; lon: number; name: string | null; type: PoiType };

type RouteShapeSVGProps = {
  route: Route;
  width: number;
};


const INITIAL_REGION = {
  latitude: 45.5,
  longitude: 24.5,
  latitudeDelta: 3.0,
  longitudeDelta: 3.0,
};

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_SPARKLINE_WIDTH = Math.min(SCREEN_WIDTH * 0.35, 180);
const RECOMMENDED_SPARKLINE_WIDTH = Math.min(SCREEN_WIDTH * 0.32, 140);
const SPARKLINE_HEIGHT = 24;
const ROUTE_SHAPE_PADDING = 2;
const FAVORITE_COLOR = "#E25822";

const DIFFICULTY_COLORS: Record<Dificultate, string> = {
  easy: Colors.difficultyEasy,
  moderate: Colors.difficultyModerate,
  hard: Colors.difficultyHard,
  expert: Colors.difficultyExpert,
};

const FILTER_OPTIONS: Array<{ label: string; value: Dificultate | null }> = [
  { label: "Toate", value: null },
  { label: "Ușor", value: "easy" },
  { label: "Moderat", value: "moderate" },
  { label: "Greu", value: "hard" },
  { label: "Expert", value: "expert" },
];

const TRAIL_CONDITION_META: Record<
  TrailCondition,
  {
    color: string;
    icon: React.ComponentProps<typeof Ionicons>["name"];
    label: string;
  }
> = {
  dry: { color: "#4CAF50", icon: "sunny-outline", label: "Uscat" },
  muddy: { color: "#FF9800", icon: "water-outline", label: "Noroios" },
  snowy: { color: "#2196F3", icon: "snow-outline", label: "Inzapezit" },
  overgrown: { color: "#FFC107", icon: "leaf-outline", label: "Napadit" },
  blocked: {
    color: "#F44336",
    icon: "close-circle-outline",
    label: "Blocat",
  },
};

function difficultyColor(difficulty: string): string {
  const normalizedDificultate = difficulty.toLowerCase() as Dificultate;
  return DIFFICULTY_COLORS[normalizedDificultate] ?? Colors.textTertiary;
}

function formatDificultateLabel(difficulty: string): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1).toLowerCase();
}

function formatPoiType(type: PoiType): string {
  if (type === "viewpoint") return "Belvedere";
  if (type === "spring") return "Izvor";
  return "Apa potabila";
}

function withAlpha(hexColor: string, alpha: string): string {
  return `${hexColor}${alpha}`;
}

function normalize(str: string): string {
  return str.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCoordinateArray(
  value: unknown
): value is Array<{ latitude: number; longitude: number }> {
  return (
    Array.isArray(value) &&
    value.every(
      (point) =>
        isObject(point) &&
        isFiniteNumber(point.latitude) &&
        isFiniteNumber(point.longitude)
    )
  );
}

function getRouteShapePoints(route: Route): string {
  if (route.geometry.length < 2) return "";

  const latitudes = route.geometry.map((point) => point.latitude);
  const longitudes = route.geometry.map((point) => point.longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const latitudeRange = maxLatitude - minLatitude || 1;
  const longitudeRange = maxLongitude - minLongitude || 1;
  const drawableWidth = 100 - ROUTE_SHAPE_PADDING * 2;
  const drawableHeight = SPARKLINE_HEIGHT - ROUTE_SHAPE_PADDING * 2;

  return route.geometry
    .map((point) => {
      const x =
        ROUTE_SHAPE_PADDING +
        ((point.longitude - minLongitude) / longitudeRange) * drawableWidth;
      const y =
        ROUTE_SHAPE_PADDING +
        ((maxLatitude - point.latitude) / latitudeRange) * drawableHeight;

      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function normalizeRoutes(data: unknown): Route[] {
  if (!Array.isArray(data)) return [];

  return data.filter((item): item is Route => {
    if (!isObject(item)) return false;
    const { tags } = item;

    return (
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.region === "string" &&
      isFiniteNumber(item.distanceKm) &&
      isFiniteNumber(item.elevationGainM) &&
      isFiniteNumber(item.estimatedDurationH) &&
      typeof item.difficulty === "string" &&
      isFiniteNumber(item.startLatitude) &&
      isFiniteNumber(item.startLongitude) &&
      isFiniteNumber(item.endLatitude) &&
      isFiniteNumber(item.endLongitude) &&
      isCoordinateArray(item.geometry) &&
      (item.description == null || typeof item.description === "string") &&
      (item.bestSeason == null || typeof item.bestSeason === "string") &&
      (item.condition == null || typeof item.condition === "string") &&
      (tags == null ||
        (Array.isArray(tags) && tags.every((tag) => typeof tag === "string")))
    );
  });
}

function isHikeItem(value: unknown): value is HikeItem {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    (typeof value.routeId === "string" || value.routeId === null) &&
    typeof value.status === "string" &&
    (value.distanceM === null || isFiniteNumber(value.distanceM)) &&
    (value.elevationGainM === null || isFiniteNumber(value.elevationGainM))
  );
}

type Navigation = NativeStackNavigationProp<MainStackParamList>;

type RouteStatProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
};

function RouteStat({ icon, label }: RouteStatProps) {
  return (
    <View style={styles.routeStat}>
      <Ionicons name={icon} size={14} color={Colors.textTertiary} />
      <Text style={styles.routeStatText}>{label}</Text>
    </View>
  );
}

function RouteShapeSVG({ route, width }: RouteShapeSVGProps) {
  const points = useMemo(() => getRouteShapePoints(route), [route]);

  if (points.length === 0) {
    return null;
  }

  return (
    <View style={styles.sparklineContainer}>
      <Svg
        width={width}
        height={SPARKLINE_HEIGHT}
        viewBox={`0 0 100 ${SPARKLINE_HEIGHT}`}
      >
        <SvgPolyline
          points={points}
          fill="none"
          stroke={Colors.forest}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

type DetailCellProps = {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  label: string;
  value: string;
};

function DetailCell({ icon, label, value }: DetailCellProps) {
  return (
    <GlassCard style={styles.detailCard}>
      <View style={styles.detailHeader}>
        <Ionicons name={icon} size={18} color={Colors.forest} />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text style={styles.detailValue}>{value}</Text>
    </GlassCard>
  );
}

export default function ExploreScreen() {
  const navigation = useNavigation<Navigation>();
  const insets = useSafeAreaInsets();
  const listSheetRef = useRef<BottomSheet>(null);
  const detailSheetRef = useRef<BottomSheet>(null);
  const hasHandledInitialRegion = useRef(false);
  const skeletonOpacity = useRef(new Animated.Value(0.4)).current;

  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [selectedRoute, setSelectedRoute] = useState<Route | null>(null);
  const [pois, setPois] = useState<Poi[]>([]);
  const [completedHikes, setCompletedHikes] = useState<HikeItem[]>([]);
  const [hikedHistory, setHikedHistory] = useState<Record<string, RouteHistory>>(
    {}
  );
  const [inputText, setInputText] = useState("");
  const [searchQuery, setCautăQuery] = useState("");
  const [selectedDificultate, setSelectedDificultate] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() => new Set());
  const [showOnlyFavorite, setShowOnlyFavorite] = useState(false);
  const [recommendationsCollapsed, setRecommendationsCollapsed] = useState(false);

  const listSnapPoints = useMemo(() => ["15%", "45%", "92%"], []);
  const detailSnapPoints = useMemo(() => ["50%", "92%"], []);

  useEffect(() => {
    if (!loading) {
      skeletonOpacity.setValue(0.4);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(skeletonOpacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(skeletonOpacity, {
          toValue: 0.4,
          duration: 700,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [loading, skeletonOpacity]);

  useEffect(() => {
    if (!selectedRoute) { setPois([]); return; }
    const geom = selectedRoute.geometry;
    if (!Array.isArray(geom) || geom.length === 0) { setPois([]); return; }
    const midIdx = Math.floor(geom.length / 2);
    const mid = geom[midIdx];
    const lat = typeof mid?.latitude === "number" ? mid.latitude : null;
    const lon = typeof mid?.longitude === "number" ? mid.longitude : null;
    if (lat === null || lon === null) { setPois([]); return; }
    const radiusKm = Math.min(10, Math.max(2, (selectedRoute.distanceKm ?? 4) / 2 + 1));
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        const response = await api.get<Poi[]>("/pois", {
          params: { lat, lon, radius_km: radiusKm },
          headers: token ? { Authorization: "Bearer " + token } : undefined,
        });
        if (!cancelled) setPois(Array.isArray(response.data) ? response.data : []);
      } catch {
        if (!cancelled) setPois([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedRoute]);

  useEffect(() => {
    let cancelled = false;

    async function fetchRoutes() {
      try {
        const fetched = await getRoutes();
        if (!cancelled) {
          setRoutes(normalizeRoutes(fetched));
          setError(false);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setLoading(false);
        }
      }
    }

    void fetchRoutes();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleRefresh = useCallback(async () => {
    try {
      setRefreshing(true);
      const fetched = await getRoutes(true);
      setRoutes(normalizeRoutes(fetched));
      setError(false);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  const loadCompletedHikes = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) {
        setCompletedHikes([]);
        return;
      }

      const response = await api.get("/hikes", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const hikes: HikeItem[] = Array.isArray(response.data?.hikes)
        ? response.data.hikes.filter(isHikeItem)
        : [];

      setCompletedHikes(
        hikes.filter((hike) => hike.status.toLowerCase() === "completed")
      );
    } catch {
      setCompletedHikes([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadCompletedHikes();
    }, [loadCompletedHikes])
  );

  const loadFavorite = useCallback(async () => {
    try {
      setFavoriteIds(new Set(await fetchFavoriteIds()));
    } catch {
      setFavoriteIds(new Set());
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadFavorite();
    }, [loadFavorite])
  );

  useEffect(() => {
    let cancelled = false;

    async function fetchHikedHistory() {
      if (routes.length === 0) {
        if (!cancelled) {
          setHikedHistory({});
        }
        return;
      }

      try {
        const token = await getAccessToken();

        if (!token) {
          if (!cancelled) {
            setHikedHistory({});
          }
          return;
        }

        const routeIds = routes.map((route) => route.id).join(",");
        const response = await api.get(`/routes/my-history/batch?ids=${routeIds}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const historyData = isObject(response.data) ? response.data : {};

        if (!cancelled) {
          setHikedHistory(
            routes.reduce<Record<string, RouteHistory>>((accumulator, route) => {
              const value = historyData[route.id];

              accumulator[route.id] =
                isObject(value) &&
                isFiniteNumber(value.count) &&
                (typeof value.lastHikedAt === "string" || value.lastHikedAt === null)
                  ? {
                      count: value.count,
                      lastHikedAt: value.lastHikedAt,
                    }
                  : { count: 0, lastHikedAt: null };

              return accumulator;
            }, {})
          );
        }
      } catch {
        if (!cancelled) {
          setHikedHistory({});
        }
      }
    }

    void fetchHikedHistory();

    return () => {
      cancelled = true;
    };
  }, [routes]);

  useEffect(() => {
    setDescExpanded(false);
  }, [selectedRoute?.id]);



  const filteredRoutes = useMemo(() => {
    const normalizedQuery = normalize(searchQuery.trim());

    return routes.filter((route) => {
      const matchesCaută =
        normalizedQuery.length === 0 ||
        normalize(route.name).includes(normalizedQuery);
      const matchesDificultate =
        selectedDificultate === null ||
        route.difficulty.toLowerCase() === selectedDificultate;
      const matchesFavorite = !showOnlyFavorite || favoriteIds.has(route.id);

      return matchesCaută && matchesDificultate && matchesFavorite;
    });
  }, [favoriteIds, routes, searchQuery, selectedDificultate, showOnlyFavorite]);

  const recommendedRoutes = useMemo(() => {
    if (completedHikes.length < 3) return [];

    const hikesWithMetrics = completedHikes.filter(
      (hike): hike is HikeItem & { distanceM: number; elevationGainM: number } =>
        hike.distanceM != null && hike.elevationGainM != null
    );

    if (hikesWithMetrics.length === 0) return [];

    const avgDistanțăM =
      hikesWithMetrics.reduce((total, hike) => total + hike.distanceM, 0) /
      hikesWithMetrics.length;
    const avgElevationGainM =
      hikesWithMetrics.reduce(
        (total, hike) => total + hike.elevationGainM,
        0
      ) / hikesWithMetrics.length;

    const completionCounts = completedHikes.reduce((counts, hike) => {
      if (!hike.routeId) return counts;
      counts.set(hike.routeId, (counts.get(hike.routeId) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());

    return routes
      .map((route) => {
        const routeDistanțăM = route.distanceKm * 1000;
        return {
          route,
          completionCount: completionCounts.get(route.id) ?? 0,
          distanceDelta: Math.abs(routeDistanțăM - avgDistanțăM),
          matchesDistanță:
            routeDistanțăM >= avgDistanțăM * 0.7 &&
            routeDistanțăM <= avgDistanțăM * 1.3,
          matchesElevation:
            route.elevationGainM >= avgElevationGainM * 0.6 &&
            route.elevationGainM <= avgElevationGainM * 1.4,
        };
      })
      .filter(
        ({ completionCount, matchesDistanță, matchesElevation }) =>
          completionCount <= 2 && matchesDistanță && matchesElevation
      )
      .sort((left, right) => {
        if (left.completionCount !== right.completionCount) {
          return left.completionCount - right.completionCount;
        }

        return left.distanceDelta - right.distanceDelta;
      })
      .slice(0, 5)
      .map(({ route }) => route);
  }, [completedHikes, routes]);

  const collapseListSheet = useCallback(() => {
    listSheetRef.current?.snapToIndex(0);
  }, []);

  const handleSelectRoute = useCallback((route: Route) => {
    setSelectedRoute(route);
    detailSheetRef.current?.snapToIndex(0);
  }, []);

  const handleDetailSheetClose = useCallback(() => {
    setSelectedRoute(null);
  }, []);

  const handlePlanPress = useCallback(() => {
    if (!selectedRoute) return;
    navigation.navigate("MainTabs", {
      screen: "Plan",
      params: { selectedRouteId: selectedRoute.id },
    });
  }, [navigation, selectedRoute]);

  const handleRecordPress = useCallback(() => {
    if (!selectedRoute) return;
    navigation.navigate("MainTabs", {
      screen: "Record",
      params: {
        routeId: selectedRoute.id,
        routeName: selectedRoute.name,
      },
    });
  }, [navigation, selectedRoute]);

  const handleCautăTextChange = useCallback((value: string) => {
    setInputText(value);
    if (value.trim() === "") {
      setCautăQuery("");
    }
  }, []);

  const handleCautăSubmit = useCallback((value: string) => {
    setCautăQuery(value.trim());
  }, []);

  const toggleFavorite = useCallback(
    async (routeId: string) => {
      const wasFavorite = favoriteIds.has(routeId);

      setFavoriteIds((currentIds) => {
        const nextIds = new Set(currentIds);
        if (wasFavorite) {
          nextIds.delete(routeId);
        } else {
          nextIds.add(routeId);
        }
        return nextIds;
      });

      try {
        if (wasFavorite) {
          await removeFavorite(routeId);
          showSuccess("Eliminat din salvate");
        } else {
          await addFavorite(routeId);
          showSuccess("Ruta salvata");
        }
      } catch {
        setFavoriteIds((currentIds) => {
          const nextIds = new Set(currentIds);
          if (wasFavorite) {
            nextIds.add(routeId);
          } else {
            nextIds.delete(routeId);
          }
          return nextIds;
        });
        showError("Nu s-a putut actualiza ruta salvata", "Incearca din nou.");
      }
    },
    [favoriteIds]
  );

  const handleRegionChangeComplete = useCallback(() => {
    if (!hasHandledInitialRegion.current) {
      hasHandledInitialRegion.current = true;
      return;
    }

    collapseListSheet();
  }, [collapseListSheet]);

  const renderPolylines = () =>
    filteredRoutes.map((route) => (
      <MapPolyline
        key={route.id}
        coordinates={route.geometry}
        strokeColor={difficultyColor(route.difficulty)}
        strokeWidth={5}
        tappable
        onPress={() => handleSelectRoute(route)}
      />
    ));

  const renderSelectedMarkers = () => {
    if (!selectedRoute) return null;

    return (
      <>
        <Marker
          key={`${selectedRoute.id}-start`}
          coordinate={{
            latitude: selectedRoute.startLatitude,
            longitude: selectedRoute.startLongitude,
          }}
          pinColor="green"
        />
        <Marker
          key={`${selectedRoute.id}-end`}
          coordinate={{
            latitude: selectedRoute.endLatitude,
            longitude: selectedRoute.endLongitude,
          }}
          pinColor="red"
        />
      </>
    );
  };

  const renderRouteItem = useCallback(({
    item,
  }: {
    item: Route;
  }) => {
    return (
      <RouteCard
        routeName={item.name}
        difficulty={item.difficulty}
        distanceKm={item.distanceKm}
        elevationGainM={item.elevationGainM}
        estimatedDurationH={item.estimatedDurationH}
        condition={item.condition}
        onPress={() => handleSelectRoute(item)}
      />
    );
  }, [handleSelectRoute]);

  const renderRecommendedRouteItem = useCallback(({
    item,
  }: {
    item: Route;
  }) => {
    return (
      <RouteCard
        routeName={item.name}
        difficulty={item.difficulty}
        distanceKm={item.distanceKm}
        elevationGainM={item.elevationGainM}
        estimatedDurationH={item.estimatedDurationH}
        condition={item.condition}
        onPress={() => handleSelectRoute(item)}
        style={styles.recommendedRouteCard}
      />
    );
  }, [handleSelectRoute]);

  const renderListHeader = useCallback(() => {
    if (recommendedRoutes.length === 0) return null;
    if (searchQuery.trim().length > 0) return null;

    return (
      <View style={styles.recommendedSection}>
        <PressableFeedback
          style={styles.recommendedTitleRow}
          onPress={() =>
            setRecommendationsCollapsed((currentValue) => !currentValue)
          }
        >
          <Ionicons name="sparkles" size={16} color={Colors.textPrimary} />
          <Text style={[styles.recommendedTitle, { flex: 1 }]}>
            Recomandat pentru tine
          </Text>
          <Ionicons
            name={recommendationsCollapsed ? "chevron-down" : "chevron-up"}
            size={16}
            color={Colors.textPrimary}
          />
        </PressableFeedback>
        {recommendationsCollapsed ? null : (
          <FlatList
            horizontal
            data={recommendedRoutes}
            keyExtractor={(item) => item.id}
            renderItem={renderRecommendedRouteItem}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recommendedListContent}
          />
        )}
      </View>
    );
  }, [
    recommendedRoutes,
    renderRecommendedRouteItem,
    searchQuery,
    recommendationsCollapsed,
  ]);

  const renderEmptyState = useCallback(() => {
    if (loading || error) {
      return null;
    }

    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateTitle}>Nicio rută găsită</Text>
        <Text style={styles.emptyStateBody}>Încearcă să modifici filtrele</Text>
      </View>
    );
  }, [error, loading]);

  const renderLoadingSkeleton = useCallback(() => {
    return (
      <View style={styles.skeletonList}>
        {[0, 1, 2].map((item) => (
          <Animated.View
            key={item}
            style={[styles.skeletonCard, { opacity: skeletonOpacity }]}
          />
        ))}
      </View>
    );
  }, [skeletonOpacity]);

  const renderListSeparator = useCallback(() => {
    return <View style={styles.listSeparator} />;
  }, []);

  const selectedRouteDescription = selectedRoute?.description?.trim() ?? "";
  const shouldTruncateDescription = selectedRouteDescription.length > 120;
  const visibleDescription =
    !shouldTruncateDescription || descExpanded
      ? selectedRouteDescription
      : `${selectedRouteDescription.slice(0, 120)}...`;
  const visibleTags = selectedRoute?.tags?.slice(0, 8) ?? [];
  const selectedRouteCondition = selectedRoute
    ? (selectedRoute.condition as TrailCondition | undefined)
    : undefined;
  const selectedRouteConditionMeta = selectedRouteCondition
    ? TRAIL_CONDITION_META[selectedRouteCondition]
    : null;
  const selectedRouteIsFavorite = selectedRoute
    ? favoriteIds.has(selectedRoute.id)
    : false;

  return (
    <GestureHandlerRootView style={styles.container}>
      <MapView
        style={styles.map}
        mapType="hybrid"
        initialRegion={INITIAL_REGION}
        onPanDrag={collapseListSheet}
        onRegionChangeComplete={handleRegionChangeComplete}
        showsUserLocation
      >
        {renderPolylines()}
        {selectedRoute ? (
          <MapPolyline
            coordinates={selectedRoute.geometry}
            strokeColor={Colors.alpine}
            strokeWidth={7}
            lineCap="round"
            lineJoin="round"
            zIndex={2}
          />
        ) : null}
        {renderSelectedMarkers()}
        {pois.map((poi, index) => (
          <Marker
            key={"poi-" + poi.type + "-" + poi.lat + "-" + poi.lon + "-" + index}
            coordinate={{ latitude: poi.lat, longitude: poi.lon }}
            title={poi.name ?? formatPoiType(poi.type)}
            description={formatPoiType(poi.type)}
            pinColor={poi.type === "viewpoint" ? "blue" : "#0891B2"}
          />
        ))}
      </MapView>

      {error && !loading && (
        <View style={styles.overlay}>
          <Text style={styles.errorText}>Nu s-au putut incarca traseele</Text>
        </View>
      )}

      <BottomSheet
        ref={listSheetRef}
        index={1}
        snapPoints={listSnapPoints}
        enableDynamicSizing={false}
        topInset={insets.top}
        handleIndicatorStyle={styles.sheetHandleIndicator}
        backgroundStyle={styles.listSheetBackground}
        enableContentPanningGesture={false}
      >
        <View style={styles.listSheetContent}>
          <View
            pointerEvents="box-none"
            style={[
              styles.stickyHeader,
              { paddingTop: Spacing.base, paddingHorizontal: Spacing.base },
            ]}
          >
            <Text style={styles.screenTitle}>Explorează</Text>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput
                value={inputText}
                onChangeText={handleCautăTextChange}
                onSubmitEditing={() => handleCautăSubmit(inputText)}
                placeholder="Caută rute..."
                placeholderTextColor={Colors.textMuted}
                style={styles.searchInput}
                returnKeyType="search"
              />
              {inputText.length > 0 && (
                <Pressable onPress={() => { setInputText(""); setCautăQuery(""); }}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </Pressable>
              )}
            </View>
            <View style={styles.filterRow}>
              {FILTER_OPTIONS.map((option) => {
                const isActive = selectedDificultate === option.value;
                return (
                  <Pressable
                    key={option.label}
                    onPress={() => setSelectedDificultate(option.value)}
                    style={[
                      styles.filterChip,
                      isActive ? styles.filterChipActive : styles.filterChipInactive,
                    ]}
                  >
                    <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityLabel={`Afiseaza traseele salvate, ${favoriteIds.size} salvate`}
                onPress={() => setShowOnlyFavorite((currentValue) => !currentValue)}
                style={[
                  styles.filterChip,
                  styles.favoriteFiltreazăChip,
                  showOnlyFavorite
                    ? styles.filterChipActive
                    : styles.filterChipInactive,
                ]}
              >
                <Ionicons
                  name={showOnlyFavorite ? "bookmark" : "bookmark-outline"}
                  size={16}
                  color={showOnlyFavorite ? Colors.background : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.filterChipText,
                    showOnlyFavorite && styles.filterChipTextActive,
                  ]}
                >
                  {favoriteIds.size > 0 ? `Salvate (${favoriteIds.size})` : "Saved"}
                </Text>
              </Pressable>
            </View>
          </View>

          <BottomSheetFlatList
            data={filteredRoutes}
            keyExtractor={(item) => item.id}
            renderItem={renderRouteItem}
            initialNumToRender={8}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews={false}
            contentContainerStyle={[
              styles.listContent,
              filteredRoutes.length === 0 ? styles.listContentEmpty : null,
              { paddingBottom: insets.bottom + Spacing.xl },
            ]}
            ListHeaderComponent={renderListHeader}
            ItemSeparatorComponent={renderListSeparator}
            ListEmptyComponent={loading ? renderLoadingSkeleton : renderEmptyState}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={Colors.accent}
              />
            }
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      </BottomSheet>

      <BottomSheet
        ref={detailSheetRef}
        index={-1}
        snapPoints={detailSnapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        onClose={handleDetailSheetClose}
        handleIndicatorStyle={styles.sheetHandleIndicator}
        backgroundStyle={styles.detailSheetBackground}
      >
        {selectedRoute ? (
          <BottomSheetScrollView
            contentContainerStyle={[
              styles.detailSheetContent,
              { paddingBottom: insets.bottom + Spacing.base },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <Pressable
              style={styles.closeButton}
              onPress={() => detailSheetRef.current?.close()}
            >
              <Ionicons name="close" size={18} color={Colors.textPrimary} />
            </Pressable>
            <Pressable
              style={styles.favoriteButton}
              onPress={() => toggleFavorite(selectedRoute.id)}
            >
              <Ionicons
                name={selectedRouteIsFavorite ? "bookmark" : "bookmark-outline"}
                size={18}
                color={selectedRouteIsFavorite ? FAVORITE_COLOR : Colors.textPrimary}
              />
            </Pressable>

            <Text style={styles.panelRouteName}>{selectedRoute.name}</Text>
            <View style={styles.regionRow}>
              <Ionicons
                name="location-outline"
                size={16}
                color={Colors.textSecondary}
              />
              <Text style={styles.panelRegionText}>{selectedRoute.region}</Text>
            </View>

            {selectedRouteConditionMeta ? (
              <View
                style={[
                  styles.detailConditionChip,
                  {
                    backgroundColor: withAlpha(
                      selectedRouteConditionMeta.color,
                      "1F"
                    ),
                  },
                ]}
              >
                <Ionicons
                  name={selectedRouteConditionMeta.icon}
                  size={12}
                  color={selectedRouteConditionMeta.color}
                />
                <Text
                  style={[
                    styles.conditionChipText,
                    { color: selectedRouteConditionMeta.color },
                  ]}
                >
                  {selectedRouteConditionMeta.label}
                </Text>
              </View>
            ) : null}

            <View style={styles.detailGrid}>
              <DetailCell
                icon="trail-sign-outline"
                label="Distanță"
                value={`${selectedRoute.distanceKm.toFixed(1)} km`}
              />
              <DetailCell
                icon="trending-up-outline"
                label="Altitudine"
                value={`${selectedRoute.elevationGainM} m`}
              />
              <DetailCell
                icon="time-outline"
                label="Durata"
                value={`${selectedRoute.estimatedDurationH.toFixed(1)} h`}
              />
              <DetailCell
                icon="speedometer-outline"
                label="Dificultate"
                value={formatDificultateLabel(selectedRoute.difficulty)}
              />
            </View>

            {selectedRouteDescription.length > 0 ? (
              <View style={styles.descriptionSection}>
                <Text style={styles.descriptionLabel}>Descriere</Text>
                <Text style={styles.descriptionText}>{visibleDescription}</Text>
                {shouldTruncateDescription ? (
                  <TouchableOpacity
                    onPress={() => setDescExpanded((currentValue) => !currentValue)}
                  >
                    <Text style={styles.descriptionToggleText}>
                      {descExpanded ? "Arata mai putin" : "Arata mai mult"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}

            {visibleTags.length > 0 ? (
              <View style={styles.tagsSection}>
                <Text style={styles.tagsLabel}>Etichete:</Text>
                <View style={styles.tagsRow}>
                  {visibleTags.map((tag) => (
                    <View key={tag} style={styles.tagChip}>
                      <Text style={styles.tagChipText}>{translateTag(tag)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {selectedRoute.bestSeason ? (
              <View style={styles.bestSeasonRow}>
                <Ionicons
                  name="calendar-outline"
                  size={13}
                  color={Colors.textSecondary}
                />
                <Text style={styles.bestSeasonText}>
                  {`Cel mai bun sezon: ${translateSeason(selectedRoute.bestSeason)}`}
                </Text>
              </View>
            ) : null}

            <GlassButton
              label="Incepe inregistrarea traseului"
              onPress={handleRecordPress}
              variant="primary"
              style={styles.panelButton}
            />
            <GlassButton
              label="Planifica aceasta ruta"
              onPress={handlePlanPress}
              variant="secondary"
              style={styles.panelButton}
            />
          </BottomSheetScrollView>
        ) : null}
      </BottomSheet>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(28,42,34,0.88)",
    zIndex: 3,
  },
  errorText: {
    fontSize: Typography.size.md,
    color: Colors.textPrimary,
    fontWeight: Typography.weight.semibold,
  },
  listSheetBackground: {
    backgroundColor: Colors.background,
  },
  detailSheetBackground: {
    backgroundColor: Colors.surface,
  },
  sheetHandleIndicator: {
    backgroundColor: Colors.border,
  },
  listSheetContent: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.base,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing["3xl"],
    gap: 6,
  },
  emptyStateTitle: {
    fontFamily: Typography.fontSemibold,
    fontSize: Typography.size.lg,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  emptyStateBody: {
    fontFamily: Typography.fontRegular,
    fontSize: Typography.size.md,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: Typography.size.md * Typography.lineHeight.relaxed,
  },
  stickyHeader: {
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    backgroundColor: Colors.background,
  },
  screenTitle: {
    fontFamily: Typography.fontBold,
    fontSize: Typography.size["2xl"],
    color: Colors.textPrimary,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    minHeight: 44,
    borderRadius: 10,
    paddingHorizontal: Spacing.md,
    paddingVertical: 0,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontFamily: Typography.fontRegular,
    fontSize: Typography.size.md,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  filterChip: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderWidth: 1,
  },
  filterChipInactive: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  filterChipActive: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  favoriteFiltreazăChip: {
    justifyContent: "center",
  },
  filterChipText: {
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontMedium,
    color: Colors.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.background,
  },
  listSeparator: {
    height: 1,
    marginHorizontal: Spacing.base,
    marginVertical: Spacing.sm,
    backgroundColor: Colors.border,
  },
  skeletonList: {
    width: "100%",
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
  },
  skeletonCard: {
    minHeight: 56,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
  },
  recommendedSection: {
    marginBottom: Spacing.lg,
    gap: Spacing.sm,
    marginTop: Spacing.base,
  },
  recommendedTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  recommendedTitle: {
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
    fontFamily: Typography.fontSemibold,
  },
  recommendedListContent: {
    paddingRight: Spacing.base,
  },
  recommendedRouteCard: {
    width: 280,
    marginRight: Spacing.md,
  },
  recommendedCard: {
    width: 200,
    height: 132,
    marginRight: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.glassLight,
    justifyContent: "space-between",
    position: "relative",
    ...Shadow.md,
  },
  recommendedHeader: {
    gap: Spacing.sm,
  },
  recommendedHeaderSaved: {
    paddingRight: 28,
  },
  recommendedFooter: {
    gap: Spacing.sm,
  },
  recommendedRouteName: {
    fontSize: Typography.size.md,
    color: Colors.textPrimary,
    fontWeight: Typography.weight.semibold,
  },
  recommendedDistanță: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  routeCard: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Colors.glassLight,
    borderRadius: BorderRadius.xl,
    padding: 14,
    position: "relative",
    ...Shadow.md,
  },
  savedIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glassLight,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1,
  },
  routeNameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  hikedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: `${Colors.forest}18`,
  },
  hikedBadgeText: {
    fontSize: 11,
    color: Colors.forest,
    fontWeight: Typography.weight.semibold,
  },
  routeAccent: {
    width: 4,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.md,
  },
  routeContent: {
    flex: 1,
    gap: Spacing.sm,
  },
  routeContentSaved: {
    paddingRight: 28,
  },
  routeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  routeHeaderText: {
    flex: 1,
    gap: Spacing.xs,
  },
  routeName: {
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
    fontWeight: Typography.weight.semibold,
  },
  conditionChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  detailConditionChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  conditionChipText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
  },
  regionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  regionText: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: Spacing.md,
  },
  routeStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  routeStatText: {
    fontSize: Typography.size.sm,
    color: Colors.textTertiary,
  },
  sparklineContainer: {
    marginTop: Spacing.xs,
    alignSelf: "flex-start",
  },
  difficultyPill: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 5,
  },
  difficultyPillText: {
    fontSize: Typography.size.xs,
    fontWeight: Typography.weight.semibold,
  },
  riskBadge: {
    alignSelf: "flex-start",
  },
  detailSheetContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  closeButton: {
    position: "absolute",
    top: Spacing.base,
    right: Spacing.base,
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glassLight,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.glassBorderDark,
    zIndex: 1,
  },
  favoriteButton: {
    position: "absolute",
    top: Spacing.base,
    left: Spacing.base,
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.glassLight,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.glassBorderDark,
    zIndex: 1,
  },
  panelRouteName: {
    fontSize: Typography.size["2xl"],
    color: Colors.textPrimary,
    fontWeight: Typography.weight.bold,
    paddingLeft: 44,
    paddingRight: 44,
    marginTop: Spacing.sm,
  },
  panelRegionText: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },
  detailGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
  },
  detailCard: {
    width: "47%",
    padding: Spacing.md,
    backgroundColor: Colors.glassLight,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  detailLabel: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    fontWeight: Typography.weight.medium,
  },
  detailValue: {
    fontSize: Typography.size.lg,
    color: Colors.textPrimary,
    fontWeight: Typography.weight.semibold,
  },
  descriptionSection: {
    marginBottom: Spacing.md,
  },
  descriptionLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: Typography.weight.semibold,
    marginBottom: Spacing.xs,
  },
  descriptionText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 13 * Typography.lineHeight.relaxed,
  },
  descriptionToggleText: {
    marginTop: Spacing.xs,
    fontSize: Typography.size.sm,
    color: Colors.forest,
    fontWeight: Typography.weight.semibold,
  },
  tagsSection: {
    marginBottom: Spacing.md,
  },
  tagsLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  tagChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 4,
    marginBottom: 4,
  },
  tagChipText: {
    color: Colors.textPrimary,
    fontSize: 11,
    fontWeight: Typography.weight.medium,
  },
  bestSeasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: Spacing.md,
  },
  bestSeasonText: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  panelButton: {
    width: "100%",
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
});
