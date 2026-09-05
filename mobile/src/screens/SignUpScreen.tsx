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
import { Colors } from "../theme";

type Props = NativeStackScreenProps<AuthStackParamList, "SignUp">;

export default function SignUpScreen({ navigation }: Props) {
  const [email, setEmail] = useState("");
  const [password, setParolă] = useState("");
  const [confirmParolă, setConfirmParolă] = useState("");
  const [showParolă, setShowParolă] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<
    "email" | "password" | "confirmParolă" | null
  >(null);

  const handleSignUp = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Câmpuri lipsă", "Te rugăm să completezi toate câmpurile.");
      return;
    }
    if (password !== confirmParolă) {
      Alert.alert(
        "Parolele nu coincid",
        "Asigura-te ca ambele parole sunt identice."
      );
      return;
    }
    if (password.length < 6) {
      Alert.alert("Parolă slabă", "Parola trebuie să aibă cel puțin 6 caractere.");
      return;
    }

    try {
      setLoading(true);
      await api.post("/auth/register", { email: email.trim(), password });
      Alert.alert("Cont creat!", "Te poți autentifica acum.", [
        { text: "Autentificare", onPress: () => navigation.navigate("Login") },
      ]);
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { error?: string } };
        message?: string;
      };
      const status = (error as { response?: { status?: number } })?.response
        ?.status;
      const msg =
        err?.response?.data?.error ?? err?.message ?? "Ceva a mers prost";
      Alert.alert(
        status === 409 ? "Contul există deja" : "Înregistrare eșuată",
        msg
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
              Creează cont
            </Text>
            <Text
              style={{
                fontFamily: "PlusJakartaSans_400Regular",
                fontSize: 15,
                color: Colors.textSecondary,
              }}
            >
              Începe să explorezi traseele românești
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
                  placeholder="Cel puțin 6 caractere"
                  placeholderTextColor={Colors.textMuted}
                  value={password}
                  onChangeText={setParolă}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  secureTextEntry={!showParolă}
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
            </View>

            <View style={{ gap: 6 }}>
              <Text
                style={{
                  fontFamily: "PlusJakartaSans_600SemiBold",
                  fontSize: 12,
                  color: Colors.textSecondary,
                }}
              >
                Confirmă Parola
              </Text>
              <TextInput
                placeholder="Repetă parola"
                placeholderTextColor={Colors.textMuted}
                value={confirmParolă}
                onChangeText={setConfirmParolă}
                onFocus={() => setFocusedField("confirmParolă")}
                onBlur={() => setFocusedField(null)}
                secureTextEntry={!showParolă}
                style={{
                  minHeight: 48,
                  borderWidth: 1,
                  borderColor:
                    focusedField === "confirmParolă"
                      ? Colors.accent
                      : confirmParolă && confirmParolă !== password
                      ? Colors.danger
                      : Colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 14,
                  fontSize: 15,
                  fontFamily: "PlusJakartaSans_400Regular",
                  backgroundColor: Colors.surface,
                  color: Colors.textPrimary,
                }}
              />
              {confirmParolă.length > 0 && confirmParolă !== password && (
                <Text
                  style={{
                    color: Colors.danger,
                    fontFamily: "PlusJakartaSans_400Regular",
                    fontSize: 12,
                  }}
                >
                  Parolele nu coincid
                </Text>
              )}
            </View>
          </View>

          <Pressable
            onPress={handleSignUp}
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
              {loading ? "Se creează contul..." : "Creează Cont"}
            </Text>
          </Pressable>

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
              Ai deja un cont?{" "}
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
