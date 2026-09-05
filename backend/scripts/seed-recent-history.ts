import "dotenv/config";
import { and, eq, gte } from "drizzle-orm";
import { db } from "../src/db";
import { users } from "../src/schema/users";
import { hikes, hikePoints } from "../src/schema/hikes";
import { routes } from "../src/schema/routes";

const TARGET_EMAIL = "andreiciobanasu03@gmail.com";
const WEEKS = 8;
const DIFFICULTIES = ["easy", "moderate", "hard", "expert"] as const;

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

function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfIsoWeek(dateInput: Date) {
  const d = startOfDay(dateInput);
  const dayOffset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayOffset);
  return d;
}

function normalizeDifficulty(difficulty: string) {
  const normalized = (difficulty ?? "").toLowerCase();
  return DIFFICULTIES.find((value) => value === normalized) ?? null;
}

async function main() {
  const targetEmail = process.argv[2] ?? TARGET_EMAIL;
  const rng = createRng("seed-recent-history-v1:" + targetEmail);
  const now = new Date();

  const matching = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, targetEmail))
    .limit(1);
  const targetUser = matching[0];
  if (!targetUser) {
    console.log("User not found: " + targetEmail);
    process.exit(1);
  }

  const currentWeekStart = startOfIsoWeek(now);
  const windowStart = addDays(currentWeekStart, -(WEEKS - 1) * 7);
  console.log("window: " + windowStart.toISOString() + " .. " + now.toISOString());

  const removed = await db
    .delete(hikes)
    .where(and(eq(hikes.userId, targetUser.id), gte(hikes.startedAt, windowStart)))
    .returning({ id: hikes.id });
  console.log("removed " + removed.length + " pre-existing hikes inside the window");

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
  const namedRoutes = allRoutes.filter((r) => {
    const n = r.name ?? "";
    return n.includes(" ") && !n.includes("_");
  });
  const routePool = namedRoutes.length > 50 ? namedRoutes : allRoutes;
  console.log("routes available: " + allRoutes.length + " (human-named: " + namedRoutes.length + ")");

  const byDifficulty = new Map<string, typeof allRoutes>();
  for (const d of DIFFICULTIES) byDifficulty.set(d, []);
  for (const r of routePool) {
    const d = normalizeDifficulty(r.difficulty);
    if (d) byDifficulty.get(d)!.push(r);
  }

  // hikes per week: varied so the 8-week bar chart has shape, not a flat line
  const perWeek = [2, 3, 2, 3, 2, 3, 3, 2];
  const plan: { startedAt: Date; difficulty: string }[] = [];
  let diffCursor = 0;

  for (let w = 0; w < WEEKS; w++) {
    const weekStart = addDays(currentWeekStart, -(WEEKS - 1 - w) * 7);
    const isCurrentWeek = w === WEEKS - 1;
    const maxDayOffset = isCurrentWeek
      ? Math.min(6, Math.floor((startOfDay(now).getTime() - weekStart.getTime()) / 86400000))
      : 6;

    const count = perWeek[w] ?? 2;
    const dayOffsets = new Set<number>();
    let guard = 0;
    while (dayOffsets.size < Math.min(count, maxDayOffset + 1) && guard < 50) {
      dayOffsets.add(randInt(rng, 0, maxDayOffset));
      guard++;
    }

    if (isCurrentWeek) dayOffsets.add(maxDayOffset);

    for (const offset of [...dayOffsets].sort((a, b) => a - b)) {
      const startedAt = addDays(weekStart, offset);
      startedAt.setHours(randInt(rng, 6, 11), randInt(rng, 0, 59), 0, 0);
      if (startedAt.getTime() > now.getTime()) continue;
      const difficulty = DIFFICULTIES[diffCursor % DIFFICULTIES.length]!;
      diffCursor++;
      plan.push({ startedAt, difficulty });
    }
  }

  plan.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  const usedByDifficulty = new Map<string, number>();
  const hikesData = plan.map((entry, index) => {
    const pool = byDifficulty.get(entry.difficulty)!;
    const fallbackPool = pool.length > 0 ? pool : routePool;
    const used = usedByDifficulty.get(entry.difficulty) ?? 0;
    usedByDifficulty.set(entry.difficulty, used + 1);
    const route = fallbackPool.length > 0 ? fallbackPool[used % fallbackPool.length]! : null;

    const estimatedH = route ? route.estimatedDurationH : rand(rng, 2, 7);
    const routeDistanceKm = route ? route.distanceKm : rand(rng, 6, 22);
    const routeGainM = route ? route.elevationGainM : rand(rng, 250, 1300);

    const isPartial = index % 9 === 4;
    const partialFactor = isPartial ? rand(rng, 0.45, 0.75) : 1;

    const durationS = Math.round(estimatedH * 3600 * rand(rng, 0.85, 1.3) * partialFactor);
    const distanceM = routeDistanceKm * 1000 * rand(rng, 0.92, 1.08) * partialFactor;
    const elevationGainM = routeGainM * rand(rng, 0.9, 1.1) * partialFactor;
    const elevationLossM = routeGainM * rand(rng, 0.85, 1.15) * partialFactor;
    const movingTimeS = Math.round(durationS * rand(rng, 0.82, 0.9));
    const avgSpeedKmh = distanceM / 1000 / (durationS / 3600);
    const avgPaceMinKm = 60 / avgSpeedKmh;
    const routeMaxAlt = route?.maxElevationM ?? 900 + routeGainM * rand(rng, 0.9, 1.2);
    const maxAltitudeM = routeMaxAlt * rand(rng, 0.98, 1.02);
    const minAltitudeM = Math.max(0, maxAltitudeM - Math.max(elevationGainM, 100) * rand(rng, 0.75, 1.05));

    let startedAt = entry.startedAt;
    let endedAt = new Date(startedAt.getTime() + durationS * 1000);
    if (endedAt.getTime() > now.getTime() - 15 * 60000) {
      endedAt = new Date(now.getTime() - 15 * 60000);
      startedAt = new Date(endedAt.getTime() - durationS * 1000);
    }

    return {
      userId: targetUser.id,
      routeId: route ? route.id : null,
      routeName: route ? route.name : "Recent Hike " + (index + 1),
      startedAt,
      endedAt,
      durationS,
      movingTimeS,
      distanceM,
      elevationGainM,
      elevationLossM,
      backpackWeightKg: rand(rng, 5, 14),
      avgSpeedKmh,
      avgPaceMinKm,
      minAltitudeM,
      maxAltitudeM,
      status: isPartial ? "partial" : "completed",
      completionScore: isPartial ? randInt(rng, 30, 65) : randInt(rng, 72, 100),
      routeRef: route,
    };
  });

  const insertValues = hikesData.map(({ routeRef, ...rest }) => rest);
  const inserted = await db.insert(hikes).values(insertValues).returning({ id: hikes.id });
  console.log("inserted " + inserted.length + " hikes");

  // GPS points for the 4 most recent completed hikes so detail views render a track
  const recent = hikesData
    .map((hike, index) => ({ hike, id: inserted[index]?.id }))
    .filter((e) => e.id && e.hike.status === "completed")
    .sort((a, b) => b.hike.startedAt.getTime() - a.hike.startedAt.getTime())
    .slice(0, 4);

  const points: any[] = [];
  for (const { hike, id } of recent) {
    const route = hike.routeRef;
    const geometryRaw = route?.geometry;
    const geometry: { latitude: number; longitude: number }[] = Array.isArray(geometryRaw)
      ? geometryRaw
          .map((p: any) => {
            if (p && typeof p === "object" && typeof p.latitude === "number" && typeof p.longitude === "number") {
              return { latitude: p.latitude, longitude: p.longitude };
            }
            if (Array.isArray(p) && typeof p[0] === "number" && typeof p[1] === "number") {
              return { latitude: p[1], longitude: p[0] };
            }
            return null;
          })
          .filter((p): p is { latitude: number; longitude: number } => p !== null)
      : [];

    const numPoints = Math.min(Math.round(hike.durationS / 60), 200);
    if (numPoints < 2) continue;
    const startLat = route?.startLatitude ?? 45.4;
    const startLon = route?.startLongitude ?? 25.4;
    const baseAlt = route?.maxElevationM ? route.maxElevationM - hike.elevationGainM : 1000;

    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1);
      let latitude = startLat + t * 0.06;
      let longitude = startLon + t * 0.02;
      if (geometry.length >= 2) {
        const segIdx = t * (geometry.length - 1);
        const lo = Math.floor(segIdx);
        const hi = Math.min(lo + 1, geometry.length - 1);
        const frac = segIdx - lo;
        latitude = geometry[lo]!.latitude + frac * (geometry[hi]!.latitude - geometry[lo]!.latitude);
        longitude = geometry[lo]!.longitude + frac * (geometry[hi]!.longitude - geometry[lo]!.longitude);
      }
      const altitude =
        t <= 0.5
          ? baseAlt + t * 2 * hike.elevationGainM
          : baseAlt + hike.elevationGainM - (t - 0.5) * 2 * hike.elevationGainM;
      points.push({
        hikeId: id,
        latitude,
        longitude,
        altitude,
        accuracy: rand(rng, 3, 10),
        recordedAt: new Date(hike.startedAt.getTime() + i * (hike.durationS / (numPoints - 1)) * 1000),
      });
    }
  }

  if (points.length > 0) {
    await db.insert(hikePoints).values(points);
  }
  console.log("inserted " + points.length + " hike points");

  // summary
  const weekTotals = new Map<string, { km: number; n: number }>();
  for (const h of hikesData) {
    const key = startOfIsoWeek(h.startedAt).toISOString().slice(0, 10);
    const cur = weekTotals.get(key) ?? { km: 0, n: 0 };
    cur.km += h.distanceM / 1000;
    cur.n += 1;
    weekTotals.set(key, cur);
  }
  console.log("");
  console.log("week starting | hikes | km");
  for (const key of [...weekTotals.keys()].sort()) {
    const v = weekTotals.get(key)!;
    console.log("  " + key + " |   " + v.n + "   | " + v.km.toFixed(1));
  }

  const monthTotals = new Map<string, number>();
  for (const h of hikesData) {
    const key = h.startedAt.getFullYear() + "-" + String(h.startedAt.getMonth() + 1).padStart(2, "0");
    monthTotals.set(key, (monthTotals.get(key) ?? 0) + h.distanceM / 1000);
  }
  console.log("");
  console.log("month totals:");
  for (const key of [...monthTotals.keys()].sort()) {
    console.log("  " + key + ": " + monthTotals.get(key)!.toFixed(1) + " km");
  }

  console.log("");
  console.log("completed: " + hikesData.filter((h) => h.status === "completed").length);
  console.log("partial:   " + hikesData.filter((h) => h.status === "partial").length);

  process.exit(0);
}

main().catch((err) => {
  console.error("recent history seeding failed:", err);
  process.exit(1);
});

