import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../navigation";
import { Colors } from "../theme";

type Props = NativeStackScreenProps<AuthStackParamList, "Welcome">;

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
      <View style={{ flex: 1, justifyContent: "space-between", padding: 32 }}>

        {/* Hero section */}
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center", gap: 20 }}>
          <View
            style={{
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: Colors.surface,
              borderWidth: 1,
              borderColor: Colors.border,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons name="trail-sign" size={52} color={Colors.accent} />
          </View>

          <Text
            style={{
              fontFamily: "PlusJakartaSans_700Bold",
              fontSize: 30,
              color: Colors.textPrimary,
              letterSpacing: 0,
            }}
          >
            HikeApp
          </Text>

          <Text
            style={{
              fontFamily: "PlusJakartaSans_400Regular",
              fontSize: 15,
              color: Colors.textSecondary,
              textAlign: "center",
              lineHeight: 22,
              maxWidth: 260,
            }}
          >
            Planifică trasee mai sigure, înregistrează-ți aventurile și explorează munții României.
          </Text>
        </View>

        {/* Buttons */}
        <View style={{ gap: 12 }}>
          <Pressable
            onPress={() => navigation.navigate("Login")}
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
              Autentificare
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("SignUp")}
            style={({ pressed }) => ({
              backgroundColor: pressed ? Colors.surface : "transparent",
              minHeight: 52,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: Colors.border,
            })}
          >
            <Text
              style={{
                color: Colors.accent,
                fontFamily: "PlusJakartaSans_700Bold",
                fontSize: 16,
              }}
            >
              Creează Cont
            </Text>
          </Pressable>

          <Text
            style={{
              color: Colors.textMuted,
              textAlign: "center",
              fontFamily: "PlusJakartaSans_400Regular",
              fontSize: 12,
              marginTop: 8,
            }}
          >
            Continuând, ești de acord cu Termenii Serviciului
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}
