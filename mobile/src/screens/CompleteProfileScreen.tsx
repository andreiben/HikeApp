import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api } from "../services/api";
import { getAccessToken } from "../services/authStorage";
import { useAuth } from "../hooks/useAuth";
import { Colors } from "../theme";

const EXPERIENCE_LEVELS = [
  { value: "beginner", label: "Începător", icon: "leaf-outline" as const, desc: "Nou în drumeții" },
  { value: "intermediate", label: "Intermediar", icon: "footsteps-outline" as const, desc: "Ceva experiență" },
  { value: "advanced", label: "Avansat", icon: "trending-up-outline" as const, desc: "Drumeț regulat" },
  { value: "expert", label: "Expert", icon: "trophy-outline" as const, desc: "Alpinist experimentat" },
];

const LEVEL_COLORS: Record<string, string> = {
  beginner: Colors.accent,
  intermediate: Colors.textSecondary,
  advanced: Colors.amber,
  expert: Colors.danger,
};

export default function CompleteProfileScreen() {
  const { refreshProfileStatus, logout } = useAuth();

  // Step 1 state
  const [displayName, setDisplayName] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("beginner");

  // Step 2 state
  const [heightCm, setHeightCm] = useState("170");
  const [weightKg, setWeightKg] = useState("70");
  const [age, setAge] = useState("30");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<
    "displayName" | "heightCm" | "weightKg" | "age" | null
  >(null);

  const handleNext = () => {
    if (displayName.trim().length < 2) {
      Alert.alert("Nume invalid", "Te rugăm să introduci cel puțin 2 caractere.");
      return;
    }
    setStep(2);
  };

  const handleSave = async () => {
    const parsedHeight = parseInt(heightCm, 10);
    const parsedWeight = parseInt(weightKg, 10);
    const parsedAge = parseInt(age, 10);

    if (!parsedHeight || parsedHeight < 100 || parsedHeight > 250) {
      Alert.alert("Valoare invalidă", "Înălțimea trebuie să fie între 100 și 250 cm.");
      return;
    }
    if (!parsedWeight || parsedWeight < 30 || parsedWeight > 250) {
      Alert.alert("Valoare invalidă", "Greutatea trebuie să fie între 30 și 250 kg.");
      return;
    }
    if (!parsedAge || parsedAge < 16 || parsedAge > 99) {
      Alert.alert("Valoare invalidă", "Vârsta trebuie să fie între 16 și 99 ani.");
      return;
    }

    try {
      setLoading(true);
      const token = await getAccessToken();
      if (!token) {
        Alert.alert("Sesiune expirată", "Te rugăm să te autentifici din nou.");
        await logout();
        return;
      }

      await api.post(
        "/profile/complete",
        {
          displayName: displayName.trim(),
          experienceLevel,
          heightCm: parsedHeight,
          weightKg: parsedWeight,
          age: parsedAge,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await refreshProfileStatus();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      if ((err as { response?: { status?: number } })?.response?.status === 401) {
        Alert.alert("Sesiune expirată", "Te rugăm să te autentifici din nou.");
        await logout();
        return;
      }
      Alert.alert("Salvare eșuată", err?.response?.data?.error ?? err?.message ?? "Ceva nu a mers bine. Verifică conexiunea.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert("Deconectare", "Autentifică-te cu un alt cont?", [
      { text: "Anulează", style: "cancel" },
      { text: "Deconectare", style: "destructive", onPress: () => void logout() },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Top bar */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 4,
          }}
        >
          {step === 2 ? (
            <Pressable onPress={() => setStep(1)} style={{ padding: 4 }}>
              <Ionicons name="arrow-back" size={22} color={Colors.textSecondary} />
            </Pressable>
          ) : (
            <View style={{ width: 30 }} />
          )}

          {/* Step dots */}
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[1, 2].map((s) => (
              <View
                key={s}
                style={{
                  width: s === step ? 20 : 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: s === step ? Colors.accent : Colors.border,
                }}
              />
            ))}
          </View>

          <Pressable onPress={handleLogout} style={{ padding: 4 }}>
            <Text
              style={{
                color: Colors.textMuted,
                fontFamily: "PlusJakartaSans_400Regular",
                fontSize: 13,
              }}
            >
              Deconectare
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 28, gap: 28, paddingBottom: 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {step === 1 ? (
            <>
              {/* Step 1: Identity */}
              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    fontFamily: "PlusJakartaSans_700Bold",
                    fontSize: 24,
                    color: Colors.textPrimary,
                  }}
                >
                  Hai să îți configurăm profilul
                </Text>
                <Text
                  style={{
                    fontFamily: "PlusJakartaSans_400Regular",
                    fontSize: 15,
                    color: Colors.textSecondary,
                    lineHeight: 22,
                  }}
                >
                  Acest lucru ne ajută să personalizăm scorurile de risc și sugestiile de trasee.
                </Text>
              </View>

              {/* Display name */}
              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    fontFamily: "PlusJakartaSans_600SemiBold",
                    fontSize: 11,
                    color: Colors.textMuted,
                    textTransform: "uppercase",
                  }}
                >
                  NUMELE TĂU
                </Text>
                <TextInput
                  placeholder="Cum să te numim?"
                  placeholderTextColor={Colors.textMuted}
                  value={displayName}
                  onChangeText={setDisplayName}
                  onFocus={() => setFocusedField("displayName")}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="words"
                  style={{
                    minHeight: 48,
                    borderWidth: 1,
                    borderColor: focusedField === "displayName" ? Colors.accent : Colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 14,
                    fontSize: 15,
                    fontFamily: "PlusJakartaSans_400Regular",
                    backgroundColor: Colors.surface,
                    color: Colors.textPrimary,
                  }}
                />
              </View>

              {/* Experience level */}
              <View style={{ gap: 12 }}>
                <Text
                  style={{
                    fontFamily: "PlusJakartaSans_600SemiBold",
                    fontSize: 11,
                    color: Colors.textMuted,
                    textTransform: "uppercase",
                  }}
                >
                  NIVEL DE EXPERIENȚĂ
                </Text>
                <View style={{ gap: 10 }}>
                  {EXPERIENCE_LEVELS.map((lvl) => {
                    const selected = experienceLevel === lvl.value;
                    const color = LEVEL_COLORS[lvl.value] ?? Colors.accent;
                    return (
                      <Pressable
                        key={lvl.value}
                        onPress={() => setExperienceLevel(lvl.value)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 14,
                          padding: 14,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: selected ? color : Colors.border,
                          backgroundColor: selected ? Colors.elevated : Colors.surface,
                        }}
                      >
                        <View
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 20,
                            backgroundColor: selected ? color : Colors.elevated,
                            justifyContent: "center",
                            alignItems: "center",
                          }}
                        >
                          <Ionicons
                            name={lvl.icon}
                            size={20}
                            color={selected ? Colors.background : Colors.textMuted}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={{
                              fontFamily: "PlusJakartaSans_700Bold",
                              fontSize: 15,
                              color: selected ? color : Colors.textPrimary,
                            }}
                          >
                            {lvl.label}
                          </Text>
                          <Text
                            style={{
                              fontFamily: "PlusJakartaSans_400Regular",
                              fontSize: 12,
                              color: Colors.textMuted,
                            }}
                          >
                            {lvl.desc}
                          </Text>
                        </View>
                        {selected && (
                          <Ionicons name="checkmark-circle" size={22} color={color} />
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <Pressable
                onPress={handleNext}
                style={({ pressed }) => ({
                  backgroundColor: Colors.accent,
                  minHeight: 52,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.86 : 1,
                })}
              >
                <Text
                  style={{
                    color: Colors.background,
                    fontFamily: "PlusJakartaSans_700Bold",
                    fontSize: 16,
                  }}
                >
                  Continuă →
                </Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* Step 2: Physical metrics */}
              <View style={{ gap: 8 }}>
                <Text
                  style={{
                    fontFamily: "PlusJakartaSans_700Bold",
                    fontSize: 24,
                    color: Colors.textPrimary,
                  }}
                >
                  Profilul tău fizic
                </Text>
                <Text
                  style={{
                    fontFamily: "PlusJakartaSans_400Regular",
                    fontSize: 15,
                    color: Colors.textSecondary,
                    lineHeight: 22,
                  }}
                >
                  Valorile fizice ne ajută să calculăm mai precis riscul cardiovascular și de altitudine. Le poți actualiza oricând în profil.
                </Text>
              </View>

              {/* Height */}
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="resize-outline" size={18} color={Colors.textMuted} />
                  <Text
                    style={{
                      fontFamily: "PlusJakartaSans_600SemiBold",
                      fontSize: 11,
                      color: Colors.textMuted,
                      textTransform: "uppercase",
                    }}
                  >
                    ÎNĂLȚIME (CM)
                  </Text>
                </View>
                <TextInput
                  value={heightCm}
                  onChangeText={setHeightCm}
                  onFocus={() => setFocusedField("heightCm")}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="numeric"
                  placeholder="ex. 170"
                  placeholderTextColor={Colors.textMuted}
                  style={{
                    minHeight: 48,
                    borderWidth: 1,
                    borderColor: focusedField === "heightCm" ? Colors.accent : Colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 14,
                    fontSize: 15,
                    fontFamily: "JetBrainsMono_400Regular",
                    backgroundColor: Colors.surface,
                    color: Colors.textPrimary,
                  }}
                />
              </View>

              {/* Weight */}
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="body-outline" size={18} color={Colors.textMuted} />
                  <Text
                    style={{
                      fontFamily: "PlusJakartaSans_600SemiBold",
                      fontSize: 11,
                      color: Colors.textMuted,
                      textTransform: "uppercase",
                    }}
                  >
                    GREUTATE (KG)
                  </Text>
                </View>
                <TextInput
                  value={weightKg}
                  onChangeText={setWeightKg}
                  onFocus={() => setFocusedField("weightKg")}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="numeric"
                  placeholder="ex. 70"
                  placeholderTextColor={Colors.textMuted}
                  style={{
                    minHeight: 48,
                    borderWidth: 1,
                    borderColor: focusedField === "weightKg" ? Colors.accent : Colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 14,
                    fontSize: 15,
                    fontFamily: "JetBrainsMono_400Regular",
                    backgroundColor: Colors.surface,
                    color: Colors.textPrimary,
                  }}
                />
              </View>

              {/* Age */}
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.textMuted} />
                  <Text
                    style={{
                      fontFamily: "PlusJakartaSans_600SemiBold",
                      fontSize: 11,
                      color: Colors.textMuted,
                      textTransform: "uppercase",
                    }}
                  >
                    VÂRSTĂ
                  </Text>
                </View>
                <TextInput
                  value={age}
                  onChangeText={setAge}
                  onFocus={() => setFocusedField("age")}
                  onBlur={() => setFocusedField(null)}
                  keyboardType="numeric"
                  placeholder="ex. 30"
                  placeholderTextColor={Colors.textMuted}
                  style={{
                    minHeight: 48,
                    borderWidth: 1,
                    borderColor: focusedField === "age" ? Colors.accent : Colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 14,
                    fontSize: 15,
                    fontFamily: "JetBrainsMono_400Regular",
                    backgroundColor: Colors.surface,
                    color: Colors.textPrimary,
                  }}
                />
              </View>

              <Pressable
                onPress={handleSave}
                disabled={loading}
                style={({ pressed }) => ({
                  backgroundColor: Colors.accent,
                  minHeight: 52,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: loading ? 0.55 : pressed ? 0.86 : 1,
                })}
              >
                <Text
                  style={{
                    color: Colors.background,
                    fontFamily: "PlusJakartaSans_700Bold",
                    fontSize: 16,
                  }}
                >
                  {loading ? "Se salvează…" : "Finalizează Configurarea"}
                </Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
