import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../schema/users";
import { hikes, hikePoints } from "../schema/hikes";
import { routes } from "../schema/routes";

const TARGET_EMAIL = "andreiciobanasu03@gmail.com";
const HIKE_TARGET_COUNT = 50;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DIFFICULTIES = ["easy", "moderate", "hard", "expert"] as const;

type Difficulty = (typeof DIFFICULTIES)[number];

type RouteRow = {
  id: string;
  name: string;
  distanceKm: number;
  elevationGainM: number;
  estimatedDurationH: number;
  difficulty: string;
  maxElevationM: number | null;
  startLatitude: number;
  startLongitude: number;
  geometry: unknown;
};

type HikeSeed = {
  userId: string;
  routeId: string | null;
  routeName: string;
  startedAt: Date;
  endedAt: Date;
  durationS: number;
  movingTimeS: number;
  distanceM: number;
  elevationGainM: number;
  elevationLossM: number;
  backpackWeightKg: number;
  avgSpeedKmh: number;
  avgPaceMinKm: number;
  minAltitudeM: number;
  maxAltitudeM: number;
  status: "completed" | "partial";
  completionScore: number;
};

function createRng(seedText: string) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) {
    seed ^= seedText.charCodeAt(i);
    seed = Math.imul(seed, 16777619);
  }

  return function rng() {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rand(rng: () => number, min: number, max: number) {
  return min + rng() * (max - min);
}

function randInt(rng: () => number, min: number, max: number) {
  return Math.floor(rand(rng, min, max + 1));
}

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function maxDate(a: Date, b: Date) {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthStartFromKey(key: string) {
  const [yearText, monthText] = key.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  return new Date(year, month - 1, 1);
}

function monthEndFromKey(key: string) {
  const start = monthStartFromKey(key);
  return new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfIsoWeek(date: Date) {
  const d = startOfDay(date);
  const dayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayOffset);
  return d;
}

function weekKey(date: Date) {
  return startOfIsoWeek(date).toISOString().slice(0, 10);
}

function monthsInRange(start: Date, end: Date) {
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cursor.getTime() <= endMonth.getTime()) {
    months.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function buildPlannedDates(now: Date, rng: () => number) {
  const windowStart = new Date(now.getTime() - 365 * MS_PER_DAY);
  const last90Start = new Date(now.getTime() - 90 * MS_PER_DAY);
  const currentMonth = monthKey(now);
  const previousMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const plannedDates: Date[] = [];
  const monthKeys = monthsInRange(windowStart, now);
  const currentWeekStart = startOfIsoWeek(now);
  const last12Weeks = Array.from({ length: 12 }, (_, i) => {
    const start = addDays(currentWeekStart, -(11 - i) * 7);
    const end = minDate(addDays(start, 6), now);
    return {
      key: weekKey(start),
      start: maxDate(start, windowStart),
      end,
    };
  }).filter((week) => week.end.getTime() >= week.start.getTime());

  const last12WeekKeys = new Set(last12Weeks.map((week) => week.key));

  function countMonth(key: string) {
    return plannedDates.filter((date) => monthKey(date) === key).length;
  }

  function countWeek(key: string) {
    return plannedDates.filter((date) => weekKey(date) === key).length;
  }

  function countLast90() {
    return plannedDates.filter((date) => date.getTime() >= last90Start.getTime()).length;
  }

  function addInRange(
    start: Date,
    end: Date,
    options: { respectLast12WeekCap?: boolean; recentMonthCap?: number } = {}
  ) {
    const rangeStart = maxDate(start, windowStart);
    const rangeEnd = minDate(end, now);
    if (rangeEnd.getTime() < rangeStart.getTime()) return false;

    const candidates: Date[] = [];
    for (let day = startOfDay(rangeStart); day.getTime() <= rangeEnd.getTime(); day = addDays(day, 1)) {
      const key = monthKey(day);
      const week = weekKey(day);
      const isRecentMonth = key === currentMonth || key === previousMonth;

      if (
        options.recentMonthCap !== undefined &&
        isRecentMonth &&
        countMonth(key) >= options.recentMonthCap
      ) {
        continue;
      }

      if (
        options.respectLast12WeekCap &&
        last12WeekKeys.has(week) &&
        countWeek(week) >= 3
      ) {
        continue;
      }

      candidates.push(day);
    }

    const chosenDay = candidates[randInt(rng, 0, candidates.length - 1)];
    if (!chosenDay) return false;

    const date = new Date(chosenDay);
    date.setHours(randInt(rng, 6, 15), randInt(rng, 0, 59), randInt(rng, 0, 59), 0);

    if (date.getTime() < rangeStart.getTime()) date.setTime(rangeStart.getTime());
    if (date.getTime() > rangeEnd.getTime()) date.setTime(rangeEnd.getTime());

    plannedDates.push(date);
    return true;
  }

  function addInMonth(key: string, options: { respectLast12WeekCap?: boolean; recentMonthCap?: number } = {}) {
    return addInRange(monthStartFromKey(key), monthEndFromKey(key), options);
  }

  for (const week of last12Weeks) {
    addInRange(week.start, week.end, { respectLast12WeekCap: true });
  }

  for (const key of [currentMonth, previousMonth]) {
    let guard = 0;
    while (countMonth(key) < 5 && guard < 20) {
      if (!addInMonth(key, { respectLast12WeekCap: true, recentMonthCap: 6 })) {
        addInMonth(key, { recentMonthCap: 6 });
      }
      guard++;
    }
  }

  let last90Guard = 0;
  while (countLast90() < 22 && last90Guard < 80) {
    const candidateWeeks = last12Weeks.filter((week) => countWeek(week.key) < 3);
    const week = candidateWeeks[randInt(rng, 0, candidateWeeks.length - 1)];

    if (week) {
      const start = maxDate(week.start, last90Start);
      const added = addInRange(start, week.end, {
        respectLast12WeekCap: true,
        recentMonthCap: 5,
      });
      if (!added) {
        addInRange(start, week.end, { respectLast12WeekCap: true, recentMonthCap: 6 });
      }
    } else {
      addInRange(last90Start, now, { recentMonthCap: 6 });
    }

    last90Guard++;
  }

  for (const key of monthKeys) {
    let guard = 0;
    while (countMonth(key) < 2 && guard < 10) {
      addInMonth(key, { respectLast12WeekCap: true, recentMonthCap: 5 });
      guard++;
    }
  }

  const olderMonths = monthKeys.filter((key) => {
    const end = monthEndFromKey(key);
    return key !== currentMonth && key !== previousMonth && end.getTime() < last90Start.getTime();
  });
  const scatterMonths = olderMonths.length > 0
    ? olderMonths
    : monthKeys.filter((key) => key !== currentMonth && key !== previousMonth);

  let scatterIndex = 0;
  while (plannedDates.length < HIKE_TARGET_COUNT && scatterMonths.length > 0) {
    const key = scatterMonths[scatterIndex % scatterMonths.length];
    if (key) addInMonth(key, { respectLast12WeekCap: true, recentMonthCap: 5 });
    scatterIndex++;
  }

  plannedDates.sort((a, b) => a.getTime() - b.getTime());
  return { plannedDates, last90Start };
}

function normalizeDifficulty(difficulty: string): Difficulty | null {
  const normalized = difficulty.toLowerCase();
  return DIFFICULTIES.find((value) => value === normalized) ?? null;
}

function pickRoute(index: number, allRoutes: RouteRow[]) {
  if (allRoutes.length === 0) return null;

  const preferredDifficulty = DIFFICULTIES[index % DIFFICULTIES.length];
  const matchingRoutes = allRoutes.filter((route) => normalizeDifficulty(route.difficulty) === preferredDifficulty);
  const pool = matchingRoutes.length > 0 ? matchingRoutes : allRoutes;
  return pool[Math.floor(index / DIFFICULTIES.length) % pool.length] ?? null;
}

function buildHike(
  userId: string,
  route: RouteRow | null,
  fallbackName: string,
  startedAt: Date,
  index: number,
  rng: () => number
): HikeSeed {
  const estimatedH = route ? route.estimatedDurationH : rand(rng, 2, 7);
  const routeDistanceKm = route ? route.distanceKm : rand(rng, 6, 22);
  const routeElevationGainM = route ? route.elevationGainM : rand(rng, 250, 1300);
  const forceAchievement = index < 2;
  const isPartial = !forceAchievement && index % 7 === 0;
  const partialFactor = isPartial ? rand(rng, 0.4, 0.75) : 1;

  let durationS = Math.round(estimatedH * 3600 * rand(rng, 0.8, 1.4) * partialFactor);
  let distanceM = routeDistanceKm * 1000 * rand(rng, 0.9, 1.1) * partialFactor;
  const elevationGainM = routeElevationGainM * rand(rng, 0.9, 1.1) * partialFactor;
  const elevationLossM = routeElevationGainM * rand(rng, 0.85, 1.15) * partialFactor;

  if (index < 2) {
    distanceM = Math.max(distanceM, rand(rng, 15000, 18500));
    const fastDurationS = Math.round((distanceM / 1000) * rand(rng, 6.8, 7.8) * 60);
    durationS = Math.min(durationS, fastDurationS);
  }

  const movingTimeS = Math.round(durationS * 0.85);
  const backpackWeightKg = rand(rng, 6, 14);
  const avgSpeedKmh = (distanceM / 1000) / (durationS / 3600);
  const avgPaceMinKm = 60 / avgSpeedKmh;
  const routeMaxAltitude = route?.maxElevationM ?? 900 + routeElevationGainM * rand(rng, 0.9, 1.2);
  const maxAltitudeM = routeMaxAltitude * rand(rng, 0.98, 1.02);
  const minAltitudeM = Math.max(0, maxAltitudeM - Math.max(elevationGainM, 100) * rand(rng, 0.75, 1.05));
  const endedAt = new Date(startedAt.getTime() + durationS * 1000);

  return {
    userId,
    routeId: route ? route.id : null,
    routeName: route ? route.name : fallbackName,
    startedAt,
    endedAt,
    durationS,
    movingTimeS,
    distanceM,
    elevationGainM,
    elevationLossM,
    backpackWeightKg,
    avgSpeedKmh,
    avgPaceMinKm,
    minAltitudeM,
    maxAltitudeM,
    status: isPartial ? "partial" : "completed",
    completionScore: isPartial ? randInt(rng, 30, 65) : randInt(rng, 70, 100),
  };
}

function extractGeometry(route: RouteRow | null) {
  const geometry = route?.geometry;

  if (Array.isArray(geometry)) {
    return geometry
      .map((point) => {
        if (
          point &&
          typeof point === "object" &&
          "latitude" in point &&
          "longitude" in point &&
          typeof point.latitude === "number" &&
          typeof point.longitude === "number"
        ) {
          return { latitude: point.latitude, longitude: point.longitude };
        }

        if (
          Array.isArray(point) &&
          typeof point[0] === "number" &&
          typeof point[1] === "number"
        ) {
          return { latitude: point[1], longitude: point[0] };
        }

        return null;
      })
      .filter((point): point is { latitude: number; longitude: number } => point !== null);
  }

  if (
    geometry &&
    typeof geometry === "object" &&
    "coordinates" in geometry &&
    Array.isArray(geometry.coordinates)
  ) {
    return geometry.coordinates
      .map((point) => {
        if (
          Array.isArray(point) &&
          typeof point[0] === "number" &&
          typeof point[1] === "number"
        ) {
          return { latitude: point[1], longitude: point[0] };
        }
        return null;
      })
      .filter((point): point is { latitude: number; longitude: number } => point !== null);
  }

  return [];
}

function buildHikePoints(
  hikeId: string,
  route: RouteRow | null,
  startedAt: Date,
  durationS: number,
  elevationGainM: number,
  rng: () => number
) {
  const numPoints = Math.min(Math.round(durationS / 60), 200);
  if (numPoints < 2) return [];

  const geometry = extractGeometry(route);
  const hasGeometry = geometry.length >= 2;
  const startLat = route?.startLatitude ?? 45.4;
  const startLon = route?.startLongitude ?? 25.4;

  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1);
    let latitude: number;
    let longitude: number;

    if (hasGeometry) {
      const segIdx = t * (geometry.length - 1);
      const lo = Math.floor(segIdx);
      const hi = Math.min(lo + 1, geometry.length - 1);
      const frac = segIdx - lo;
      const loPoint = geometry[lo];
      const hiPoint = geometry[hi];

      if (loPoint && hiPoint) {
        latitude = loPoint.latitude + frac * (hiPoint.latitude - loPoint.latitude);
        longitude = loPoint.longitude + frac * (hiPoint.longitude - loPoint.longitude);
      } else {
        latitude = startLat + t * 0.001 * 60;
        longitude = startLon + t * 0.001 * 20;
      }
    } else {
      latitude = startLat + t * 0.001 * 60;
      longitude = startLon + t * 0.001 * 20;
    }

    const baseAlt = route?.maxElevationM ? route.maxElevationM - elevationGainM : 1000;
    const altitude =
      t <= 0.5
        ? baseAlt + t * 2 * elevationGainM
        : baseAlt + elevationGainM - (t - 0.5) * 2 * elevationGainM;
    const recordedAt = new Date(startedAt.getTime() + i * (durationS / (numPoints - 1)) * 1000);

    points.push({
      hikeId,
      latitude,
      longitude,
      altitude,
      accuracy: rand(rng, 3, 10),
      recordedAt,
    });
  }

  return points;
}

async function main() {
  const targetEmail = process.argv[2] ?? TARGET_EMAIL;
  const rng = createRng(`seed-year-history:${targetEmail}`);

  const matchingUsers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, targetEmail))
    .limit(1);
  const targetUser = matchingUsers[0];

  if (!targetUser) {
    console.log(`User not found for email: ${targetEmail}`);
    process.exit(1);
  }

  const deleted = await db
    .delete(hikes)
    .where(eq(hikes.userId, targetUser.id))
    .returning({ id: hikes.id });
  console.log(`Deleted ${deleted.length} existing hikes for ${targetUser.email}.`);

  const allRoutes = await db
    .select({
      id: routes.id,
      name: routes.name,
      distanceKm: routes.distanceKm,
      elevationGainM: routes.elevationGainM,
      estimatedDurationH: routes.estimatedDurationH,
      difficulty: routes.difficulty,
      maxElevationM: routes.maxElevationM,
      startLatitude: routes.startLatitude,
      startLongitude: routes.startLongitude,
      geometry: routes.geometry,
    })
    .from(routes);

  if (allRoutes.length === 0) {
    console.log("No routes found; hikes will use generated fallback route data.");
  } else {
    console.log(`Found ${allRoutes.length} routes to sample from.`);
  }

  const now = new Date();
  const { plannedDates, last90Start } = buildPlannedDates(now, rng);
  const routeById = new Map(allRoutes.map((route) => [route.id, route]));
  const hikesData = plannedDates.map((startedAt, index) =>
    buildHike(
      targetUser.id,
      pickRoute(index, allRoutes),
      `Year History Hike ${index + 1}`,
      startedAt,
      index,
      rng
    )
  );

  hikesData.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  const inserted = await db.insert(hikes).values(hikesData).returning({ id: hikes.id });

  const recentCompleted = hikesData
    .map((hike, index) => ({ hike, id: inserted[index]?.id }))
    .filter((entry): entry is { hike: HikeSeed; id: string } => entry.id !== undefined && entry.hike.status === "completed")
    .sort((a, b) => b.hike.startedAt.getTime() - a.hike.startedAt.getTime())
    .slice(0, 5);

  const points = recentCompleted.flatMap(({ hike, id }) => {
    const route = hike.routeId ? routeById.get(hike.routeId) ?? null : null;
    return buildHikePoints(id, route, hike.startedAt, hike.durationS, hike.elevationGainM, rng);
  });

  if (points.length > 0) {
    await db.insert(hikePoints).values(points);
  }

  const completedCount = hikesData.filter((hike) => hike.status === "completed").length;
  const partialCount = hikesData.filter((hike) => hike.status === "partial").length;
  const last90Count = hikesData.filter((hike) => hike.startedAt.getTime() >= last90Start.getTime()).length;
  const earliest = hikesData[0]?.startedAt.toISOString() ?? "n/a";
  const latest = hikesData[hikesData.length - 1]?.startedAt.toISOString() ?? "n/a";

  console.log("\nYear history seed summary");
  console.log(`Deleted: ${deleted.length}`);
  console.log(`Inserted: ${inserted.length}`);
  console.log(`Date range: ${earliest}..${latest}`);
  console.log(`Completed: ${completedCount}`);
  console.log(`Partial: ${partialCount}`);
  console.log(`Last 90 days: ${last90Count}`);
  console.log(`Hike points inserted: ${points.length}`);
}

main().catch((err) => {
  console.error("Year history seeding failed:", err);
  process.exit(1);
});
