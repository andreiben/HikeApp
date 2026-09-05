import { Hono } from "hono";
import { and, asc, between, count, desc, eq, gte, inArray, lte, max, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db";
import { hikes } from "../schema/hikes";
import { routes } from "../schema/routes";
import { trailConditions } from "../schema/trailConditions";
import {
  isReportImplausible,
  resolveTrustedCondition,
  type ConditionReport,
} from "../utils/conditionTrust";
import { decimateGeometry, parseCoordinatePoint, type CoordinatePoint } from "../utils/geometry";
import { getAuthUser } from "../utils/getAuthUser";
import { calculateRisk } from "../utils/riskEngine";

const routesRouter = new Hono();
const cache = new Map<string, { data: unknown; timestamp: number }>();
const cacheTtlMs = 10 * 60 * 1000;
const trailConditionValues = [
  "dry",
  "muddy",
  "snowy",
  "overgrown",
  "blocked",
] as const;

const createTrailConditionSchema = z.object({
  condition: z.enum(trailConditionValues),
  notes: z.string().trim().max(2000).optional(),
});

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

function parseAnchorPoint(geometry: unknown): CoordinatePoint | null {
  if (!Array.isArray(geometry) || geometry.length === 0) {
    return null;
  }

  return parseCoordinatePoint(geometry[0]);
}

function parseFiniteNumber(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalStartDate(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function parseOptionalStartTime(value: string | undefined): string | null {
  return value && /^\d{2}:\d{2}$/.test(value) ? value : null;
}

function parseOptionalBackpackWeight(value: string | undefined): number | null {
  const parsed = parseFiniteNumber(value);
  return parsed != null && parsed >= 0 && parsed <= 50 ? parsed : null;
}

routesRouter.get("/", async (c) => {
  try {
    const cached = cache.get("routes-list");

    if (cached && Date.now() - cached.timestamp < cacheTtlMs) {
      return c.json(cached.data);
    }

    const allRoutes = await db
      .select({
        id: routes.id,
        name: routes.name,
        region: routes.region,
        distanceKm: routes.distanceKm,
        elevationGainM: routes.elevationGainM,
        maxElevationM: routes.maxElevationM,
        estimatedDurationH: routes.estimatedDurationH,
        difficulty: routes.difficulty,
        surfaceType: routes.surfaceType,
        source: routes.source,
        osmRelationId: routes.osmRelationId,
        tags: routes.tags,
        description: routes.description,
        bestSeason: routes.bestSeason,
        startLatitude: routes.startLatitude,
        startLongitude: routes.startLongitude,
        endLatitude: routes.endLatitude,
        endLongitude: routes.endLongitude,
        isolationScore: routes.isolationScore,
        createdAt: routes.createdAt,
        geometry: routes.geometrySimplified,
      })
      .from(routes)
      .where(
        and(
          between(routes.startLatitude, 43.5, 48.5),
          between(routes.startLongitude, 20.0, 30.0)
        )
      )
      .orderBy(asc(routes.region), asc(routes.name));

    if (allRoutes.length === 0) {
      const response = { routes: [] };
      cache.set("routes-list", {
        data: response,
        timestamp: Date.now(),
      });
      return c.json(response);
    }

    const seventyFiveDaysAgo = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000);
    const routeIds = allRoutes.map((r) => r.id);

    const allConditions = await db
      .select({
        id: trailConditions.id,
        routeId: trailConditions.routeId,
        condition: trailConditions.condition,
        reportedAt: trailConditions.reportedAt,
        isTrailVerified: trailConditions.isTrailVerified,
        isSuppressed: trailConditions.isSuppressed,
      })
      .from(trailConditions)
      .where(
        and(
          inArray(trailConditions.routeId, routeIds),
          gte(trailConditions.reportedAt, seventyFiveDaysAgo)
        )
      )
      .orderBy(desc(trailConditions.reportedAt));

    const conditionsByRoute = new Map<string, typeof allConditions>();
    for (const cond of allConditions) {
      if (!cond.routeId) continue;
      const existing = conditionsByRoute.get(cond.routeId);
      if (existing) {
        existing.push(cond);
      } else {
        conditionsByRoute.set(cond.routeId, [cond]);
      }
    }

    const routesWithConditions = allRoutes.map((route) => {
      const reports = conditionsByRoute.get(route.id) ?? [];
      const conditionReports: ConditionReport[] = reports.map((r) => ({
        id: r.id,
        condition: r.condition as ConditionReport["condition"],
        reportedAt: r.reportedAt,
        isTrailVerified: r.isTrailVerified,
        isSuppressed: r.isSuppressed,
      }));
      const trusted =
        conditionReports.length > 0
          ? resolveTrustedCondition(
              conditionReports,
              route.startLatitude,
              route.startLongitude,
              route.maxElevationM
            )
          : null;
      return { ...route, condition: trusted?.condition ?? null };
    });

    const response = {
      routes: routesWithConditions.map((route) => ({
        ...route,
        geometry: Array.isArray(route.geometry)
          ? (route.geometry as Array<{ lat: number; lon: number }>).map((p) => ({
              latitude: p.lat,
              longitude: p.lon,
            }))
          : [],
      })),
    };
    cache.set("routes-list", {
      data: response,
      timestamp: Date.now(),
    });

    return c.json(response);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

routesRouter.get("/near", async (c) => {
  try {
    const lat = parseFiniteNumber(c.req.query("lat"));
    const lon = parseFiniteNumber(c.req.query("lon"));
    const radiusKm = parseFiniteNumber(c.req.query("radius_km"));

    if (
      lat == null ||
      lon == null ||
      radiusKm == null ||
      lat < -90 ||
      lat > 90 ||
      lon < -180 ||
      lon > 180 ||
      radiusKm < 1 ||
      radiusKm > 500
    ) {
      return c.json(
        {
          error:
            "Invalid query params. Expected lat (-90..90), lon (-180..180), radius_km (1..500).",
        },
        400
      );
    }

    const allRoutes = await db
      .select({
        id: routes.id,
        name: routes.name,
        distanceKm: routes.distanceKm,
        elevationGainM: routes.elevationGainM,
        maxElevationM: routes.maxElevationM,
        difficulty: routes.difficulty,
        region: routes.region,
        coordinates: routes.geometry,
      })
      .from(routes);

    const nearbyRoutes = allRoutes
      .map((route) => {
        const anchorPoint = parseAnchorPoint(route.coordinates);

        if (!anchorPoint) {
          return null;
        }

        const distanceFromUserKm = haversineKm(
          lat,
          lon,
          anchorPoint.lat,
          anchorPoint.lon
        );

        if (distanceFromUserKm > radiusKm) {
          return null;
        }

        return {
          id: route.id,
          name: route.name,
          distanceKm: route.distanceKm,
          elevationGainM: route.elevationGainM,
          maxElevationM: route.maxElevationM,
          difficulty: route.difficulty,
          region: route.region,
          distanceFromUserKm,
        };
      })
      .filter(
        (
          route
        ): route is {
          id: string;
          name: string;
          distanceKm: number;
          elevationGainM: number;
          maxElevationM: number | null;
          difficulty: string;
          region: string;
          distanceFromUserKm: number;
        } => route !== null
      )
      .sort((left, right) => left.distanceFromUserKm - right.distanceFromUserKm)
      .slice(0, 50);

    return c.json(nearbyRoutes);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

routesRouter.get("/my-history/batch", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const idsParam = c.req.query("ids") ?? "";
    const routeIds = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (routeIds.length === 0) {
      return c.json({});
    }

    const historyRows = await db
      .select({
        routeId: hikes.routeId,
        count: count(hikes.id),
        lastHikedAt: max(hikes.endedAt),
      })
      .from(hikes)
      .where(
        and(
          eq(hikes.userId, authUser.sub),
          eq(hikes.status, "completed"),
          inArray(hikes.routeId, routeIds)
        )
      )
      .groupBy(hikes.routeId);

    const historyByRouteId = routeIds.reduce<
      Record<string, { count: number; lastHikedAt: string | null }>
    >((accumulator, routeId) => {
      accumulator[routeId] = { count: 0, lastHikedAt: null };
      return accumulator;
    }, {});

    historyRows.forEach((row) => {
      if (!row.routeId) {
        return;
      }

      historyByRouteId[row.routeId] = {
        count: Number(row.count ?? 0),
        lastHikedAt: row.lastHikedAt ? row.lastHikedAt.toISOString() : null,
      };
    });

    return c.json(historyByRouteId);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

routesRouter.get("/:id/my-history", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const routeId = c.req.param("id");

    const [historyRow] = await db
      .select({
        count: count(hikes.id),
        lastHikedAt: max(hikes.endedAt),
      })
      .from(hikes)
      .where(
        and(
          eq(hikes.routeId, routeId),
          eq(hikes.userId, authUser.sub),
          eq(hikes.status, "completed")
        )
      );

    return c.json({
      count: Number(historyRow?.count ?? 0),
      lastHikedAt: historyRow?.lastHikedAt
        ? historyRow.lastHikedAt.toISOString()
        : null,
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

routesRouter.post("/:id/conditions", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const routeId = c.req.param("id");
    const body = await c.req.json();
    const parsed = createTrailConditionSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid input",
          details: parsed.error.flatten(),
        },
        400
      );
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [[routeReportCount], [dailyReportCount], [routeRow], [verifiedHike]] =
      await Promise.all([
        db
          .select({ count: count(trailConditions.id) })
          .from(trailConditions)
          .where(
            and(
              eq(trailConditions.routeId, routeId),
              eq(trailConditions.userId, authUser.sub),
              gte(trailConditions.reportedAt, twentyFourHoursAgo)
            )
          ),
        db
          .select({ count: count(trailConditions.id) })
          .from(trailConditions)
          .where(
            and(
              eq(trailConditions.userId, authUser.sub),
              gte(trailConditions.reportedAt, todayStart)
            )
          ),
        db
          .select({
            startLatitude: routes.startLatitude,
            startLongitude: routes.startLongitude,
            maxElevationM: routes.maxElevationM,
          })
          .from(routes)
          .where(eq(routes.id, routeId))
          .limit(1),
        db
          .select({ id: hikes.id })
          .from(hikes)
          .where(
            and(
              eq(hikes.routeId, routeId),
              eq(hikes.userId, authUser.sub),
              eq(hikes.status, "completed"),
              gte(hikes.completionScore, 65)
            )
          )
          .limit(1),
      ]);

    if (Number(routeReportCount?.count ?? 0) >= 1) {
      return c.json({ error: "You can only report this trail once every 24 hours." }, 429);
    }

    if (Number(dailyReportCount?.count ?? 0) >= 5) {
      return c.json({ error: "You have reached the daily trail condition report limit." }, 429);
    }

    if (!routeRow) {
      return c.json({ error: "Route not found" }, 404);
    }

    const suppressed = await isReportImplausible(
      {
        id: "plausibility-check",
        condition: parsed.data.condition as import("../utils/conditionTrust").ConditionType,
        reportedAt: new Date(),
        isTrailVerified: false,
        isSuppressed: false,
      },
      routeRow.startLatitude,
      routeRow.startLongitude,
      routeRow.maxElevationM ?? 0
    );

    const isVerified = Boolean(verifiedHike);

    const inserted = await db
      .insert(trailConditions)
      .values({
        routeId,
        userId: authUser.sub,
        condition: parsed.data.condition,
        notes: parsed.data.notes ?? null,
        isTrailVerified: isVerified,
        isSuppressed: suppressed,
      })
      .returning();

    cache.delete("routes-list");

    return c.json(inserted[0], 201);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

routesRouter.get("/:id/conditions/latest", async (c) => {
  try {
    const routeId = c.req.param("id");
    const seventyFiveDaysAgo = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000);

    const [routeRow] = await db
      .select({
        startLatitude: routes.startLatitude,
        startLongitude: routes.startLongitude,
        maxElevationM: routes.maxElevationM,
      })
      .from(routes)
      .where(eq(routes.id, routeId))
      .limit(1);

    if (!routeRow) {
      return c.json(null);
    }

    const reports = await db
      .select({
        id: trailConditions.id,
        condition: trailConditions.condition,
        notes: trailConditions.notes,
        reportedAt: trailConditions.reportedAt,
        isTrailVerified: trailConditions.isTrailVerified,
        isSuppressed: trailConditions.isSuppressed,
      })
      .from(trailConditions)
      .where(
        and(
          eq(trailConditions.routeId, routeId),
          gte(trailConditions.reportedAt, seventyFiveDaysAgo)
        )
      )
      .orderBy(desc(trailConditions.reportedAt));

    if (reports.length === 0) {
      return c.json(null);
    }

    const conditionReports: ConditionReport[] = reports.map((report) => ({
      id: report.id,
      condition: report.condition as ConditionReport["condition"],
      reportedAt: report.reportedAt,
      isTrailVerified: report.isTrailVerified,
      isSuppressed: report.isSuppressed,
    }));

    const trusted = resolveTrustedCondition(
      conditionReports,
      routeRow.startLatitude,
      routeRow.startLongitude,
      routeRow.maxElevationM ?? 0
    );

    if (!trusted) {
      return c.json(null);
    }

    const latestNonSuppressed = reports.find((report) => !report.isSuppressed);

    if (!latestNonSuppressed) {
      return c.json(null);
    }

    return c.json({
      trusted: {
        condition: trusted.condition,
        riskPoints: trusted.riskPoints,
        confidence: trusted.confidence,
        label: trusted.label,
        daysOld: trusted.daysOld,
        isTrailVerified: trusted.isTrailVerified,
        notes: latestNonSuppressed.notes,
      },
      condition: latestNonSuppressed.condition,
      notes: latestNonSuppressed.notes,
      reportedAt: latestNonSuppressed.reportedAt.toISOString(),
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

routesRouter.get("/my-conditions/batch", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const idsParam = c.req.query("ids") ?? "";
    const routeIds = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id.length > 0);

    if (routeIds.length === 0) {
      return c.json({});
    }

    const rows = await db
      .select({
        routeId: trailConditions.routeId,
        condition: trailConditions.condition,
      })
      .from(trailConditions)
      .where(
        and(
          eq(trailConditions.userId, authUser.sub),
          inArray(trailConditions.routeId, routeIds)
        )
      )
      .orderBy(desc(trailConditions.reportedAt));

    const result: Record<string, string> = {};
    for (const row of rows) {
      if (row.routeId && !result[row.routeId]) {
        result[row.routeId] = row.condition;
      }
    }

    return c.json(result);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

routesRouter.get("/:id/conditions/mine", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const routeId = c.req.param("id");

    const [condition] = await db
      .select()
      .from(trailConditions)
      .where(
        and(
          eq(trailConditions.routeId, routeId),
          eq(trailConditions.userId, authUser.sub)
        )
      )
      .orderBy(desc(trailConditions.reportedAt))
      .limit(1);

    return c.json(condition ?? null);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

routesRouter.get("/:id", async (c) => {
  try {
    const routeId = c.req.param("id");

    const found = await db
      .select()
      .from(routes)
      .where(eq(routes.id, routeId))
      .limit(1);

    if (found.length === 0) {
      return c.json({ error: "Route not found" }, 404);
    }

    return c.json({
      route: found[0],
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

routesRouter.get("/:id/alternatives", async (c) => {
  try {
    const routeId = c.req.param("id");
    const startDate = parseOptionalStartDate(c.req.query("startDate"));
    const startTime = parseOptionalStartTime(c.req.query("startTime"));
    const backpackWeightKg = parseOptionalBackpackWeight(c.req.query("backpackWeightKg"));

    const found = await db
      .select()
      .from(routes)
      .where(eq(routes.id, routeId))
      .limit(1);

    if (found.length === 0) {
      return c.json({ error: "Route not found" }, 404);
    }

    const target = found[0]!;

    const difficultyOrder: Record<string, number> = {
      easy: 1,
      moderate: 2,
      hard: 3,
      expert: 4,
    };

    const targetLevel = difficultyOrder[target.difficulty ?? "moderate"] ?? 2;
    const easierDifficulties = Object.entries(difficultyOrder)
      .filter(([, level]) => level < targetLevel)
      .map(([d]) => d);

    if (easierDifficulties.length === 0) {
      return c.json({ alternatives: [] });
    }

    const alternatives = await db
      .select()
      .from(routes)
      .where(
        and(
          eq(routes.region, target.region),
          inArray(routes.difficulty, easierDifficulties),
          ne(routes.id, routeId),
          lte(routes.elevationGainM, target.elevationGainM)
        )
      )
      .orderBy(asc(routes.elevationGainM))
      .limit(8);

    const scoredAlternatives = alternatives
      .map((candidate) => {
        const scored = calculateRisk({
          distanceKm: candidate.distanceKm,
          elevationGainM: candidate.elevationGainM,
          estimatedDurationH: candidate.estimatedDurationH,
          backpackWeightKg: backpackWeightKg ?? 6,
          startTime: startTime ?? "08:00",
          routeDifficulty: candidate.difficulty,
          isolationScore: candidate.isolationScore,
          maxAltitudeM: candidate.maxElevationM,
          surfaceType: candidate.surfaceType,
          now: startDate ? new Date(startDate + "T00:00:00.000Z") : new Date(),
        });

        return {
          ...candidate,
          score: scored.score,
          level: scored.level,
        };
      })
      .sort((left, right) => left.score - right.score)
      .slice(0, 5);

    return c.json({ alternatives: scoredAlternatives });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default routesRouter;

