import { and, count, desc, eq, gt, gte as gteOp, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { hikes } from "../schema/hikes";
import { riskAssessments } from "../schema/riskAssessments";
import { routes } from "../schema/routes";
import { trailConditions } from "../schema/trailConditions";
import { users } from "../schema/users";
import { userProfiles } from "../schema/userProfiles";
import {
  resolveTrustedCondition,
  type ConditionReport,
} from "../utils/conditionTrust";
import {
  computeFitnessLevel,
  computeRecentLoad,
  type CompletedHikeRow,
} from "../utils/fitness";
import { getAuthUser } from "../utils/getAuthUser";
import { notifyUser } from "../utils/notifyUser";
import { calculateRisk } from "../utils/riskEngine";
import {
  fetchDaylight,
  fetchForecastWindows,
  fetchHourlyWeather,
  fetchPrecipitationHistory,
} from "../utils/weather";
import { describeWeatherCode } from "../utils/weatherCode";

const riskAssessmentsRouter = new Hono();

const createRiskAssessmentSchema = z.object({
  routeId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  backpackWeightKg: z.number().min(0).max(60).optional(),
  soloHiker: z.boolean().optional(),
});

type WeatherSnapshot = {
  sunrise: string | null;
  sunset: string | null;
  precipitationProbability: number | null;
  windspeedKmh: number | null;
  temperatureC: number | null;
  humidityPercent: number | null;
  uvIndex: number | null;
  weatherCode: number | null;
};

type FatigueAssessment = {
  score: number;
  level: "rested" | "mild" | "moderate" | "high";
  totalDistanceKm: number;
  restDays: number;
  description: string;
};

type WeatherWindow = {
  startTime: string;
  score: number;
  summary: string;
  tempC: number;
  precipPct: number;
  windKmh: number;
};

const weatherWindowsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

function getUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function countRecentRestDays(
  hikeDates: Array<Date | null | undefined>,
  referenceDate: Date
): number {
  const activeDays = new Set(
    hikeDates
      .filter((date): date is Date => date instanceof Date)
      .map((date) => getUtcDateKey(date))
  );

  const anchor = new Date(referenceDate);
  anchor.setUTCHours(0, 0, 0, 0);

  let restDays = 0;

  for (let dayOffset = 1; dayOffset <= 3; dayOffset += 1) {
    const day = new Date(anchor);
    day.setUTCDate(anchor.getUTCDate() - dayOffset);

    if (!activeDays.has(getUtcDateKey(day))) {
      restDays += 1;
    }
  }

  return restDays;
}

function assessFatigue(
  totalDistanceKm: number,
  restDays: number
): FatigueAssessment {
  let baseScore = 0;
  let level: FatigueAssessment["level"] = "rested";

  if (totalDistanceKm >= 50) {
    baseScore = 0.35;
    level = "high";
  } else if (totalDistanceKm >= 30) {
    baseScore = 0.2;
    level = "moderate";
  } else if (totalDistanceKm >= 15) {
    baseScore = 0.1;
    level = "mild";
  }

  const score = Number((baseScore * Math.pow(0.75, restDays)).toFixed(3));
  const fatigueLabel =
    level === "high"
      ? "oboseală ridicată"
      : level === "moderate"
        ? "oboseală moderată"
        : level === "mild"
          ? "oboseală ușoară"
          : "odihnit";
  const restSuffix =
    restDays > 0
      ? ` după ${restDays} ${restDays === 1 ? "zi completă" : "zile complete"} de odihnă`
      : "";

  return {
    score,
    level,
    totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
    restDays,
    description:
      level === "rested"
        ? `Ai parcurs ${totalDistanceKm.toFixed(1)}km în ultimele 3 zile${restSuffix} - odihnit`
        : `Ai parcurs ${totalDistanceKm.toFixed(1)}km în ultimele 3 zile${restSuffix} - ${fatigueLabel}`,
  };
}

function deriveFitnessTrend(
  hikesData: Array<{
    durationS: number | null;
    routeEstimatedDurationH: number | null;
  }>
): "improving" | "stable" | "declining" {
  const ratios = hikesData
    .filter(
      (
        hike
      ): hike is {
        durationS: number;
        routeEstimatedDurationH: number;
      } => hike.durationS != null && hike.routeEstimatedDurationH != null && hike.routeEstimatedDurationH > 0
    )
    .map((hike) => hike.durationS / 3600 / hike.routeEstimatedDurationH);

  if (ratios.length < 3) {
    return "stable";
  }

  const recent = ratios.slice(0, 2);
  const older = ratios.slice(2);

  if (older.length === 0) {
    return "stable";
  }

  const recentAvg = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const olderAvg = older.reduce((sum, value) => sum + value, 0) / older.length;

  if (recentAvg < olderAvg * 0.92) {
    return "improving";
  }

  if (recentAvg > olderAvg * 1.1) {
    return "declining";
  }

  return "stable";
}

function clampScore(score: number): number {
  return Math.max(0, Math.round(score));
}

function scoreForecastHour(hour: {
  time: string;
  temperatureC: number;
  precipitationProbability: number;
  windspeedKmh: number;
  weatherCode: number;
}): number {
  let score = 100;

  if (hour.precipitationProbability > 50) {
    score -= 30;
  } else if (hour.precipitationProbability > 30) {
    score -= 20;
  }

  if (hour.windspeedKmh > 30) {
    score -= 15;
  } else if (hour.windspeedKmh > 20) {
    score -= 10;
  }

  if (hour.weatherCode >= 61) {
    score -= 20;
  }

  if (hour.temperatureC < 5 || hour.temperatureC > 32) {
    score -= 15;
  }

  const localHour = Number(hour.time.slice(11, 13));
  if (localHour < 7 || localHour > 18) {
    score -= 10;
  }

  return clampScore(score);
}

function capitalizeDescription(text: string): string {
  return text
    .split(" ")
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function describeWindSummary(windKmh: number): string {
  if (windKmh <= 15) {
    return "vânt slab";
  }

  if (windKmh <= 30) {
    return "vânt moderat";
  }

  return "vânt puternic";
}

function buildWeatherWindowSummary(
  weatherCode: number,
  temperatureC: number,
  windKmh: number
): string {
  const condition = capitalizeDescription(describeWeatherCode(weatherCode));
  return `${condition}, ${Math.round(temperatureC)}Â°C, ${describeWindSummary(windKmh)}`;
}

function toWindowStartTime(time: string): string {
  return new Date(time).toISOString();
}

function buildWeatherWindowSummarySafe(
  weatherCode: number,
  temperatureC: number,
  windKmh: number
): string {
  const condition = capitalizeDescription(describeWeatherCode(weatherCode));
  return `${condition}, ${Math.round(temperatureC)}\u00B0C, ${describeWindSummary(windKmh)}`;
}

riskAssessmentsRouter.get("/weather-windows", async (c) => {
  try {
    const parsed = weatherWindowsQuerySchema.safeParse(c.req.query());

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid query",
          details: parsed.error.flatten(),
        },
        400
      );
    }

    const { lat, lon } = parsed.data;
    const forecast = await fetchForecastWindows(lat, lon);
    const hourCount = Math.min(
      72,
      forecast.time.length,
      forecast.temperature_2m.length,
      forecast.precipitation_probability.length,
      forecast.windspeed_10m.length,
      forecast.weathercode.length
    );

    const hourlyScores: Array<{
      time: string;
      temperatureC: number;
      precipitationProbability: number;
      windspeedKmh: number;
      weatherCode: number;
      score: number;
    }> = [];

    for (let index = 0; index < hourCount; index += 1) {
      const time = forecast.time[index];

      if (typeof time !== "string") {
        continue;
      }

      const hour = {
        time,
        temperatureC: forecast.temperature_2m[index] ?? 0,
        precipitationProbability: forecast.precipitation_probability[index] ?? 0,
        windspeedKmh: forecast.windspeed_10m[index] ?? 0,
        weatherCode: forecast.weathercode[index] ?? 0,
      };

      hourlyScores.push({
        ...hour,
        score: scoreForecastHour(hour),
      });
    }

    const windows: WeatherWindow[] = [];

    for (let index = 0; index + 2 < hourlyScores.length; index += 3) {
      const chunk = hourlyScores.slice(index, index + 3);
      const firstHour = chunk[0];

      if (!firstHour) {
        continue;
      }

      const avgTemp =
        chunk.reduce((sum, hour) => sum + hour.temperatureC, 0) / chunk.length;
      const maxPrecip = Math.max(...chunk.map((hour) => hour.precipitationProbability));
      const maxWind = Math.max(...chunk.map((hour) => hour.windspeedKmh));
      const windowScore = Math.min(...chunk.map((hour) => hour.score));
      const representativeWeatherCode = firstHour.weatherCode;

      if (windowScore >= 60) {
        windows.push({
          startTime: toWindowStartTime(firstHour.time),
          score: windowScore,
          summary: `${capitalizeDescription(
            describeWeatherCode(representativeWeatherCode)
          )}, ${Math.round(avgTemp)}C, ${describeWindSummary(maxWind)}`,
          tempC: Math.round(avgTemp),
          precipPct: Math.round(maxPrecip),
          windKmh: Math.round(maxWind),
        });
      }
    }

    const rankedWindows = windows
      .sort((a, b) => b.score - a.score || a.startTime.localeCompare(b.startTime))
      .slice(0, 5);

    return c.json({
      windows: rankedWindows,
      bestWindow: rankedWindows[0] ?? null,
      currentScore: hourlyScores[0]?.score ?? 0,
    });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

riskAssessmentsRouter.post("/", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const body = await c.req.json();
    const parsed = createRiskAssessmentSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        {
          error: "Invalid input",
          details: parsed.error.flatten(),
        },
        400
      );
    }

    const { routeId, startDate, startTime, backpackWeightKg, soloHiker } = parsed.data;
    const startDateAsDate = new Date(`${startDate}T00:00:00.000Z`);
    const forecastDaysOut = Math.floor(
      (startDateAsDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    );

    const foundRoutes = await db
      .select({
        id: routes.id,
        distanceKm: routes.distanceKm,
        elevationGainM: routes.elevationGainM,
        estimatedDurationH: routes.estimatedDurationH,
        isolationScore: routes.isolationScore,
        difficulty: routes.difficulty,
        startLatitude: routes.startLatitude,
        startLongitude: routes.startLongitude,
        maxElevationM: routes.maxElevationM,
        surfaceType: routes.surfaceType,
      })
      .from(routes)
      .where(eq(routes.id, routeId))
      .limit(1);

    const route = foundRoutes[0];

    if (!route) {
      return c.json({ error: "Route not found" }, 404);
    }

    const profiles = await db
      .select({
        heightCm: userProfiles.heightCm,
        weightKg: userProfiles.weightKg,
        age: userProfiles.age,
        experienceLevel: userProfiles.experienceLevel,
        hikesSoloUsually: userProfiles.hikesSoloUsually,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, authUser.sub))
      .limit(1);

    const userRows = await db
      .select({ emergencyContactPhone: users.emergencyContactPhone })
      .from(users)
      .where(eq(users.id, authUser.sub))
      .limit(1);
    const hasEmergencyContact = !!(userRows[0]?.emergencyContactPhone);

    const completedHikes = await db
      .select({
        distanceM: hikes.distanceM,
        elevationGainM: hikes.elevationGainM,
        durationS: hikes.durationS,
        avgPaceMinKm: hikes.avgPaceMinKm,
      })
      .from(hikes)
      .where(
        and(
          eq(hikes.userId, authUser.sub),
          eq(hikes.status, "completed")
        )
      )
      .orderBy(desc(hikes.startedAt))
      .limit(20);

    const recentCompletedHikes = await db
      .select({
        durationS: hikes.durationS,
        routeEstimatedDurationH: routes.estimatedDurationH,
        startedAt: hikes.startedAt,
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
      .limit(5);

    const ratedHikes = await db
      .select({
        userDifficultyRating: hikes.userDifficultyRating,
        difficulty: routes.difficulty,
      })
      .from(hikes)
      .leftJoin(routes, eq(hikes.routeId, routes.id))
      .where(
        and(eq(hikes.userId, authUser.sub), eq(hikes.status, "completed"))
      )
      .orderBy(desc(hikes.startedAt))
      .limit(15);

    const PERCEIVED_DIFFICULTY_BASELINE: Record<string, number> = {
      easy: 1.5,
      moderate: 2.5,
      hard: 3.5,
      expert: 4.5,
    };
    const ratingGaps = ratedHikes
      .map((ratedHike) => {
        const baseline = ratedHike.difficulty
          ? PERCEIVED_DIFFICULTY_BASELINE[ratedHike.difficulty.toLowerCase()]
          : undefined;
        if (baseline === undefined || ratedHike.userDifficultyRating == null) {
          return null;
        }
        return ratedHike.userDifficultyRating - baseline;
      })
      .filter((gap): gap is number => gap !== null);
    const perceivedDifficultyBias =
      ratingGaps.length >= 3
        ? ratingGaps.reduce((sum, gap) => sum + gap, 0) / ratingGaps.length
        : null;

    const fatigueWindowStart = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const fitnessWindowStart = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const trailConditionWindowStart = new Date(Date.now() - 75 * 24 * 60 * 60 * 1000);
    const routeMonthlyWindowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentLoadHikes = await db
      .select({
        distanceM: hikes.distanceM,
        endedAt: hikes.endedAt,
        startedAt: hikes.startedAt,
      })
      .from(hikes)
      .where(
        and(
          eq(hikes.userId, authUser.sub),
          eq(hikes.status, "completed"),
          gt(hikes.endedAt, fatigueWindowStart)
        )
      )
      .orderBy(desc(hikes.endedAt));

    const ninetyDayCompletedHikes: CompletedHikeRow[] = await db
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
          gteOp(hikes.startedAt, fitnessWindowStart)
        )
      );

    const recentLoad = computeRecentLoad(ninetyDayCompletedHikes);
    const profile = profiles[0];
    const fitnessLevel = computeFitnessLevel(ninetyDayCompletedHikes);

  const allTimeCompletedResult = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(hikes)
    .where(and(eq(hikes.userId, authUser.sub), eq(hikes.status, 'completed')));
  const allTimeCompletedCount = allTimeCompletedResult[0]?.cnt ?? 0;

  const FITNESS_TO_EXPERIENCE: Record<string, string> = {
    Sedentary: 'beginner',
    Casual: 'beginner',
    Active: 'intermediate',
    Athletic: 'advanced',
    Elite: 'expert',
  };

  const effectiveExperienceLevel =
    allTimeCompletedCount >= 5 && fitnessLevel
      ? (FITNESS_TO_EXPERIENCE[fitnessLevel] ?? profile?.experienceLevel ?? null)
      : (profile?.experienceLevel ?? null);

    const trailConditionRows = await db
      .select({
        id: trailConditions.id,
        condition: trailConditions.condition,
        reportedAt: trailConditions.reportedAt,
        isTrailVerified: trailConditions.isTrailVerified,
        isSuppressed: trailConditions.isSuppressed,
      })
      .from(trailConditions)
      .where(
        and(
          eq(trailConditions.routeId, routeId),
          gteOp(trailConditions.reportedAt, trailConditionWindowStart)
        )
      )
      .orderBy(desc(trailConditions.reportedAt));

    const priorHikesOnRoute = await db
      .select({
        status: hikes.status,
        completionScore: hikes.completionScore,
      })
      .from(hikes)
      .where(
        and(
          eq(hikes.userId, authUser.sub),
          eq(hikes.routeId, routeId)
        )
      );

    const priorCompletionsOnRoute = priorHikesOnRoute.filter(
      (hike) => hike.status === "completed"
    ).length;
    const priorPartialsOnRoute = priorHikesOnRoute.filter(
      (hike) => hike.status === "partial" && (hike.completionScore ?? 0) >= 40
    ).length;

    const routeMonthlyHikeCountRow = await db
      .select({
        value: count(),
      })
      .from(hikes)
      .where(
        and(
          eq(hikes.routeId, routeId),
          eq(hikes.status, "completed"),
          gteOp(hikes.endedAt, routeMonthlyWindowStart)
        )
      );
    const routeMonthlyHikeCount = Number(routeMonthlyHikeCountRow[0]?.value ?? 0);

    const recentHighAltitudeHike = await db
      .select({
        endedAt: hikes.endedAt,
      })
      .from(hikes)
      .innerJoin(routes, eq(hikes.routeId, routes.id))
      .where(
        and(
          eq(hikes.userId, authUser.sub),
          eq(hikes.status, "completed"),
          gt(routes.maxElevationM, 1499)
        )
      )
      .orderBy(desc(hikes.endedAt))
      .limit(1);

    const highAltitudeEndedAt = recentHighAltitudeHike[0]?.endedAt ?? null;
    const daysSinceLastHighAltitudeHike = highAltitudeEndedAt
      ? Math.max(
          0,
          Math.floor((Date.now() - highAltitudeEndedAt.getTime()) / (1000 * 60 * 60 * 24))
        )
      : null;

    const condReports: ConditionReport[] = trailConditionRows.flatMap((row) => {
      if (
        row.reportedAt == null ||
        !(
          row.condition === "dry" ||
          row.condition === "muddy" ||
          row.condition === "snowy" ||
          row.condition === "overgrown" ||
          row.condition === "blocked"
        )
      ) {
        return [];
      }

      return [
        {
          id: row.id,
          condition: row.condition,
          reportedAt: row.reportedAt,
          isTrailVerified: row.isTrailVerified,
          isSuppressed: row.isSuppressed,
        },
      ];
    });

    const trustedCondition = resolveTrustedCondition(
      condReports,
      route.startLatitude,
      route.startLongitude,
      route.maxElevationM ?? 0
    );

    const priorAssessment = await db
      .select({
        id: riskAssessments.id,
        score: riskAssessments.score,
        createdAt: riskAssessments.createdAt,
      })
      .from(riskAssessments)
      .where(
        and(
          eq(riskAssessments.userId, authUser.sub),
          eq(riskAssessments.routeId, routeId)
        )
      )
      .orderBy(desc(riskAssessments.createdAt))
      .limit(1);

    const completedCount = completedHikes.length;
    const fitnessTrend = deriveFitnessTrend(recentCompletedHikes);
    const hikesWithPace = completedHikes.filter(h => h.avgPaceMinKm != null);
    const userAvgPaceMinKm = hikesWithPace.length > 0
      ? hikesWithPace.reduce((sum, h) => sum + (h.avgPaceMinKm ?? 0), 0) / hikesWithPace.length
      : null;
    const hikesWithElevation = completedHikes.filter(h => h.elevationGainM != null);
    const userAvgElevationGainM = hikesWithElevation.length > 0
      ? hikesWithElevation.reduce((sum, h) => sum + (h.elevationGainM ?? 0), 0) / hikesWithElevation.length
      : null;
    const hikesWithDistance = completedHikes.filter(h => h.distanceM != null);
    const userAvgDistanceKm = hikesWithDistance.length > 0
      ? hikesWithDistance.reduce((sum, h) => sum + ((h.distanceM ?? 0) / 1000), 0) / hikesWithDistance.length
      : null;
    const hikesWithEstimatedDuration = recentCompletedHikes.filter(
      (h) => h.durationS != null && h.routeEstimatedDurationH != null && h.routeEstimatedDurationH > 0
    );
    const userAvgActualVsEstimatedRatio = hikesWithEstimatedDuration.length > 0
      ? hikesWithEstimatedDuration.reduce(
          (sum, h) => sum + ((h.durationS ?? 0) / 3600) / (h.routeEstimatedDurationH ?? 1),
          0
        ) / hikesWithEstimatedDuration.length
      : null;
    const lastCompletedHike = recentCompletedHikes[0];
    const userLastHikeDaysAgo = lastCompletedHike?.startedAt
      ? Math.max(
          0,
          Math.floor(
            (new Date(`${startDate}T00:00:00`).getTime() - lastCompletedHike.startedAt.getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : null;
    const fatigueDistanceKm = recentLoadHikes.reduce(
      (sum, hike) => sum + ((hike.distanceM ?? 0) / 1000),
      0
    );
    const fatigueRestDays = countRecentRestDays(
      recentLoadHikes.map((hike) => hike.endedAt ?? hike.startedAt),
      new Date()
    );
    const fatigue = assessFatigue(fatigueDistanceKm, fatigueRestDays);

    let sunrise: string | null = null;
    let sunset: string | null = null;
    let precipitationProbability: number | null = null;
    let windspeedKmh: number | null = null;
    let temperatureC: number | null = null;
    let humidityPercent: number | null = null;
    let uvIndex: number | null = null;
    let weatherCode: number | null = null;
    let precipitationLast7DaysMm: number | null = null;

    try {
      const daylight = await fetchDaylight(route.startLatitude, route.startLongitude, startDate);
      sunrise = daylight.sunrise;
      sunset = daylight.sunset;
    } catch (error) {
      console.error(error);
    }

    try {
      const weather = await fetchHourlyWeather(
        route.startLatitude,
        route.startLongitude,
        startDate,
        startTime
      );
      precipitationProbability = weather.precipitationProbability;
      windspeedKmh = weather.windspeedKmh;
      temperatureC = weather.temperatureC;
      humidityPercent = weather.humidityPercent;
      uvIndex = weather.uvIndex;
      weatherCode = weather.weatherCode;
    } catch (error) {
      console.error(error);
    }

    try {
      precipitationLast7DaysMm = await fetchPrecipitationHistory(
        route.startLatitude,
        route.startLongitude,
        startDate
      );
    } catch (error) {
      console.error(error);
    }

    const result = calculateRisk({
      distanceKm: route.distanceKm,
      elevationGainM: route.elevationGainM,
      estimatedDurationH: route.estimatedDurationH,
      backpackWeightKg: backpackWeightKg ?? 0,
      startTime,
      soloHiker: soloHiker ?? null,
      experienceLevel: effectiveExperienceLevel,
      routeDifficulty: route.difficulty ?? null,
      isolationScore: route.isolationScore ?? null,
      maxAltitudeM: route.maxElevationM ?? null,
      surfaceType: route.surfaceType ?? null,
      userLastHikeDaysAgo,
      userAvgActualVsEstimatedRatio,
      precipitationLast7DaysMm,
      humidityPercent,
      userHeightCm: profile?.heightCm ?? null,
      userWeightKg: profile?.weightKg ?? null,
      userAge: profile?.age ?? null,
      recentLoad3DaysKm: recentLoad.last3DaysKm,
      recentLoad3DaysElevationM: recentLoad.last3DaysElevationM,
      recentLoad7DaysKm: recentLoad.last7DaysKm,
      recentLoad7DaysElevationM: recentLoad.last7DaysElevationM,
      recentLoad7DaysHikeCount: recentLoad.last7DaysHikeCount,
      recentLoad30DaysKm: recentLoad.last30DaysKm,
      recentLoad30DaysHikeCount: recentLoad.last30DaysHikeCount,
      fitnessLevel,
      now: new Date(startDate + "T00:00:00.000Z"),
      sunriseTime: sunrise,
      sunsetTime: sunset,
      precipitationProbability,
      windspeedKmh,
      temperatureC,
      uvIndex,
      weatherCode,
      userCompletedHikesCount: completedCount,
      perceivedDifficultyBias,
      userAvgPaceMinKm,
      userAvgElevationGainM,
      userAvgDistanceKm,
      fatigueScore: fatigue.score,
      fatigueDescription: fatigue.description,
      fatigueLevel: fatigue.level,
      trailConditionReport: trustedCondition
        ? {
            condition: trustedCondition.condition,
            reportedAt: new Date(
              Date.now() - trustedCondition.daysOld * 24 * 60 * 60 * 1000
            ).toISOString(),
            isTrailVerified: trustedCondition.isTrailVerified,
            riskPoints: trustedCondition.riskPoints,
            label: trustedCondition.label,
          }
        : null,
      forecastDaysOut: Math.max(0, forecastDaysOut),
      fitnessTrend,
      priorCompletionsOnRoute,
      priorPartialsOnRoute,
      routeMonthlyHikeCount,
      hasEmergencyContact,
      daysSinceLastHighAltitudeHike,
      routeIsExposed:
        (route.maxElevationM ?? 0) > 1200 || (route.isolationScore ?? 0) > 0.5,
      groupSize: soloHiker ? 1 : 2,
    });

    if (result.level === "High" || result.level === "Very High") {
      notifyUser(
        "âš ï¸ High Risk Hike Planned",
        `Score: ${result.score}/100 (${result.level}) â€” ${route.difficulty ?? "unknown"} route, ${route.distanceKm?.toFixed(1) ?? "?"}km`,
        result.level === "Very High" ? "urgent" : "high"
      ).catch(() => {});
    }

    const weatherData: WeatherSnapshot = {
      sunrise,
      sunset,
      precipitationProbability,
      windspeedKmh,
      temperatureC,
      humidityPercent,
      uvIndex,
      weatherCode,
    };

    const inserted = await db
      .insert(riskAssessments)
      .values({
        userId: authUser.sub,
        routeId,
        startDate,
        startTime,
        backpackWeightKg,
        score: result.score,
        level: result.level,
        weatherData,
        factors: result.factors,
        subScores: result.subScores,
        counterfactuals: result.counterfactuals,
      })
      .returning({
        id: riskAssessments.id,
        score: riskAssessments.score,
        level: riskAssessments.level,
      });

    const assessment = inserted[0];
    const priorAssessmentRecord = priorAssessment[0];
    const scoreDelta = priorAssessmentRecord ? result.score - priorAssessmentRecord.score : null;
    const priorAssessmentDate = priorAssessmentRecord?.createdAt?.toISOString() ?? null;

    if (!assessment) {
      throw new Error("Failed to create risk assessment");
    }

    return c.json(
      {
        assessment: {
          id: assessment.id,
          score: assessment.score,
          level: assessment.level,
          factors: result.factors,
          subScores: result.subScores,
          dataCompleteness: result.dataCompleteness,
          confidence: result.confidence,
          scoreDelta,
          priorAssessmentDate,
          trailCondition: trustedCondition,
          counterfactuals: result.counterfactuals,
          weather: {
            ...weatherData,
            weatherDescription:
              weatherCode !== null ? describeWeatherCode(weatherCode) : "Necunoscut",
          },
          daylight: {
            sunrise,
            sunset,
          },
          routeContext: {
            isolationScore: route.isolationScore,
            difficulty: route.difficulty,
            precipitationLast7DaysMm,
          },
        },
      },
      201
    );
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default riskAssessmentsRouter;
