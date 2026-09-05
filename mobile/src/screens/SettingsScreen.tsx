import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as SecureStore from "expo-secure-store";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { GlassButton } from "../components/ui/GlassButton";
import { GlassCard } from "../components/ui/GlassCard";
import { useAuth } from "../hooks/useAuth";
import type { MainStackParamList } from "../navigation";
import { api } from "../services/api";
import { getAccessToken } from "../services/authStorage";
import {
  requestNotificationPermissions,
  setNotificationsEnabled,
} from "../services/notifications";
import { showError, showSuccess } from "../services/toast";
import { BorderRadius, Colors, Spacing, Typography } from "../theme";

function createSettingsKeys(userId: string) {
  return {
    units: `settings_units_${userId}`,
    riskAlerts: `settings_risk_alerts_${userId}`,
    achievementToasts: `settings_achievement_toasts_${userId}`,
    emergencyName: `settings_emergency_name_${userId}`,
    emergencyPhone: `settings_emergency_phone_${userId}`,
    notifications: `notifications_enabled_${userId}`,
  };
}

type Navigation = NativeStackNavigationProp<MainStackParamList>;
type DistanceUnit = "km" | "miles";
type ProfileSetăriPatch = {
  units?: DistanceUnit;
  riskAlertsEnabled?: boolean;
  achievementToastsEnabled?: boolean;
};

function SectionTitle({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>;
}

function SettingRow({
  label,
  children,
  isLast = false,
}: {
  label: string;
  children: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.settingRow, !isLast && styles.rowBorder]}>
      <Text style={styles.settingLabel}>{label}</Text>
      {children}
    </View>
  );
}

function InputRow({
  label,
  value,
  onChangeText,
  keyboardType = "default",
  isLast = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: "default" | "phone-pad";
  isLast?: boolean;
}) {
  return (
    <View style={[styles.inputRow, !isLast && styles.rowBorder]}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={label}
        placeholderTextColor={Colors.textTertiary}
        style={styles.input}
      />
    </View>
  );
}

export default function SetăriScreen() {
  const navigation = useNavigation<Navigation>();
  const { logout, user } = useAuth();
  const userSub = user?.id ?? "anonymous";
  const KEYS = useMemo(() => createSettingsKeys(userSub), [userSub]);

  const [units, setUnits] = useState<DistanceUnit>("km");
  const [riskAlertsEnabled, setRiskAlertsEnabled] = useState(true);
  const [achievementToastsEnabled, setAchievementToastsEnabled] = useState(true);
  const [pushNotificăriEnabled, setPushNotificăriEnabled] = useState(false);
  const [emergencyNume, setEmergencyNume] = useState("");
  const [emergencyTelefon, setEmergencyTelefon] = useState("");
  const [savingContact, setSavingContact] = useState(false);
  const [deletingCont, setDeletingCont] = useState(false);

  const syncProfileSetări = async (settings: ProfileSetăriPatch) => {
    const token = await getAccessToken();

    if (!token) {
      throw new Error("Not authenticated");
    }

    await api.patch("/profile/settings", settings, {
      headers: { Authorization: `Bearer ${token}` },
    });
  };

  useEffect(() => {
    const loadSetări = async () => {
      setRiskAlertsEnabled(true);
      setAchievementToastsEnabled(true);
      setPushNotificăriEnabled(false);
      try {
        const [
          storedUnits,
          storedRiskAlerts,
          storedAchievementToasts,
          storedPushNotificări,
          storedEmergencyNume,
          storedEmergencyTelefon,
        ] = await Promise.all([
          SecureStore.getItemAsync(KEYS.units),
          SecureStore.getItemAsync(KEYS.riskAlerts),
          SecureStore.getItemAsync(KEYS.achievementToasts),
          SecureStore.getItemAsync(KEYS.notifications),
          SecureStore.getItemAsync(KEYS.emergencyName),
          SecureStore.getItemAsync(KEYS.emergencyPhone),
        ]);

        if (storedUnits === "km" || storedUnits === "miles") {
          setUnits(storedUnits);
        }

        if (storedRiskAlerts !== null) {
          setRiskAlertsEnabled(storedRiskAlerts === "true");
        }

        if (storedAchievementToasts !== null) {
          setAchievementToastsEnabled(storedAchievementToasts === "true");
        }

        setPushNotificăriEnabled(storedPushNotificări === "true");

        const trimmedStoredEmergencyNume = storedEmergencyNume?.trim() ?? "";
        const trimmedStoredEmergencyTelefon = storedEmergencyTelefon?.trim() ?? "";

        setEmergencyNume(storedEmergencyNume ?? "");
        setEmergencyTelefon(storedEmergencyTelefon ?? "");

        const token = await getAccessToken();

        if (token) {
          try {
            const profileResponse = await api.get("/profile/me", {
              headers: { Authorization: `Bearer ${token}` },
            });
            const settingsData = profileResponse.data?.profile ?? profileResponse.data;

            if (settingsData?.units === "km" || settingsData?.units === "miles") {
              setUnits(settingsData.units);
            }

            if (typeof settingsData?.riskAlertsEnabled === "boolean") {
              setRiskAlertsEnabled(settingsData.riskAlertsEnabled);
            }

            if (typeof settingsData?.achievementToastsEnabled === "boolean") {
              setAchievementToastsEnabled(settingsData.achievementToastsEnabled);
            }
          } catch (error) {
            console.error("Failed to load profile settings from backend", error);
          }
        }

        if (!trimmedStoredEmergencyNume && !trimmedStoredEmergencyTelefon && token) {
          const response = await api.get("/profile/emergency-contact", {
            headers: { Authorization: `Bearer ${token}` },
          });
          const backendNume =
            typeof response.data?.name === "string" ? response.data.name.trim() : "";
          const backendTelefon =
            typeof response.data?.phone === "string" ? response.data.phone.trim() : "";

          if (backendNume || backendTelefon) {
            setEmergencyNume(backendNume);
            setEmergencyTelefon(backendTelefon);
          }
        }
      } catch {
        showError("Eroare", "Nu s-au putut incarca setarile.");
      }
    };

    void loadSetări();
  }, [KEYS]);

  const handleUnitsChange = async (nextUnits: DistanceUnit) => {
    const previousUnits = units;

    try {
      setUnits(nextUnits);
      await syncProfileSetări({ units: nextUnits });
      await SecureStore.setItemAsync(KEYS.units, nextUnits);
    } catch {
      setUnits(previousUnits);
      showError("Eroare", "Nu s-a putut salva unitatea de distanta.");
    }
  };

  const handleRiskAlertsChange = async (nextValue: boolean) => {
    const previousValue = riskAlertsEnabled;

    try {
      setRiskAlertsEnabled(nextValue);
      await syncProfileSetări({ riskAlertsEnabled: nextValue });
      await SecureStore.setItemAsync(
        KEYS.riskAlerts,
        nextValue ? "true" : "false"
      );
    } catch {
      setRiskAlertsEnabled(previousValue);
      showError("Eroare", "Nu s-a putut salva preferinta de notificari.");
    }
  };

  const handleAchievementToastsChange = async (nextValue: boolean) => {
    const previousValue = achievementToastsEnabled;

    try {
      setAchievementToastsEnabled(nextValue);
      await syncProfileSetări({ achievementToastsEnabled: nextValue });
      await SecureStore.setItemAsync(
        KEYS.achievementToasts,
        nextValue ? "true" : "false"
      );
    } catch {
      setAchievementToastsEnabled(previousValue);
      showError("Eroare", "Nu s-a putut salva preferinta de notificari.");
    }
  };

  const handlePushNotificăriChange = async (nextValue: boolean) => {
    const previousValue = pushNotificăriEnabled;

    setPushNotificăriEnabled(nextValue);

    if (nextValue) {
      const granted = await requestNotificationPermissions();

      if (!granted) {
        setPushNotificăriEnabled(previousValue);
        showError(
          "Permisiune necesara",
          "Permite notificarile din Setari pentru a primi mementouri de drumetii."
        );
        return;
      }
    }

    try {
      await setNotificationsEnabled(nextValue);
    } catch {
      // service unavailable in Expo Go — ignore, preference is still saved
    }
    await SecureStore.setItemAsync(KEYS.notifications, nextValue ? "true" : "false");
  };

  const handleSalveazăEmergencyContact = async () => {
    try {
      setSavingContact(true);
      await Promise.all([
        SecureStore.setItemAsync(KEYS.emergencyName, emergencyNume.trim()),
        SecureStore.setItemAsync(KEYS.emergencyPhone, emergencyTelefon.trim()),
      ]);

      const token = await getAccessToken();

      if (token) {
        try {
          await api.put(
            "/profile/emergency-contact",
            {
              name: emergencyNume.trim(),
              phone: emergencyTelefon.trim(),
            },
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );
        } catch (error) {
          console.error("Failed to sync emergency contact to backend", error);
        }
      }

      showSuccess("Contact de urgenta actualizat.", "");
    } catch {
      showError("Eroare", "Nu s-a putut salva contactul de urgenta.");
    } finally {
      setSavingContact(false);
    }
  };

  const performDeleteCont = async () => {
    try {
      setDeletingCont(true);
      const token = await getAccessToken();

      if (token) {
        await api.delete("/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
      }

      await logout();
    } catch {
      await logout();
    } finally {
      setDeletingCont(false);
    }
  };

  const handleDeleteCont = () => {
    Alert.alert(
      "Sterge contul",
      "Aceasta actiune nu poate fi anulata. Vrei sa continui?",
      [
        { text: "Anulează", style: "cancel" },
        {
          text: deletingCont ? "Se sterge..." : "Sterge",
          style: "destructive",
          onPress: () => void performDeleteCont(),
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            activeOpacity={0.8}
          >
            <Ionicons name="chevron-back" size={22} color={Colors.textMuted} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Setări</Text>
          <View style={styles.headerSpacer} />
        </View>

        <GlassCard style={styles.sectionCard}>
          <SectionTitle title="Unitati" />
          <SettingRow label="Unitati de distanta" isLast>
            <View style={styles.unitsToggle}>
              <TouchableOpacity
                onPress={() => void handleUnitsChange("km")}
                style={[
                  styles.unitOption,
                  units === "km" && styles.unitOptionActive,
                ]}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.unitOptionText,
                    units === "km" && styles.unitOptionTextActive,
                  ]}
                >
                  km
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleUnitsChange("miles")}
                style={[
                  styles.unitOption,
                  units === "miles" && styles.unitOptionActive,
                ]}
                activeOpacity={0.85}
              >
                <Text
                  style={[
                    styles.unitOptionText,
                    units === "miles" && styles.unitOptionTextActive,
                  ]}
                >
                  miles
                </Text>
              </TouchableOpacity>
            </View>
          </SettingRow>
        </GlassCard>

        <GlassCard style={styles.sectionCard}>
          <SectionTitle title="Notificări" />
          <SettingRow label="Alerte de risc in timpul drumetiei">
            <Switch
              value={riskAlertsEnabled}
              onValueChange={(value) => void handleRiskAlertsChange(value)}
              trackColor={{ false: Colors.elevated, true: Colors.accent }}
              thumbColor={riskAlertsEnabled ? Colors.accent : Colors.textMuted}
            />
          </SettingRow>
          <SettingRow label="Notificari de realizari">
            <Switch
              value={achievementToastsEnabled}
              onValueChange={(value) => void handleAchievementToastsChange(value)}
              trackColor={{ false: Colors.elevated, true: Colors.accent }}
              thumbColor={achievementToastsEnabled ? Colors.accent : Colors.textMuted}
            />
          </SettingRow>
          <SettingRow label="Notificari push" isLast>
            <Switch
              value={pushNotificăriEnabled}
              onValueChange={(value) => void handlePushNotificăriChange(value)}
              trackColor={{ false: Colors.elevated, true: Colors.accent }}
              thumbColor={pushNotificăriEnabled ? Colors.accent : Colors.textMuted}
            />
          </SettingRow>
        </GlassCard>

        <GlassCard style={styles.sectionCard}>
          <SectionTitle title="Contact de Urgență" />
          <InputRow
            label="Numele contactului"
            value={emergencyNume}
            onChangeText={setEmergencyNume}
          />
          <InputRow
            label="Telefonul contactului"
            value={emergencyTelefon}
            onChangeText={setEmergencyTelefon}
            keyboardType="phone-pad"
            isLast
          />
          <GlassButton
            label={savingContact ? "Se salveaza..." : "Salveaza"}
            onPress={() => void handleSalveazăEmergencyContact()}
            disabled={savingContact}
            variant="secondary"
            style={styles.saveButton}
            labelStyle={styles.saveButtonLabel}
          />
          <Text style={styles.privacyNote}>
            Datele tale sunt stocate securizat și folosite exclusiv pentru evaluarea personalizată a riscului și istoricul drumeților.
          </Text>
        </GlassCard>

        <GlassCard style={styles.sectionCard}>
          <SectionTitle title="Cont" />
          <GlassButton
            label="Deconectare"
            onPress={() => void logout()}
            variant="secondary"
            style={styles.accountButton}
            labelStyle={styles.accountButtonLabel}
            icon={<Ionicons name="log-out-outline" size={18} color={Colors.textPrimary} />}
          />
          <GlassButton
            label={deletingCont ? "Se sterge..." : "Sterge contul"}
            onPress={handleDeleteCont}
            variant="danger"
            disabled={deletingCont}
            style={styles.deleteButton}
            labelStyle={styles.deleteButtonLabel}
            icon={<Ionicons name="trash-outline" size={18} color={Colors.danger} />}
          />
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
    paddingBottom: Spacing["3xl"],
    gap: Spacing.base,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xs,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerTitle: {
    fontSize: Typography.size.xl,
    fontWeight: Typography.weight.bold,
    fontFamily: Typography.fontBold,
    color: Colors.textPrimary,
  },
  headerSpacer: {
    width: 40,
  },
  sectionCard: {
    padding: 0,
    overflow: "hidden",
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.surface,
    borderColor: Colors.border,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: Typography.fontSemibold,
    fontWeight: Typography.weight.semibold,
    color: Colors.textMuted,
    letterSpacing: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: Spacing.sm,
  },
  settingRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: Spacing.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  settingLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: Typography.fontMedium,
    color: Colors.textPrimary,
    fontWeight: Typography.weight.medium,
  },
  unitsToggle: {
    flexDirection: "row",
    padding: 4,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.elevated,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitOption: {
    minWidth: 68,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  unitOptionActive: {
    backgroundColor: Colors.accent,
  },
  unitOptionText: {
    fontSize: 13,
    fontFamily: Typography.fontRegular,
    color: Colors.textMuted,
  },
  unitOptionTextActive: {
    color: Colors.background,
    fontFamily: Typography.fontSemibold,
    fontWeight: Typography.weight.semibold,
  },
  inputRow: {
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
  },
  inputLabel: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontFamily: Typography.fontMedium,
    fontWeight: Typography.weight.medium,
  },
  input: {
    minHeight: 44,
    paddingVertical: Spacing.xs,
    fontSize: 13,
    fontFamily: Typography.fontRegular,
    color: Colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  saveButton: {
    marginHorizontal: 14,
    marginTop: Spacing.sm,
    marginBottom: 14,
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  saveButtonLabel: {
    color: Colors.background,
  },
  privacyNote: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    lineHeight: 16,
  },
  accountButton: {
    width: "auto",
    marginHorizontal: 14,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.elevated,
    borderColor: Colors.border,
  },
  accountButtonLabel: {
    color: Colors.textPrimary,
  },
  deleteButton: {
    width: "auto",
    marginHorizontal: 14,
    marginBottom: 14,
    backgroundColor: Colors.dangerLight,
    borderColor: Colors.danger,
  },
  deleteButtonLabel: {
    color: Colors.danger,
  },
});


