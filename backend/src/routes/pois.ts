import { Hono } from "hono";

type PoiType = "viewpoint" | "spring" | "drinking_water";

type Poi = {
  lat: number;
  lon: number;
  name: string | null;
  type: PoiType;
};

type OverpassElement = {
  lat?: number;
  lon?: number;
  tags?: {
    tourism?: string;
    natural?: string;
    amenity?: string;
    name?: string;
  };
};

type CacheEntry = {
  data: Poi[];
  timestamp: number;
};

const poisRouter = new Hono();
const overpassUrl = "https://overpass-api.de/api/interpreter";
const cache = new Map<string, CacheEntry>();
const cacheTtlMs = 10 * 60 * 1000;
const requestTimeoutMs = 8000;

function parseNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapPoiType(element: OverpassElement): PoiType | null {
  if (element.tags?.tourism === "viewpoint") {
    return "viewpoint";
  }

  if (element.tags?.natural === "spring") {
    return "spring";
  }

  if (element.tags?.amenity === "drinking_water") {
    return "drinking_water";
  }

  return null;
}

async function fetchPois(lat: number, lon: number, radiusKm: number): Promise<Poi[]> {
  const radiusM = Math.round(radiusKm * 1000);
  const query = `[out:json][timeout:8];
(
  node(around:${radiusM},${lat},${lon})["tourism"="viewpoint"];
  node(around:${radiusM},${lat},${lon})["natural"="spring"];
  node(around:${radiusM},${lat},${lon})["amenity"="drinking_water"];
);
out body;`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(overpassUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: new URLSearchParams({ data: query }).toString(),
      signal: controller.signal,
    });

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as { elements?: OverpassElement[] };
    const elements = Array.isArray(payload.elements) ? payload.elements : [];

    return elements
      .map((element) => {
        if (typeof element.lat !== "number" || typeof element.lon !== "number") {
          return null;
        }

        const type = mapPoiType(element);
        if (!type) {
          return null;
        }

        return {
          lat: element.lat,
          lon: element.lon,
          name: element.tags?.name ?? null,
          type,
        } satisfies Poi;
      })
      .filter((poi): poi is Poi => poi !== null)
      .slice(0, 50);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

poisRouter.get("/", async (c) => {
  const lat = parseNumber(c.req.query("lat"));
  const lon = parseNumber(c.req.query("lon"));
  const radiusKm = parseNumber(c.req.query("radius_km"));

  if (
    lat == null ||
    lon == null ||
    radiusKm == null ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180 ||
    radiusKm <= 0
  ) {
    return c.json([]);
  }

  const cacheKey = `${lat}:${lon}:${radiusKm}`;
  const cached = cache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < cacheTtlMs) {
    return c.json(cached.data);
  }

  const data = await fetchPois(lat, lon, radiusKm);
  cache.set(cacheKey, {
    data,
    timestamp: Date.now(),
  });

  return c.json(data);
});

export default poisRouter;
