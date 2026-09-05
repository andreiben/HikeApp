import { Hono } from "hono";
import { z } from "zod";
import { and, asc, avg, count, desc, eq, max, sql, sum } from "drizzle-orm";
import { db } from "../db";
import { hikes, hikePoints } from "../schema/hikes";
import { routes } from "../schema/routes";
import { trailConditions } from "../schema/trailConditions";
import { getAuthUser } from "../utils/getAuthUser";
import { calculateCompletionScore } from "../utils/completionScore";

const hikesRouter = new Hono();

const startHikeSchema = z.object({
  routeName: z.string().min(2).optional(),
  routeId: z.string().uuid().optional(),
  backpackWeightKg: z.number().min(0).optional(),
  riskScore: z.number().int().min(0).max(100).optional(),
  startedAt: z.string().datetime().optional(),
});

const addPointsSchema = z.object({
  points: z.array(
    z.object({
      latitude: z.number(),
      longitude: z.number(),
      altitude: z.number().nullable().optional(),
      timestamp: z.number(),
    })
  ),
});

const stopHikeSchema = z.object({
  endedAt: z.string().datetime().optional(),
  durationS: z.number().int().min(0),
  movingTimeS: z.number().int().min(0).optional(),
  distanceM: z.number().min(0).optional(),
  elevationGainM: z.number().min(0).optional(),
  elevationLossM: z.number().min(0).optional(),
  avgSpeedKmh: z.number().min(0).optional(),
  avgPaceMinKm: z.number().min(0).optional(),
  minAltitudeM: z.number().nullable().optional(),
  maxAltitudeM: z.number().nullable().optional(),
  weatherSnapshotStart: z.record(z.string(), z.unknown()).optional(),
  offTrailSeconds: z.number().int().min(0).default(0),
  userDifficultyRating: z.number().int().min(1).max(5).optional(),
  status: z.enum(["completed", "partial"]).optional(),
});

const updateHikeNotesSchema = z.object({
  notes: z.string().max(2000),
});

hikesRouter.get("/", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const userHikes = await db
      .select({
        id: hikes.id,
        userId: hikes.userId,
        routeName: hikes.routeName,
        routeId: hikes.routeId,
        notes: hikes.notes,
        startedAt: hikes.startedAt,
        endedAt: hikes.endedAt,
        durationS: hikes.durationS,
        movingTimeS: hikes.movingTimeS,
        distanceM: hikes.distanceM,
        elevationGainM: hikes.elevationGainM,
        elevationLossM: hikes.elevationLossM,
        backpackWeightKg: hikes.backpackWeightKg,
        riskScoreAtStart: hikes.riskScoreAtStart,
        weatherSnapshotStart: hikes.weatherSnapshotStart,
        riskAssessmentId: hikes.riskAssessmentId,
        offTrailSeconds: hikes.offTrailSeconds,
        userDifficultyRating: hikes.userDifficultyRating,
        completionScore: hikes.completionScore,
        avgSpeedKmh: hikes.avgSpeedKmh,
        avgPaceMinKm: hikes.avgPaceMinKm,
        minAltitudeM: hikes.minAltitudeM,
        maxAltitudeM: hikes.maxAltitudeM,
        status: hikes.status,
        createdAt: hikes.createdAt,
        difficulty: routes.difficulty,
      })
      .from(hikes)
      .leftJoin(routes, eq(hikes.routeId, routes.id))
      .where(eq(hikes.userId, authUser.sub))
      .orderBy(desc(hikes.startedAt));

    return c.json({
      hikes: userHikes,
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

hikesRouter.get("/stats", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const [statsRow] = await db
      .select({
        totalHikes: count(hikes.id),
        totalDistanceM: sum(hikes.distanceM),
        totalElevationGainM: sum(hikes.elevationGainM),
        totalDurationS: sum(hikes.durationS),
        longestDistanceM: max(hikes.distanceM),
        highestElevationGainM: max(hikes.elevationGainM),
        avgPaceMinKm: avg(hikes.avgPaceMinKm),
      })
      .from(hikes)
      .where(and(eq(hikes.userId, authUser.sub), sql`${hikes.status} = 'completed'`));

    const roundToTwo = (value: number): number => Number(value.toFixed(2));
    const toNumber = (value: unknown): number | null =>
      value === null || value === undefined ? null : Number(value);

    return c.json({
      stats: {
        totalHikes: Number(statsRow?.totalHikes ?? 0),
        totalDistanceKm: roundToTwo((toNumber(statsRow?.totalDistanceM) ?? 0) / 1000),
        totalElevationGainM: roundToTwo(toNumber(statsRow?.totalElevationGainM) ?? 0),
        totalDurationH: roundToTwo((toNumber(statsRow?.totalDurationS) ?? 0) / 3600),
        longestHikeKm: roundToTwo((toNumber(statsRow?.longestDistanceM) ?? 0) / 1000),
        highestElevationGainM: roundToTwo(toNumber(statsRow?.highestElevationGainM) ?? 0),
        avgPaceMinKm:
          statsRow?.avgPaceMinKm === null || statsRow?.avgPaceMinKm === undefined
            ? null
            : roundToTwo(Number(statsRow.avgPaceMinKm)),
      },
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

hikesRouter.get("/:id", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const hikeId = c.req.param("id");

    const found = await db
      .select()
      .from(hikes)
      .where(and(eq(hikes.id, hikeId), eq(hikes.userId, authUser.sub)))
      .limit(1);

    if (found.length === 0) {
      return c.json({ error: "Hike not found" }, 404);
    }

    return c.json({
      hike: found[0],
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

hikesRouter.get("/:id/points", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const hikeId = c.req.param("id");

    const foundHike = await db
      .select()
      .from(hikes)
      .where(and(eq(hikes.id, hikeId), eq(hikes.userId, authUser.sub)))
      .limit(1);

    if (foundHike.length === 0) {
      return c.json({ error: "Hike not found" }, 404);
    }

    const points = await db
      .select()
      .from(hikePoints)
      .where(eq(hikePoints.hikeId, hikeId))
      .orderBy(asc(hikePoints.recordedAt));

    return c.json({
      points,
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

hikesRouter.post("/start", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const parsed = startHikeSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid input",
          details: parsed.error.flatten(),
        },
        400
      );
    }

    const { routeName, routeId, backpackWeightKg, riskScore, startedAt } = parsed.data;

    const inserted = await db
      .insert(hikes)
      .values({
        userId: authUser.sub,
        routeName: routeName ?? null,
        routeId: routeId ?? null,
        backpackWeightKg,
        riskScoreAtStart: riskScore ?? null,
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        status: "in_progress",
      })
      .returning();

    return c.json(
      {
        message: "Hike started successfully",
        hike: inserted[0],
      },
      201
    );
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

hikesRouter.post("/:id/points", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const hikeId = c.req.param("id");

    const found = await db
      .select()
      .from(hikes)
      .where(and(eq(hikes.id, hikeId), eq(hikes.userId, authUser.sub)))
      .limit(1);

    if (found.length === 0) {
      return c.json({ error: "Hike not found" }, 404);
    }

    const body = await c.req.json();
    const parsed = addPointsSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid input",
          details: parsed.error.flatten(),
        },
        400
      );
    }

    if (parsed.data.points.length === 0) {
      return c.json({ message: "No points to save", count: 0 });
    }

    const values = parsed.data.points.map((point) => ({
      hikeId,
      latitude: point.latitude,
      longitude: point.longitude,
      altitude: point.altitude ?? null,
      recordedAt: new Date(point.timestamp),
    }));

    await db.insert(hikePoints).values(values);

    return c.json({
      message: "Points saved successfully",
      count: values.length,
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

hikesRouter.post("/:id/stop", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const hikeId = c.req.param("id");
    const body = await c.req.json();
    const parsed = stopHikeSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid input",
          details: parsed.error.flatten(),
        },
        400
      );
    }

    const found = await db
      .select()
      .from(hikes)
      .where(and(eq(hikes.id, hikeId), eq(hikes.userId, authUser.sub)))
      .limit(1);

    if (found.length === 0) {
      return c.json({ error: "Hike not found" }, 404);
    }

    const existingHike = found[0]!;
    const endedAt = parsed.data.endedAt ? new Date(parsed.data.endedAt) : new Date();
    const status = parsed.data.status ?? "completed";

    let completionScore: number | null = null;
    let isTrailVerified = false;

    if (existingHike.routeId) {
      const [route, points] = await Promise.all([
        db
          .select({
            startLatitude: routes.startLatitude,
            startLongitude: routes.startLongitude,
            distanceKm: routes.distanceKm,
            estimatedDurationH: routes.estimatedDurationH,
            geometry: routes.geometry,
          })
          .from(routes)
          .where(eq(routes.id, existingHike.routeId))
          .limit(1),
        db
          .select({
            latitude: hikePoints.latitude,
            longitude: hikePoints.longitude,
          })
          .from(hikePoints)
          .where(eq(hikePoints.hikeId, hikeId))
          .orderBy(asc(hikePoints.recordedAt)),
      ]);

      const matchedRoute = route[0];

      if (matchedRoute) {
        completionScore = calculateCompletionScore({
          hikePoints: points,
          recordedDistanceM: parsed.data.distanceM ?? 0,
          durationS: parsed.data.durationS,
          route: {
            startLatitude: matchedRoute.startLatitude,
            startLongitude: matchedRoute.startLongitude,
            distanceKm: matchedRoute.distanceKm,
            estimatedDurationH: matchedRoute.estimatedDurationH,
            geometry:
              matchedRoute.geometry &&
              typeof matchedRoute.geometry === "object" &&
              "type" in matchedRoute.geometry &&
              "coordinates" in matchedRoute.geometry
                ? (matchedRoute.geometry as { type: string; coordinates: [number, number][] })
                : null,
          },
        });
        isTrailVerified = completionScore >= 65;
      }
    }

    const updated = await db
      .update(hikes)
      .set({
        endedAt,
        durationS: parsed.data.durationS,
        movingTimeS: parsed.data.movingTimeS,
        distanceM: parsed.data.distanceM,
        elevationGainM: parsed.data.elevationGainM,
        elevationLossM: parsed.data.elevationLossM,
        avgSpeedKmh: parsed.data.avgSpeedKmh,
        avgPaceMinKm: parsed.data.avgPaceMinKm,
        minAltitudeM: parsed.data.minAltitudeM,
        maxAltitudeM: parsed.data.maxAltitudeM,
        weatherSnapshotStart: parsed.data.weatherSnapshotStart,
        offTrailSeconds: parsed.data.offTrailSeconds,
        userDifficultyRating: parsed.data.userDifficultyRating,
        completionScore,
        status,
      })
      .where(and(eq(hikes.id, hikeId), eq(hikes.userId, authUser.sub)))
      .returning();

    if (existingHike.routeId && isTrailVerified) {
      await db
        .update(trailConditions)
        .set({
          isTrailVerified: true,
        })
        .where(
          and(
            eq(trailConditions.routeId, existingHike.routeId),
            eq(trailConditions.userId, authUser.sub),
            sql`${trailConditions.reportedAt} >= ${existingHike.startedAt}`,
            sql`${trailConditions.reportedAt} <= ${endedAt}`
          )
        );
    }

    return c.json({
      message: "Hike stopped successfully",
      hike: updated[0],
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

hikesRouter.patch("/:id", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const hikeId = c.req.param("id");
    const body = await c.req.json();
    const parsed = updateHikeNotesSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid input",
          details: parsed.error.flatten(),
        },
        400
      );
    }

    const updated = await db
      .update(hikes)
      .set({
        notes: parsed.data.notes,
      })
      .where(and(eq(hikes.id, hikeId), eq(hikes.userId, authUser.sub)))
      .returning();

    if (updated.length === 0) {
      return c.json({ error: "Hike not found" }, 404);
    }

    return c.json({
      hike: updated[0],
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});


hikesRouter.delete('/:id', async (c) => {
  try {
    const authUser = getAuthUser(c);
    if (!authUser) return c.json({ error: 'Unauthorized' }, 401);

    const hikeId = c.req.param('id');

    await db.delete(hikePoints).where(eq(hikePoints.hikeId, hikeId));
    const deleted = await db
      .delete(hikes)
      .where(and(eq(hikes.id, hikeId), eq(hikes.userId, authUser.sub)))
      .returning();

    if (deleted.length === 0) {
      return c.json({ error: 'Hike not found or not yours' }, 404);
    }

    return c.json({ message: 'Hike deleted' });
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default hikesRouter;

