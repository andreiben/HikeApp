type Hike = {
  id: string;
  status: string;
  startedAt?: string | null;
  distanceM?: number | null;
  durationS: number | null;
  elevationGainM: number | null;
};

export type UserCapacity = {
  learnedComfortDurationH: number | null;
  learnedComfortElevationGainM: number | null;
  learnedComfortDistanceKm: number | null;
  sampleSize: number;
};

function percentile(values: number[], p: number) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.floor((sorted.length - 1) * p);
  return sorted[index];
}

function hasMinimumSample(values: number[]) {
  return values.length >= 3;
}

export function calculateUserCapacity(hikes: Hike[]): UserCapacity {
  const now = Date.now();
  const windowStart = now - 365 * 24 * 60 * 60 * 1000;
  const completed = hikes.filter((h) => {
    if (h.status !== "completed") return false;
    if (!h.startedAt) return true;

    const startedAtMs = new Date(h.startedAt).getTime();
    if (Number.isNaN(startedAtMs)) return true;

    return startedAtMs >= windowStart && startedAtMs <= now;
  });

  const durationsH = completed
    .map((h) => (h.durationS != null ? h.durationS / 3600 : null))
    .filter((v): v is number => v !== null && v > 0);

  const elevationGains = completed
    .map((h) => h.elevationGainM)
    .filter((v): v is number => v !== null && v > 0);

  const distancesKm = completed
    .map((h) => (h.distanceM != null ? h.distanceM / 1000 : null))
    .filter((v): v is number => v !== null && v > 0);

  return {
    learnedComfortDurationH: hasMinimumSample(durationsH)
      ? percentile(durationsH, 0.75)
      : null,
    learnedComfortElevationGainM: hasMinimumSample(elevationGains)
      ? percentile(elevationGains, 0.75)
      : null,
    learnedComfortDistanceKm: hasMinimumSample(distancesKm)
      ? percentile(distancesKm, 0.75)
      : null,
    sampleSize: completed.length,
  };
}
