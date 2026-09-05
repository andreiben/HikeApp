export type RoutePoint = {
  latitude: number;
  longitude: number;
};

export type RouteDifficulty = "easy" | "moderate" | "hard";

export type HikeRoute = {
  id: string;
  name: string;
  region: string;
  distanceKm: number;
  elevationGainM: number;
  surfaceType?: string;
  maxElevationM?: number | null;
  estimatedDurationH: number;
  difficulty: RouteDifficulty;
  startLatitude: number;
  startLongitude: number;
  endLatitude: number;
  endLongitude: number;
  geometry: RoutePoint[];
  createdAt?: string;
};
