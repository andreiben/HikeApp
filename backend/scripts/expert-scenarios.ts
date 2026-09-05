import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { calculateRisk, type RiskInput } from "../src/utils/riskEngine";

type ExpectedLevel = "Low" | "Moderate" | "High" | "Very High";

type ExpertScenario = {
  id: string;
  name: string;
  massif: string;
  season: string;
  justification: string;
  expectedLevel: ExpectedLevel;
  input: RiskInput;
};

type ScenarioResult = {
  id: string;
  name: string;
  massif: string;
  season: string;
  expectedLevel: ExpectedLevel;
  actualLevel: ExpectedLevel;
  actualScore: number;
  pass: boolean;
  justification: string;
  synergyFactors: string[];
  topFactors: Array<{ text: string; value: number }>;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendDir = resolve(scriptDir, "..");
const levels: ExpectedLevel[] = ["Low", "Moderate", "High", "Very High"];

const baseInput: RiskInput = {
  distanceKm: 10,
  elevationGainM: 500,
  estimatedDurationH: 4,
  backpackWeightKg: 5,
  startTime: "08:00",
  soloHiker: false,
  experienceLevel: "intermediate",
  routeDifficulty: "moderate",
  isolationScore: 0.3,
  maxAltitudeM: 1200,
  surfaceType: "dirt",
  userLastHikeDaysAgo: 5,
  userAvgActualVsEstimatedRatio: 1,
  precipitationLast7DaysMm: 5,
  humidityPercent: 50,
  userHeightCm: 175,
  userWeightKg: 75,
  userAge: 32,
  recentLoad3DaysKm: 0,
  recentLoad3DaysElevationM: 0,
  recentLoad7DaysKm: 12,
  recentLoad7DaysElevationM: 400,
  recentLoad7DaysHikeCount: 1,
  recentLoad30DaysKm: 40,
  recentLoad30DaysHikeCount: 4,
  fitnessLevel: "Active",
  now: new Date("2025-07-15T08:00:00"),
  sunriseTime: "05:45",
  sunsetTime: "20:30",
  precipitationProbability: 5,
  windspeedKmh: 10,
  temperatureC: 16,
  uvIndex: 4,
  weatherCode: 1,
  userCompletedHikesCount: 15,
  perceivedDifficultyBias: 0,
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
  routeMonthlyHikeCount: 8,
  hasEmergencyContact: true,
  daysSinceLastHighAltitudeHike: 14,
  routeIsExposed: false,
  groupSize: 2,
};

const snowyTrailReport: NonNullable<RiskInput["trailConditionReport"]> = {
  condition: "snowy",
  reportedAt: "2025-01-13T08:00:00.000Z",
  isTrailVerified: true,
  riskPoints: 16,
  label: "Recent verified snowy trail report",
};

const scenarios: ExpertScenario[] = [
  {
    id: "S01",
    name: "Short easy walk",
    massif: "Generic",
    season: "Summer",
    justification: "Short easy low-altitude walk with good weather and an experienced hiker.",
    expectedLevel: "Low",
    input: {
      ...baseInput,
      distanceKm: 5,
      elevationGainM: 150,
      estimatedDurationH: 2,
      routeDifficulty: "easy",
      experienceLevel: "advanced",
      maxAltitudeM: 800,
      userCompletedHikesCount: 30,
    },
  },
  {
    id: "S02",
    name: "Moderate summer hike Bucegi",
    massif: "Bucegi",
    season: "Summer",
    justification: "Normal summer Bucegi hike with moderate terrain and no material weather hazards.",
    expectedLevel: "Low",
    input: {
      ...baseInput,
      distanceKm: 9,
      elevationGainM: 450,
      estimatedDurationH: 4,
      maxAltitudeM: 1400,
    },
  },
  {
    id: "S03",
    name: "Experienced group popular trail",
    massif: "Retezat",
    season: "Summer",
    justification: "Experienced group, previous route familiarity, and high trail traffic reduce risk.",
    expectedLevel: "Low",
    input: {
      ...baseInput,
      experienceLevel: "advanced",
      groupSize: 4,
      priorCompletionsOnRoute: 2,
      routeMonthlyHikeCount: 20,
      userCompletedHikesCount: 35,
    },
  },
  {
    id: "S04",
    name: "Moderate autumn hike",
    massif: "Piatra Craiului",
    season: "Autumn",
    justification: "Autumn weather uncertainty and moderate rain chance should lift risk into the middle band.",
    expectedLevel: "Moderate",
    input: {
      ...baseInput,
      now: new Date("2025-10-10T08:00:00"),
      distanceKm: 11,
      elevationGainM: 550,
      precipitationProbability: 40,
      weatherCode: 61,
      routeMonthlyHikeCount: 2,
      uvIndex: 6,
    },
  },
  {
    id: "S05",
    name: "Solo moderate terrain",
    massif: "Bucegi",
    season: "Summer",
    justification: "Solo travel on a less-trafficked moderate trail reduces margin for error.",
    expectedLevel: "Moderate",
    input: {
      ...baseInput,
      soloHiker: true,
      groupSize: 1,
      isolationScore: 0.5,
      routeMonthlyHikeCount: 2,
      windspeedKmh: 30,
    },
  },
  {
    id: "S06",
    name: "Heavy backpack long day",
    massif: "Retezat",
    season: "Summer",
    justification: "Longer distance, meaningful climbing, and a heavy pack create metabolic strain without severe hazards.",
    expectedLevel: "Moderate",
    input: {
      ...baseInput,
      backpackWeightKg: 18,
      distanceKm: 16,
      elevationGainM: 800,
      estimatedDurationH: 7,
    },
  },
  {
    id: "S07",
    name: "Beginner easy trail",
    massif: "Generic",
    season: "Summer",
    justification: "The trail is easy, but low experience and limited recent history warrant caution.",
    expectedLevel: "Moderate",
    input: {
      ...baseInput,
      experienceLevel: "beginner",
      userCompletedHikesCount: 2,
      routeDifficulty: "easy",
      distanceKm: 7,
      elevationGainM: 350,
      estimatedDurationH: 7,
      userLastHikeDaysAgo: 20,
      routeMonthlyHikeCount: 2,
      precipitationProbability: 40,
      uvIndex: 6,
    },
  },
  {
    id: "S08",
    name: "Late start within sunset",
    massif: "Bucegi",
    season: "Summer",
    justification: "The plan still finishes before sunset, but a late start trims the daylight buffer.",
    expectedLevel: "Moderate",
    input: {
      ...baseInput,
      startTime: "14:00",
      estimatedDurationH: 5,
      routeMonthlyHikeCount: 2,
      precipitationProbability: 40,
    },
  },
  {
    id: "S09",
    name: "Rainy rocky surface",
    massif: "Fagaras",
    season: "Summer",
    justification: "Rain on rocky footing should trigger slippery-terrain conditions without becoming extreme.",
    expectedLevel: "Moderate",
    input: {
      ...baseInput,
      precipitationProbability: 65,
      weatherCode: 61,
      surfaceType: "rocky",
      routeMonthlyHikeCount: 2,
    },
  },
  {
    id: "S10",
    name: "Autumn above 1800m",
    massif: "Fagaras",
    season: "Autumn",
    justification: "Autumn above 1800m introduces first-snow risk while the route remains otherwise manageable.",
    expectedLevel: "Moderate",
    input: {
      ...baseInput,
      now: new Date("2025-10-10T08:00:00"),
      maxAltitudeM: 1900,
      elevationGainM: 600,
      routeMonthlyHikeCount: 2,
      windspeedKmh: 30,
    },
  },
  {
    id: "S11",
    name: "Long alpine day 2400m",
    massif: "Fagaras",
    season: "Summer",
    justification: "A long alpine objective at 2400m stacks distance, elevation, technical terrain, and isolation.",
    expectedLevel: "High",
    input: {
      ...baseInput,
      distanceKm: 18,
      elevationGainM: 1200,
      estimatedDurationH: 8,
      maxAltitudeM: 2400,
      experienceLevel: "advanced",
      routeDifficulty: "expert",
      backpackWeightKg: 10,
      surfaceType: "rocky",
      isolationScore: 0.65,
      routeMonthlyHikeCount: 2,
      precipitationProbability: 40,
      windspeedKmh: 30,
    },
  },
  {
    id: "S12",
    name: "Beginner hard trail",
    massif: "Bucegi",
    season: "Summer",
    justification: "Beginner experience on a hard, longer route should be treated as high-risk mismatch.",
    expectedLevel: "High",
    input: {
      ...baseInput,
      experienceLevel: "beginner",
      routeDifficulty: "hard",
      maxAltitudeM: 1800,
      userCompletedHikesCount: 3,
      elevationGainM: 600,
      estimatedDurationH: 7,
      routeMonthlyHikeCount: 2,
      distanceKm: 15,
      backpackWeightKg: 12,
      soloHiker: true,
      groupSize: 1,
      isolationScore: 0.65,
      windspeedKmh: 30,
      userAvgActualVsEstimatedRatio: 1.2,
      precipitationProbability: 40,
      uvIndex: 6,
    },
  },
  {
    id: "S13",
    name: "Solo bad weather demanding",
    massif: "Retezat",
    season: "Summer",
    justification: "Solo hiking plus rain on a demanding route should trigger compounding risk.",
    expectedLevel: "High",
    input: {
      ...baseInput,
      soloHiker: true,
      groupSize: 1,
      precipitationProbability: 60,
      distanceKm: 14,
      elevationGainM: 700,
      isolationScore: 0.65,
      routeMonthlyHikeCount: 2,
    },
  },
  {
    id: "S14",
    name: "Deconditioning long route",
    massif: "Generic",
    season: "Summer",
    justification: "No recent hikes and a demanding long route should expose deconditioning risk.",
    expectedLevel: "High",
    input: {
      ...baseInput,
      recentLoad30DaysHikeCount: 0,
      userLastHikeDaysAgo: 45,
      distanceKm: 16,
      elevationGainM: 1000,
      estimatedDurationH: 7,
      backpackWeightKg: 12,
      routeDifficulty: "expert",
      routeMonthlyHikeCount: 2,
      soloHiker: true,
      groupSize: 1,
      isolationScore: 0.65,
      uvIndex: 6,
    },
  },
  {
    id: "S15",
    name: "High altitude no acclimatization 2800m",
    massif: "Fagaras",
    season: "Summer",
    justification: "Very high altitude without recent altitude exposure should be high risk even in summer.",
    expectedLevel: "High",
    input: {
      ...baseInput,
      maxAltitudeM: 2800,
      daysSinceLastHighAltitudeHike: 90,
      elevationGainM: 1000,
      distanceKm: 12,
      estimatedDurationH: 7,
      routeDifficulty: "expert",
      isolationScore: 0.65,
      soloHiker: true,
      groupSize: 1,
      windspeedKmh: 30,
      routeMonthlyHikeCount: 2,
    },
  },
  {
    id: "S16",
    name: "Snowy trail beginner solo",
    massif: "Bucegi",
    season: "Winter",
    justification: "Snowy reported trail conditions, beginner status, and solo travel compound meaningfully.",
    expectedLevel: "High",
    input: {
      ...baseInput,
      trailConditionReport: snowyTrailReport,
      experienceLevel: "beginner",
      soloHiker: true,
      groupSize: 1,
      temperatureC: 2,
    },
  },
  {
    id: "S17",
    name: "Thunderstorm low altitude no exposed terrain",
    massif: "Generic",
    season: "Summer",
    justification: "Thunderstorm risk is serious even below alpine/exposed terrain thresholds.",
    expectedLevel: "High",
    input: {
      ...baseInput,
      weatherCode: 95,
      precipitationProbability: 70,
      windspeedKmh: 50,
      maxAltitudeM: 900,
      routeIsExposed: false,
      distanceKm: 15,
      estimatedDurationH: 7,
      uvIndex: 6,
    },
  },
  {
    id: "S18",
    name: "Declining fitness heavy load long",
    massif: "Retezat",
    season: "Summer",
    justification: "Declining fitness combined with very long distance and a heavy pack should be high risk.",
    expectedLevel: "High",
    input: {
      ...baseInput,
      fitnessTrend: "declining",
      distanceKm: 22,
      backpackWeightKg: 14,
      elevationGainM: 1000,
      estimatedDurationH: 8,
      routeDifficulty: "hard",
      isolationScore: 0.65,
    },
  },
  {
    id: "S19",
    name: "Winter above 1600m",
    massif: "Bucegi",
    season: "Winter",
    justification: "Winter above 1600m introduces cold, wind, snow, and short-day constraints.",
    expectedLevel: "High",
    input: {
      ...baseInput,
      now: new Date("2025-01-15T08:00:00"),
      maxAltitudeM: 1700,
      temperatureC: -3,
      windspeedKmh: 30,
      weatherCode: 73,
      sunsetTime: "16:30",
      surfaceType: "rocky",
    },
  },
  {
    id: "S20",
    name: "Early spring alpine intermediate 2200m",
    massif: "Fagaras",
    season: "Spring",
    justification: "Early spring alpine travel above 2000m remains snow-affected and weather-sensitive.",
    expectedLevel: "High",
    input: {
      ...baseInput,
      now: new Date("2025-03-20T08:00:00"),
      maxAltitudeM: 2200,
      distanceKm: 12,
      elevationGainM: 900,
      estimatedDurationH: 7,
      routeDifficulty: "hard",
      surfaceType: "rocky",
      precipitationProbability: 70,
      windspeedKmh: 50,
      isolationScore: 0.65,
      userLastHikeDaysAgo: 20,
      routeMonthlyHikeCount: 2,
    },
  },
  {
    id: "S21",
    name: "Thunderstorm alpine exposed terrain",
    massif: "Fagaras",
    season: "Summer",
    justification: "Thunderstorm, high alpine altitude, and exposed terrain represent an expert-defined no-go profile.",
    expectedLevel: "Very High",
    input: {
      ...baseInput,
      weatherCode: 95,
      maxAltitudeM: 2200,
      routeIsExposed: true,
      routeMonthlyHikeCount: 2,
    },
  },
  {
    id: "S22",
    name: "Beginner alpine above 2000m",
    massif: "Fagaras",
    season: "Summer",
    justification: "Beginner on hard alpine terrain above 2000m should trigger the alpine inexperience synergy.",
    expectedLevel: "Very High",
    input: {
      ...baseInput,
      experienceLevel: "beginner",
      routeDifficulty: "hard",
      maxAltitudeM: 2300,
      userCompletedHikesCount: 2,
    },
  },
  {
    id: "S23",
    name: "Winter above 2000m cold wind",
    massif: "Retezat",
    season: "Winter",
    justification: "Winter high-altitude travel with snow, cold, wind, and short daylight is very high risk.",
    expectedLevel: "Very High",
    input: {
      ...baseInput,
      now: new Date("2025-01-15T08:00:00"),
      maxAltitudeM: 2100,
      temperatureC: -8,
      windspeedKmh: 45,
      weatherCode: 75,
      sunsetTime: "16:30",
    },
  },
  {
    id: "S24",
    name: "Solo high fatigue remote",
    massif: "Retezat",
    season: "Summer",
    justification: "High fatigue, solo travel, remote terrain, and no emergency contact leave little margin.",
    expectedLevel: "Very High",
    input: {
      ...baseInput,
      soloHiker: true,
      groupSize: 1,
      fatigueScore: 1,
      fatigueDescription: "High recent activity load",
      fatigueLevel: "high",
      isolationScore: 0.85,
      distanceKm: 15,
      estimatedDurationH: 7,
      hasEmergencyContact: false,
    },
  },
  {
    id: "S25",
    name: "Early spring alpine beginner",
    massif: "Fagaras",
    season: "Spring",
    justification: "Beginner status on early spring alpine terrain should trigger severe seasonal compounding.",
    expectedLevel: "Very High",
    input: {
      ...baseInput,
      now: new Date("2025-03-20T08:00:00"),
      maxAltitudeM: 2200,
      experienceLevel: "beginner",
      userCompletedHikesCount: 2,
      routeDifficulty: "hard",
      distanceKm: 12,
      elevationGainM: 900,
    },
  },
  {
    id: "S26",
    name: "Worst-case all factors",
    massif: "Fagaras",
    season: "Winter",
    justification: "Maximum stacking of severe weather, winter, altitude, inexperience, solo travel, and route demand.",
    expectedLevel: "Very High",
    input: {
      ...baseInput,
      weatherCode: 95,
      temperatureC: -10,
      maxAltitudeM: 2400,
      now: new Date("2025-01-15T08:00:00"),
      soloHiker: true,
      groupSize: 1,
      experienceLevel: "beginner",
      routeDifficulty: "expert",
      distanceKm: 20,
      elevationGainM: 1600,
      backpackWeightKg: 18,
      isolationScore: 0.9,
      hasEmergencyContact: false,
      sunsetTime: "16:30",
    },
  },
  {
    id: "S27",
    name: "Late start slow hiker long route",
    massif: "Bucegi",
    season: "Summer",
    justification: "Late departure, slow historical pace, and a long route should create very high after-dark risk.",
    expectedLevel: "Very High",
    input: {
      ...baseInput,
      startTime: "13:00",
      userAvgActualVsEstimatedRatio: 1.35,
      distanceKm: 16,
      estimatedDurationH: 7,
    },
  },
  {
    id: "S28",
    name: "Senior age71 solo alpine",
    massif: "Retezat",
    season: "Summer",
    justification: "Age 71, solo travel, altitude, isolation, and harder terrain should be high risk.",
    expectedLevel: "High",
    input: {
      ...baseInput,
      userAge: 71,
      soloHiker: true,
      groupSize: 1,
      maxAltitudeM: 2100,
      distanceKm: 12,
      elevationGainM: 800,
      routeDifficulty: "hard",
      isolationScore: 0.85,
      estimatedDurationH: 7,
      backpackWeightKg: 12,
      hasEmergencyContact: false,
      userLastHikeDaysAgo: 20,
    },
  },
  {
    id: "S29",
    name: "Flash flood risk storm wet ground",
    massif: "Bucegi",
    season: "Summer",
    justification: "Storm conditions over already wet rocky ground raise flash-flood and footing concerns.",
    expectedLevel: "High",
    input: {
      ...baseInput,
      weatherCode: 95,
      precipitationProbability: 60,
      elevationGainM: 600,
      windspeedKmh: 50,
      surfaceType: "rocky",
      precipitationLast7DaysMm: 55,
      routeIsExposed: true,
      uvIndex: 6,
    },
  },
  {
    id: "S30",
    name: "Solo no emergency contact remote alpine 2600m",
    massif: "Fagaras",
    season: "Summer",
    justification: "Remote high-alpine solo route without an emergency contact should be high risk.",
    expectedLevel: "High",
    input: {
      ...baseInput,
      soloHiker: true,
      groupSize: 1,
      maxAltitudeM: 2600,
      isolationScore: 0.85,
      hasEmergencyContact: false,
      distanceKm: 14,
      elevationGainM: 1000,
      estimatedDurationH: 7,
      routeDifficulty: "expert",
      userLastHikeDaysAgo: 20,
    },
  },
];

const getText = (factor: { label?: string; description?: string }) =>
  factor.label ?? factor.description ?? "";

function evaluateScenario(scenario: ExpertScenario): ScenarioResult {
  const result = calculateRisk(scenario.input);
  const synergyFactors = result.factors
    .filter((factor) => factor.category === "synergy")
    .map(getText);
  const topFactors = result.factors
    .filter((factor) => factor.category !== "synergy")
    .sort((left, right) => right.value - left.value || getText(left).localeCompare(getText(right)))
    .slice(0, 3)
    .map((factor) => ({ text: getText(factor), value: factor.value }));

  return {
    id: scenario.id,
    name: scenario.name,
    massif: scenario.massif,
    season: scenario.season,
    expectedLevel: scenario.expectedLevel,
    actualLevel: result.level,
    actualScore: result.score,
    pass: result.level === scenario.expectedLevel,
    justification: scenario.justification,
    synergyFactors,
    topFactors,
  };
}

function escapeCell(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ").replace(/\|/g, "\\|");
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value).replace(/\|/g, "\\|");
  }

  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function markdownTable(headers: string[], rows: unknown[][]): string {
  return [
    `| ${headers.map(escapeCell).join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(" | ")} |`),
  ].join("\n");
}

function summarizeByLevel(results: ScenarioResult[]) {
  return Object.fromEntries(
    levels.map((level) => {
      const levelResults = results.filter((result) => result.expectedLevel === level);
      const passed = levelResults.filter((result) => result.pass).length;
      const passPercent =
        levelResults.length === 0 ? 100 : Number(((passed / levelResults.length) * 100).toFixed(1));

      return [
        level,
        {
          total: levelResults.length,
          passed,
          failed: levelResults.length - passed,
          passRate: `${passed}/${levelResults.length} (${passPercent.toFixed(1)}%)`,
        },
      ];
    })
  ) as Record<ExpectedLevel, { total: number; passed: number; failed: number; passRate: string }>;
}

function renderMarkdown(
  runAt: string,
  results: ScenarioResult[],
  byLevel: ReturnType<typeof summarizeByLevel>
): string {
  const passed = results.filter((result) => result.pass).length;
  const failedScenarios = results.filter((result) => !result.pass);
  const passPercent = ((passed / results.length) * 100).toFixed(1);

  return [
    "# Expert Scenarios Result",
    "",
    `Run timestamp: ${runAt}`,
    `Pass rate: ${passed}/${results.length} (${passPercent}%)`,
    "",
    "## Results by Expected Level",
    "",
    markdownTable(
      ["Level", "Total", "Passed", "Failed", "Pass Rate"],
      levels.map((level) => {
        const summary = byLevel[level];

        return [level, summary.total, summary.passed, summary.failed, summary.passRate];
      })
    ),
    "",
    "## Scenario Detail",
    "",
    markdownTable(
      [
        "ID",
        "Name",
        "Massif",
        "Season",
        "Expected",
        "Actual",
        "Score",
        "Pass",
        "Top Factors",
        "Synergy Factors",
      ],
      results.map((result) => [
        result.id,
        result.name,
        result.massif,
        result.season,
        result.expectedLevel,
        result.actualLevel,
        result.actualScore,
        result.pass ? "PASS" : "FAIL",
        result.topFactors.map((factor) => `${factor.text} (${factor.value})`).join("; "),
        result.synergyFactors.join("; "),
      ])
    ),
    "",
    "## Failures",
    "",
    failedScenarios.length === 0
      ? "No failed scenarios."
      : failedScenarios
          .map(
            (result) =>
              `- ${result.id} ${result.name}: expected ${result.expectedLevel}, actual ${result.actualLevel}, score ${result.actualScore}. ${result.justification}`
          )
          .join("\n"),
    "",
  ].join("\n");
}

async function main() {
  if (scenarios.length !== 30) {
    throw new Error(`Expected exactly 30 scenarios, found ${scenarios.length}.`);
  }

  const results = scenarios.map(evaluateScenario);
  const passed = results.filter((result) => result.pass).length;
  const failed = results.length - passed;
  const passPercent = ((passed / results.length) * 100).toFixed(1);
  const byLevel = summarizeByLevel(results);
  const failedScenarios = results.filter((result) => !result.pass);
  const runAt = new Date().toISOString();
  const output = {
    runAt,
    totalScenarios: results.length,
    passed,
    failed,
    passRate: `${passed}/${results.length} (${passPercent}%)`,
    byLevel,
    results,
    failedScenarios,
  };

  await writeFile(
    resolve(backendDir, "expert-scenarios-result.json"),
    `${JSON.stringify(output, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    resolve(backendDir, "expert-scenarios-result.md"),
    renderMarkdown(runAt, results, byLevel),
    "utf8"
  );

  console.log(`Expert scenarios: ${passed}/${results.length} passed (${passPercent}%).`);

  if (failedScenarios.length > 0) {
    console.log("Failures:");

    for (const result of failedScenarios) {
      console.log(
        `${result.id}: expected ${result.expectedLevel}, actual ${result.actualLevel}, score ${result.actualScore}`
      );
    }

    process.exit(1);
  }

  console.log("Failures: none.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
