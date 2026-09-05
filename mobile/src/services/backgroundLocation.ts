import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import * as TaskManager from "expo-task-manager";

export const BACKGROUND_LOCATION_TASK = "HIKEAPP_BACKGROUND_LOCATION_TASK";

const BACKGROUND_LOCATION_QUEUE_KEY = "background_location_queue";
const MAX_QUEUED_LOCATIONS = 5000;

export type QueuedLocation = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  speed: number | null;
  timestamp: number;
};

type BackgroundLocationTaskBody = {
  data?: unknown;
  error?: unknown;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object";
}

function isQueuedLocation(value: unknown): value is QueuedLocation {
  return (
    isObject(value) &&
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude) &&
    (value.altitude === null || typeof value.altitude === "number") &&
    (value.accuracy === null || typeof value.accuracy === "number") &&
    (value.speed === null || typeof value.speed === "number") &&
    typeof value.timestamp === "number" &&
    Number.isFinite(value.timestamp)
  );
}

function parseQueuedLocations(value: string | null): QueuedLocation[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(isQueuedLocation) : [];
  } catch {
    return [];
  }
}

TaskManager.defineTask(
  BACKGROUND_LOCATION_TASK,
  async ({ data, error }: BackgroundLocationTaskBody) => {
    if (error) return;

    const locations =
      isObject(data) && Array.isArray(data.locations) ? data.locations : [];
    if (locations.length === 0) return;

    const nextLocations = locations
      .filter(
        (location): location is Location.LocationObject =>
          isObject(location) && isObject(location.coords)
      )
      .map((location) => ({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        altitude: location.coords.altitude ?? null,
        accuracy: location.coords.accuracy ?? null,
        speed: location.coords.speed ?? null,
        timestamp: location.timestamp,
      }))
      .filter(isQueuedLocation);

    if (nextLocations.length === 0) return;

    try {
      const existingQueue = parseQueuedLocations(
        await SecureStore.getItemAsync(BACKGROUND_LOCATION_QUEUE_KEY)
      );
      const cappedQueue = [...existingQueue, ...nextLocations].slice(
        -MAX_QUEUED_LOCATIONS
      );

      await SecureStore.setItemAsync(
        BACKGROUND_LOCATION_QUEUE_KEY,
        JSON.stringify(cappedQueue)
      );
    } catch {
      // Background tasks should not throw back to the native task runner.
    }
  }
);

export async function startBackgroundLocationUpdates(): Promise<boolean> {
  const foregroundPermission = await Location.requestForegroundPermissionsAsync();
  if (foregroundPermission.status !== "granted") {
    return false;
  }

  const backgroundPermission = await Location.requestBackgroundPermissionsAsync();
  if (backgroundPermission.status !== "granted") {
    return false;
  }

  const isRunning = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK
  );

  if (!isRunning) {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 4000,
      distanceInterval: 5,
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Fitness,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "HikeApp is recording your hike",
        notificationBody: "Tracking your route in the background",
      },
    });
  }

  return true;
}

export async function stopBackgroundLocationUpdates(): Promise<void> {
  const isRunning = await Location.hasStartedLocationUpdatesAsync(
    BACKGROUND_LOCATION_TASK
  );

  if (isRunning) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}

export async function drainBackgroundLocationQueue(): Promise<QueuedLocation[]> {
  const queuedLocations = parseQueuedLocations(
    await SecureStore.getItemAsync(BACKGROUND_LOCATION_QUEUE_KEY)
  );

  await SecureStore.deleteItemAsync(BACKGROUND_LOCATION_QUEUE_KEY);

  return queuedLocations;
}

export async function clearBackgroundLocationQueue(): Promise<void> {
  await SecureStore.deleteItemAsync(BACKGROUND_LOCATION_QUEUE_KEY);
}
