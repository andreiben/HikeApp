import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, type Route } from "./api";

const CACHE_KEY = "routes_cache_v5";
const SERVE_TTL_MS = 24 * 60 * 60 * 1000;
const REFRESH_TTL_MS = 60 * 60 * 1000;

type RoutesCache = {
  routes: Route[];
  fetchedAt: number;
};

async function fetchAndCache(): Promise<Route[]> {
  const response = await api.get<{ routes: Route[] }>("/routes");
  const routes = response.data.routes ?? [];
  const payload: RoutesCache = { routes, fetchedAt: Date.now() };
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // cache write failure is non-fatal
  }
  return routes;
}

export async function getRoutes(forceRefresh = false): Promise<Route[]> {
  if (forceRefresh) {
    return fetchAndCache();
  }

  let cached: RoutesCache | null = null;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) cached = JSON.parse(raw) as RoutesCache;
  } catch {
    // cache read failure — fall through to network
  }

  const now = Date.now();

  if (!cached || now - cached.fetchedAt > SERVE_TTL_MS) {
    return fetchAndCache();
  }

  if (now - cached.fetchedAt > REFRESH_TTL_MS) {
    void fetchAndCache().catch(() => undefined);
  }

  return cached.routes;
}

export async function invalidateRoutesCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    // non-fatal
  }
}
