export interface CompletionInput {
  hikePoints: { latitude: number; longitude: number }[];
  recordedDistanceM: number;
  durationS: number;
  route: {
    startLatitude: number;
    startLongitude: number;
    distanceKm: number;
    estimatedDurationH: number;
    geometry: { type: string; coordinates: [number, number][] } | null;
  };
}

/** Haversine distance in metres between two lat/lon points */
export function haversineM(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Compute a 0-100 GPS quality score measuring how thoroughly a hike
 * covered the reference route.
 *
 * Four signals:
 *   Signal 1 — Start proximity     (0 or 25 pts)
 *   Signal 2 — Distance coverage   (0-30 pts)
 *   Signal 3 — GPS spatial overlap (0-30 pts)
 *   Signal 4 — Duration floor      (0 or 15 pts)
 *
 * Score >= 65 → hiker is considered "trail-verified" for condition reports.
 */
export function calculateCompletionScore(input: CompletionInput): number {
  const { hikePoints, recordedDistanceM, durationS, route } = input;

  // Not enough GPS data to evaluate
  if (hikePoints.length < 3) return 0;

  let score = 0;

  // ── Signal 1: Start proximity (0 or 25 pts) ───────────────────────────────
  const firstPoint = hikePoints[0]!;
  const startDist = haversineM(
    firstPoint.latitude, firstPoint.longitude,
    route.startLatitude, route.startLongitude
  );
  if (startDist <= 400) score += 25;

  // ── Signal 2: Distance coverage (0-30 pts) ────────────────────────────────
  const routeDistanceM = route.distanceKm * 1000;
  if (routeDistanceM > 0) {
    const ratio = recordedDistanceM / routeDistanceM;
    if (ratio >= 0.9) score += 30;
    else if (ratio >= 0.7) score += 20;
    else if (ratio >= 0.5) score += 10;
    // < 50% = 0
  }

  // ── Signal 3: GPS spatial overlap (0-30 pts) ──────────────────────────────
  if (
    route.geometry &&
    route.geometry.type === "LineString" &&
    route.geometry.coordinates.length >= 2
  ) {
    const coords = route.geometry.coordinates; // [lon, lat]
    // Sample route every ~500 m worth of index steps
    const stepSize = Math.max(
      1,
      Math.round(coords.length / Math.max(1, routeDistanceM / 500))
    );
    const samples: [number, number][] = [];
    for (let i = 0; i < coords.length; i += stepSize) {
      samples.push(coords[i]!);
    }

    let covered = 0;
    for (const [sLon, sLat] of samples) {
      const nearby = hikePoints.some(
        (p) => haversineM(p.latitude, p.longitude, sLat, sLon) <= 250
      );
      if (nearby) covered++;
    }

    const coverage = samples.length > 0 ? covered / samples.length : 0;
    if (coverage >= 0.7) score += 30;
    else if (coverage >= 0.5) score += 20;
    else if (coverage >= 0.3) score += 10;
  } else {
    // No geometry available — award neutral 15 pts
    score += 15;
  }

  // ── Signal 4: Duration floor (0 or 15 pts) ───────────────────────────────
  const durationFloor = route.estimatedDurationH * 3600 * 0.35;
  if (durationS >= durationFloor) score += 15;

  return Math.min(100, Math.max(0, score));
}
