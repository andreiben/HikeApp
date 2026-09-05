import "dotenv/config";
import { db } from "../db";
import { routes } from "../schema/routes";
import { eq } from "drizzle-orm";
import { decimateGeometry } from "../utils/geometry";
import { computeToblerDurationH } from "../utils/duration";
import { isInRomania, nearestRegion } from "../utils/geo";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

async function fetchElevations(points: Array<{ lat: number; lon: number }>): Promise<number[]> {
  const lats = points.map(p => p.lat).join(",");
  const lons = points.map(p => p.lon).join(",");
  const res = await fetch(
    `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lons}`
  );
  const data = (await res.json()) as { elevation?: number[] };
  return data.elevation ?? [];
}

function detectRegion(centerLat: number, centerLon: number): string {
  return nearestRegion(centerLat, centerLon);
}

function difficultyFromSacScale(sac: string | undefined): "easy" | "moderate" | "hard" | "expert" | null {
  if (!sac) return null;
  if (sac === "hiking") return "easy";
  if (sac === "mountain_hiking") return "moderate";
  if (sac === "demanding_mountain_hiking" || sac === "alpine_hiking") return "hard";
  if (sac === "demanding_alpine_hiking" || sac === "difficult_alpine_hiking") return "expert";
  return null;
}

function difficultyFromElevation(elevationGainM: number): "easy" | "moderate" | "hard" | "expert" {
  if (elevationGainM < 400) return "easy";
  if (elevationGainM < 800) return "moderate";
  if (elevationGainM >= 1200) return "expert";
  return "hard";
}

function looksRomanian(name: string): boolean {
  if (!/\p{L}/u.test(name)) return false;
  if (/[Ѐ-ӿ一-鿿　-ヿ]/u.test(name)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// OSM types
// ---------------------------------------------------------------------------

interface OsmGeomPoint {
  lat: number;
  lon: number;
}

interface OsmMember {
  type: string;
  ref: number;
  role: string;
  geometry?: OsmGeomPoint[];
}

interface OsmRelation {
  type: "relation";
  id: number;
  tags?: Record<string, string>;
  members?: OsmMember[];
}

interface OverpassResponse {
  elements: OsmRelation[];
}

// ---------------------------------------------------------------------------
function computeIsolationScore(
  elevationGainM: number,
  maxElevationM: number | null,
  distanceKm: number,
  difficulty: string
): number {
  const maxAlt = maxElevationM ?? 0;
  const altScore =
    maxAlt >= 2400 ? 0.40 :
    maxAlt >= 2000 ? 0.32 :
    maxAlt >= 1500 ? 0.20 :
    maxAlt >= 1000 ? 0.10 :
    0.05;
  const distScore =
    distanceKm >= 25 ? 0.25 :
    distanceKm >= 15 ? 0.18 :
    distanceKm >= 8 ? 0.10 :
    0.04;
  const diffScore =
    difficulty === "expert" ? 0.22 :
    difficulty === "hard" ? 0.18 :
    difficulty === "moderate" ? 0.10 :
    0.03;
  const gainScore =
    elevationGainM >= 1200 ? 0.15 :
    elevationGainM >= 700 ? 0.10 :
    elevationGainM >= 300 ? 0.05 :
    0.00;
  const raw = altScore + distScore + diffScore + gainScore;
  return Math.max(0.25, Math.min(1.0, Math.round(raw * 100) / 100));
}

// Main
// ---------------------------------------------------------------------------

async function main() {
  // 1. Fetch from Overpass
  const query = `[out:json][timeout:300];
(
  relation["type"="route"]["route"="hiking"]["name"~".",i](44.0,20.0,48.5,30.0);
);
out geom;`;

  console.log("Fetching hiking routes from Overpass API...");

  let elements: OsmRelation[];
  try {
    const res = await fetch("https://overpass.private.coffee/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "HikeApp/1.0 (student project)" },
      body: `data=${encodeURIComponent(query)}`, 
    });
    if (!res.ok) {
      console.error(`Overpass API returned HTTP ${res.status}: ${res.statusText}`);
      process.exit(1);
    }
    const data = (await res.json()) as OverpassResponse;
    elements = data.elements ?? [];
  } catch (err) {
    console.error("Failed to fetch from Overpass API:", err);
    process.exit(1);
  }

  console.log(`Overpass returned ${elements.length} relations. Processing all...`);

  const toProcess = elements;

  // 2. Load existing route names to skip duplicates
  const existingRows = await db.select({ name: routes.name, osmRelationId: routes.osmRelationId }).from(routes);
  const existingNames = new Set(existingRows.map(r => r.name));
  const existingOsmIds = new Set(
    existingRows
      .map(r => r.osmRelationId)
      .filter((id): id is number => id !== null)
  );

  let seeded = 0;
  let skippedExist = 0;
  let failed = 0;

  const batch: (typeof routes.$inferInsert)[] = [];

  const flushBatch = async () => {
    if (batch.length === 0) return;
    await db.insert(routes).values(batch);
    seeded += batch.length;
    batch.length = 0;
  };

  for (let i = 0; i < toProcess.length; i++) {
    const rel = toProcess[i]!;
    const tags = rel.tags ?? {};
    const name = tags["name"] ?? "";

    console.log(`Processing route ${i + 1}/${toProcess.length}: "${name}"...`);

    try {
      // Name checks
      if (!name) { skippedExist++; continue; }
      if (!looksRomanian(name)) { skippedExist++; continue; }
      if (existingNames.has(name) || existingOsmIds.has(rel.id)) { skippedExist++; continue; }

      // Build geometry from members
      const members = rel.members ?? [];
      const geomPoints: Array<{ latitude: number; longitude: number }> = [];
      for (const member of members) {
        if (member.type !== "way") continue;
        const memberGeom = member.geometry ?? [];
        for (const pt of memberGeom) {
          geomPoints.push({ latitude: pt.lat, longitude: pt.lon });
        }
      }

      if (geomPoints.length < 3) { failed++; continue; }

      // Start / end
      const startPt = geomPoints[0];
      const endPt = geomPoints[geomPoints.length - 1];

      // Bounding box center for region detection
      const lats = geomPoints.map(p => p.latitude);
      const lons = geomPoints.map(p => p.longitude);
      const centerLat = (Math.min(...lats) + Math.max(...lats)) / 2;
      const centerLon = (Math.min(...lons) + Math.max(...lons)) / 2;
      if (!isInRomania(centerLat, centerLon)) { skippedExist++; continue; }
      const region = detectRegion(centerLat, centerLon);

      // Distance via Haversine
      let distanceKm = 0;
      for (let j = 1; j < geomPoints.length; j++) {
        distanceKm += haversineKm(
          geomPoints[j - 1]!.latitude, geomPoints[j - 1]!.longitude,
          geomPoints[j]!.latitude, geomPoints[j]!.longitude
        );
      }

      // Data quality filter
      if (distanceKm < 1 || distanceKm > 100) { failed++; continue; }

      // Elevation: sample every 5th point, max 50 samples
      const rawPoints = geomPoints.map(p => ({ lat: p.latitude, lon: p.longitude }));
      const step = Math.max(1, Math.floor(rawPoints.length / 50));
      const sampledIndices: number[] = [];
      for (let j = 0; j < rawPoints.length; j += step) {
        sampledIndices.push(j);
      }
      // always include last point
      if (sampledIndices[sampledIndices.length - 1]! !== rawPoints.length - 1) {
        sampledIndices.push(rawPoints.length - 1);
      }
      const sampledPoints = sampledIndices.map(idx => rawPoints[idx]!).filter(Boolean) as Array<{ lat: number; lon: number }>;

      let elevationGainM: number;
      let maxElevationM: number | null = null;
      let elevationProfile: Array<{ lat: number; lon: number; elevation: number }> | null = null;
      await new Promise(r => setTimeout(r, 100));
      try {
        const elevations = await fetchElevations(sampledPoints);
        if (elevations.length >= 2) {
          elevationProfile = sampledPoints
            .slice(0, elevations.length)
            .map((point, index) => ({ ...point, elevation: elevations[index]! }));
          let gain = 0;
          for (let j = 1; j < elevations.length; j++) {
            const diff = elevations[j]! - elevations[j - 1]!;
            if (diff > 0) gain += diff;
          }
          elevationGainM = Math.round(gain);
          maxElevationM = Math.round(Math.max(...elevations));
        } else {
          elevationGainM = Math.round(distanceKm * 50);
          maxElevationM = null;
          elevationProfile = null;
        }
      } catch {
        elevationGainM = Math.round(distanceKm * 50);
        maxElevationM = null;
        elevationProfile = null;
      }

      // Difficulty
      const sacScale = tags["sac_scale"];
      const difficulty: "easy" | "moderate" | "hard" | "expert" =
        difficultyFromSacScale(sacScale) ?? difficultyFromElevation(elevationGainM);

      // Duration via Tobler hiking function with Naismith fallback
      const tobler = computeToblerDurationH(elevationProfile, distanceKm);
      const estimatedDurationH = tobler ?? Math.max(0.5, distanceKm / 4 + elevationGainM / 300);

      batch.push({
        name,
        region,
        distanceKm,
        elevationGainM,
        maxElevationM,
        estimatedDurationH,
        difficulty,
        osmRelationId: rel.id,
        isolationScore: computeIsolationScore(elevationGainM, maxElevationM, distanceKm, difficulty),
        startLatitude: startPt!.latitude,
        startLongitude: startPt!.longitude,
        endLatitude: endPt!.latitude,
        endLongitude: endPt!.longitude,
        geometry: geomPoints,
        geometrySimplified: decimateGeometry(geomPoints, 50),
        elevationProfile,
      });

      // Track so we don't re-insert if the same name appears twice in OSM
      existingNames.add(name);
      existingOsmIds.add(rel.id);

      if (batch.length >= 10) {
        await flushBatch();
      }
    } catch (err) {
      console.error(`  Error processing "${name}":`, err);
      failed++;
    }
  }

  // Flush remaining
  await flushBatch();

  console.log(
    `\nSeeded ${seeded} new routes (${skippedExist} skipped - already exist or invalid name, ${failed} failed)`
  );
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
  });





