export type FitnessLevel = "Sedentary" | "Casual" | "Active" | "Athletic" | "Elite";

export type CompletedHikeRow = {
  distanceM: number | null;
  elevationGainM: number | null;
  startedAt: Date;
};

export type RecentLoad = {
  last3DaysKm: number;
  last3DaysElevationM: number;
  last3DaysHikeCount: number;
  last7DaysKm: number;
  last7DaysElevationM: number;
  last7DaysHikeCount: number;
  last30DaysKm: number;
  last30DaysElevationM: number;
  last30DaysHikeCount: number;
};

export type FitnessLevelDetail = {
  level: FitnessLevel;
  score: number;
  nextLevelScore: number | null;
};

export type PeriodSummary = {
  km: number;
  elevationM: number;
  hikeCount: number;
};

export type MonthComparison = {
  currentMonth: PeriodSummary;
  previousMonth: PeriodSummary;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function isWithinDays(startedAt: Date, now: Date, days: number): boolean {
  const startedAtMs = startedAt.getTime();
  const nowMs = now.getTime();
  const windowStartMs = nowMs - days * 24 * 60 * 60 * 1000;

  return startedAtMs >= windowStartMs && startedAtMs <= nowMs;
}

function sumDistanceKm(hikes: CompletedHikeRow[]): number {
  return hikes.reduce((sum, hike) => sum + (hike.distanceM ?? 0) / 1000, 0);
}

function sumElevationM(hikes: CompletedHikeRow[]): number {
  return hikes.reduce((sum, hike) => sum + (hike.elevationGainM ?? 0), 0);
}

function scoreByThresholds(
  value: number,
  thresholds: [number, number, number, number]
): number {
  const [elite, athletic, active, casual] = thresholds;

  if (value >= elite) {
    return 4;
  }

  if (value >= athletic) {
    return 3;
  }

  if (value >= active) {
    return 2;
  }

  if (value >= casual) {
    return 1;
  }

  return 0;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function startOfIsoWeekUtc(dateInput: Date): Date {
  const date = new Date(
    Date.UTC(
      dateInput.getUTCFullYear(),
      dateInput.getUTCMonth(),
      dateInput.getUTCDate()
    )
  );
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}

export function computeWeeklyStreak(
  hikes: CompletedHikeRow[],
  now: Date = new Date()
): number {
  const nowMs = now.getTime();
  const activeWeekStarts = new Set<number>();

  for (const hike of hikes) {
    const startedAtMs = hike.startedAt.getTime();

    if (!Number.isFinite(startedAtMs) || startedAtMs > nowMs) {
      continue;
    }

    activeWeekStarts.add(startOfIsoWeekUtc(hike.startedAt).getTime());
  }

  let cursor = startOfIsoWeekUtc(now).getTime();

  if (!activeWeekStarts.has(cursor)) {
    cursor -= WEEK_MS;
  }

  let streak = 0;

  while (streak < 520 && activeWeekStarts.has(cursor)) {
    streak += 1;
    cursor -= WEEK_MS;
  }

  return streak;
}

export function computeRecentLoad(
  hikes: CompletedHikeRow[],
  now = new Date()
): RecentLoad {
  const last3DaysHikes = hikes.filter((hike) => isWithinDays(hike.startedAt, now, 3));
  const last7DaysHikes = hikes.filter((hike) => isWithinDays(hike.startedAt, now, 7));
  const last30DaysHikes = hikes.filter((hike) => isWithinDays(hike.startedAt, now, 30));

  return {
    last3DaysKm: sumDistanceKm(last3DaysHikes),
    last3DaysElevationM: sumElevationM(last3DaysHikes),
    last3DaysHikeCount: last3DaysHikes.length,
    last7DaysKm: sumDistanceKm(last7DaysHikes),
    last7DaysElevationM: sumElevationM(last7DaysHikes),
    last7DaysHikeCount: last7DaysHikes.length,
    last30DaysKm: sumDistanceKm(last30DaysHikes),
    last30DaysElevationM: sumElevationM(last30DaysHikes),
    last30DaysHikeCount: last30DaysHikes.length,
  };
}

export function computeFitnessLevel(
  hikes: CompletedHikeRow[],
  now = new Date()
): FitnessLevel {
  return computeFitnessLevelDetail(hikes, now).level;
}

export function computeFitnessLevelDetail(
  hikes: CompletedHikeRow[],
  now = new Date()
): FitnessLevelDetail {
  const last90DaysHikes = hikes.filter((hike) => isWithinDays(hike.startedAt, now, 90));
  const weeklyFreq = last90DaysHikes.length / 12.857;
  const avgKm = average(
    last90DaysHikes
      .map((hike) => hike.distanceM)
      .filter((distanceM): distanceM is number => distanceM != null)
      .map((distanceM) => distanceM / 1000)
  );
  const avgElev = average(
    last90DaysHikes
      .map((hike) => hike.elevationGainM)
      .filter((elevationGainM): elevationGainM is number => elevationGainM != null)
  );

  const freqScore = scoreByThresholds(weeklyFreq, [3, 2, 1, 0.25]);
  const distScore = scoreByThresholds(avgKm, [15, 12, 8, 5]);
  const elevScore = scoreByThresholds(avgElev, [800, 600, 300, 100]);
  const score = freqScore + distScore + elevScore;

  if (score >= 10) {
    return { level: "Elite", score, nextLevelScore: null };
  }

  if (score >= 7) {
    return { level: "Athletic", score, nextLevelScore: 10 };
  }

  if (score >= 4) {
    return { level: "Active", score, nextLevelScore: 7 };
  }

  if (score >= 2) {
    return { level: "Casual", score, nextLevelScore: 4 };
  }

  return { level: "Sedentary", score, nextLevelScore: 2 };
}

export function computeMonthComparison(
  hikes: CompletedHikeRow[],
  now: Date = new Date()
): MonthComparison {
  const cutoff30 = now.getTime() - 30 * DAY_MS;
  const cutoff60 = now.getTime() - 60 * DAY_MS;
  let currKm = 0;
  let currElev = 0;
  let currCount = 0;
  let prevKm = 0;
  let prevElev = 0;
  let prevCount = 0;

  for (const hike of hikes) {
    const t = hike.startedAt.getTime();

    if (t >= cutoff30) {
      currKm += (hike.distanceM ?? 0) / 1000;
      currElev += hike.elevationGainM ?? 0;
      currCount += 1;
    } else if (t >= cutoff60 && t < cutoff30) {
      prevKm += (hike.distanceM ?? 0) / 1000;
      prevElev += hike.elevationGainM ?? 0;
      prevCount += 1;
    }
  }

  return {
    currentMonth: {
      km: Number(currKm.toFixed(1)),
      elevationM: Math.round(currElev),
      hikeCount: currCount,
    },
    previousMonth: {
      km: Number(prevKm.toFixed(1)),
      elevationM: Math.round(prevElev),
      hikeCount: prevCount,
    },
  };
}
