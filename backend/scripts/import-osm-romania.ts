import "dotenv/config";
import { db } from "../src/db";
import { routes } from "../src/schema/routes";

const OVERPASS_QUERY = `[out:json][timeout:300];
relation["route"="hiking"]["name"](44.0,20.0,48.5,30.0);
out geom;`;

const SAC_SCALE_MAP = {
  hiking: 1,
  mountain_hiking: 2,
  demanding_mountain_hiking: 3,
  alpine_hiking: 4,
  demanding_alpine_hiking: 5,
  difficult_alpine_hiking: 6,
} as const;

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

async function fetchRelations(): Promise<OsmRelation[]> {
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
    },
    body: OVERPASS_QUERY,
  });

  if (!response.ok) {
    throw new Error(`Overpass API returned ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as OverpassResponse;
  return data.elements ?? [];
}

async function main() {
  const relations = await fetchRelations();
  const total = relations.length;
  let imported = 0;

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
    const start = coordinates[0]!;
    const end = coordinates[coordinates.length - 1]!;

    await db
      .insert(routes)
      .values({
        name,
        region: tags.network ?? tags["addr:region"] ?? "Romania",
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
      });

    imported += 1;
    console.log(`Imported ${imported} / ${total} routes`);
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
