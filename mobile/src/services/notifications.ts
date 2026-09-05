import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";

const NOTIFICATIONS_ENABLED_KEY = "notifications_enabled";
const LAST_FITNESS_LEVEL_KEY = "notifications_last_fitness_level";
const WEIGHT_UPDATED_AT_KEY = "notifications_weight_updated_at";
const LAST_INACTIVITY_SCHEDULED_KEY = "notifications_last_inactivity_scheduled";
const LAST_STALE_WEIGHT_SCHEDULED_KEY = "notifications_last_stale_weight_scheduled";

const DAY_MS = 24 * 60 * 60 * 1000;
const FITNESS_LEVEL_ORDER = ["Sedentary", "Casual", "Active", "Athletic", "Elite"] as const;

type FitnessLevel = (typeof FITNESS_LEVEL_ORDER)[number];

function getFitnessLevelRank(level: string | null | undefined): number {
  return FITNESS_LEVEL_ORDER.indexOf(level as FitnessLevel);
}

function parseStoredTimestamp(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

async function hasNotificationPermission(): Promise<boolean> {
  const permissions = await Notifications.getPermissionsAsync();
  return (
    permissions.granted ||
    permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

async function notificationsActive(): Promise<boolean> {
  const storedEnabled = await SecureStore.getItemAsync(NOTIFICATIONS_ENABLED_KEY);

  if (storedEnabled !== "true") {
    return false;
  }

  return hasNotificationPermission();
}

async function scheduleDelayedNotification(
  content: Notifications.NotificationContentInput,
  seconds: number
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds,
    },
  });
}

export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync("default", {
    name: "default",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const currentPermissions = await Notifications.getPermissionsAsync();

  if (
    currentPermissions.granted ||
    currentPermissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  ) {
    return true;
  }

  const requestedPermissions = await Notifications.requestPermissionsAsync();
  return (
    requestedPermissions.granted ||
    requestedPermissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

export async function areNotificationsEnabled(): Promise<boolean> {
  return notificationsActive();
}

export async function setNotificationsEnabled(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(NOTIFICATIONS_ENABLED_KEY, enabled ? "true" : "false");

  if (!enabled) {
    await Notifications.cancelAllScheduledNotificationsAsync();
  }
}

export async function checkAndFireLevelUp(
  currentLevel: string | null | undefined
): Promise<void> {
  if (!(await notificationsActive())) {
    return;
  }

  const currentRank = getFitnessLevelRank(currentLevel);

  if (currentRank === -1 || !currentLevel) {
    return;
  }

  const previousLevel = await SecureStore.getItemAsync(LAST_FITNESS_LEVEL_KEY);
  const previousRank = getFitnessLevelRank(previousLevel);

  if (previousRank !== -1 && currentRank > previousRank) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Fitness level up",
        body: `You reached ${currentLevel}. Keep the momentum going.`,
      },
      trigger: null,
    });
  }

  await SecureStore.setItemAsync(LAST_FITNESS_LEVEL_KEY, currentLevel);
}

export async function scheduleInactivityReminderIfNeeded(
  daysSinceLastHike: number | null | undefined
): Promise<void> {
  if (!(await notificationsActive())) {
    return;
  }

  if (typeof daysSinceLastHike !== "number" || daysSinceLastHike < 21) {
    return;
  }

  const now = Date.now();
  const lastScheduled = parseStoredTimestamp(
    await SecureStore.getItemAsync(LAST_INACTIVITY_SCHEDULED_KEY)
  );

  if (lastScheduled && now - lastScheduled <= 14 * DAY_MS) {
    return;
  }

  await scheduleDelayedNotification(
    {
      title: "Time for a hike",
      body: "It has been a while since your last hike. Plan a route when you can.",
    },
    24 * 60 * 60
  );
  await SecureStore.setItemAsync(LAST_INACTIVITY_SCHEDULED_KEY, String(now));
}

export async function markWeightUpdated(): Promise<void> {
  await SecureStore.setItemAsync(WEIGHT_UPDATED_AT_KEY, String(Date.now()));
}

export async function checkStaleWeightReminder(): Promise<void> {
  if (!(await notificationsActive())) {
    return;
  }

  const now = Date.now();
  const weightUpdatedAt = parseStoredTimestamp(
    await SecureStore.getItemAsync(WEIGHT_UPDATED_AT_KEY)
  );

  if (weightUpdatedAt && now - weightUpdatedAt < 90 * DAY_MS) {
    return;
  }

  const lastScheduled = parseStoredTimestamp(
    await SecureStore.getItemAsync(LAST_STALE_WEIGHT_SCHEDULED_KEY)
  );

  if (lastScheduled && now - lastScheduled <= 30 * DAY_MS) {
    return;
  }

  await scheduleDelayedNotification(
    {
      title: "Update your weight",
      body: "Refresh your weight so fitness estimates stay accurate.",
    },
    5
  );
  await SecureStore.setItemAsync(LAST_STALE_WEIGHT_SCHEDULED_KEY, String(now));
}
