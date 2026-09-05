export interface ElevationProfilePoint {
  lat: number;
  lon: number;
  elevation: number;
}

function isElevationProfilePoint(value: unknown): value is ElevationProfilePoint {
  if (!value || typeof value !== "object") {
    return false;
  }

  const point = value as Partial<ElevationProfilePoint>;

  return (
    typeof point.lat === "number" &&
    typeof point.lon === "number" &&
    typeof point.elevation === "number" &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lon) &&
    Number.isFinite(point.elevation)
  );
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;

  return earthRadiusKm * 2 * Math.asin(Math.sqrt(a));
}

export function computeToblerDurationH(
  elevationProfile: unknown,
  distanceKm: number
): number | null {
  if (!Array.isArray(elevationProfile) || elevationProfile.length < 2) {
    return null;
  }

  if (!Number.isFinite(distanceKm) || distanceKm <= 0) {
    return null;
  }

  const profile = elevationProfile.filter(isElevationProfilePoint);

  if (profile.length < 2) {
    return null;
  }

  const rawSegmentDistancesKm: number[] = [];
  let rawDistanceKm = 0;

  for (let i = 1; i < profile.length; i++) {
    const prev = profile[i - 1]!;
    const current = profile[i]!;
    const segmentDistanceKm = haversineKm(prev.lat, prev.lon, current.lat, current.lon);

    rawSegmentDistancesKm.push(segmentDistanceKm);
    rawDistanceKm += segmentDistanceKm;
  }

  if (!Number.isFinite(rawDistanceKm) || rawDistanceKm <= 0) {
    return null;
  }

  const distanceScale = distanceKm / rawDistanceKm;
  let durationH = 0;

  for (let i = 1; i < profile.length; i++) {
    const prev = profile[i - 1]!;
    const current = profile[i]!;
    const segmentDistanceKm = rawSegmentDistancesKm[i - 1]! * distanceScale;

    if (!Number.isFinite(segmentDistanceKm) || segmentDistanceKm <= 0) {
      continue;
    }

    const elevationDeltaM = current.elevation - prev.elevation;
    const slope = elevationDeltaM / (segmentDistanceKm * 1000);
    const speedKmh = 6 * Math.exp(-3.5 * Math.abs(slope + 0.05));

    if (!Number.isFinite(speedKmh) || speedKmh <= 0) {
      return null;
    }

    durationH += segmentDistanceKm / speedKmh;
  }

  if (!Number.isFinite(durationH) || durationH <= 0) {
    return null;
  }

  return Math.round(durationH * 100) / 100;
}
