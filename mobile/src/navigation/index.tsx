import { ActivityIndicator, View } from "react-native";
import { DarkTheme, DefaultTheme } from "@react-navigation/native";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NavigatorScreenParams } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import WelcomeScreen from "../screens/WelcomeScreen";
import LoginScreen from "../screens/LoginScreen";
import SignUpScreen from "../screens/SignUpScreen";
import ForgotPasswordScreen from "../screens/ForgotPasswordScreen";
import CompleteProfileScreen from "../screens/CompleteProfileScreen";
import ExploreScreen from "../screens/ExploreScreen";
import PlanScreen from "../screens/PlanScreen";
import RecordScreen from "../screens/RecordScreen";
import HistoryScreen from "../screens/HistoryScreen";
import ProfileScreen from "../screens/ProfileScreen";
import HikeDetailsScreen from "../screens/HikeDetailsScreen";
import SettingsScreen from "../screens/SettingsScreen";
import { GlassTabBar } from "../components/ui/GlassTabBar";
import { Colors } from "../theme";
import { useAuth } from "../hooks/useAuth";

export type MainTabParamList = {
  Explore: undefined;
  Plan: { selectedRouteId?: string } | undefined;
  Record:
    | {
        routeId?: string;
        routeName?: string;
        routeCoordinates?: Array<{ lat: number; lon: number }>;
        routeDistanceKm?: number;
        riskScore?: number;
        backpackWeightKg?: number;
      }
    | undefined;
  History: undefined;
  Profile: undefined;
};

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
};

export type MainStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  HikeDetails: { hikeId: string };
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const AuthStackNav = createNativeStackNavigator<AuthStackParamList>();
const MainStackNav = createNativeStackNavigator<MainStackParamList>();

type TabIconName = React.ComponentProps<typeof Ionicons>["name"];

function isMainTabRouteName(value: string): value is keyof MainTabParamList {
  return (
    value === "Explore" ||
    value === "Plan" ||
    value === "Record" ||
    value === "History" ||
    value === "Profile"
  );
}

function getTabIcon(
  routeName: keyof MainTabParamList,
  focused: boolean
): TabIconName {
  const icons: Record<keyof MainTabParamList, [TabIconName, TabIconName]> = {
    Explore: ["map", "map-outline"],
    Plan: ["compass", "compass-outline"],
    Record: ["radio-button-on", "radio-button-off"],
    History: ["time", "time-outline"],
    Profile: ["person", "person-outline"],
  };
  const [active, inactive] = icons[routeName];
  return focused ? active : inactive;
}

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={({ route }) => ({
        headerTitleAlign: "center",
        tabBarActiveTintColor: "#1976d2",
        tabBarInactiveTintColor: "#888",
        tabBarIcon: ({ color, size, focused }) => (
          <Ionicons
            name={getTabIcon(
              isMainTabRouteName(route.name) ? route.name : "Explore",
              focused
            )}
            size={size}
            color={color}
          />
        ),
      })}
    >
      <Tab.Screen
        name="Explore"
        component={ExploreScreen}
        options={{ title: "Explorează", headerShown: false }}
      />
      <Tab.Screen
        name="Plan"
        component={PlanScreen}
        options={{ title: "Planifică" }}
      />
      <Tab.Screen
        name="Record"
        component={RecordScreen}
        options={{ title: "Înregistrează", headerShown: false }}
      />
      <Tab.Screen
        name="History"
        component={HistoryScreen}
        options={{ title: "Istoric" }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: "Profil" }}
      />
    </Tab.Navigator>
  );
}

function MainStack() {
  return (
    <MainStackNav.Navigator screenOptions={{ headerTitleAlign: "center" }}>
      <MainStackNav.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <MainStackNav.Screen
        name="HikeDetails"
        component={HikeDetailsScreen}
        options={{ title: "Detalii Traseu", headerBackTitle: "Înapoi" }}
      />
      <MainStackNav.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ headerShown: false }}
      />
    </MainStackNav.Navigator>
  );
}

function AuthStack() {
  return (
    <AuthStackNav.Navigator screenOptions={{ headerTitleAlign: "center", headerBackTitle: "Înapoi" }}>
      <AuthStackNav.Screen
        name="Welcome"
        component={WelcomeScreen}
        options={{ headerShown: false }}
      />
      <AuthStackNav.Screen name="Login" component={LoginScreen} options={{ title: "Autentificare" }} />
      <AuthStackNav.Screen name="SignUp" component={SignUpScreen} options={{ title: "Cont nou" }} />
      <AuthStackNav.Screen
        name="ForgotPassword"
        component={ForgotPasswordScreen}
        options={{ title: "Parolă Uitată" }}
      />
    </AuthStackNav.Navigator>
  );
}


const AppDarkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.background,
    card: Colors.surface,
    text: Colors.textPrimary,
    border: Colors.border,
    primary: Colors.accent,
    notification: Colors.accent,
  },
};

export default function AppNavigator() {
  const { isAuthenticated, isInitializing, hasCompletedProfile } = useAuth();

  if (isInitializing) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <NavigationContainer theme={AppDarkTheme}>
      {!isAuthenticated ? (
        <AuthStack />
      ) : !hasCompletedProfile ? (
        <CompleteProfileScreen />
      ) : (
        <MainStack />
      )}
    </NavigationContainer>
  );
}
