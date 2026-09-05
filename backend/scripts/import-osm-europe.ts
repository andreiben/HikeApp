import "dotenv/config";
import { count, eq } from "drizzle-orm";
import { db } from "../src/db";
import { routes } from "../src/schema/routes";

const SAC_SCALE_MAP = {
  hiking: 1,
  mountain_hiking: 2,
  demanding_mountain_hiking: 3,
  alpine_hiking: 4,
  demanding_alpine_hiking: 5,
  difficult_alpine_hiking: 6,
} as const;

interface Country {
  name: string;
  bbox: string;
  skipIfOsmRoutesExist?: boolean;
}

const COUNTRIES: Country[] = [
  {
    name: "Romania",
    bbox: "(44.0,20.0,48.5,30.0)",
    skipIfOsmRoutesExist: true,
  },
  {
    name: "Austria",
    bbox: "(46.3,9.5,49.0,17.2)",
  },
  {
    name: "Switzerland",
    bbox: "(45.8,5.9,47.8,10.5)",
  },
  {
    name: "Slovenia",
    bbox: "(45.4,13.3,46.9,16.6)",
  },
  {
    name: "Croatia",
    bbox: "(42.4,13.5,46.6,19.5)",
  },
  {
    name: "Bulgaria",
    bbox: "(41.2,22.3,44.2,28.7)",
  },
  {
    name: "Serbia",
    bbox: "(42.2,18.8,46.2,23.0)",
  },
  {
    name: "North Macedonia",
    bbox: "(40.8,20.4,42.4,23.1)",
  },
  {
    name: "Slovakia",
    bbox: "(47.7,16.8,49.6,22.6)",
  },
];
type Difficulty = "easy" | "moderate" | "hard" | "expert";

interface OsmPoint {
  lat: number;
  lon: number;
}

interface OsmMember {
  type?: string;
  geometry?: OsmPoint[];
}

interface OsmRelation {
  id: number;
  tags?: Record<string, string>;
  members?: OsmMember[];
}

interface OverpassResponse {
  elements?: OsmRelation[];
}

function buildOverpassQuery(country: Country): string {
  return `[out:json][timeout:300];
relation["route"="hiking"]["name"]${country.bbox};
out geom;`;
}

function parseDistanceMeters(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(",", ".");
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(km|m)?$/);

  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2] ?? "m";

  if (!Number.isFinite(amount)) {
    return null;
  }

  return unit === "km" ? amount * 1000 : amount;
}

function haversineMeters(a: OsmPoint, b: OsmPoint): number {
  const earthRadiusM = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const term =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return earthRadiusM * 2 * Math.asin(Math.sqrt(term));
}

function computeDistanceMeters(points: OsmPoint[]): number {
  let total = 0;

  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1]!, points[i]!);
  }

  return total;
}

function mapSacScale(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  return SAC_SCALE_MAP[value as keyof typeof SAC_SCALE_MAP] ?? null;
}

function difficultyFromSacScale(sacScale: number | null): Difficulty {
  if (sacScale == null) {
    return "moderate";
  }

  if (sacScale <= 2) {
    return "easy";
  }

  if (sacScale === 3) {
    return "moderate";
  }

  if (sacScale <= 5) {
    return "hard";
  }

  return "expert";
}

function buildCoordinates(relation: OsmRelation): OsmPoint[] {
  const coordinates: OsmPoint[] = [];

  for (const member of relation.members ?? []) {
    if (member.type !== "way" || !member.geometry?.length) {
      continue;
    }

    for (const point of member.geometry) {
      const previous = coordinates[coordinates.length - 1];
      if (previous?.lat === point.lat && previous.lon === point.lon) {
        continue;
      }

      coordinates.push({ lat: point.lat, lon: point.lon });
    }
  }

  return coordinates;
}

async function fetchRelations(country: Country): Promise<OsmRelation[]> {
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
    },
    body: buildOverpassQuery(country),
  });

  if (!response.ok) {
    throw new Error(`Overpass API returned ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as OverpassResponse;
  return data.elements ?? [];
}

function parseCountryArg(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (!arg) {
      continue;
    }

    if (arg === "--country") {
      return argv[i + 1]?.trim() ?? null;
    }

    if (arg.startsWith("--country=")) {
      return arg.slice("--country=".length).trim() || null;
    }
  }

  return null;
}

function normalizeCountryName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function shouldSkipRomania(): Promise<boolean> {
  const existing = await db
    .select({ count: count(routes.id) })
    .from(routes)
    .where(eq(routes.source, "osm"));

  return Number(existing[0]?.count ?? 0) > 0;
}

async function importCountry(country: Country): Promise<number> {
  if (country.skipIfOsmRoutesExist && await shouldSkipRomania()) {
    console.log(`${country.name}: skipped because OSM routes already exist in DB`);
    return 0;
  }

  const relations = await fetchRelations(country);
  let inserted = 0;

  for (const relation of relations) {
    const tags = relation.tags ?? {};
    const name = tags.name?.trim();
    const coordinates = buildCoordinates(relation);

    if (!name || coordinates.length === 0) {
      continue;
    }

    const sacScale = mapSacScale(tags.sac_scale);
    const distanceM =
      parseDistanceMeters(tags.distance) ?? computeDistanceMeters(coordinates);

    if (distanceM <= 1000) {
      continue;
    }

    const start = coordinates[0]!;
    const end = coordinates[coordinates.length - 1]!;

    const insertedRows = await db
      .insert(routes)
      .values({
        name,
        region: tags.network ?? tags["addr:region"] ?? country.name,
        distanceKm: distanceM / 1000,
        elevationGainM: 0,
        estimatedDurationH: distanceM / 1000 / 4,
        difficulty: difficultyFromSacScale(sacScale),
        source: "osm",
        osmRelationId: relation.id,
        tags,
        description: tags.description,
        bestSeason: tags.season,
        startLatitude: start.lat,
        startLongitude: start.lon,
        endLatitude: end.lat,
        endLongitude: end.lon,
        geometry: coordinates.map(point => ({
          latitude: point.lat,
          longitude: point.lon,
        })),
      })
      .onConflictDoNothing({
        target: routes.osmRelationId,
      })
      .returning({ id: routes.id });

    inserted += insertedRows.length;
  }

  console.log(`${country.name}: inserted ${inserted} routes`);
  return inserted;
}

async function main() {
  const requestedCountry = parseCountryArg(process.argv.slice(2));
  const countries = requestedCountry
    ? COUNTRIES.filter(
        country =>
          normalizeCountryName(country.name) === normalizeCountryName(requestedCountry)
      )
    : [...COUNTRIES];

  if (requestedCountry && countries.length === 0) {
    throw new Error(`Unknown country: ${requestedCountry}`);
  }

  for (let i = 0; i < countries.length; i++) {
    await importCountry(countries[i]!);

    if (i < countries.length - 1) {
      await sleep(2000);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
