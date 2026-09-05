import "dotenv/config";
import { eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { routes } from "../src/schema/routes";

class QuotaExhaustedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotaExhaustedError";
  }
}

interface RoutePoint {
  lat: number;
  lon: number;
}

interface ElevationProfilePoint extends RoutePoint {
  elevation: number;
}

interface BatchEntry {
  id: string;
  name: string;
  points: RoutePoint[];
  count: number;
}

type Dataset = "eudem25m" | "srtm30m";

const POINTS_PER_ROUTE = 40;
const MAX_LOCATIONS_PER_BATCH = 100;
const RETRY_DELAYS_MS = [5000, 15000, 30000];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRoutePoint(value: unknown): RoutePoint | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as {
    lat?: unknown;
    lon?: unknown;
    latitude?: unknown;
    longitude?: unknown;
  };

  const lat = candidate.lat ?? candidate.latitude;
  const lon = candidate.lon ?? candidate.longitude;

  if (typeof lat !== "number" || typeof lon !== "number") {
    return null;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return { lat, lon };
}

function sampleRoutePoints(geometry: unknown, maxPoints: number): RoutePoint[] {
  if (!Array.isArray(geometry) || maxPoints <= 0) {
    return [];
  }

  const points = geometry
    .map(parseRoutePoint)
    .filter((point): point is RoutePoint => point !== null);

  if (points.length === 0) {
    return [];
  }

  if (maxPoints === 1) {
    return [points[points.length - 1]!];
  }

  if (points.length === 1) {
    return Array.from({ length: maxPoints }, () => points[0]!);
  }

  const sampled: RoutePoint[] = [];
  const lastIndex = points.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    sampled.push(points[Math.floor((i * lastIndex) / (maxPoints - 1))]!);
  }

  return sampled;
}

function buildBatches(entries: BatchEntry[]): BatchEntry[][] {
  const batches: BatchEntry[][] = [];
  let currentBatch: BatchEntry[] = [];
  let currentLocationCount = 0;

  for (const entry of entries) {
    if (
      currentBatch.length > 0 &&
      currentLocationCount + entry.count > MAX_LOCATIONS_PER_BATCH
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentLocationCount = 0;
    }

    currentBatch.push(entry);
    currentLocationCount += entry.count;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

async function fetchElevations(
  dataset: Dataset,
  batch: BatchEntry[]
): Promise<(number | null)[]> {
  const locations = batch
    .flatMap((entry) => entry.points)
    .map((point) => `${point.lat},${point.lon}`)
    .join("|");
  const url = `https://api.opentopodata.org/v1/${dataset}?locations=${encodeURIComponent(
    locations
  )}`;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    let response: Response;

    try {
      response = await fetch(url);
    } catch (err) {
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]!);
        continue;
      }

      throw err;
    }

    if (response.status === 429) {
      throw new QuotaExhaustedError("Open-Topo-Data quota exhausted");
    }

    if (response.status >= 500) {
      const error = new Error(`Open-Topo-Data ${dataset} HTTP ${response.status}`);

      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt]!);
        continue;
      }

      throw error;
    }

    const data = (await response.json()) as {
      status?: unknown;
      error?: unknown;
      results?: Array<{ elevation?: number | null }>;
    };

    if (data.status !== "OK") {
      const error =
        typeof data.error === "string" && data.error.length > 0
          ? `: ${data.error}`
          : "";
      throw new Error(`Open-Topo-Data ${dataset} status ${String(data.status)}${error}`);
    }

    return (data.results ?? []).map((result) =>
      typeof result.elevation === "number" ? result.elevation : null
    );
  }

  return [];
}

function isValidElevation(elevation: number | null | undefined): elevation is number {
  return typeof elevation === "number" && Number.isFinite(elevation);
}

function normalizeElevations(
  elevations: (number | null)[],
  expectedCount: number
): (number | null)[] {
  return Array.from({ length: expectedCount }, (_, index) => elevations[index] ?? null);
}

function interpolateElevation(
  elevations: (number | null)[],
  index: number
): number | null {
  let previousIndex = index - 1;
  while (previousIndex >= 0 && !isValidElevation(elevations[previousIndex])) {
    previousIndex--;
  }

  let nextIndex = index + 1;
  while (
    nextIndex < elevations.length &&
    !isValidElevation(elevations[nextIndex])
  ) {
    nextIndex++;
  }

  const previous = elevations[previousIndex];
  const next = elevations[nextIndex];

  if (!isValidElevation(previous) || !isValidElevation(next)) {
    return null;
  }

  const ratio = (index - previousIndex) / (nextIndex - previousIndex);
  return previous + (next - previous) * ratio;
}

function buildElevationProfile(
  points: RoutePoint[],
  elevations: (number | null)[]
): ElevationProfilePoint[] {
  const profile: ElevationProfilePoint[] = [];

  for (let index = 0; index < points.length; index++) {
    const point = points[index]!;
    const elevation = isValidElevation(elevations[index])
      ? elevations[index]
      : interpolateElevation(elevations, index);

    if (isValidElevation(elevation)) {
      profile.push({ lat: point.lat, lon: point.lon, elevation });
    }
  }

  return profile;
}

async function updateRouteElevationProfile(
  route: BatchEntry,
  profile: ElevationProfilePoint[]
) {
  await db
    .update(routes)
    .set({ elevationProfile: profile })
    .where(eq(routes.id, route.id));
}

function markFailed(
  batch: BatchEntry[],
  failedRouteIds: Set<string>,
  updatedRouteIds: Set<string>,
  skippedRouteIds: Set<string>
) {
  let failed = 0;

  for (const entry of batch) {
    if (
      failedRouteIds.has(entry.id) ||
      updatedRouteIds.has(entry.id) ||
      skippedRouteIds.has(entry.id)
    ) {
      continue;
    }

    failedRouteIds.add(entry.id);
    failed++;
  }

  return failed;
}

async function main() {
  const routeRows = await db
    .select({
      id: routes.id,
      name: routes.name,
      geometry: routes.geometry,
    })
    .from(routes)
    .where(isNull(routes.elevationProfile));

  const allEntries: BatchEntry[] = routeRows.map((route) => {
    const points = sampleRoutePoints(route.geometry, POINTS_PER_ROUTE);
    return {
      id: route.id,
      name: route.name,
      points,
      count: points.length,
    };
  });
  const processableEntries = allEntries.filter((entry) => entry.count > 0);
  const eudemBatches = buildBatches(processableEntries);
  const totalLocations = processableEntries.reduce(
    (sum, entry) => sum + entry.count,
    0
  );
  const maxPossibleBatches = eudemBatches.length * 2;

  console.log(`Routes to process: ${routeRows.length}`);
  console.log(`Total batches: ${eudemBatches.length} initial, up to ${maxPossibleBatches} with fallback`);
  console.log(`Total locations: ${totalLocations}`);
  console.log(`Estimated time: ${eudemBatches.length}s-${maxPossibleBatches}s`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const failedRouteIds = new Set<string>();
  const skippedRouteIds = new Set<string>();
  const updatedRouteIds = new Set<string>();
  const fallbackEntries: BatchEntry[] = [];
  const eudemElevationsByRouteId = new Map<string, (number | null)[]>();

  for (const entry of allEntries) {
    if (entry.count > 0) {
      continue;
    }

    skippedRouteIds.add(entry.id);
    skipped++;
    console.log(`Skipping ${entry.name}: no valid geometry points.`);
  }

  for (const batch of eudemBatches) {
    let elevations: (number | null)[];

    try {
      elevations = await fetchElevations("eudem25m", batch);
    } catch (err) {
      if (err instanceof QuotaExhaustedError) {
        throw err;
      }

      console.error("Failed eudem25m batch:", err);
      failed += markFailed(batch, failedRouteIds, updatedRouteIds, skippedRouteIds);
      await sleep(1000);
      continue;
    }

    let cursor = 0;
    for (const entry of batch) {
      const routeElevations = normalizeElevations(
        elevations.slice(cursor, cursor + entry.count),
        entry.count
      );

      if (routeElevations.some((elevation) => !isValidElevation(elevation))) {
        eudemElevationsByRouteId.set(entry.id, routeElevations);
        fallbackEntries.push(entry);
      } else {
        const profile = buildElevationProfile(entry.points, routeElevations);

        if (profile.length >= 2) {
          await updateRouteElevationProfile(entry, profile);
          updatedRouteIds.add(entry.id);
          updated++;
          console.log(`Updated ${entry.name}: profile points=${profile.length}`);
        } else {
          skippedRouteIds.add(entry.id);
          skipped++;
          console.log(`Skipping ${entry.name}: fewer than 2 valid elevation points.`);
        }
      }

      cursor += entry.count;
    }

    await sleep(1000);
  }

  const srtmBatches = buildBatches(
    fallbackEntries.filter(
      (entry) =>
        !failedRouteIds.has(entry.id) &&
        !updatedRouteIds.has(entry.id) &&
        !skippedRouteIds.has(entry.id)
    )
  );

  for (const batch of srtmBatches) {
    let elevations: (number | null)[];

    try {
      elevations = await fetchElevations("srtm30m", batch);
    } catch (err) {
      if (err instanceof QuotaExhaustedError) {
        throw err;
      }

      console.error("Failed srtm30m batch:", err);
      failed += markFailed(batch, failedRouteIds, updatedRouteIds, skippedRouteIds);
      await sleep(1000);
      continue;
    }

    let cursor = 0;
    for (const entry of batch) {
      const eudemElevations =
        eudemElevationsByRouteId.get(entry.id) ??
        Array.from({ length: entry.count }, (): number | null => null);
      const srtmElevations = normalizeElevations(
        elevations.slice(cursor, cursor + entry.count),
        entry.count
      );
      const combinedElevations = entry.points.map((_, index) =>
        isValidElevation(eudemElevations[index])
          ? eudemElevations[index]!
          : srtmElevations[index] ?? null
      );
      const profile = buildElevationProfile(entry.points, combinedElevations);

      if (profile.length >= 2) {
        await updateRouteElevationProfile(entry, profile);
        updatedRouteIds.add(entry.id);
        updated++;
        console.log(`Updated ${entry.name}: profile points=${profile.length}`);
      } else {
        skippedRouteIds.add(entry.id);
        skipped++;
        console.log(`Skipping ${entry.name}: fewer than 2 valid elevation points.`);
      }

      cursor += entry.count;
    }

    await sleep(1000);
  }

  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill elevation profile failed:", error);
    process.exit(1);
  });
