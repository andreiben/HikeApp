import "./src/services/backgroundLocation";
import { useEffect } from "react";
import { StatusBar, Text, View } from "react-native";
import { useFonts } from "expo-font";
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_600SemiBold,
} from "@expo-google-fonts/jetbrains-mono";
import { QueryClientProvider } from "@tanstack/react-query";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import Toast from "react-native-toast-message";
import AppNavigator from "./src/navigation";
import { Colors } from "./src/theme";
import { queryClient } from "./src/lib/queryClient";
import { AuthProvider } from "./src/hooks/useAuth";
import { setupNotificationChannel } from "./src/services/notifications";

const toastConfig = {
  success: ({ text1, text2 }: { text1?: string; text2?: string }) => (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#2D3E32", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 16, borderWidth: 1, borderColor: "#3A4F3E", gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }}>
      <Ionicons name="checkmark-circle" size={20} color="#52B788" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#F0EDE8", fontWeight: "600", fontSize: 14 }}>{text1}</Text>
        {text2 ? <Text style={{ color: "#9BB5A0", fontSize: 12, marginTop: 2 }}>{text2}</Text> : null}
      </View>
    </View>
  ),
  error: ({ text1, text2 }: { text1?: string; text2?: string }) => (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#2D3E32", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 16, borderWidth: 1, borderColor: "#F87171", gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }}>
      <Ionicons name="alert-circle" size={20} color="#F87171" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#F0EDE8", fontWeight: "600", fontSize: 14 }}>{text1}</Text>
        {text2 ? <Text style={{ color: "#9BB5A0", fontSize: 12, marginTop: 2 }}>{text2}</Text> : null}
      </View>
    </View>
  ),
  info: ({ text1, text2 }: { text1?: string; text2?: string }) => (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#2D3E32", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, marginHorizontal: 16, borderWidth: 1, borderColor: "#3A4F3E", gap: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }}>
      <Ionicons name="information-circle" size={20} color="#52B788" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: "#F0EDE8", fontWeight: "600", fontSize: 14 }}>{text1}</Text>
        {text2 ? <Text style={{ color: "#9BB5A0", fontSize: 12, marginTop: 2 }}>{text2}</Text> : null}
      </View>
    </View>
  ),
};

export default function App() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_600SemiBold,
  });

  useEffect(() => {
    void setupNotificationChannel();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: Colors.background }}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.background} />
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </QueryClientProvider>
      <Toast config={toastConfig} />
    </GestureHandlerRootView>
  );
}
