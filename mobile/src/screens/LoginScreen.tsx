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
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation";
import { api } from "../services/api";
import { useAuth } from "../hooks/useAuth";
import { Colors } from "../theme";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setParolă] = useState("");
  const [showParolă, setShowParolă] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<"email" | "password" | null>(null);
  const { login } = useAuth();

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Câmpuri lipsă", "Te rugăm să introduci email-ul și parola.");
      return;
    }

    try {
      setLoading(true);
      const response = await api.post("/auth/login", {
        email: email.trim(),
        password,
      });
      await login(response.data.accessToken, response.data.user);
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      Alert.alert(
        "Autentificare eșuată",
        err?.response?.data?.error ?? err?.message ?? "Ceva a mers prost"
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
              Bun venit înapoi
            </Text>
            <Text
              style={{
                fontFamily: "PlusJakartaSans_400Regular",
                fontSize: 15,
                color: Colors.textSecondary,
              }}
            >
              Autentifică-te pentru a-ți continua aventurile
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
                Parolă
              </Text>
              <View>
                <TextInput
                  placeholder="Parola ta"
                  placeholderTextColor={Colors.textMuted}
                  value={password}
                  onChangeText={setParolă}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry={!showParolă}
                  autoComplete="password"
                  style={{
                    minHeight: 48,
                    borderWidth: 1,
                    borderColor: focusedField === "password" ? Colors.accent : Colors.border,
                    borderRadius: 8,
                    paddingHorizontal: 14,
                    paddingRight: 48,
                    fontSize: 15,
                    fontFamily: "PlusJakartaSans_400Regular",
                    backgroundColor: Colors.surface,
                    color: Colors.textPrimary,
                  }}
                />
                <Pressable
                  onPress={() => setShowParolă((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: 0,
                    bottom: 0,
                    justifyContent: "center",
                  }}
                >
                  <Ionicons
                    name={showParolă ? "eye-off-outline" : "eye-outline"}
                    size={20}
                    color={Colors.textMuted}
                  />
                </Pressable>
              </View>
              <Pressable
                onPress={() => navigation.navigate("ForgotPassword")}
                style={{ alignSelf: "flex-end" }}
              >
                <Text
                  style={{
                    color: Colors.textMuted,
                    fontFamily: "PlusJakartaSans_400Regular",
                    fontSize: 13,
                  }}
                >
                  Ai uitat parola?
                </Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            onPress={handleLogin}
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
              {loading ? "Se autentifică..." : "Autentificare"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("SignUp")}
            style={{ alignItems: "center" }}
          >
            <Text
              style={{
                color: Colors.textSecondary,
                fontFamily: "PlusJakartaSans_400Regular",
                fontSize: 14,
              }}
            >
              Nu ai un cont?{" "}
              <Text
                style={{
                  color: Colors.accent,
                  fontFamily: "PlusJakartaSans_700Bold",
                }}
              >
                Înregistrează-te
              </Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
