import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation";
import { api } from "../services/api";
import { Colors } from "../theme";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

type ForgotPasswordResponse = {
  message: string;
  resetCode: string;
};

export default function ForgotPasswordScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<
    "email" | "code" | "newPassword" | null
  >(null);

  const handleSendCode = async () => {
    if (!email.trim()) {
      Alert.alert("Email lipsă", "Te rugăm să introduci adresa de email.");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post<ForgotPasswordResponse>(
        "/auth/forgot-password",
        { email: email.trim() }
      );
      setResetCode(response.data.resetCode);
      setStep(2);
      Alert.alert("Cod trimis", response.data.message);
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      Alert.alert(
        "Nu s-a putut trimite codul",
        err?.response?.data?.error ?? err?.message ?? "Ceva nu a mers bine"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!code.trim() || !newPassword) {
      Alert.alert("Câmpuri lipsă", "Te rugăm să introduci codul de resetare și o parolă nouă.");
      return;
    }

    if (!/^\d{6}$/.test(code.trim())) {
      Alert.alert("Cod invalid", "Codul de resetare trebuie să aibă exact 6 cifre.");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Parolă slabă", "Parola trebuie să aibă cel puțin 6 caractere.");
      return;
    }

    try {
      setLoading(true);
      await api.post("/auth/reset-password", {
        email: email.trim(),
        code: code.trim(),
        newPassword,
      });
      Alert.alert("Parola resetată!", "Te rugăm să te autentifici.", [
        { text: "OK", onPress: () => navigation.navigate("Login") },
      ]);
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      Alert.alert(
        "Resetare eșuată",
        err?.response?.data?.error ?? err?.message ?? "Ceva nu a mers bine"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={{ flex: 1, padding: 28, justifyContent: "center", gap: 24 }}>
          <View style={{ gap: 6 }}>
            <Text
              style={{
                fontFamily: "PlusJakartaSans_700Bold",
                fontSize: 24,
                color: Colors.textPrimary,
              }}
            >
              Resetează parola
            </Text>
            <Text
              style={{
                fontFamily: "PlusJakartaSans_400Regular",
                fontSize: 15,
                color: Colors.textSecondary,
              }}
            >
              Solicită un cod demo, apoi alege o parolă nouă
            </Text>
          </View>

          <View style={{ gap: 14 }}>
            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontFamily: "PlusJakartaSans_600SemiBold",
                  fontSize: 12,
                  color: Colors.textSecondary,
                }}
              >
                Email
              </Text>
              <TextInput
                placeholder="you@example.com"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!loading && step === 1}
                style={{
                  minHeight: 48,
                  borderWidth: 1,
                  borderColor: focusedField === "email" ? Colors.accent : Colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 14,
                  fontSize: 15,
                  fontFamily: "PlusJakartaSans_400Regular",
                  backgroundColor: Colors.surface,
                  color: Colors.textPrimary,
                  opacity: step === 1 ? 1 : 0.72,
                }}
              />
            </View>

            {step === 2 && (
              <>
                <View
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: Colors.accent,
                    backgroundColor: Colors.surface,
                    padding: 16,
                    gap: 8,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "PlusJakartaSans_700Bold",
                      fontSize: 13,
                      color: Colors.accent,
                    }}
                  >
                    Codul tău de resetare (doar demo):
                  </Text>
                  <Text
                    style={{
                      fontSize: 28,
                      fontFamily: "JetBrainsMono_400Regular",
                      letterSpacing: 4,
                      color: Colors.accent,
                    }}
                  >
                    {resetCode}
                  </Text>
                </View>

                <View style={{ gap: 6 }}>
                  <Text
                    style={{
                      fontFamily: "PlusJakartaSans_600SemiBold",
                      fontSize: 12,
                      color: Colors.textSecondary,
                    }}
                  >
                    Cod de Resetare
                  </Text>
                  <TextInput
                    placeholder="Cod de 6 cifre"
                    placeholderTextColor={Colors.textMuted}
                    value={code}
                    onChangeText={(value) =>
                      setCode(value.replace(/[^0-9]/g, "").slice(0, 6))
                    }
                    onFocus={() => setFocusedField("code")}
                    onBlur={() => setFocusedField(null)}
                    keyboardType="number-pad"
                    maxLength={6}
                    style={{
                      minHeight: 48,
                      borderWidth: 1,
                      borderColor: focusedField === "code" ? Colors.accent : Colors.border,
                      borderRadius: 8,
                      paddingHorizontal: 14,
                      fontSize: 18,
                      fontFamily: "JetBrainsMono_400Regular",
                      letterSpacing: 3,
                      backgroundColor: Colors.surface,
                      color: Colors.textPrimary,
                    }}
                  />
                </View>

                <View style={{ gap: 6 }}>
                  <Text
                    style={{
                      fontFamily: "PlusJakartaSans_600SemiBold",
                      fontSize: 12,
                      color: Colors.textSecondary,
                    }}
                  >
                    Parolă Nouă
                  </Text>
                  <TextInput
                    placeholder="Cel puțin 6 caractere"
                    placeholderTextColor={Colors.textMuted}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    onFocus={() => setFocusedField("newPassword")}
                    onBlur={() => setFocusedField(null)}
                    secureTextEntry
                    autoComplete="password-new"
                    style={{
                      minHeight: 48,
                      borderWidth: 1,
                      borderColor: focusedField === "newPassword" ? Colors.accent : Colors.border,
                      borderRadius: 8,
                      paddingHorizontal: 14,
                      fontSize: 15,
                      fontFamily: "PlusJakartaSans_400Regular",
                      backgroundColor: Colors.surface,
                      color: Colors.textPrimary,
                    }}
                  />
                </View>
              </>
            )}
          </View>

          {step === 1 ? (
            <Pressable
              onPress={handleSendCode}
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
                {loading ? "Se trimite codul..." : "Trimite Codul"}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleResetPassword}
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
                {loading ? "Se resetează parola..." : "Resetează Parola"}
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={() => navigation.navigate("Login")}
            style={{ alignItems: "center" }}
          >
            <Text
              style={{
                color: Colors.textSecondary,
                fontFamily: "PlusJakartaSans_400Regular",
                fontSize: 14,
              }}
            >
              Înapoi la{" "}
              <Text
                style={{
                  color: Colors.accent,
                  fontFamily: "PlusJakartaSans_700Bold",
                }}
              >
                Autentificare
              </Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
