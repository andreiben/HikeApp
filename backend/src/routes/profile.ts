import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq, gte, max, min } from "drizzle-orm";
import { db } from "../db";
import { hikes } from "../schema/hikes";
import { routes } from "../schema/routes";
import { userProfiles } from "../schema/userProfiles";
import { users } from "../schema/users";
import {
  computeFitnessLevel,
  computeFitnessLevelDetail,
  computeMonthComparison,
  computeRecentLoad,
  computeWeeklyStreak,
  type CompletedHikeRow,
} from "../utils/fitness";
import { getAuthUser } from "../utils/getAuthUser";

const profileRouter = new Hono();

const completeProfileSchema = z.object({
  displayName: z.string().min(2),
  experienceLevel: z.string().min(2),
  heightCm: z.number().int().min(100).max(250),
  weightKg: z.number().int().min(30).max(250),
  age: z.number().int().min(16).max(99),
  typicalBackpackWeightKg: z.number().int().min(0).nullish(),
  hikesSoloUsually: z.boolean().optional(),
  units: z.string().optional(),
  riskAlertsEnabled: z.boolean().optional(),
  achievementToastsEnabled: z.boolean().optional(),
});

const updateSettingsSchema = z.object({
  units: z.string().optional(),
  riskAlertsEnabled: z.boolean().optional(),
  achievementToastsEnabled: z.boolean().optional(),
});

const updateDisplayNameSchema = z.object({
  displayName: z.string().min(2),
});

function mean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getFatigueLevel(totalDistanceKm: number, restDays: number): string {
  let baseScore = 0;

  if (totalDistanceKm >= 50) {
    baseScore = 0.35;
  } else if (totalDistanceKm >= 30) {
    baseScore = 0.2;
  } else if (totalDistanceKm >= 15) {
    baseScore = 0.1;
  }

  const adjustedScore = baseScore * Math.pow(0.75, restDays);

  if (adjustedScore >= 0.35) {
    return "High";
  }

  if (adjustedScore >= 0.2) {
    return "Moderate";
  }

  if (adjustedScore > 0) {
    return "Mild";
  }

  return "Rested";
}

profileRouter.get("/me", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const profile = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, authUser.sub))
      .limit(1);

    return c.json({
      profile: profile[0] ?? null,
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

profileRouter.post("/complete", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const parsed = completeProfileSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid input",
          details: parsed.error.flatten(),
        },
        400
      );
    }

    await db
      .insert(userProfiles)
      .values({
        userId: authUser.sub,
        ...parsed.data,
      })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: {
          ...parsed.data,
          updatedAt: new Date(),
        },
      });

    return c.json({ message: "Profile saved successfully" });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

profileRouter.patch("/settings", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const parsed = updateSettingsSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid input",
          details: parsed.error.flatten(),
        },
        400
      );
    }

    const updates = Object.fromEntries(
      Object.entries(parsed.data).filter(([, value]) => value !== undefined)
    ) as Partial<typeof parsed.data>;

    if (Object.keys(updates).length === 0) {
      return c.json({ error: "No settings provided" }, 400);
    }

    const updated = await db
      .update(userProfiles)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, authUser.sub))
      .returning();

    if (updated.length === 0) {
      return c.json({ error: "Profile not found" }, 404);
    }

    return c.json({ profile: updated[0] });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

profileRouter.patch("/display-name", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const parsed = updateDisplayNameSchema.safeParse(body);

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
      .update(userProfiles)
      .set({
        displayName: parsed.data.displayName,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, authUser.sub))
      .returning();

    if (updated.length === 0) {
      return c.json({ error: "Profile not found" }, 404);
    }

    return c.json({ profile: updated[0] });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

profileRouter.get("/fitness-trend", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const completedHikes = await db
      .select({
        durationS: hikes.durationS,
        distanceM: hikes.distanceM,
        avgPaceMinKm: hikes.avgPaceMinKm,
        elevationGainM: hikes.elevationGainM,
        startedAt: hikes.startedAt,
        routeId: hikes.routeId,
        estimatedDurationH: routes.estimatedDurationH,
      })
      .from(hikes)
      .leftJoin(routes, eq(hikes.routeId, routes.id))
      .where(
        and(
          eq(hikes.userId, authUser.sub),
          eq(hikes.status, "completed")
        )
      )
      .orderBy(desc(hikes.startedAt))
      .limit(10);

    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
    const fatigueWindowStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const weeklyCompletedHikes = await db
      .select({
        id: hikes.id,
      })
      .from(hikes)
      .where(
        and(
          eq(hikes.userId, authUser.sub),
          eq(hikes.status, "completed"),
          gte(hikes.startedAt, sevenDaysAgo)
        )
      );

    const recentDistanceHikes = await db
      .select({
        distanceM: hikes.distanceM,
        startedAt: hikes.startedAt,
      })
      .from(hikes)
      .where(
        and(
          eq(hikes.userId, authUser.sub),
          eq(hikes.status, "completed"),
          gte(hikes.startedAt, fourWeeksAgo)
        )
      );

    const ninetyDayHikes: CompletedHikeRow[] = await db
      .select({
        distanceM: hikes.distanceM,
        elevationGainM: hikes.elevationGainM,
        startedAt: hikes.startedAt,
      })
      .from(hikes)
      .where(
        and(
          eq(hikes.userId, authUser.sub),
          eq(hikes.status, "completed"),
          gte(hikes.startedAt, ninetyDaysAgo)
        )
      );

    const yearlyCompletedHikes: CompletedHikeRow[] = await db
      .select({
        distanceM: hikes.distanceM,
        elevationGainM: hikes.elevationGainM,
        startedAt: hikes.startedAt,
      })
      .from(hikes)
      .where(
        and(
          eq(hikes.userId, authUser.sub),
          eq(hikes.status, "completed"),
          gte(hikes.startedAt, oneYearAgo)
        )
      );

    const [personalRecordsRow] = await db
      .select({
        longestM: max(hikes.distanceM),
        biggestElevationM: max(hikes.elevationGainM),
        fastestPaceMinKm: min(hikes.avgPaceMinKm),
      })
      .from(hikes)
      .where(and(eq(hikes.userId, authUser.sub), eq(hikes.status, 'completed')));

    const personalRecords = {
      longestKm: personalRecordsRow?.longestM != null ? Number((personalRecordsRow.longestM / 1000).toFixed(1)) : 0,
      biggestElevationM: personalRecordsRow?.biggestElevationM ?? 0,
      fastestPaceMinKm: personalRecordsRow?.fastestPaceMinKm != null ? Number(personalRecordsRow.fastestPaceMinKm.toFixed(2)) : null,
    };

    const recentLoad = computeRecentLoad(ninetyDayHikes, now);
    const fitnessLevelDetail = computeFitnessLevelDetail(ninetyDayHikes as CompletedHikeRow[], now);
    const monthComparison = computeMonthComparison(ninetyDayHikes as CompletedHikeRow[], now);
    const streakWeeks = computeWeeklyStreak(yearlyCompletedHikes, now);

    const ratioValues = completedHikes
      .filter(
        (hike) =>
          hike.routeId != null &&
          hike.durationS != null &&
          hike.estimatedDurationH != null &&
          hike.estimatedDurationH > 0
      )
      .map((hike) => ((hike.durationS ?? 0) / 3600) / (hike.estimatedDurationH ?? 1));

    const recentPaceValues = completedHikes
      .slice(0, 3)
      .map((hike) => hike.avgPaceMinKm)
      .filter((pace): pace is number => pace != null);

    const priorPaceValues = completedHikes
      .slice(3, 10)
      .map((hike) => hike.avgPaceMinKm)
      .filter((pace): pace is number => pace != null);

    const recentPaceAverage = mean(recentPaceValues);
    const priorPaceAverage = mean(priorPaceValues);

    let paceTrend: "improving" | "stable" | "declining" = "stable";

    if (recentPaceAverage != null && priorPaceAverage != null && priorPaceAverage > 0) {
      if (recentPaceAverage <= priorPaceAverage * 0.95) {
        paceTrend = "improving";
      } else if (recentPaceAverage >= priorPaceAverage * 1.05) {
        paceTrend = "declining";
      }
    }

    const weeklyDistances = [0, 0, 0, 0];

    for (const hike of recentDistanceHikes) {
      const ageMs = now.getTime() - hike.startedAt.getTime();

      if (ageMs < 0 || ageMs >= 28 * 24 * 60 * 60 * 1000) {
        continue;
      }

      const bucketIndex = 3 - Math.floor(ageMs / (7 * 24 * 60 * 60 * 1000));
      if (bucketIndex >= 0 && bucketIndex < weeklyDistances.length) {
        weeklyDistances[bucketIndex] =
          (weeklyDistances[bucketIndex] ?? 0) + (hike.distanceM ?? 0) / 1000;
      }
    }

    const fatigueWindowHikes = recentDistanceHikes.filter(
      (hike) => hike.startedAt.getTime() > fatigueWindowStart.getTime()
    );
    const fatigueDistanceKm = fatigueWindowHikes.reduce(
      (sum, hike) => sum + ((hike.distanceM ?? 0) / 1000),
      0
    );
    const recentHikeDays = new Set(
      fatigueWindowHikes.map((hike) => hike.startedAt.toISOString().slice(0, 10))
    );
    let restDays = 0;

    for (let dayOffset = 1; dayOffset <= 3; dayOffset += 1) {
      const day = new Date(now);
      day.setUTCHours(0, 0, 0, 0);
      day.setUTCDate(day.getUTCDate() - dayOffset);

      if (!recentHikeDays.has(day.toISOString().slice(0, 10))) {
        restDays += 1;
      }
    }

    const mostRecentHike = completedHikes[0];
    const avgActualVsEstimatedRatio = mean(ratioValues);
    const avgPaceImprovement =
      avgActualVsEstimatedRatio != null
        ? Number(((1 - avgActualVsEstimatedRatio) * 100).toFixed(1))
        : 0;

    return c.json({
      weeklyDistances: weeklyDistances.map((distance) => Number(distance.toFixed(1))),
      avgPaceImprovement,
      currentFatigueLevel: getFatigueLevel(fatigueDistanceKm, restDays),
      fitnessLevel: fitnessLevelDetail.level,
      fitnessLevelScore: fitnessLevelDetail.score,
      fitnessLevelNextThreshold: fitnessLevelDetail.nextLevelScore,
      streakWeeks,
      personalRecords,
      monthComparison,
      last3DaysKm: recentLoad.last3DaysKm,
      last3DaysElevationM: recentLoad.last3DaysElevationM,
      last3DaysHikeCount: recentLoad.last3DaysHikeCount,
      last7DaysKm: recentLoad.last7DaysKm,
      last7DaysElevationM: recentLoad.last7DaysElevationM,
      last7DaysHikeCount: recentLoad.last7DaysHikeCount,
      last30DaysKm: recentLoad.last30DaysKm,
      last30DaysElevationM: recentLoad.last30DaysElevationM,
      last30DaysHikeCount: recentLoad.last30DaysHikeCount,
      avgActualVsEstimatedRatio,
      paceTrend,
      daysSinceLastHike: mostRecentHike?.startedAt
        ? Math.max(
            0,
            Math.floor(
              (now.getTime() - mostRecentHike.startedAt.getTime()) / (1000 * 60 * 60 * 24)
            )
          )
        : null,
      weeklyHikeCount: weeklyCompletedHikes.length,
      hikes: completedHikes,
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

profileRouter.get('/emergency-contact', async (c) => {
  try {
    const authUser = getAuthUser(c);
    if (!authUser) return c.json({ error: 'Unauthorized' }, 401);
    const [row] = await db
      .select({ name: users.emergencyContactName, phone: users.emergencyContactPhone })
      .from(users)
      .where(eq(users.id, authUser.sub))
      .limit(1);
    return c.json({ name: row?.name ?? null, phone: row?.phone ?? null });
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

profileRouter.put('/emergency-contact', async (c) => {
  try {
    const authUser = getAuthUser(c);
    if (!authUser) return c.json({ error: 'Unauthorized' }, 401);
    const body = await c.req.json();
    const schema = z.object({
      name: z.string().max(100),
      phone: z.string().max(30),
    });
    const parsed = schema.safeParse(body);
    if (!parsed.success) return c.json({ error: 'Invalid input' }, 400);
    await db.update(users)
      .set({ emergencyContactName: parsed.data.name, emergencyContactPhone: parsed.data.phone })
      .where(eq(users.id, authUser.sub));
    return c.json({ ok: true });
  } catch (error) {
    console.error(error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default profileRouter;

