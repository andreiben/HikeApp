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

interface BatchEntry {
  routeId: number;
  name: string;
  points: RoutePoint[];
  count: number;
}

type Dataset = "eudem25m" | "srtm30m";

const MAX_POINTS_PER_ROUTE = 15;
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
  if (!Array.isArray(geometry)) {
    return [];
  }

  const points = geometry
    .map(parseRoutePoint)
    .filter((point): point is RoutePoint => point !== null);

  if (points.length <= maxPoints) {
    return points;
  }

  const sampled: RoutePoint[] = [];
  const lastIndex = points.length - 1;
  for (let i = 0; i < maxPoints - 1; i++) {
    sampled.push(points[Math.floor((i * lastIndex) / (maxPoints - 1))]!);
  }
  sampled.push(points[lastIndex]!);

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

async function updateRouteMaxElevation(routeId: number, maxElevationM: number) {
  await db
    .update(routes)
    .set({ maxElevationM })
    .where(eq(routes.id, routeId as unknown as string));
}

async function main() {
  const routeRows = await db
    .select({
      id: routes.id,
      name: routes.name,
      geometry: routes.geometry,
    })
    .from(routes)
    .where(isNull(routes.maxElevationM));

  const allEntries: BatchEntry[] = routeRows.map((route) => {
    const points = sampleRoutePoints(route.geometry, MAX_POINTS_PER_ROUTE);
    return {
      routeId: route.id as unknown as number,
      name: route.name,
      points,
      count: points.length,
    };
  });
  const entryByRouteId = new Map(allEntries.map((entry) => [entry.routeId, entry]));
  const eudemBatches = buildBatches(allEntries.filter((entry) => entry.count > 0));
  const totalLocations = allEntries.reduce((sum, entry) => sum + entry.count, 0);

  console.log(`Routes to process: ${routeRows.length}`);
  console.log(`Total batches: ${eudemBatches.length}`);
  console.log(`Total locations: ${totalLocations}`);
  console.log(`Estimated time: ${eudemBatches.length}s`);

  let updated = 0;
  let failed = 0;
  const eudemNullRouteIds = new Set<number>(
    allEntries.filter((entry) => entry.count === 0).map((entry) => entry.routeId)
  );
  const failedRouteIds = new Set<number>();
  const updatedRouteIds = new Set<number>();

  for (const batch of eudemBatches) {
    let elevations: (number | null)[];

    try {
      elevations = await fetchElevations("eudem25m", batch);
    } catch (err) {
      if (err instanceof QuotaExhaustedError) {
        throw err;
      }

      console.error("Failed eudem25m batch:", err);
      for (const entry of batch) {
        if (!failedRouteIds.has(entry.routeId)) {
          failedRouteIds.add(entry.routeId);
          failed++;
        }
      }
      await sleep(1000);
      continue;
    }

    let cursor = 0;
    for (const entry of batch) {
      const routeElevations = elevations.slice(cursor, cursor + entry.count);
      const values = routeElevations.filter(
        (elevation): elevation is number =>
          typeof elevation === "number" && Number.isFinite(elevation)
      );

      if (values.length > 0) {
        const maxElevationM = Math.round(Math.max(...values));
        await updateRouteMaxElevation(entry.routeId, maxElevationM);
        updatedRouteIds.add(entry.routeId);
        updated++;
        console.log(`Updated ${entry.name}: maxElevationM=${maxElevationM}`);
      } else {
        eudemNullRouteIds.add(entry.routeId);
      }

      cursor += entry.count;
    }

    await sleep(1000);
  }

  const srtmEntries = [...eudemNullRouteIds]
    .map((routeId) => entryByRouteId.get(routeId))
    .filter((entry): entry is BatchEntry => entry !== undefined && entry.count > 0);
  const srtmBatches = buildBatches(srtmEntries);
  const srtmNullRouteIds = new Set<number>(
    [...eudemNullRouteIds].filter((routeId) => {
      const entry = entryByRouteId.get(routeId);
      return !entry || entry.count === 0;
    })
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
      for (const entry of batch) {
        if (!failedRouteIds.has(entry.routeId)) {
          failedRouteIds.add(entry.routeId);
          failed++;
        }
      }
      await sleep(1000);
      continue;
    }

    let cursor = 0;
    for (const entry of batch) {
      const routeElevations = elevations.slice(cursor, cursor + entry.count);
      const values = routeElevations.filter(
        (elevation): elevation is number =>
          typeof elevation === "number" && Number.isFinite(elevation)
      );

      if (values.length > 0) {
        const maxElevationM = Math.round(Math.max(...values));
        await updateRouteMaxElevation(entry.routeId, maxElevationM);
        updatedRouteIds.add(entry.routeId);
        updated++;
        console.log(`Updated ${entry.name}: maxElevationM=${maxElevationM}`);
      } else {
        srtmNullRouteIds.add(entry.routeId);
      }

      cursor += entry.count;
    }

    await sleep(1000);
  }

  let skipped = 0;
  for (const routeId of srtmNullRouteIds) {
    if (failedRouteIds.has(routeId) || updatedRouteIds.has(routeId)) {
      continue;
    }

    const entry = entryByRouteId.get(routeId);
    skipped++;
    console.log(
      `Skipping ${entry?.name ?? `route ${routeId}`}: no elevation data returned.`
    );
  }

  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed: ${failed}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill max elevation failed:", error);
    process.exit(1);
  });
