export type TrackedPoint = {
  latitude: number;
  longitude: number;
  altitude: number | null;
  timestamp: number;
};

export type HikeMetrics = {
  distanceM: number;
  durationS: number;
  movingTimeS: number;
  elevationGainM: number;
  elevationLossM: number;
  minAltitudeM: number | null;
  maxAltitudeM: number | null;
  avgSpeedKmh: number;
  avgPaceMinKm: number;
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function haversineDistanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
) {
  const R = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateHikeMetrics(points: TrackedPoint[]): HikeMetrics {
  if (points.length < 2) {
    return {
      distanceM: 0,
      durationS: 0,
      movingTimeS: 0,
      elevationGainM: 0,
      elevationLossM: 0,
      minAltitudeM: null,
      maxAltitudeM: null,
      avgSpeedKmh: 0,
      avgPaceMinKm: 0,
    };
  }

  let distanceM = 0;
  let movingTimeS = 0;
  let elevationGainM = 0;
  let elevationLossM = 0;

  const altitudeValues = points
    .map((p) => p.altitude)
    .filter((alt): alt is number => alt !== null);

  const minAltitudeM =
    altitudeValues.length > 0 ? Math.min(...altitudeValues) : null;
  const maxAltitudeM =
    altitudeValues.length > 0 ? Math.max(...altitudeValues) : null;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    const segmentDistance = haversineDistanceM(
      prev.latitude,
      prev.longitude,
      curr.latitude,
      curr.longitude
    );

    distanceM += segmentDistance;

    const deltaTimeS = Math.max((curr.timestamp - prev.timestamp) / 1000, 0);

    if (segmentDistance >= 3) {
      movingTimeS += deltaTimeS;
    }

    if (prev.altitude !== null && curr.altitude !== null) {
      const deltaAlt = curr.altitude - prev.altitude;

      if (deltaAlt > 3) {
        elevationGainM += deltaAlt;
      } else if (deltaAlt < -3) {
        elevationLossM += Math.abs(deltaAlt);
      }
    }
  }

  const durationS = Math.max(
    (points[points.length - 1].timestamp - points[0].timestamp) / 1000,
    0
  );

  const avgSpeedKmh =
    movingTimeS > 0 ? (distanceM / 1000) / (movingTimeS / 3600) : 0;

  const avgPaceMinKm =
    distanceM > 0 && movingTimeS > 0
      ? (movingTimeS / 60) / (distanceM / 1000)
      : 0;

  return {
    distanceM,
    durationS,
    movingTimeS,
    elevationGainM,
    elevationLossM,
    minAltitudeM,
    maxAltitudeM,
    avgSpeedKmh,
    avgPaceMinKm,
  };
}