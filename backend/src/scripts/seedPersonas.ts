import "dotenv/config";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { hikePoints, hikes } from "../schema/hikes";
import { routeFavorites } from "../schema/routeFavorites";
import { routes } from "../schema/routes";
import { userProfiles } from "../schema/userProfiles";
import { users } from "../schema/users";
import { computeFitnessLevelDetail, computeRecentLoad } from "../utils/fitness";

// Password assigned to every generated demo persona account. Supplied through
// the environment so no credential is ever committed to the repository.
const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD;

if (!DEMO_USER_PASSWORD) {
  console.error(
    "DEMO_USER_PASSWORD is not set.\n" +
      "This script assigns that password to every demo persona account it creates,\n" +
      "so it must be provided explicitly - there is no default.\n" +
      "Set it in backend/.env (see backend/.env.example), or pass it inline:\n" +
      "  DEMO_USER_PASSWORD='<choose-a-strong-value>' bun run seed:personas"
  );
  process.exit(1);
}

const SHARED_PASSWORD: string = DEMO_USER_PASSWORD;
const MS_PER_DAY = 86400000;

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

type Range = [number, number];
type Segment = { fromDaysAgo: number; toDaysAgo: number; count: number };
type ClusterHike = { daysAgo: number; distanceRangeKm: Range; elevationRangeM: Range };
type Persona = {
  email: string; displayName: string; persona: string; experienceLevel: string;
  heightCm: number; weightKg: number; age: number; solo: boolean;
  description: string; riskNotes: string; difficulties: string[]; distanceRangeKm: Range;
  elevationRangeM: Range; backpackKg: number; segments: Segment[];
  clusterHikes?: ClusterHike[]; favoritesCount: number;
};
type PlannedHike = {
  daysAgo: number; hour: number; distanceRangeKm: Range; elevationRangeM: Range; forceCompleted: boolean;
};
type HikeSeed = {
  userId: string; routeId: string | null; routeName: string; startedAt: Date; endedAt: Date;
  durationS: number; movingTimeS: number; distanceM: number; elevationGainM: number;
  elevationLossM: number; backpackWeightKg: number; avgSpeedKmh: number; avgPaceMinKm: number;
  minAltitudeM: number; maxAltitudeM: number; status: "completed" | "partial"; completionScore: number;
};
type HikeDraft = { seed: HikeSeed; route: RouteRow | null };

const PERSONAS: Persona[] = [
  {
    email: "incepator@hikedemo.app", displayName: "Incepator", persona: "incepator",
    heightCm: 168, weightKg: 64, age: 27, solo: false,
    experienceLevel: "beginner", description: "New hiker with two short easy outings.",
    riskNotes: "Low experience and limited history.", difficulties: ["easy"],
    distanceRangeKm: [3, 4.5], elevationRangeM: [60, 95], backpackKg: 4,
    segments: [{ fromDaysAgo: 80, toDaysAgo: 5, count: 2 }], favoritesCount: 2,
  },
  {
    email: "ocazional@hikedemo.app", displayName: "Ocazional", persona: "ocazional",
    heightCm: 178, weightKg: 80, age: 34, solo: false,
    experienceLevel: "intermediate", description: "Steady casual hiker with a light recent bump.",
    riskNotes: "Generally balanced recent effort.", difficulties: ["easy", "moderate"],
    distanceRangeKm: [6, 8], elevationRangeM: [250, 350], backpackKg: 6,
    segments: [
      { fromDaysAgo: 360, toDaysAgo: 95, count: 15 },
      { fromDaysAgo: 88, toDaysAgo: 2, count: 3 },
    ], favoritesCount: 3,
  },
  {
    email: "atletic@hikedemo.app", displayName: "Atletic", persona: "atletic",
    heightCm: 170, weightKg: 58, age: 29, solo: true,
    experienceLevel: "advanced", description: "Consistent high-volume hiker on moderate and hard routes.",
    riskNotes: "Strong fitness with frequent recent activity.", difficulties: ["moderate", "hard"],
    distanceRangeKm: [12, 15], elevationRangeM: [600, 750], backpackKg: 8,
    segments: [
      { fromDaysAgo: 360, toDaysAgo: 92, count: 17 },
      { fromDaysAgo: 89, toDaysAgo: 1, count: 28 },
    ], favoritesCount: 4,
  },
  {
    email: "expert@hikedemo.app", displayName: "Expert", persona: "expert",
    heightCm: 175, weightKg: 68, age: 41, solo: true,
    experienceLevel: "expert", description: "Very frequent expert hiker on long high-elevation routes.",
    riskNotes: "High capability with sustained heavy training load.", difficulties: ["hard", "expert"],
    distanceRangeKm: [15, 18], elevationRangeM: [800, 1000], backpackKg: 9,
    segments: [
      { fromDaysAgo: 360, toDaysAgo: 92, count: 26 },
      { fromDaysAgo: 89, toDaysAgo: 1, count: 34 },
    ], favoritesCount: 4,
  },
  {
    email: "sedentar@hikedemo.app", displayName: "Sedentar", persona: "sedentar",
    heightCm: 180, weightKg: 102, age: 47, solo: false,
    experienceLevel: "intermediate", description: "Intermediate profile with only older activity.",
    riskNotes: "Stale recent load despite intermediate self-rating.", difficulties: ["easy", "moderate"],
    distanceRangeKm: [7, 10], elevationRangeM: [300, 450], backpackKg: 7,
    segments: [{ fromDaysAgo: 360, toDaysAgo: 100, count: 15 }], favoritesCount: 2,
  },
  {
    email: "supraantrenat@hikedemo.app", displayName: "Supraantrenat",
    persona: "supraantrenat", experienceLevel: "advanced",
    heightCm: 167, weightKg: 60, age: 31, solo: true,
    description: "Advanced hiker with a dense recent cluster.",
    riskNotes: "Recent spike suggests elevated fatigue risk.", difficulties: ["moderate", "hard"],
    distanceRangeKm: [14, 17], elevationRangeM: [700, 900], backpackKg: 8,
    segments: [
      { fromDaysAgo: 360, toDaysAgo: 92, count: 15 },
      { fromDaysAgo: 89, toDaysAgo: 10, count: 25 },
    ],
    clusterHikes: [0, 1, 2, 4, 5].map((daysAgo) => ({
      daysAgo, distanceRangeKm: [17, 20], elevationRangeM: [800, 1000],
    })), favoritesCount: 3,
  },
  {
    email: "inconstant@hikedemo.app", displayName: "Inconstant", persona: "inconstant",
    heightCm: 176, weightKg: 75, age: 36, solo: false,
    experienceLevel: "intermediate", description: "Streaky hiker with separated bursts of activity.",
    riskNotes: "Irregular training history can hide readiness gaps.", difficulties: ["easy", "moderate", "hard"],
    distanceRangeKm: [8, 11], elevationRangeM: [300, 450], backpackKg: 7,
    segments: [
      { fromDaysAgo: 300, toDaysAgo: 255, count: 5 },
      { fromDaysAgo: 150, toDaysAgo: 120, count: 9 },
      { fromDaysAgo: 42, toDaysAgo: 22, count: 8 },
    ], favoritesCount: 3,
  },
  {
    email: "senior@hikedemo.app", displayName: "Senior", persona: "senior",
    heightCm: 162, weightKg: 66, age: 64, solo: false,
    experienceLevel: "intermediate", description: "Older steady hiker with modest recent consistency.",
    riskNotes: "Moderate distances with age-sensitive risk profile.", difficulties: ["easy", "moderate"],
    distanceRangeKm: [6, 8], elevationRangeM: [250, 400], backpackKg: 5,
    segments: [
      { fromDaysAgo: 360, toDaysAgo: 95, count: 10 },
      { fromDaysAgo: 88, toDaysAgo: 3, count: 4 },
    ], favoritesCount: 2,
  },
];

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

function buildPlannedHikes(persona: Persona, rng: () => number) {
  const planned: PlannedHike[] = [];

  for (const segment of persona.segments) {
    for (let i = 0; i < segment.count; i++) {
      planned.push({
        daysAgo: randInt(rng, segment.toDaysAgo, segment.fromDaysAgo),
        hour: randInt(rng, 6, 15),
        distanceRangeKm: persona.distanceRangeKm,
        elevationRangeM: persona.elevationRangeM,
        forceCompleted: false,
      });
    }
  }

  for (const clusterHike of persona.clusterHikes ?? []) {
    planned.push({
      daysAgo: clusterHike.daysAgo,
      hour: randInt(rng, 7, 11),
      distanceRangeKm: clusterHike.distanceRangeKm,
      elevationRangeM: clusterHike.elevationRangeM,
      forceCompleted: true,
    });
  }

  return planned;
}

function pickRoute(persona: Persona, allRoutes: RouteRow[], rng: () => number) {
  if (allRoutes.length === 0) return null;

  const matchingRoutes = allRoutes.filter((route) =>
    persona.difficulties.includes(route.difficulty.toLowerCase())
  );
  const pool = matchingRoutes.length > 0 ? matchingRoutes : allRoutes;
  return pool[randInt(rng, 0, pool.length - 1)] ?? null;
}

function buildHikeSeed(
  userId: string,
  persona: Persona,
  planned: PlannedHike,
  route: RouteRow | null,
  index: number,
  now: Date,
  rng: () => number
): HikeSeed {
  const startedAt = new Date(now.getTime() - planned.daysAgo * MS_PER_DAY);
  startedAt.setHours(planned.hour, randInt(rng, 0, 59), randInt(rng, 0, 59), 0);

  const distanceKm = rand(rng, planned.distanceRangeKm[0], planned.distanceRangeKm[1]);
  const elevGain = rand(rng, planned.elevationRangeM[0], planned.elevationRangeM[1]);
  const paceMinKm = rand(rng, 9, 13);
  let durationS = Math.round(distanceKm * paceMinKm * 60);
  let movingTimeS = Math.round(durationS * 0.85);
  let distanceM = distanceKm * 1000;
  let elevationGainM = elevGain;
  const elevationLossM = elevGain * rand(rng, 0.9, 1.1);
  const routeMaxAltitude = route?.maxElevationM ?? 800 + elevGain;
  const maxAltitudeM = routeMaxAltitude * rand(rng, 0.98, 1.02);
  const minAltitudeM = Math.max(0, maxAltitudeM - elevGain * rand(rng, 0.8, 1.0));
  const status = !planned.forceCompleted && planned.daysAgo > 90 && rng() < 0.15 ? "partial" : "completed";
  const completionScore = status === "completed" ? randInt(rng, 70, 100) : randInt(rng, 30, 65);

  if (status === "partial") {
    const partialFactor = rand(rng, 0.4, 0.75);
    distanceM *= partialFactor;
    elevationGainM *= partialFactor;
    durationS = Math.round(durationS * partialFactor);
    movingTimeS = Math.round(movingTimeS * partialFactor);
  }

  const endedAt = new Date(startedAt.getTime() + durationS * 1000);
  const finalDistanceKm = distanceM / 1000;
  const avgSpeedKmh = finalDistanceKm / (durationS / 3600);

  return {
    userId,
    routeId: route ? route.id : null,
    routeName: route ? route.name : `${persona.displayName} Demo Hike ${index + 1}`,
    startedAt,
    endedAt,
    durationS,
    movingTimeS,
    distanceM,
    elevationGainM,
    elevationLossM,
    backpackWeightKg: persona.backpackKg + rand(rng, -1, 2),
    avgSpeedKmh,
    avgPaceMinKm: 60 / avgSpeedKmh,
    minAltitudeM,
    maxAltitudeM,
    status,
    completionScore,
  };
}

function csvQuote(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function uniqueRouteIds(drafts: HikeDraft[], count: number) {
  const routeIds: string[] = [];
  const seen = new Set<string>();

  for (const draft of [...drafts].reverse()) {
    const routeId = draft.seed.routeId;
    if (!routeId || seen.has(routeId)) continue;

    routeIds.push(routeId);
    seen.add(routeId);

    if (routeIds.length >= count) break;
  }

  return routeIds;
}

const EMERGENCY_CONTACTS: Record<string, { name: string; phone: string }> = {
  incepator: { name: "Ana Ciobanu", phone: "+40721100200" },
  ocazional: { name: "Mihai Ionescu", phone: "+40722300400" },
  atletic: { name: "Elena Dumitru", phone: "+40723500600" },
  expert: { name: "Radu Marin", phone: "+40724700800" },
  sedentar: { name: "Ioana Popa", phone: "+40725900100" },
  supraantrenat: { name: "Andrei Stan", phone: "+40726200300" },
  inconstant: { name: "Cristina Vlad", phone: "+40727400500" },
  senior: { name: "Gabriel Toma", phone: "+40728600700" },
};

async function seedPersona(persona: Persona, allRoutes: RouteRow[], passwordHash: string, now: Date) {
  await db.delete(users).where(eq(users.email, persona.email));

  const insertedUsers = await db
    .insert(users)
    .values({
      email: persona.email,
      passwordHash,
      emergencyContactName: EMERGENCY_CONTACTS[persona.persona]?.name ?? "Emergency Contact",
      emergencyContactPhone: EMERGENCY_CONTACTS[persona.persona]?.phone ?? "+40700000000",
    })
    .returning({ id: users.id });
  const userId = insertedUsers[0]?.id;

  if (!userId) {
    throw new Error(`Failed to insert user for ${persona.email}`);
  }

  await db.insert(userProfiles).values({
    userId,
    displayName: persona.displayName,
    experienceLevel: persona.experienceLevel,
    heightCm: persona.heightCm,
    weightKg: persona.weightKg,
    age: persona.age,
    typicalBackpackWeightKg: Math.round(persona.backpackKg),
    hikesSoloUsually: persona.solo,
    units: "metric",
    riskAlertsEnabled: true,
    achievementToastsEnabled: true,
  });

  const rng = createRng(`persona:${persona.email}`);
  const plannedHikes = buildPlannedHikes(persona, rng);
  const drafts = plannedHikes.map((planned, index) => {
    const route = pickRoute(persona, allRoutes, rng);
    return {
      route,
      seed: buildHikeSeed(userId, persona, planned, route, index, now, rng),
    };
  });

  drafts.sort((a, b) => a.seed.startedAt.getTime() - b.seed.startedAt.getTime());

  const insertedHikes = drafts.length > 0
    ? await db.insert(hikes).values(drafts.map((draft) => draft.seed)).returning({ id: hikes.id })
    : [];
  const recentCompleted = drafts
    .map((draft, index) => ({ draft, id: insertedHikes[index]?.id }))
    .filter((entry): entry is { draft: HikeDraft; id: string } =>
      entry.id !== undefined && entry.draft.seed.status === "completed"
    )
    .sort((a, b) => b.draft.seed.startedAt.getTime() - a.draft.seed.startedAt.getTime())
    .slice(0, 5);
  const points = recentCompleted.flatMap(({ draft, id }) =>
    buildHikePoints(id, draft.route, draft.seed.startedAt, draft.seed.durationS, draft.seed.elevationGainM, rng)
  );

  if (points.length > 0) {
    await db.insert(hikePoints).values(points);
  }

  const favoriteRouteIds = uniqueRouteIds(drafts, persona.favoritesCount);
  if (favoriteRouteIds.length > 0) {
    await db.insert(routeFavorites).values(
      favoriteRouteIds.map((routeId) => ({
        userId,
        routeId,
      }))
    );
  }

  const completedHikes = drafts
    .filter((draft) => draft.seed.status === "completed")
    .map((draft) => ({
      distanceM: draft.seed.distanceM,
      elevationGainM: draft.seed.elevationGainM,
      startedAt: draft.seed.startedAt,
    }));
  const fitness = computeFitnessLevelDetail(completedHikes, now);
  const recentLoad = computeRecentLoad(completedHikes, now);

  console.log(
    `${persona.email}: hikes=${insertedHikes.length}, favorites=${favoriteRouteIds.length}, fitness=${fitness.level}(${fitness.score}), last7=${recentLoad.last7DaysHikeCount}/${recentLoad.last7DaysKm.toFixed(1)}km`
  );

  return {
    persona,
    fitness,
  };
}

async function main() {
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

  console.log(`Found ${allRoutes.length} routes to sample from.`);

  const passwordHash = await bcrypt.hash(SHARED_PASSWORD, 10);
  const now = new Date();
  const summaries = [];

  for (const persona of PERSONAS) {
    summaries.push(await seedPersona(persona, allRoutes, passwordHash, now));
  }

  const csvRows = [
    ["email", "password", "persona", "experienceLevel", "description", "computedFitness", "riskNotes"]
      .map(csvQuote)
      .join(","),
    ...summaries.map(({ persona, fitness }) =>
      [
        persona.email,
        SHARED_PASSWORD,
        persona.persona,
        persona.experienceLevel,
        persona.description,
        `${fitness.level} (${fitness.score})`,
        persona.riskNotes,
      ]
        .map(csvQuote)
        .join(",")
    ),
  ];

  // Resolved relative to this file so the script works on any machine.
  // backend/src/scripts -> backend/persona-accounts.csv
  await Bun.write(
    join(import.meta.dir, "..", "..", "persona-accounts.csv"),
    `${csvRows.join("\n")}\n`
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("Persona seeding failed:", err);
  process.exit(1);
});
