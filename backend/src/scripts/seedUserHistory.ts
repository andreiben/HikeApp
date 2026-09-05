import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../schema/users";
import { hikes, hikePoints } from "../schema/hikes";
import { routes } from "../schema/routes";
import { userProfiles } from "../schema/userProfiles";

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number) {
  return Math.floor(rand(min, max + 1));
}

function randomPastDate(maxDaysAgo: number): Date {
  const now = Date.now();
  const msAgo = rand(0, maxDaysAgo * 24 * 60 * 60 * 1000);
  return new Date(now - msAgo);
}

type RouteRow = {
  id: string;
  name: string;
  distanceKm: number;
  elevationGainM: number;
  estimatedDurationH: number;
  startLatitude: number;
  startLongitude: number;
  geometry: unknown;
};

function buildHike(userId: string, route: RouteRow | null, fallbackName: string) {
  const estimatedH = route ? route.estimatedDurationH : rand(2, 6);
  const distanceKm = route ? route.distanceKm : rand(5, 20);
  const elevGain = route ? route.elevationGainM : rand(200, 1200);

  const durationS = Math.round(estimatedH * 3600 * (0.8 + Math.random() * 0.6));
  const movingTimeS = Math.round(durationS * 0.85);
  const distanceM = distanceKm * 1000 * (0.95 + Math.random() * 0.1);
  const elevationGainM = elevGain * (0.9 + Math.random() * 0.2);
  const elevationLossM = elevGain * (0.85 + Math.random() * 0.3);
  const backpackWeightKg = rand(8, 15);
  const avgSpeedKmh = (distanceM / 1000) / (durationS / 3600);
  const avgPaceMinKm = 60 / avgSpeedKmh;
  const minAltitudeM = 800 + Math.random() * 400;
  const maxAltitudeM = minAltitudeM + elevationGainM;

  const startedAt = randomPastDate(180);
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
    status: "completed",
  };
}

function buildHikePoints(
  hikeId: string,
  route: RouteRow | null,
  startedAt: Date,
  durationS: number,
  elevationGainM: number
) {
  const numPoints = Math.min(Math.round(durationS / 60), 200);
  if (numPoints < 2) return [];

  const geometry = route?.geometry as Array<{ latitude: number; longitude: number }> | null;
  const hasGeometry = Array.isArray(geometry) && geometry.length >= 2;

  const startLat = route?.startLatitude ?? 45.4;
  const startLon = route?.startLongitude ?? 25.4;

  const points = [];
  for (let i = 0; i < numPoints; i++) {
    const t = i / (numPoints - 1); // 0 → 1

    let lat: number;
    let lon: number;

    if (hasGeometry) {
      const segIdx = t * (geometry!.length - 1);
      const lo = Math.floor(segIdx);
      const hi = Math.min(lo + 1, geometry!.length - 1);
      const frac = segIdx - lo;
      lat = geometry![lo]!.latitude + frac * (geometry![hi]!.latitude - geometry![lo]!.latitude);
      lon = geometry![lo]!.longitude + frac * (geometry![hi]!.longitude - geometry![lo]!.longitude);
    } else {
      lat = startLat + t * 0.001 * 60; // ~6km north
      lon = startLon + t * 0.001 * 20;
    }

    // Altitude: climb first half, descend second half
    const baseAlt = 1000;
    const altitude =
      t <= 0.5
        ? baseAlt + t * 2 * elevationGainM
        : baseAlt + elevationGainM - (t - 0.5) * 2 * elevationGainM;

    const recordedAt = new Date(startedAt.getTime() + i * (durationS / numPoints) * 1000);

    points.push({
      hikeId,
      latitude: lat,
      longitude: lon,
      altitude,
      accuracy: rand(3, 10),
      recordedAt,
    });
  }
  return points;
}

async function seedForUser(
  user: { id: string; email: string },
  allRoutes: RouteRow[],
  hikeCount: number,
  seedPoints: boolean
) {
  console.log(`\nSeeding ${hikeCount} hikes for user: ${user.email}`);

  const hikesData = Array.from({ length: hikeCount }, (_, i) => {
    const route = allRoutes.length > 0 ? (allRoutes[i % allRoutes.length] ?? null) : null;
    const fallback = `Hike ${i + 1}`;
    return buildHike(user.id, route, fallback);
  });

  // Sort by startedAt ascending so history looks natural
  hikesData.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

  const inserted = await db.insert(hikes).values(hikesData).returning({ id: hikes.id });
  console.log(`  Seeded ${inserted.length} hikes for user: ${user.email}`);

  if (seedPoints && inserted.length > 0) {
    const firstHike = hikesData[0]!;
    const firstHikeId = inserted[0]!.id;
    const route =
      firstHike.routeId ? allRoutes.find((r) => r.id === firstHike.routeId) ?? null : null;

    const pts = buildHikePoints(
      firstHikeId,
      route,
      firstHike.startedAt,
      firstHike.durationS,
      firstHike.elevationGainM
    );

    if (pts.length > 0) {
      await db.insert(hikePoints).values(pts);
      console.log(`  Seeded ${pts.length} hike points for hike ID: ${firstHikeId}`);
    }
  }

  return inserted.length;
}

async function main() {
  const allUsers = await db.select().from(users).limit(5);

  if (allUsers.length === 0) {
    console.log("No users in database. Please register first.");
    process.exit(0);
  }

  const allRoutes = await db
    .select({
      id: routes.id,
      name: routes.name,
      distanceKm: routes.distanceKm,
      elevationGainM: routes.elevationGainM,
      estimatedDurationH: routes.estimatedDurationH,
      startLatitude: routes.startLatitude,
      startLongitude: routes.startLongitude,
      geometry: routes.geometry,
    })
    .from(routes)
    .limit(20);

  if (allRoutes.length === 0) {
    console.log("No routes found — hikes will use generated names without routeId.");
  } else {
    console.log(`Found ${allRoutes.length} routes to draw from.`);
  }

  // First user: 15 hikes + hike points
  const firstUser = allUsers[0]!;
  await seedForUser(firstUser, allRoutes, 15, true);

  // Update first user's profile to "intermediate" if they had fewer than 5 hikes
  const existingProfile = await db
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(eq(userProfiles.userId, firstUser.id))
    .limit(1);

  if (existingProfile.length > 0) {
    const existingHikeCount = await db
      .select({ id: hikes.id })
      .from(hikes)
      .where(eq(hikes.userId, firstUser.id));

    // We just seeded 15 so check total; only update if profile was a beginner
    if (existingHikeCount.length <= 15 + 5) {
      // new account
      await db
        .update(userProfiles)
        .set({ experienceLevel: "intermediate" })
        .where(eq(userProfiles.userId, firstUser.id));
      console.log(`  Updated profile of ${firstUser.email} to experienceLevel: intermediate`);
    }
  } else {
    console.log(`  No profile found for ${firstUser.email} — skipping profile update.`);
  }

  // Second user: 8 hikes, no points
  if (allUsers.length >= 2) {
    const secondUser = allUsers[1]!;
    await seedForUser(secondUser, allRoutes, 8, false);

    // Update second user profile to "beginner"
    const secondProfile = await db
      .select({ id: userProfiles.id })
      .from(userProfiles)
      .where(eq(userProfiles.userId, secondUser.id))
      .limit(1);

    if (secondProfile.length > 0) {
      await db
        .update(userProfiles)
        .set({ experienceLevel: "beginner" })
        .where(eq(userProfiles.userId, secondUser.id));
      console.log(`  Updated profile of ${secondUser.email} to experienceLevel: beginner`);
    }
  } else {
    console.log("\nOnly one user in database — skipping second user seeding.");
  }

  console.log("\nDone seeding hike history.");
}

main().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
