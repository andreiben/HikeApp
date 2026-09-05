import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "../src/db";
import { routes } from "../src/schema/routes";
import { calculateRisk, type RiskInput, type RiskResult } from "../src/utils/riskEngine";

type Level = RiskResult["level"];
type NumericRiskKey =
  | "distanceKm"
  | "elevationGainM"
  | "estimatedDurationH"
  | "backpackWeightKg"
  | "maxAltitudeM"
  | "windspeedKmh"
  | "precipitationProbability"
  | "uvIndex"
  | "temperatureC"
  | "userAge"
  | "userCompletedHikesCount";

type DominanceResult = {
  input: string;
  minValue: number;
  maxValue: number;
  minScore: number;
  maxScore: number;
  leverage: number;
};

type MonotonicityViolation = {
  input: string;
  direction: "increasing" | "decreasing";
  fromValue: number;
  toValue: number;
  fromScore: number;
  toScore: number;
};

type ThresholdFlip = {
  input: string;
  fromValue: number;
  toValue: number;
  fromScore: number;
  toScore: number;
  scoreDelta: number;
  fromLevel: Level;
  toLevel: Level;
  reason: string;
};

type FactorFrequency = {
  label: string;
  fireCount: number;
  meanValue: number;
};

type DistributionRow = {
  scenario: string;
  routeCount: number;
  meanScore: number;
  Low: number;
  Moderate: number;
  High: number;
  "Very High": number;
};

type SynergyCheck = {
  name: string;
  triggered: boolean;
  synergyFactors: string[];
};

type SmoothnessDelta = {
  input: string;
  fromValue: number;
  toValue: number;
  fromScore: number;
  toScore: number;
  scoreDelta: number;
};

type BackpackPersonaRow = {
  persona: string;
  score0kg: number;
  score20kg: number;
  delta: number;
  sweep: string;
};

type RouteScoreRow = {
  routeId: string;
  routeName: string;
  score: number;
  level: Level;
};

type BandChangeRow = {
  routeId: string;
  routeName: string;
  v1Score: number;
  v2Score: number;
  delta: number;
  v1Level: Level;
  v2Level: Level;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(scriptDir, "..");
const levels: Level[] = ["Low", "Moderate", "High", "Very High"];

const baseline: RiskInput = {
  distanceKm: 12,
  elevationGainM: 600,
  estimatedDurationH: 5,
  backpackWeightKg: 8,
  startTime: "09:00",
  maxAltitudeM: 1400,
  temperatureC: 15,
  windspeedKmh: 15,
  precipitationProbability: 10,
  uvIndex: 4,
  weatherCode: 1,
  humidityPercent: 55,
  experienceLevel: "intermediate",
  userCompletedHikesCount: 10,
  sunsetTime: "20:00",
  routeDifficulty: "moderate",
  surfaceType: "dirt",
  now: new Date("2025-07-15T09:00:00"),
  userAge: 35,
  soloHiker: false,
  isolationScore: 0.3,
  userLastHikeDaysAgo: 7,
  userAvgActualVsEstimatedRatio: 1,
  precipitationLast7DaysMm: 0,
  userHeightCm: 175,
  userWeightKg: 75,
  recentLoad3DaysKm: 8,
  recentLoad3DaysElevationM: 300,
  recentLoad7DaysKm: 18,
  recentLoad7DaysElevationM: 700,
  recentLoad7DaysHikeCount: 2,
  recentLoad30DaysKm: 55,
  recentLoad30DaysHikeCount: 6,
  fitnessLevel: "Active",
  sunriseTime: "05:45",
  userAvgPaceMinKm: 30,
  userAvgElevationGainM: 700,
  userAvgDistanceKm: 12,
  fatigueScore: 0,
  fatigueDescription: null,
  fatigueLevel: "rested",
  trailConditionReport: null,
  forecastDaysOut: 1,
  fitnessTrend: "stable",
  priorCompletionsOnRoute: 0,
  priorPartialsOnRoute: 0,
  routeMonthlyHikeCount: 6,
  hasEmergencyContact: true,
  daysSinceLastHighAltitudeHike: 30,
  routeIsExposed: false,
  groupSize: 2,
};

const dominanceFields: Array<{ field: NumericRiskKey; min: number; max: number; steps: number }> = [
  { field: "distanceKm", min: 2, max: 30, steps: 10 },
  { field: "elevationGainM", min: 100, max: 2000, steps: 10 },
  { field: "estimatedDurationH", min: 1, max: 12, steps: 10 },
  { field: "backpackWeightKg", min: 0, max: 25, steps: 10 },
  { field: "maxAltitudeM", min: 500, max: 3500, steps: 10 },
  { field: "windspeedKmh", min: 0, max: 80, steps: 10 },
  { field: "precipitationProbability", min: 0, max: 100, steps: 10 },
  { field: "uvIndex", min: 0, max: 11, steps: 10 },
  { field: "temperatureC", min: -10, max: 40, steps: 10 },
  { field: "userAge", min: 18, max: 75, steps: 10 },
];

const monotonicIncreasingFields: Array<{ field: NumericRiskKey; min: number; max: number; steps: number }> = [
  { field: "distanceKm", min: 2, max: 30, steps: 15 },
  { field: "elevationGainM", min: 100, max: 2000, steps: 15 },
  { field: "backpackWeightKg", min: 0, max: 25, steps: 15 },
  { field: "windspeedKmh", min: 0, max: 80, steps: 15 },
  { field: "precipitationProbability", min: 0, max: 100, steps: 15 },
  { field: "maxAltitudeM", min: 500, max: 3500, steps: 15 },
  { field: "uvIndex", min: 0, max: 11, steps: 15 },
];

const monotonicDecreasingFields: Array<{ field: NumericRiskKey; min: number; max: number; steps: number }> = [
  { field: "userCompletedHikesCount", min: 0, max: 40, steps: 15 },
];

const synergyCases: Array<{ name: string; overrides: Partial<RiskInput> }> = [
  {
    name: "Combined effect solo plus bad weather plus demanding route multiplies total risk x1.8",
    overrides: { soloHiker: true, precipitationProbability: 60, distanceKm: 12 },
  },
  {
    name: "Combined effect inexperienced hiker on alpine terrain above 2000m x2.0",
    overrides: { experienceLevel: "beginner", routeDifficulty: "hard", maxAltitudeM: 2200 },
  },
  {
    name: "Combined effect finishing near dark on a remote trail x1.5",
    overrides: { startTime: "16:30", estimatedDurationH: 3.25, sunsetTime: "20:00", isolationScore: 0.7 },
  },
  {
    name: "Combined effect recent heavy rain on isolated trail without partner x1.5",
    overrides: { precipitationLast7DaysMm: 45, soloHiker: true, isolationScore: 0.6 },
  },
  {
    name: "High fatigue plus solo plus remote trail",
    overrides: {
      fatigueScore: 0.8,
      fatigueDescription: "Heavy recent activity load",
      fatigueLevel: "high",
      soloHiker: true,
      isolationScore: 0.7,
    },
  },
  {
    name: "Blocked or snowy trail plus beginner plus solo hiking",
    overrides: {
      experienceLevel: "beginner",
      soloHiker: true,
      trailConditionReport: {
        condition: "blocked",
        reportedAt: "2025-07-10T10:00:00.000Z",
        isTrailVerified: true,
        riskPoints: 30,
        label: "Blocked by debris",
      },
    },
  },
  {
    name: "Late start plus historically slow pace plus long route",
    overrides: { startTime: "12:30", userAvgActualVsEstimatedRatio: 1.25, distanceKm: 16 },
  },
  {
    name: "High altitude plus no recent high altitude hike plus bad weather",
    overrides: { maxAltitudeM: 2200, daysSinceLastHighAltitudeHike: 90, precipitationProbability: 75 },
  },
  {
    name: "Fitness trend declining plus very long route plus heavy pack",
    overrides: { fitnessTrend: "declining", distanceKm: 20, backpackWeightKg: 12 },
  },
  {
    name: "Combined effect thunderstorm plus route above 2000m x2.2",
    overrides: { weatherCode: 95, maxAltitudeM: 2200 },
  },
  {
    name: "Spring plus very high altitude plus beginner is extremely high risk",
    overrides: { now: new Date("2025-03-15T09:00:00"), maxAltitudeM: 2200, experienceLevel: "beginner" },
  },
  {
    name: "Winter high-altitude routes carry extreme combined risk",
    overrides: { now: new Date("2025-01-15T09:00:00"), maxAltitudeM: 1900 },
  },
];

function withOverrides(overrides: Partial<RiskInput>): RiskInput {
  return { ...baseline, ...overrides };
}

function scoreFor(overrides: Partial<RiskInput>): RiskResult {
  return calculateRisk(withOverrides(overrides));
}

function linspace(min: number, max: number, steps: number): number[] {
  if (steps <= 1) {
    return [min];
  }

  const values: number[] = [];
  const step = (max - min) / (steps - 1);

  for (let i = 0; i < steps; i += 1) {
    values.push(Number((min + step * i).toFixed(4)));
  }

  return values;
}

function rangeInclusive(min: number, max: number, step: number): number[] {
  const values: number[] = [];

  for (let value = min; value <= max + step / 1000; value += step) {
    values.push(Number(value.toFixed(4)));
  }

  return values;
}

function scoreAt(field: NumericRiskKey, value: number): RiskResult {
  return scoreFor({ [field]: value } as Partial<RiskInput>);
}

function round(value: number, digits = 2): number {
  return Number(value.toFixed(digits));
}

function levelCounts(): Record<Level, number> {
  return { Low: 0, Moderate: 0, High: 0, "Very High": 0 };
}

function analyzeDominance(): DominanceResult[] {
  return dominanceFields
    .map(({ field, min, max, steps }) => {
      const results = linspace(min, max, steps).map((value) => ({
        value,
        score: scoreAt(field, value).score,
      }));
      const minResult = results.reduce((best, current) => (current.score < best.score ? current : best));
      const maxResult = results.reduce((best, current) => (current.score > best.score ? current : best));

      return {
        input: field,
        minValue: minResult.value,
        maxValue: maxResult.value,
        minScore: minResult.score,
        maxScore: maxResult.score,
        leverage: maxResult.score - minResult.score,
      };
    })
    .sort((left, right) => right.leverage - left.leverage || left.input.localeCompare(right.input));
}

function analyzeMonotonicity(): MonotonicityViolation[] {
  const violations: MonotonicityViolation[] = [];

  for (const { field, min, max, steps } of monotonicIncreasingFields) {
    const values = linspace(min, max, steps);
    const results = values.map((value) => ({ value, score: scoreAt(field, value).score }));

    for (let i = 1; i < results.length; i += 1) {
      const previous = results[i - 1];
      const current = results[i];

      if (previous && current && current.score < previous.score) {
        violations.push({
          input: field,
          direction: "increasing",
          fromValue: previous.value,
          toValue: current.value,
          fromScore: previous.score,
          toScore: current.score,
        });
      }
    }
  }

  for (const { field, min, max, steps } of monotonicDecreasingFields) {
    const values = linspace(min, max, steps);
    const results = values.map((value) => ({ value, score: scoreAt(field, value).score }));

    for (let i = 1; i < results.length; i += 1) {
      const previous = results[i - 1];
      const current = results[i];

      if (previous && current && current.score > previous.score) {
        violations.push({
          input: field,
          direction: "decreasing",
          fromValue: previous.value,
          toValue: current.value,
          fromScore: previous.score,
          toScore: current.score,
        });
      }
    }
  }

  return violations;
}

function scanThresholdFlips(field: NumericRiskKey, values: number[]): ThresholdFlip[] {
  const flips: ThresholdFlip[] = [];
  const results = values.map((value) => {
    const result = scoreAt(field, value);
    return { value, score: result.score, level: result.level };
  });

  for (let i = 1; i < results.length; i += 1) {
    const previous = results[i - 1];
    const current = results[i];

    if (!previous || !current) {
      continue;
    }

    const delta = current.score - previous.score;
    const jump = Math.abs(delta) > 8;
    const levelChange = previous.level !== current.level;

    if (jump || levelChange) {
      flips.push({
        input: field,
        fromValue: previous.value,
        toValue: current.value,
        fromScore: previous.score,
        toScore: current.score,
        scoreDelta: delta,
        fromLevel: previous.level,
        toLevel: current.level,
        reason: [jump ? "score jump > 8" : null, levelChange ? "level band changed" : null]
          .filter(Boolean)
          .join("; "),
      });
    }
  }

  return flips;
}

function analyzeThresholdFlips(): ThresholdFlip[] {
  return [
    ...scanThresholdFlips("distanceKm", rangeInclusive(2, 30, 1)),
    ...scanThresholdFlips("elevationGainM", rangeInclusive(100, 2000, 25)),
  ];
}

function normalizeDifficulty(value: string | null | undefined): RiskInput["routeDifficulty"] {
  if (value === "easy" || value === "moderate" || value === "hard" || value === "expert") {
    return value;
  }

  return baseline.routeDifficulty;
}

type RouteRow = Awaited<ReturnType<typeof loadRoutes>>[number];

async function loadRoutes() {
  return db.select().from(routes);
}

function inputForRoute(route: RouteRow, overrides: Partial<RiskInput> = {}): RiskInput {
  return withOverrides({
    distanceKm: Number.isFinite(route.distanceKm) ? route.distanceKm : baseline.distanceKm,
    elevationGainM: Number.isFinite(route.elevationGainM) ? route.elevationGainM : baseline.elevationGainM,
    estimatedDurationH: Number.isFinite(route.estimatedDurationH)
      ? route.estimatedDurationH
      : baseline.estimatedDurationH,
    maxAltitudeM: route.maxElevationM ?? baseline.maxAltitudeM,
    routeDifficulty: normalizeDifficulty(route.difficulty),
    surfaceType: route.surfaceType ?? baseline.surfaceType,
    isolationScore: route.isolationScore ?? baseline.isolationScore,
    ...overrides,
  });
}

function analyzeFactorFrequency(routeRows: RouteRow[], knownLabels: Set<string>) {
  const tallies = new Map<string, { fireCount: number; totalValue: number }>();

  for (const route of routeRows) {
    const result = calculateRisk(inputForRoute(route));

    for (const factor of result.factors) {
      const current = tallies.get(factor.label) ?? { fireCount: 0, totalValue: 0 };
      current.fireCount += 1;
      current.totalValue += factor.value;
      tallies.set(factor.label, current);
      knownLabels.add(factor.label);
    }
  }

  const factors: FactorFrequency[] = [...tallies.entries()]
    .map(([label, tally]) => ({
      label,
      fireCount: tally.fireCount,
      meanValue: round(tally.totalValue / tally.fireCount, 2),
    }))
    .sort((left, right) => right.fireCount - left.fireCount || left.label.localeCompare(right.label));

  const deadLabels = [...knownLabels].filter((label) => !tallies.has(label)).sort();

  return {
    routeCount: routeRows.length,
    factors,
    deadLabels,
  };
}

function analyzeDistribution(routeRows: RouteRow[]): DistributionRow[] {
  const scenarios: Array<{ name: string; overrides: Partial<RiskInput> }> = [
    { name: "clear-summer", overrides: {} },
    { name: "rainy", overrides: { precipitationProbability: 80, weatherCode: 65 } },
    {
      name: "winter",
      overrides: { now: new Date("2025-01-15T09:00:00"), temperatureC: -5, weatherCode: 73 },
    },
  ];

  return scenarios.map(({ name, overrides }) => {
    const counts = levelCounts();
    let totalScore = 0;

    for (const route of routeRows) {
      const result = calculateRisk(inputForRoute(route, overrides));
      counts[result.level] += 1;
      totalScore += result.score;
    }

    return {
      scenario: name,
      routeCount: routeRows.length,
      meanScore: routeRows.length > 0 ? round(totalScore / routeRows.length, 2) : 0,
      Low: counts.Low,
      Moderate: counts.Moderate,
      High: counts.High,
      "Very High": counts["Very High"],
    };
  });
}

function analyzeSynergy(): SynergyCheck[] {
  return synergyCases.map(({ name, overrides }) => {
    const result = scoreFor(overrides);
    const synergyFactors = result.factors
      .filter((factor) => factor.category === "synergy")
      .map((factor) => factor.description);

    return {
      name,
      triggered: synergyFactors.includes(name),
      synergyFactors,
    };
  });
}

function analyzeSmoothnessSweeps(): SmoothnessDelta[] {
  const sweeps: Array<{ field: NumericRiskKey; values: number[] }> = [
    { field: "distanceKm", values: rangeInclusive(2, 30, 0.5) },
    { field: "elevationGainM", values: rangeInclusive(100, 2000, 25) },
    { field: "backpackWeightKg", values: rangeInclusive(0, 20, 1) },
  ];
  const deltas: SmoothnessDelta[] = [];

  for (const { field, values } of sweeps) {
    const results = values.map((value) => ({ value, score: scoreAt(field, value).score }));

    for (let i = 1; i < results.length; i += 1) {
      const previous = results[i - 1];
      const current = results[i];

      if (!previous || !current) {
        continue;
      }

      const scoreDelta = current.score - previous.score;

      if (Math.abs(scoreDelta) > 4) {
        deltas.push({
          input: field,
          fromValue: previous.value,
          toValue: current.value,
          fromScore: previous.score,
          toScore: current.score,
          scoreDelta,
        });
      }
    }
  }

  return deltas;
}

function analyzeBackpackPersonas(): BackpackPersonaRow[] {
  const personas: Array<{ name: string; overrides: Partial<RiskInput> }> = [
    {
      name: "beginner-casual",
      overrides: {
        experienceLevel: "beginner",
        fitnessLevel: "Casual",
        userCompletedHikesCount: 1,
        userWeightKg: 70,
      },
    },
    {
      name: "intermediate-active",
      overrides: {
        experienceLevel: "intermediate",
        fitnessLevel: "Active",
        userCompletedHikesCount: 8,
        userWeightKg: 75,
      },
    },
    {
      name: "advanced-athletic",
      overrides: {
        experienceLevel: "advanced",
        fitnessLevel: "Athletic",
        userCompletedHikesCount: 20,
        userWeightKg: 78,
      },
    },
    {
      name: "expert-elite",
      overrides: {
        experienceLevel: "expert",
        fitnessLevel: "Elite",
        userCompletedHikesCount: 35,
        userWeightKg: 80,
      },
    },
  ];

  return personas.map(({ name, overrides }) => {
    const sweep = rangeInclusive(0, 20, 5).map((weight) => ({
      weight,
      score: scoreFor({ ...overrides, backpackWeightKg: weight }).score,
    }));
    const score0kg = sweep[0]?.score ?? scoreFor({ ...overrides, backpackWeightKg: 0 }).score;
    const score20kg =
      sweep[sweep.length - 1]?.score ?? scoreFor({ ...overrides, backpackWeightKg: 20 }).score;

    return {
      persona: name,
      score0kg,
      score20kg,
      delta: score20kg - score0kg,
      sweep: sweep.map((row) => `${row.weight}kg=${row.score}`).join(", "),
    };
  });
}

function routeScoreRow(route: RouteRow, result: RiskResult): RouteScoreRow {
  const routeRecord = route as Record<string, unknown>;

  return {
    routeId: String(routeRecord.id),
    routeName: String(routeRecord.name ?? routeRecord.id),
    score: result.score,
    level: result.level,
  };
}

function analyzeRouteScores(routeRows: RouteRow[]): RouteScoreRow[] {
  return routeRows.map((route) => routeScoreRow(route, calculateRisk(inputForRoute(route))));
}

function isLevel(value: unknown): value is Level {
  return (
    value === "Low" ||
    value === "Moderate" ||
    value === "High" ||
    value === "Very High"
  );
}

function normalizeRouteScoreRows(value: unknown): RouteScoreRow[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((row) => {
    if (!row || typeof row !== "object") {
      return [];
    }

    const record = row as Record<string, unknown>;
    const routeId = record.routeId ?? record.id;
    const routeName = record.routeName ?? record.name ?? routeId;
    const score = record.score;
    const level = record.level;

    if (typeof routeId !== "string" || typeof score !== "number" || !isLevel(level)) {
      return [];
    }

    return [
      {
        routeId,
        routeName: String(routeName ?? routeId),
        score,
        level,
      },
    ];
  });
}

async function loadV1RouteScores(): Promise<{
  source: string | null;
  rows: RouteScoreRow[];
  error: string | null;
}> {
  const candidates = [
    resolve(backendDir, "v1.json"),
    resolve(backendDir, "risk-engine-evaluation.v1.json"),
  ];

  for (const candidate of candidates) {
    try {
      const raw = await readFile(candidate, "utf8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const analyses =
        parsed.analyses && typeof parsed.analyses === "object"
          ? (parsed.analyses as Record<string, unknown>)
          : {};
      const rows = normalizeRouteScoreRows(
        analyses.routeScores ?? parsed.routeScores ?? analyses.routes
      );

      return {
        source: candidate,
        rows,
        error: rows.length === 0 ? "v1 file found but no route score rows were present" : null,
      };
    } catch (error: unknown) {
      const code =
        error && typeof error === "object" && "code" in error
          ? String((error as { code?: unknown }).code)
          : "";

      if (code !== "ENOENT") {
        return {
          source: candidate,
          rows: [],
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        };
      }
    }
  }

  return { source: null, rows: [], error: "No v1.json comparison file found" };
}

function analyzeBandChanges(
  routeScores: RouteScoreRow[],
  v1RouteScores: RouteScoreRow[]
): BandChangeRow[] {
  const previousByRouteId = new Map(v1RouteScores.map((row) => [row.routeId, row]));
  const changes: BandChangeRow[] = [];

  for (const routeScore of routeScores) {
    const previous = previousByRouteId.get(routeScore.routeId);

    if (!previous || previous.level === routeScore.level) {
      continue;
    }

    changes.push({
      routeId: routeScore.routeId,
      routeName: routeScore.routeName,
      v1Score: previous.score,
      v2Score: routeScore.score,
      delta: routeScore.score - previous.score,
      v1Level: previous.level,
      v2Level: routeScore.level,
    });
  }

  return changes.sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
}

function discoverKnownFactorLabels(): Set<string> {
  const labels = new Set<string>();
  const cases: Array<Partial<RiskInput>> = [
    {},
    { precipitationProbability: 100, weatherCode: 95, windspeedKmh: 70, uvIndex: 11, temperatureC: -10 },
    { temperatureC: 38, humidityPercent: 80, uvIndex: 9 },
    { weatherCode: 73, now: new Date("2025-01-15T09:00:00"), maxAltitudeM: 2200 },
    { weatherCode: 80, precipitationProbability: 10 },
    { surfaceType: "rocky", precipitationProbability: 70 },
    { surfaceType: "mixed", precipitationProbability: 70 },
    { experienceLevel: "beginner", routeDifficulty: "expert", maxAltitudeM: 2600 },
    { experienceLevel: "advanced", routeDifficulty: "expert" },
    { isolationScore: 0.9, soloHiker: true },
    { userLastHikeDaysAgo: 45 },
    { userAvgActualVsEstimatedRatio: 1.4 },
    { precipitationLast7DaysMm: 60 },
    { userAge: 72 },
    { userAge: 66, maxAltitudeM: 1900, estimatedDurationH: 6 },
    { userHeightCm: 170, userWeightKg: 105, elevationGainM: 900 },
    { userHeightCm: 180, userWeightKg: 58 },
    { recentLoad3DaysKm: 55, recentLoad7DaysKm: 85, recentLoad7DaysHikeCount: 5, recentLoad30DaysKm: 170 },
    { recentLoad30DaysHikeCount: 0, elevationGainM: 700 },
    { fitnessLevel: "Athletic", elevationGainM: 1100 },
    { fitnessLevel: "Elite", elevationGainM: 900 },
    { now: new Date("2025-03-15T09:00:00"), maxAltitudeM: 2300 },
    { now: new Date("2025-05-20T09:00:00"), maxAltitudeM: 2300 },
    { now: new Date("2025-10-20T09:00:00"), maxAltitudeM: 1900 },
    { userCompletedHikesCount: 2, elevationGainM: 700 },
    { userAvgPaceMinKm: 45, distanceKm: 12, estimatedDurationH: 4 },
    { userAvgElevationGainM: 300, elevationGainM: 800 },
    { userCompletedHikesCount: 35 },
    { groupSize: 4 },
    { experienceLevel: "expert", routeDifficulty: "easy" },
    { fitnessTrend: "declining" },
    { fitnessTrend: "improving" },
    { priorCompletionsOnRoute: 3 },
    { priorCompletionsOnRoute: 1 },
    { priorPartialsOnRoute: 1 },
    { routeMonthlyHikeCount: 1 },
    { routeMonthlyHikeCount: 15 },
    { soloHiker: true, isolationScore: 0.8, hasEmergencyContact: false },
    { forecastDaysOut: 5 },
    {
      trailConditionReport: {
        condition: "dry",
        reportedAt: "2025-07-10T10:00:00.000Z",
        isTrailVerified: true,
        riskPoints: -4,
        label: "Dry trail",
      },
    },
    {
      trailConditionReport: {
        condition: "muddy",
        reportedAt: "2025-07-10T10:00:00.000Z",
        isTrailVerified: false,
        riskPoints: 8,
        label: "Muddy trail",
      },
    },
    {
      trailConditionReport: {
        condition: "snowy",
        reportedAt: "2025-07-10T10:00:00.000Z",
        isTrailVerified: true,
        riskPoints: 16,
        label: "Snowy trail",
      },
    },
    {
      trailConditionReport: {
        condition: "overgrown",
        reportedAt: "2025-07-10T10:00:00.000Z",
        isTrailVerified: false,
        riskPoints: 8,
        label: "Overgrown trail",
      },
    },
    {
      trailConditionReport: {
        condition: "blocked",
        reportedAt: "2024-01-01T10:00:00.000Z",
        isTrailVerified: true,
        riskPoints: 30,
        label: "Blocked trail",
      },
    },
    ...synergyCases.map((synergyCase) => synergyCase.overrides),
    {
      distanceKm: 25,
      elevationGainM: 1800,
      estimatedDurationH: 10,
      backpackWeightKg: 20,
      maxAltitudeM: 3200,
      soloHiker: true,
      isolationScore: 0.9,
      precipitationProbability: 90,
      weatherCode: 95,
      windspeedKmh: 60,
      temperatureC: -8,
      uvIndex: 11,
      experienceLevel: "beginner",
      routeDifficulty: "expert",
      surfaceType: "rocky",
      userLastHikeDaysAgo: 50,
      userAvgActualVsEstimatedRatio: 1.4,
      precipitationLast7DaysMm: 70,
      fatigueScore: 0.9,
      fatigueDescription: "High fatigue",
      fatigueLevel: "high",
      fitnessTrend: "declining",
      hasEmergencyContact: false,
      daysSinceLastHighAltitudeHike: 120,
      routeIsExposed: true,
    },
  ];

  for (const input of cases) {
    for (const factor of scoreFor(input).factors) {
      labels.add(factor.label);
    }
  }

  return labels;
}

function escapeCell(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ").replace(/\|/g, "\\|");
  }

  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function markdownTable(headers: string[], rows: unknown[][]): string {
  if (rows.length === 0) {
    return "_No rows._";
  }

  return [
    `| ${headers.map(escapeCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ].join("\n");
}

function renderMarkdown(input: {
  baselineResult: RiskResult;
  dominance: DominanceResult[];
  monotonicity: MonotonicityViolation[];
  thresholdFlips: ThresholdFlip[];
  factorFrequency: ReturnType<typeof analyzeFactorFrequency>;
  distribution: DistributionRow[];
  synergy: SynergyCheck[];
  smoothnessSweeps: SmoothnessDelta[];
  backpackPersonas: BackpackPersonaRow[];
  bandChanges: BandChangeRow[];
  v1ComparisonSource: string | null;
  v1ComparisonError: string | null;
  routeLoadError: string | null;
}): string {
  const thresholdRows = input.thresholdFlips.map((flip) => [
    flip.input,
    flip.fromValue,
    flip.toValue,
    flip.fromScore,
    flip.toScore,
    flip.scoreDelta,
    `${flip.fromLevel} -> ${flip.toLevel}`,
    flip.reason,
  ]);
  const factorRows = input.factorFrequency.factors.map((factor) => [
    factor.label,
    factor.fireCount,
    factor.meanValue,
  ]);
  const deadRows = input.factorFrequency.deadLabels.map((label) => [label]);
  const smoothnessRows = input.smoothnessSweeps.map((row) => [
    row.input,
    row.fromValue,
    row.toValue,
    row.fromScore,
    row.toScore,
    row.scoreDelta,
  ]);
  const backpackPersonaRows = input.backpackPersonas.map((row) => [
    row.persona,
    row.score0kg,
    row.score20kg,
    row.delta,
    row.sweep,
  ]);
  const bandChangeRows = input.bandChanges.map((row) => [
    row.routeName,
    row.v1Score,
    row.v2Score,
    row.delta,
    `${row.v1Level} -> ${row.v2Level}`,
    row.routeId,
  ]);

  return [
    "# Risk Engine Evaluation",
    "",
    `Baseline headline score: ${input.baselineResult.score} (${input.baselineResult.level}). Data completeness: ${input.baselineResult.dataCompleteness.overall}.`,
    "",
    "## Analysis 1 - Factor dominance",
    "",
    markdownTable(
      ["Input", "Min value at score", "Max value at score", "Min score", "Max score", "Leverage"],
      input.dominance.map((row) => [
        row.input,
        row.minValue,
        row.maxValue,
        row.minScore,
        row.maxScore,
        row.leverage,
      ])
    ),
    "",
    `Interpretation: ${input.dominance[0]?.input ?? "No input"} has the largest isolated score leverage in this baseline sweep.`,
    "",
    "## Analysis 2 - Monotonicity checks",
    "",
    markdownTable(
      ["Input", "Expected direction", "From value", "To value", "From score", "To score"],
      input.monotonicity.map((row) => [
        row.input,
        row.direction,
        row.fromValue,
        row.toValue,
        row.fromScore,
        row.toScore,
      ])
    ),
    "",
    `Interpretation: ${input.monotonicity.length === 0 ? "No monotonicity violations were found." : `${input.monotonicity.length} adjacent-step violations were found.`}`,
    "estimatedDurationH is intentionally excluded because it is a derived route property (Tobler estimate) and the engine models a deliberate pace-vs-intensity tradeoff, so a naive 'longer = riskier' monotonic expectation does not apply to it.",
    "",
    "## Analysis 3 - Threshold-flip detection",
    "",
    markdownTable(
      ["Input", "From", "To", "From score", "To score", "Delta", "Level", "Reason"],
      thresholdRows
    ),
    "",
    `Interpretation: ${input.thresholdFlips.length} adjacent threshold flips or large score jumps were detected.`,
    "",
    "## Analysis 4 - Factor frequency and contribution over real routes",
    "",
    `Routes analyzed: ${input.factorFrequency.routeCount}.`,
    input.routeLoadError ? `Route load error: ${input.routeLoadError}` : "",
    "",
    markdownTable(["Factor label", "Fire count", "Mean value"], factorRows),
    "",
    "Dead labels over this route set:",
    "",
    markdownTable(["Factor label with fire count 0"], deadRows),
    "",
    `Interpretation: ${factorRows[0]?.[0] ?? "No factor"} is the most frequent factor over the loaded routes; ${input.factorFrequency.deadLabels.length} known labels did not fire.`,
    "",
    "## Analysis 5 - Score distribution over real routes",
    "",
    markdownTable(
      ["Scenario", "Routes", "Mean score", "Low", "Moderate", "High", "Very High"],
      input.distribution.map((row) => [
        row.scenario,
        row.routeCount,
        row.meanScore,
        row.Low,
        row.Moderate,
        row.High,
        row["Very High"],
      ])
    ),
    "",
    "Interpretation: Weather scenarios show how the same route population shifts across risk bands.",
    "",
    "## Analysis 6 - Synergy coverage",
    "",
    markdownTable(
      ["Synergy", "Triggered", "Synergy factors fired"],
      input.synergy.map((row) => [row.name, row.triggered ? "yes" : "no", row.synergyFactors])
    ),
    "",
    `Interpretation: ${input.synergy.filter((row) => row.triggered).length} of ${input.synergy.length} targeted synergies triggered their expected factor.`,
    "",
    "## Analysis 7 - Smooth distance, elevation, and backpack sweeps",
    "",
    markdownTable(
      ["Input", "From", "To", "From score", "To score", "Delta"],
      smoothnessRows
    ),
    "",
    `Interpretation: ${input.smoothnessSweeps.length === 0 ? "No adjacent sweep score deltas above 4 were detected." : `${input.smoothnessSweeps.length} adjacent sweep score deltas above 4 were detected.`}`,
    "",
    "## Analysis 8 - Backpack persona sweep",
    "",
    markdownTable(
      ["Persona", "Score @ 0kg", "Score @ 20kg", "Delta", "Sweep"],
      backpackPersonaRows
    ),
    "",
    "Interpretation: Backpack load should matter more for less experienced or less fit hikers than for expert fit hikers.",
    "",
    "## Analysis 9 - v1 band comparison",
    "",
    input.v1ComparisonSource ? `v1 source: ${input.v1ComparisonSource}` : "",
    input.v1ComparisonError ? `Comparison note: ${input.v1ComparisonError}` : "",
    "",
    markdownTable(
      ["Route", "v1 score", "v2 score", "Delta", "Band", "Route ID"],
      bandChangeRows
    ),
    "",
    `Interpretation: ${input.bandChanges.length} routes changed risk band compared with v1 route scores.`,
    "",
  ].join("\n");
}

async function main() {
  let routeRows: RouteRow[] = [];
  let routeLoadError: string | null = null;

  try {
    routeRows = await loadRoutes();
  } catch (error: unknown) {
    routeLoadError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }

  const baselineResult = calculateRisk(baseline);
  const dominance = analyzeDominance();
  const monotonicity = analyzeMonotonicity();
  const thresholdFlips = analyzeThresholdFlips();
  const knownLabels = discoverKnownFactorLabels();
  const factorFrequency = analyzeFactorFrequency(routeRows, knownLabels);
  const distribution = analyzeDistribution(routeRows);
  const synergy = analyzeSynergy();
  const smoothnessSweeps = analyzeSmoothnessSweeps();
  const backpackPersonas = analyzeBackpackPersonas();
  const routeScores = analyzeRouteScores(routeRows);
  const v1Comparison = await loadV1RouteScores();
  const bandChanges = analyzeBandChanges(routeScores, v1Comparison.rows);

  const dump = {
    baseline,
    baselineResult,
    analyses: {
      dominance,
      monotonicity: {
        violations: monotonicity,
      },
      thresholdFlips,
      factorFrequency,
      routeLoadError,
      distribution,
      synergy,
      smoothnessSweeps,
      backpackPersonas,
      routeScores,
      v1Comparison: {
        source: v1Comparison.source,
        error: v1Comparison.error,
      },
      bandChanges,
    },
  };

  await writeFile(
    resolve(backendDir, "risk-engine-evaluation.json"),
    `${JSON.stringify(dump, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    resolve(backendDir, "risk-engine-evaluation.md"),
    renderMarkdown({
      baselineResult,
      dominance,
      monotonicity,
      thresholdFlips,
      factorFrequency,
      distribution,
      synergy,
      smoothnessSweeps,
      backpackPersonas,
      bandChanges,
      v1ComparisonSource: v1Comparison.source,
      v1ComparisonError: v1Comparison.error,
      routeLoadError,
    }),
    "utf8"
  );

  const distanceFlips = thresholdFlips.filter((flip) => flip.input === "distanceKm").length;
  const elevationFlips = thresholdFlips.filter((flip) => flip.input === "elevationGainM").length;
  const distributionSummary = distribution
    .map((row) => `${row.scenario}: mean ${row.meanScore}, VH ${row["Very High"]}`)
    .join("; ");
  const synergyTriggered = synergy.filter((row) => row.triggered).length;
  const worstSmoothnessDelta = smoothnessSweeps.reduce(
    (max, row) => Math.max(max, Math.abs(row.scoreDelta)),
    0
  );
  const backpackPersonaSummary = backpackPersonas
    .map((row) => `${row.persona}: ${row.delta}`)
    .join("; ");

  console.log(
    `Analysis 1: top leverage ${dominance[0]?.input ?? "none"} (${dominance[0]?.leverage ?? 0} points).`
  );
  console.log(`Analysis 2: ${monotonicity.length} monotonicity violations.`);
  console.log(`Analysis 3: ${thresholdFlips.length} flips (${distanceFlips} distance, ${elevationFlips} elevation).`);
  console.log(
    `Analysis 4: ${factorFrequency.routeCount} routes, ${factorFrequency.factors.length} labels fired, ${factorFrequency.deadLabels.length} dead labels${routeLoadError ? " (route load failed)" : ""}.`
  );
  console.log(`Analysis 5: ${distributionSummary}.`);
  console.log(`Analysis 6: ${synergyTriggered}/${synergy.length} targeted synergies triggered.`);
  console.log(
    `Analysis 7: ${smoothnessSweeps.length} adjacent deltas >4; worst delta ${worstSmoothnessDelta}.`
  );
  console.log(`Analysis 8: backpack deltas ${backpackPersonaSummary}.`);
  console.log(
    `Analysis 9: ${bandChanges.length} band-changed routes${v1Comparison.error ? ` (${v1Comparison.error})` : ""}.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
