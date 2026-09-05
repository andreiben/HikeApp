import { useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system/legacy";
// @ts-ignore -- dependency may be installed after offline code changes
import * as ImagePicker from "expo-image-picker";
import {
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { CompositeNavigationProp } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../hooks/useAuth";
import { PressableFeedback } from "../components/ui/PressableFeedback";
import { GlassButton } from "../components/ui/GlassButton";
import { GlassCard } from "../components/ui/GlassCard";
import { SkeletonLoader } from "../components/ui/SkeletonLoader";
import {
  BorderRadius,
  Colors,
  Spacing,
  Typography,
} from "../theme";
import type { MainStackParamList, MainTabParamList } from "../navigation";
import { api } from "../services/api";
import { getAccessToken } from "../services/authStorage";
import {
  checkAndFireLevelUp,
  checkStaleWeightReminder,
  markWeightUpdated,
  scheduleInactivityReminderIfNeeded,
} from "../services/notifications";
import { showError, showSuccess } from "../services/toast";
import { calculateUserCapacity } from "../utils/userCapacity";

const HAS_EXPO_IMAGE_PICKER = true;

type ProfilNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Profile">,
  NativeStackNavigationProp<MainStackParamList>
>;

type UserProfil = {
  displayName: string;
  experienceLevel: string;
  heightCm: number | null;
  weightKg: number | null;
  age: number | null;
  typicalBackpackWeightKg: number | null;
  hikesSoloUsually: boolean;
};

type HikeStats = {
  totalHikes: number;
  totalDistanceKm: number;
};

type HikeItem = {
  id: string;
  status: string;
  startedAt: string;
  distanceM: number | null;
  elevationGainM: number | null;
  durationS: number | null;
  difficulty?: string | null;
};

type FitnessLevel = "Sedentar" | "Ocazional" | "Activ" | "Atletic" | "Elite";

type FitnessTrendData = {
  fitnessLevel?: FitnessLevel | null;
  fitnessLevelScor?: number;
  fitnessLevelNextThreshold?: number | null;
  daysSinceLastHike?: number | null;
  streakWeeks?: number;
};
const FITNESS_LEVEL_COLORS: Record<FitnessLevel, string> = {
  Sedentar: Colors.accent,
  Ocazional: Colors.accent,
  Activ: Colors.accent,
  Atletic: Colors.accent,
  Elite: Colors.accent,
};

const FITNESS_LEVEL_LABELS: Record<FitnessLevel, string> = {
  Sedentar: "Sedentar",
  Ocazional: "Ocazional",
  Activ: "Activ",
  Atletic: "Atletic",
  Elite: "Elită",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatHours(totalSeconds: number): string {
  const hours = totalSeconds / 3600;
  return hours >= 10 ? hours.toFixed(0) : hours.toFixed(1);
}

function getEmailPrefix(email: string | null | undefined): string {
  if (!email) {
    return "";
  }

  return email.split("@")[0]?.trim() ?? "";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

function isUserProfil(value: unknown): value is UserProfil {
  return (
    isObject(value) &&
    typeof value.displayName === "string" &&
    typeof value.experienceLevel === "string" &&
    (value.heightCm === null || isFiniteNumber(value.heightCm)) &&
    (value.weightKg === null || isFiniteNumber(value.weightKg)) &&
    (value.age === null || isFiniteNumber(value.age)) &&
    (value.typicalBackpackWeightKg === null ||
      isFiniteNumber(value.typicalBackpackWeightKg)) &&
    typeof value.hikesSoloUsually === "boolean"
  );
}

function isHikeStats(value: unknown): value is HikeStats {
  return (
    isObject(value) &&
    isFiniteNumber(value.totalHikes) &&
    isFiniteNumber(value.totalDistanceKm)
  );
}

function isHikeItem(value: unknown): value is HikeItem {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    typeof value.status === "string" &&
    typeof value.startedAt === "string" &&
    (value.distanceM === null || isFiniteNumber(value.distanceM)) &&
    (value.elevationGainM === null || isFiniteNumber(value.elevationGainM)) &&
    (value.durationS === null || isFiniteNumber(value.durationS)) &&
    (value.difficulty === undefined ||
      value.difficulty === null ||
      typeof value.difficulty === "string")
  );
}

function extractEmailFromToken(token: string | null): string | null {
  if (!token) {
    return null;
  }

  const [, payload] = token.split(".");

  if (!payload) {
    return null;
  }

  try {
    const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalizedPayload.length % 4)) % 4);
    const decodedPayload = globalThis.atob?.(`${normalizedPayload}${padding}`);

    if (!decodedPayload) {
      return null;
    }

    const parsed = JSON.parse(decodedPayload) as { email?: unknown };
    return typeof parsed.email === "string" ? parsed.email : null;
  } catch {
    return null;
  }
}

function isFitnessLevel(value: unknown): value is FitnessLevel {
  return (
    value === "Sedentar" ||
    value === "Ocazional" ||
    value === "Activ" ||
    value === "Atletic" ||
    value === "Elite"
  );
}

function extractFitnessTrendData(value: unknown): FitnessTrendData | null {
  if (!isObject(value)) {
    return null;
  }

  return {
    fitnessLevel: isFitnessLevel(value.fitnessLevel) ? value.fitnessLevel : null,
    fitnessLevelScor: isFiniteNumber(value.fitnessLevelScor)
      ? value.fitnessLevelScor
      : undefined,
    fitnessLevelNextThreshold:
      value.fitnessLevelNextThreshold === null
        ? null
        : isFiniteNumber(value.fitnessLevelNextThreshold)
          ? value.fitnessLevelNextThreshold
          : undefined,
    daysSinceLastHike: isFiniteNumber(value.daysSinceLastHike)
      ? value.daysSinceLastHike
      : null,
    streakWeeks: isFiniteNumber(value.streakWeeks) ? value.streakWeeks : undefined,
  };
}

function Pill({
  label,
  color,
  backgroundColor,
}: {
  label: string;
  color: string;
  backgroundColor: string;
}) {
  return (
    <View style={[styles.pill, { backgroundColor }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function LoadingScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <GlassCard style={styles.heroCard}>
          <View style={styles.loadingHero}>
            <SkeletonLoader width={72} height={72} borderRadius={36} />
            <SkeletonLoader width="55%" height={28} borderRadius={14} />
            <SkeletonLoader width={116} height={30} borderRadius={BorderRadius.full} />
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statColumn}>
              <SkeletonLoader width={70} height={30} />
              <SkeletonLoader width={84} height={14} />
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statColumn}>
              <SkeletonLoader width={96} height={30} />
              <SkeletonLoader width={96} height={14} />
            </View>
          </View>
          <SkeletonLoader width="45%" height={22} borderRadius={11} />
        </GlassCard>

        <GlassCard style={styles.sectionCard}>
          <SkeletonLoader width="42%" height={24} />
          <SkeletonLoader width="36%" height={34} borderRadius={BorderRadius.full} />
          <SkeletonLoader width="100%" height={12} borderRadius={BorderRadius.full} />
        </GlassCard>

        <GlassCard style={styles.sectionCard}>
          <SkeletonLoader width="38%" height={24} />
          <SkeletonLoader width="68%" height={16} />
          <SkeletonLoader width="100%" height={44} borderRadius={BorderRadius.md} />
        </GlassCard>

        <GlassCard style={styles.sectionCard}>
          <SkeletonLoader width="30%" height={24} />
          <SkeletonLoader width="100%" height={64} borderRadius={BorderRadius.md} />
          <SkeletonLoader width="100%" height={64} borderRadius={BorderRadius.md} />
        </GlassCard>

        <SkeletonLoader width="100%" height={52} borderRadius={BorderRadius.full} />
      </ScrollView>
    </SafeAreaView>
  );
}

function FieldGroup({
  label,
  value,
  onChangeText,
  placeholder,
  numeric,
  isLast = false,
  editable = true,
}: {
  label: string;
  value: string;
  onChangeText?: (value: string) => void;
  placeholder?: string;
  numeric?: boolean;
  isLast?: boolean;
  editable?: boolean;
}) {
  return (
    <View style={[styles.fieldGroup, !isLast && styles.fieldBorder]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {editable ? (
        <TextInput
          placeholder={placeholder ?? label}
          placeholderTextColor={Colors.textTertiary}
          value={value}
          onChangeText={onChangeText}
          keyboardType={numeric ? "numeric" : "default"}
          style={[styles.textInput, numeric && styles.numberTextInput]}
        />
      ) : (
        <Text style={styles.fieldValue}>{value || "-"}</Text>
      )}
    </View>
  );
}

export default function ProfilScreen() {
  const navigation = useNavigation<ProfilNavigation>();
  const { accessToken, logout, user } = useAuth();
  const userSub = user?.id ?? "anonymous";
  const USER_AVATAR_URI_KEY = `user_avatar_uri_${userSub}`;
  const USER_DISPLAY_NAME_KEY = `user_display_name_${userSub}`;
  const [profile, setProfil] = useState<UserProfil | null>(null);
  const [traseus, setHikes] = useState<HikeItem[]>([]);
  const [traseuStats, setHikeStats] = useState<HikeStats | null>(null);
  const [fitnessTrendData, setFitnessTrendData] = useState<FitnessTrendData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [savedDisplayName, setSalveazădDisplayName] = useState("");
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [experienceLevel, setExperiențăLevel] = useState("");
  const [heightCm, setÎnălțimeCm] = useState("");
  const [weightKg, setGreutateKg] = useState("");
  const [age, setVârstă] = useState("");
  const [typicalBackpackGreutateKg, setTypicalBackpackGreutateKg] = useState("");
  const [traseusSoloUsually, setHikesSoloUsually] = useState(false);

  const fallbackEmail = user?.email ?? extractEmailFromToken(accessToken);
  const fallbackDisplayName = getEmailPrefix(fallbackEmail);

  const loadData = async (options: { showLoading?: boolean } = {}) => {
    setProfil(null);
    const showLoading = options.showLoading ?? true;

    try {
      if (showLoading) {
        setLoading(true);
      }
      const token = await getAccessToken();
      if (!token) {
        setProfil(null);
        setHikes([]);
        setHikeStats(null);
        setFitnessTrendData(null);
        setLoadError("Trebuie sa te autentifici pentru a vedea profilul.");
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };
      const [profileRes, traseusRes, statsRes, trendRes] = await Promise.all([
        api.get("/profile/me", { headers }),
        api.get("/hikes", { headers }),
        api.get("/hikes/stats", { headers }),
        api.get("/profile/fitness-trend", { headers }).catch(() => null),
      ]);

      const nextProfil = isUserProfil(profileRes.data?.profile)
        ? profileRes.data.profile
        : null;
      const nextHikes = Array.isArray(traseusRes.data?.hikes)
        ? traseusRes.data.hikes.filter(isHikeItem)
        : [];
      const nextStats = isHikeStats(statsRes.data?.stats) ? (statsRes.data.stats as HikeStats) : null;
      const nextTrendData = extractFitnessTrendData(trendRes?.data);

      setProfil(nextProfil);
      setHikes(nextHikes);
      setHikeStats(nextStats);
      setFitnessTrendData(nextTrendData);
      void checkAndFireLevelUp(nextTrendData?.fitnessLevel ?? null);
      void scheduleInactivityReminderIfNeeded(nextTrendData?.daysSinceLastHike ?? null);
      setLoadError(null);
    } catch (error: unknown) {
      setLoadError(getErrorMessage(error, "Nu s-au putut incarca datele profilului."));
      setHikes([]);
      setFitnessTrendData(null);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);
      await loadData({ showLoading: false });
    } finally {
      setRefreshing(false);
    }
  };

  const populateForm = (nextProfil: UserProfil | null, nextDisplayName: string) => {
    setDisplayName(nextDisplayName);
    setExperiențăLevel(nextProfil?.experienceLevel ?? "");
    setÎnălțimeCm(nextProfil?.heightCm != null ? String(nextProfil.heightCm) : "");
    setGreutateKg(nextProfil?.weightKg != null ? String(nextProfil.weightKg) : "");
    setVârstă(nextProfil?.age != null ? String(nextProfil.age) : "");
    setTypicalBackpackGreutateKg(
      nextProfil?.typicalBackpackWeightKg != null
        ? String(nextProfil.typicalBackpackWeightKg)
        : ""
    );
    setHikesSoloUsually(nextProfil?.hikesSoloUsually ?? false);
  };

  const handleEdit = () => {
    populateForm(profile, resolvedDisplayName);
    setEditing(true);
  };

  const handleAnulează = () => {
    populateForm(profile, resolvedDisplayName);
    setEditing(false);
  };

  const handleAvatarPress = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      showError("Permisiune necesara", "Permite accesul la biblioteca foto din Setari.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      const sourceUri = result.assets[0].uri;
      let persistentUri = sourceUri;
      try {
        const filename = `avatar_${userSub}.jpg`;
        const destUri = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.copyAsync({ from: sourceUri, to: destUri });
        persistentUri = destUri;
      } catch {
        // copy failed — fall back to original URI (will not survive restart)
      }
      setAvatarUri(persistentUri);
      try {
        await SecureStore.setItemAsync(USER_AVATAR_URI_KEY, persistentUri);
      } catch {
        // non-critical
      }
    }
  };

  const handleDisplayNameEditStart = () => {
    setDisplayNameDraft(resolvedDisplayName);
    setIsEditingDisplayName(true);
  };

  const handleDisplayNameEditAnulează = () => {
    setDisplayNameDraft(resolvedDisplayName);
    setIsEditingDisplayName(false);
  };

  const handleDisplayNameSalvează = async () => {
    const nextName = displayNameDraft.trim();
    const previousDisplayName = resolvedDisplayName;

    if (!nextName) {
      showError("Nume lipsa", "Numele afisat nu poate fi gol.");
      return;
    }

    try {
      const token = await getAccessToken();

      if (!token) {
        throw new Error("Not authenticated");
      }

      await api.patch(
        "/profile/display-name",
        { displayName: nextName },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await SecureStore.setItemAsync(USER_DISPLAY_NAME_KEY, nextName);
      setSalveazădDisplayName(nextName);
      setDisplayName(nextName);
      setIsEditingDisplayName(false);
    } catch (error: unknown) {
      setDisplayName(previousDisplayName);
      setDisplayNameDraft(previousDisplayName);
      showError("Eroare", getErrorMessage(error, "Nu s-a putut salva numele afisat."));
    }
  };

  const handleSalvează = async () => {
    try {
      setSaving(true);
      const token = await getAccessToken();
      if (!token) {
        showError("Eroare", "Neautentificat");
        return;
      }

      const nextGreutateKg = parseInt(weightKg, 10) || undefined;

      await api.post(
        "/profile/complete",
        {
          displayName,
          experienceLevel,
          heightCm: parseInt(heightCm, 10) || undefined,
          weightKg: nextGreutateKg,
          age: parseInt(age, 10) || undefined,
          typicalBackpackWeightKg: typicalBackpackGreutateKg
            ? parseInt(typicalBackpackGreutateKg, 10)
            : undefined,
          hikesSoloUsually: traseusSoloUsually,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (nextGreutateKg) {
        void markWeightUpdated();
      }

      setEditing(false);
      await loadData();
      showSuccess("Salvat", "Profil actualizat cu succes");
    } catch (error: unknown) {
      showError("Salvare esuat a", getErrorMessage(error, "Ceva a mers prost"));
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [user?.id]);

  useEffect(() => {
    void checkStaleWeightReminder();
  }, []);

  useEffect(() => {
    const loadLocalProfilPresentation = async () => {
      try {
        const [storedAvatarUri, storedDisplayNameValue] = await Promise.all([
          SecureStore.getItemAsync(USER_AVATAR_URI_KEY),
          SecureStore.getItemAsync(USER_DISPLAY_NAME_KEY),
        ]);

        setAvatarUri(storedAvatarUri);
        setSalveazădDisplayName(storedDisplayNameValue?.trim() ?? "");
      } catch {
        setAvatarUri(null);
        setSalveazădDisplayName("");
      }
    };

    void loadLocalProfilPresentation();
  }, []);

  const activeProfil = editing
    ? {
        displayName,
        experienceLevel,
        heightCm,
        weightKg,
        age,
        typicalBackpackGreutateKg,
        hikesSoloUsually: traseusSoloUsually,
      }
    : null;

  const normalizedExperiență = (
    editing ? activeProfil?.experienceLevel : profile?.experienceLevel
  )
    ?.trim()
    .toLowerCase();

  const resolvedDisplayName =
    savedDisplayName.trim() || profile?.displayName.trim() || fallbackDisplayName || "Hiker";
  const initialsSource = editing ? activeProfil?.displayName : resolvedDisplayName;
  const initials = initialsSource ? getInitials(initialsSource) : "?";
  const displayNameValue = editing ? activeProfil?.displayName || "-" : resolvedDisplayName;
  const showAvatarImage = HAS_EXPO_IMAGE_PICKER && !!avatarUri;

  const completedHikesCount = traseus.filter(h => h.status === "completed").length;
  const totalHikes = traseuStats?.totalHikes ?? completedHikesCount;
  const userCapacity = useMemo(() => calculateUserCapacity(traseus), [traseus]);
  const showCapabilitiesPrompt =
    userCapacity.sampleSize < 3 ||
    (userCapacity.learnedComfortDistanceKm == null &&
      userCapacity.learnedComfortDurationH == null &&
      userCapacity.learnedComfortElevationGainM == null);
  if (loading) {
    return <LoadingScreen />;
  }

  const fitnessProfilLevel = fitnessTrendData?.fitnessLevel ?? null;
  const fitnessProfilScor = Math.max(
    0,
    Math.min(12, fitnessTrendData?.fitnessLevelScor ?? 0)
  );
  const fitnessProfilColor = fitnessProfilLevel
    ? FITNESS_LEVEL_COLORS[fitnessProfilLevel]
    : Colors.accent;
  const fitnessProfilLevelLabel = fitnessProfilLevel
    ? FITNESS_LEVEL_LABELS[fitnessProfilLevel]
    : "-";
  const hasFitnessProfilScor = fitnessTrendData?.fitnessLevelScor != null;
  const fitnessStreakWeeks = fitnessTrendData?.streakWeeks ?? 0;
  const fitnessProfilProgressWidth = (
    fitnessProfilLevel === "Elite" || fitnessProfilScor >= 12
      ? "100%"
      : "4%"
  ) as `${number}%`;
  const totalDistanceValue = traseuStats ? traseuStats.totalDistanceKm.toFixed(1) : "0";
  const completedHikes = traseus.filter((traseu) => traseu.status === "completed");
  const totalElevationM = completedHikes.reduce(
    (total, traseu) => total + (traseu.elevationGainM ?? 0),
    0
  );
  const totalDurationS = completedHikes.reduce(
    (total, traseu) => total + (traseu.durationS ?? 0),
    0
  );
  const capabilityPaceKmh =
    userCapacity.learnedComfortDistanceKm != null &&
    userCapacity.learnedComfortDurationH != null &&
    userCapacity.learnedComfortDurationH > 0
      ? userCapacity.learnedComfortDistanceKm / userCapacity.learnedComfortDurationH
      : null;
  const bmi =
    profile?.heightCm != null && profile?.weightKg != null
      ? profile.weightKg / Math.pow(profile.heightCm / 100, 2)
      : null;
  const bmiLabel =
    bmi == null ? null
    : bmi < 18.5 ? 'Subponderal'
    : bmi < 25.0 ? 'Normal'
    : bmi < 30.0 ? 'Supraponderal'
    : 'Obezitate';
  const caloriesPerHour =
    profile?.weightKg != null ? Math.round(6.0 * profile.weightKg) : null;
  const motivationalLine =
    fitnessProfilLevel == null ? null
    : fitnessProfilLevel === 'Sedentar'
      ? 'Primul pas e cel mai important — încearcă un traseu ușor!'
    : fitnessProfilLevel === 'Ocazional'
      ? 'Ești pe drumul bun — un traseu moderat te va ridica la Activ!'
    : fitnessProfilLevel === 'Activ'
      ? 'Formă bună! Provoacă-te cu un traseu mai dificil.'
    : fitnessProfilLevel === 'Atletic'
      ? 'Performanță de top — aproape de nivelul Elite!'
    : 'Nivel de elită — ești în vârful formei!';
  const NEXT_TIER: Record<string, { threshold: number; name: string }> = {
    Sedentar: { threshold: 3, name: 'Ocazional' },
    Ocazional: { threshold: 6, name: 'Activ' },
    Activ: { threshold: 9, name: 'Atletic' },
    Atletic: { threshold: 12, name: 'Elite' },
  };
  const nextTierInfo = fitnessProfilLevel ? NEXT_TIER[fitnessProfilLevel] ?? null : null;
  const puncteRamase = nextTierInfo != null ? nextTierInfo.threshold - fitnessProfilScor : null;
  const profileEmail = fallbackEmail || "Email unavailable";
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.accent}
          />
        }
      >
        <GlassCard style={styles.heroCard}>
          <View style={styles.identityRow}>
            <PressableFeedback onPress={handleAvatarPress} style={styles.avatarPressable}>
              <View style={styles.avatar}>
                {showAvatarImage ? (
                  <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>{initials}</Text>
                )}
                <View style={styles.avatarCameraBadge}>
                  <Ionicons name="camera" size={14} color={Colors.accent} />
                </View>
              </View>
            </PressableFeedback>

            <View style={styles.identityTextWrap}>
              {isEditingDisplayName ? (
                <View style={styles.inlineNameEditor}>
                  <TextInput
                    value={displayNameDraft}
                    onChangeText={setDisplayNameDraft}
                    placeholder="Nume afișat"
                    placeholderTextColor={Colors.textMuted}
                    style={styles.inlineNameInput}
                  />
                  <View style={styles.inlineNameActions}>
                    <PressableFeedback onPress={() => void handleDisplayNameSalvează()}>
                      <View style={styles.inlineNameButton}>
                        <Text style={styles.inlineNameButtonText}>Salvează</Text>
                      </View>
                    </PressableFeedback>
                    <PressableFeedback onPress={handleDisplayNameEditAnulează}>
                      <View style={styles.inlineNameButtonSecondary}>
                        <Text style={styles.inlineNameButtonSecondaryText}>Anulează</Text>
                      </View>
                    </PressableFeedback>
                  </View>
                </View>
              ) : (
                <View style={styles.heroNameRow}>
                  <View style={styles.nameTextGroup}>
                    <Text style={styles.heroName}>{displayNameValue}</Text>
                    <Text style={styles.heroEmail}>{profileEmail}</Text>
                  </View>
                  <PressableFeedback
                    onPress={handleDisplayNameEditStart}
                    style={styles.inlineEditIconWrap}
                  >
                    <View style={styles.inlineEditIcon}>
                      <Ionicons name="pencil" size={15} color={Colors.accent} />
                    </View>
                  </PressableFeedback>
                </View>
              )}
            </View>
          </View>
        </GlassCard>

        <GlassCard style={styles.fitnessHeroCard}>
          <View style={styles.fitnessHeroHeader}>
            <Text style={styles.fitnessHeroKicker}>Nivel de fitness</Text>
            <PressableFeedback
              onPress={() =>
                Alert.alert(
                  "Nivel de fitness",
                  "Nivelul este calculat din scorul de fitness 0-12, istoricul traseelor finalizate, ritmul recent și consistența activității."
                )
              }
            >
              <View
                style={styles.infoButton}
                accessible={true}
                accessibilityLabel="Informații despre calculul nivelului de fitness"
              >
                <Ionicons
                  name="information-circle-outline"
                  size={18}
                  color={Colors.textMuted}
                />
              </View>
            </PressableFeedback>
          </View>

          <Text style={styles.fitnessTierName}>{fitnessProfilLevelLabel}</Text>

          {hasFitnessProfilScor ? (
            <View style={styles.fitnessScorRow}>
              <Text style={styles.fitnessScorValue}>{fitnessProfilScor}</Text>
              <Text style={styles.fitnessScorSuffix}>/12</Text>
            </View>
          ) : null}

          {fitnessStreakWeeks > 0 ? (
            <View style={styles.streakChip}>
              <Ionicons name="flame" size={15} color={Colors.amber} />
              <Text style={styles.streakChipNumber}>{fitnessStreakWeeks}</Text>
              <Text style={styles.streakChipText}>saptamani la rand</Text>
            </View>
          ) : null}

          <View
            style={styles.fitnessProgressTrack}
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 12, now: fitnessProfilScor }}
          >
            <View
              style={[
                styles.fitnessProgressFill,
                { width: fitnessProfilProgressWidth, backgroundColor: fitnessProfilColor },
              ]}
            />
          </View>
          <Text style={styles.fitnessNextTierLabel}>
            {puncteRamase != null && puncteRamase > 0
              ? `${puncteRamase} punct${puncteRamase === 1 ? '' : 'e'} până la ${nextTierInfo!.name}`
              : fitnessProfilLevel === 'Elite'
                ? 'Nivel maxim atins!'
                : null}
          </Text>

          {motivationalLine != null ? (
            <View style={styles.fitnessMotivationalWrap}>
              <Ionicons name="star-outline" size={13} color={fitnessProfilColor} />
              <Text style={[styles.fitnessMotivationalText, { color: fitnessProfilColor }]}>
                {motivationalLine}
              </Text>
            </View>
          ) : null}

          {bmi != null || caloriesPerHour != null ? (
            <View style={styles.fitnessInsightsRow}>
              {bmi != null ? (
                <View style={styles.fitnessInsightCell}>
                  <Text style={styles.fitnessInsightValue}>{bmi.toFixed(1)}</Text>
                  <Text style={styles.fitnessInsightLabel}>IMC · {bmiLabel}</Text>
                </View>
              ) : null}
              {caloriesPerHour != null ? (
                <View style={styles.fitnessInsightCell}>
                  <Text style={styles.fitnessInsightValue}>~{caloriesPerHour}</Text>
                  <Text style={styles.fitnessInsightLabel}>kcal/oră drumeție</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </GlassCard>

        <GlassCard style={styles.sectionCard}>
          <SectionTitle title="Profil de capabilitate" />
          {showCapabilitiesPrompt ? (
            <View style={styles.capabilityLocked}>
              <Text style={styles.capabilityPrompt}>
                Completează 3 trasee pentru a debloca profilul de capabilitate
              </Text>
              <Text style={styles.capabilityProgress}>
                {Math.min(userCapacity.sampleSize, 3)}
                <Text style={styles.capabilityProgressMuted}>/3</Text>
              </Text>
            </View>
          ) : (
            <View style={styles.capabilityGrid}>
              {userCapacity.learnedComfortDistanceKm != null ? (
                <View style={styles.capabilityCell}>
                  <Text style={styles.capabilityLabel}>Cel mai lung traseu</Text>
                  <Text style={styles.capabilityValue}>
                    {userCapacity.learnedComfortDistanceKm.toFixed(1)}
                  </Text>
                  <Text style={styles.capabilityUnit}>km</Text>
                </View>
              ) : null}
              {capabilityPaceKmh != null ? (
                <View style={styles.capabilityCell}>
                  <Text style={styles.capabilityLabel}>Ritm mediu</Text>
                  <Text style={styles.capabilityValue}>
                    {capabilityPaceKmh.toFixed(1)}
                  </Text>
                  <Text style={styles.capabilityUnit}>km/h</Text>
                </View>
              ) : null}
              {userCapacity.learnedComfortElevationGainM != null ? (
                <View style={styles.capabilityCell}>
                  <Text style={styles.capabilityLabel}>Altitudine medie</Text>
                  <Text style={styles.capabilityValue}>
                    {Math.round(userCapacity.learnedComfortElevationGainM)}
                  </Text>
                  <Text style={styles.capabilityUnit}>m</Text>
                </View>
              ) : null}
            </View>
          )}
        </GlassCard>

        {loadError ? (
          <GlassCard style={styles.errorCard}>
            <Text style={styles.errorText}>{loadError}</Text>
          </GlassCard>
        ) : null}

        <GlassCard style={styles.sectionCard}>
          <SectionTitle title="Profil personal" />
          {!editing ? (
            <PressableFeedback
              onPress={handleEdit}
              style={{ position: "absolute", right: Spacing.lg, top: Spacing.lg }}
            >
              <View style={styles.editPill}>
                <Ionicons name="pencil-outline" size={14} color={Colors.accent} />
                <Text style={styles.editPillText}>Editeaza</Text>
              </View>
            </PressableFeedback>
          ) : null}
          <FieldGroup
            label="Înălțime"
            value={
              editing
                ? heightCm
                : profile?.heightCm != null
                  ? `${profile.heightCm} cm`
                  : "-"
            }
            onChangeText={setÎnălțimeCm}
            placeholder="cm"
            numeric
            isLast={false}
            editable={editing}
          />
          <FieldGroup
            label="Greutate"
            value={
              editing
                ? weightKg
                : profile?.weightKg != null
                  ? `${profile.weightKg} kg`
                  : "-"
            }
            onChangeText={setGreutateKg}
            placeholder="kg"
            numeric
            isLast={false}
            editable={editing}
          />
          <FieldGroup
            label="Vârstă"
            value={
              editing
                ? age
                : profile?.age != null
                  ? String(profile.age)
                  : "-"
            }
            onChangeText={setVârstă}
            placeholder="ani"
            numeric
            isLast
            editable={editing}
          />
        </GlassCard>


        {editing ? (
          <View style={styles.actionStack}>
            <GlassButton
              label={saving ? "Se salveaza..." : "Salveaza modificarile"}
              onPress={handleSalvează}
              disabled={saving}
              style={styles.fullWidthButton}
              icon={<Ionicons name="checkmark-circle-outline" size={18} color={Colors.textOnDark} />}
            />
            <PressableFeedback onPress={handleAnulează} style={styles.cancelWrap}>
              <View style={styles.cancelPill}>
                <Text style={styles.cancelText}>Anulează</Text>
              </View>
            </PressableFeedback>
          </View>
        ) : null}

        <GlassCard style={styles.settingsCard}>
          <PressableFeedback onPress={() => navigation.navigate("Settings")}>
            <View style={styles.settingsListItem}>
              <View style={styles.settingsListIcon}>
                <Ionicons name="settings-outline" size={18} color={Colors.textSecondary} />
              </View>
              <Text style={styles.settingsListText}>Setări</Text>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </View>
          </PressableFeedback>
          <PressableFeedback onPress={logout}>
            <View style={styles.logoutButton}>
              <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
              <Text style={styles.logoutText}>Deconectare</Text>
            </View>
          </PressableFeedback>
        </GlassCard>
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
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    gap: Spacing.base,
  },
  heroCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.lg,
  },
  loadingHero: {
    alignItems: "center",
    gap: Spacing.sm,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "space-between",
    gap: Spacing.md,
  },
  statColumn: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.md,
  },
  avatarPressable: {
    alignSelf: "flex-start",
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "visible",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: BorderRadius.full,
  },
  avatarText: {
    color: Colors.accent,
    fontSize: 20,
    fontFamily: Typography.fontHeavy,
  },
  avatarCameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  identityTextWrap: {
    flex: 1,
  },
  nameTextGroup: {
    flex: 1,
    gap: 2,
  },
  heroNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  heroName: {
    fontSize: 22,
    fontFamily: Typography.fontBold,
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  heroEmail: {
    fontSize: 13,
    fontFamily: Typography.fontRegular,
    color: Colors.textMuted,
  },
  inlineEditIconWrap: {
    alignSelf: "center",
  },
  inlineEditIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inlineNameEditor: {
    flex: 1,
    gap: Spacing.sm,
  },
  inlineNameInput: {
    minHeight: 44,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.elevated,
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: Typography.fontSemibold,
  },
  inlineNameActions: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  inlineNameButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  inlineNameButtonText: {
    color: Colors.accent,
    fontSize: 12,
    fontFamily: Typography.fontSemibold,
  },
  inlineNameButtonSecondary: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inlineNameButtonSecondaryText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: Typography.fontSemibold,
  },
  fitnessHeroCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 20,
    gap: Spacing.sm,
  },
  fitnessHeroHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.sm,
  },
  fitnessHeroKicker: {
    fontSize: 12,
    fontFamily: Typography.fontMedium,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  infoButton: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  fitnessTierName: {
    fontSize: 32,
    fontFamily: Typography.fontHeavy,
    color: Colors.accent,
  },
  fitnessScorRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    paddingVertical: Spacing.xs,
  },
  fitnessScorValue: {
    fontSize: 48,
    fontFamily: Typography.fontMonoBold,
    color: Colors.textPrimary,
    lineHeight: 56,
  },
  fitnessScorSuffix: {
    fontSize: 20,
    fontFamily: Typography.fontMonoBold,
    color: Colors.textMuted,
    paddingBottom: 7,
  },
  pill: {
    alignSelf: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillText: {
    fontSize: 12,
    fontFamily: Typography.fontSemibold,
  },
  streakChip: {
    flexDirection: "row",
    alignSelf: "center",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.amberMuted,
  },
  streakChipNumber: {
    fontSize: 12,
    fontFamily: Typography.fontMonoBold,
    color: Colors.amber,
  },
  streakChipText: {
    fontSize: 12,
    color: Colors.amber,
    fontFamily: Typography.fontSemibold,
  },
  fitnessProgressTrack: {
    height: 8,
    borderRadius: BorderRadius.full,
    overflow: "hidden",
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.xs,
  },
  fitnessProgressFill: {
    height: "100%",
    borderRadius: BorderRadius.full,
  },
  fitnessNextTierLabel: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontRegular,
    color: Colors.textSecondary,
    marginTop: 4,
    textAlign: 'right',
  },
  fitnessMotivationalWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
  },
  fitnessMotivationalText: {
    flex: 1,
    fontSize: Typography.size.sm,
    fontFamily: Typography.fontRegular,
    fontStyle: 'italic',
  },
  fitnessInsightsRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  fitnessInsightCell: {
    flex: 1,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    alignItems: 'center',
  },
  fitnessInsightValue: {
    fontSize: Typography.size.lg,
    fontFamily: Typography.fontBold,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
  },
  fitnessInsightLabel: {
    fontSize: Typography.size.xs,
    fontFamily: Typography.fontRegular,
    color: Colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  errorCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: Spacing.base,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 14,
    fontFamily: Typography.fontRegular,
    textAlign: "center",
  },
  sectionCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 16,
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: Typography.fontSemibold,
    color: Colors.textMuted,
    textTransform: "uppercase",
    marginBottom: 12,
  },
  capabilityLocked: {
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  capabilityPrompt: {
    fontSize: 14,
    fontFamily: Typography.fontRegular,
    color: Colors.textMuted,
    textAlign: "center",
  },
  capabilityProgress: {
    fontSize: 22,
    fontFamily: Typography.fontMonoBold,
    color: Colors.textPrimary,
  },
  capabilityProgressMuted: {
    fontSize: 14,
    fontFamily: Typography.fontMonoBold,
    color: Colors.textMuted,
  },
  capabilityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  capabilityCell: {
    width: "48%",
    minHeight: 90,
    padding: Spacing.md,
    borderRadius: 12,
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
  },
  capabilityLabel: {
    fontSize: 11,
    fontFamily: Typography.fontMedium,
    color: Colors.textMuted,
    marginBottom: 6,
  },
  capabilityValue: {
    fontSize: 20,
    fontFamily: Typography.fontMonoBold,
    color: Colors.textPrimary,
  },
  capabilityUnit: {
    fontSize: 11,
    fontFamily: Typography.fontMedium,
    color: Colors.textMuted,
    marginTop: 2,
  },
  editPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.accentMuted,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  editPillText: {
    color: Colors.accent,
    fontSize: 12,
    fontFamily: Typography.fontSemibold,
  },
  fieldGroup: {
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  fieldBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  fieldLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    fontFamily: Typography.fontMedium,
  },
  fieldValue: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontFamily: Typography.fontMonoBold,
  },
  textInput: {
    minHeight: 44,
    paddingVertical: Spacing.xs,
    fontSize: 14,
    color: Colors.textPrimary,
    fontFamily: Typography.fontRegular,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  numberTextInput: {
    fontFamily: Typography.fontMonoBold,
  },
  actionStack: {
    gap: Spacing.sm,
  },
  fullWidthButton: {
    width: "100%",
  },
  cancelWrap: {
    alignSelf: "center",
  },
  cancelPill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontFamily: Typography.fontSemibold,
  },
  settingsCard: {
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 0,
    overflow: "hidden",
  },
  settingsListItem: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  settingsListIcon: {
    width: 30,
    height: 30,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.elevated,
  },
  settingsListText: {
    flex: 1,
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: Typography.fontMedium,
  },
  logoutButton: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dangerLight,
    borderWidth: 1,
    borderColor: Colors.danger,
    margin: 12,
    borderRadius: 12,
  },
  logoutText: {
    color: Colors.danger,
    fontSize: 14,
    fontFamily: Typography.fontSemibold,
  },
});

