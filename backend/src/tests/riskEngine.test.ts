import "dotenv/config";
import { describe, test, expect } from "bun:test";
import { calculateRisk } from "../utils/riskEngine";

describe("calculateRisk", () => {
  const baseInput = {
    distanceKm: 4,
    elevationGainM: 200,
    estimatedDurationH: 2,
    backpackWeightKg: 5,
    startTime: "09:00",
    maxAltitudeM: 600,
    temperatureC: 18,
    windspeedKmh: 10,
    precipitationProbability: 5,
    uvIndex: 3,
    weatherCode: 1,
    humidityPercent: 50,
    experienceLevel: "intermediate" as const,
    userCompletedHikesCount: 8,
    sunsetTime: "20:00",
    now: new Date("2026-07-15"),
    surfaceType: "dirt",
    forecastDaysOut: 1,
  };
  const minimalInput = {
    distanceKm: 4,
    elevationGainM: 200,
    estimatedDurationH: 2,
    backpackWeightKg: 5,
    startTime: "09:00",
  };
  const factorLabels = (result: ReturnType<typeof calculateRisk>) =>
    result.factors.map((factor) => factor.label);

  // 1. Low risk baseline
  test("low risk returns score < 25 and level Low", () => {
    const result = calculateRisk(baseInput);
    expect(result.score).toBeLessThan(25);
    expect(result.level).toBe("Low");
  });

  // 2. High distance
  test("distance ramp adds reason", () => {
    const result = calculateRisk({ ...baseInput, distanceKm: 20 });
    expect(factorLabels(result)).toContain("Încărcare de risc dată de distanță");
    expect(result.score).toBeGreaterThan(baseInput.distanceKm);
  });

  // 3. High elevation
  test("elevation ramp adds reason", () => {
    const result = calculateRisk({ ...baseInput, elevationGainM: 1200 });
    expect(factorLabels(result)).toContain("Încărcare de risc dată de diferența de nivel");
  });

  // 4. Pornire târzie (>= 15:00)
  test("very late start adds reason", () => {
    const result = calculateRisk({ ...baseInput, startTime: "16:00", estimatedDurationH: 4 });
    expect(factorLabels(result)).toContain("Pornire foarte târzie");
  });

  // 5. Finish after dark
  test("route finishing after dark adds reason", () => {
    const result = calculateRisk({
      ...baseInput,
      startTime: "14:00",
      estimatedDurationH: 5,
      sunsetTime: "18:30",
    });
    expect(factorLabels(result)).toContain("Drumeția se va încheia probabil după lăsarea întunericului");
  });

  // 6. Finish near sunset (end <= sunset and end > sunset - 1)
  test("route finishing near sunset adds reason", () => {
    const result = calculateRisk({
      ...baseInput,
      startTime: "15:00",
      estimatedDurationH: 3,
      sunsetTime: "18:30",
    });
    // 15:00 + 3h = 18:00; sunset = 18:30; 18:00 <= 18:30 and 18:00 > 17:30 ✓
    expect(factorLabels(result)).toContain("Drumeția se poate încheia aproape de apus");
  });

  // 7. High pack/pace/ascent load
  test("very high metabolic load adds reason", () => {
    const result = calculateRisk({
      ...baseInput,
      distanceKm: 12,
      elevationGainM: 1200,
      estimatedDurationH: 3,
      backpackWeightKg: 15,
      surfaceType: "rocky",
      userWeightKg: 70,
    });
    expect(factorLabels(result)).toContain(
      "Încărcare metabolică susținută foarte ridicată pentru corp, rucsac și teren"
    );
  });

  // 8. Thunderstorm
  test("thunderstorm weather code adds reason and high score", () => {
    const result = calculateRisk({ ...baseInput, weatherCode: 95 });
    expect(factorLabels(result)).toContain("Furtună cu tunete prognozată, caută adăpost și evită terenul deschis");
    expect(result.score).toBeGreaterThan(calculateRisk(baseInput).score);
  });

  // 9. Snow
  test("snow weather code adds reason", () => {
    const result = calculateRisk({ ...baseInput, weatherCode: 73 });
    expect(factorLabels(result)).toContain("Ninsoare sau viscol prognozate");
  });

  // 10. High UV (>= 8 and < 11 → "Expunere UV foarte ridicată")
  test("very high UV index adds reason", () => {
    const result = calculateRisk({ ...baseInput, uvIndex: 9 });
    expect(factorLabels(result)).toContain("Expunere UV foarte ridicată");
  });

  // 11. Rain >= 70%
  test("high precipitation probability adds reason", () => {
    const result = calculateRisk({ ...baseInput, precipitationProbability: 75 });
    expect(factorLabels(result)).toContain("Probabilitate mare de ploaie");
  });

  // 12. Strong wind >= 50 km/h
  test("very strong winds adds reason", () => {
    const result = calculateRisk({ ...baseInput, windspeedKmh: 55 });
    expect(factorLabels(result)).toContain("Vânt foarte puternic prognozat");
  });

  // 13. High BMI on steep route adds reason
  test("high BMI on steep ascent adds reason", () => {
    const result = calculateRisk({
      ...baseInput,
      elevationGainM: 700,
      userHeightCm: 170,
      userWeightKg: 95,
    });
    expect(factorLabels(result)).toContain("IMC ridicat crește solicitarea cardiovasculară pe urcări abrupte");
  });

  // 14. Experienced bonus (>= 20 completed hikes lowers score by 10)
  test("experienced hiker gets score bonus", () => {
    const withoutBonus = calculateRisk({
      ...baseInput,
      distanceKm: 10,
      elevationGainM: 700,
      estimatedDurationH: 4,
      userHeightCm: 170,
      userWeightKg: 95,
      userCompletedHikesCount: 5,
    });
    const withBonus = calculateRisk({
      ...baseInput,
      distanceKm: 10,
      elevationGainM: 700,
      estimatedDurationH: 4,
      userHeightCm: 170,
      userWeightKg: 95,
      userCompletedHikesCount: 25,
    });
    expect(withBonus.score).toBeLessThan(withoutBonus.score);
  });

  // 15. Beginner on hard route
  test("beginner on difficult route adds experience warning", () => {
    const result = calculateRisk({
      ...baseInput,
      estimatedDurationH: 6,
      elevationGainM: 700,
      userCompletedHikesCount: 2,
    });
    expect(factorLabels(result)).toContain("Experiență de drumeție limitată pentru dificultatea acestui traseu");
  });

  // 16. Score capped at 100
  test("score is capped at 100 regardless of stacked risks", () => {
    const result = calculateRisk({
      distanceKm: 30,
      elevationGainM: 1500,
      estimatedDurationH: 8,
      backpackWeightKg: 15,
      startTime: "16:00",
      sunsetTime: "18:00",
      maxAltitudeM: 2500,
      weatherCode: 95,
      windspeedKmh: 60,
      precipitationProbability: 80,
      uvIndex: 11,
      temperatureC: -5,
      userCompletedHikesCount: 2,
      userHeightCm: 170,
      userWeightKg: 120,
      userAge: 68,
    });
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.level).toBe("Very High");
  });

  // 17. Level thresholds
  test("score < 25 yields Low level", () => {
    const result = calculateRisk({ ...baseInput, distanceKm: 10 });
    expect(result.score).toBeLessThan(25);
    expect(result.level).toBe("Low");
  });

  test("score >= 25 and < 50 yields Moderate level", () => {
    const result = calculateRisk({
      ...baseInput,
      distanceKm: 20,
      elevationGainM: 1200,
      estimatedDurationH: 5,
    });
    expect(result.score).toBeGreaterThanOrEqual(25);
    expect(result.score).toBeLessThan(50);
    expect(result.level).toBe("Moderate");
  });

  test("score >= 50 and < 75 yields High level", () => {
    const result = calculateRisk({
      ...baseInput,
      distanceKm: 20,
      elevationGainM: 1200,
      estimatedDurationH: 8,
      startTime: "16:00",
      windspeedKmh: 55,
    });
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThan(75);
    expect(result.level).toBe("High");
  });

  test("score >= 75 yields Very High level", () => {
    const result = calculateRisk({
      ...baseInput,
      distanceKm: 30,
      elevationGainM: 1500,
      estimatedDurationH: 9,
      startTime: "16:00",
      userAvgActualVsEstimatedRatio: 1.2,
      weatherCode: 95,
      windspeedKmh: 60,
      precipitationProbability: 80,
      maxAltitudeM: 2600,
      soloHiker: true,
      isolationScore: 0.9,
      routeDifficulty: "expert",
      experienceLevel: "beginner",
    });
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.level).toBe("Very High");
  });

  // 18. Conservative missing-data factors
  test("easy route with no weather data produces conservative factors", () => {
    const labels = factorLabels(calculateRisk(minimalInput));
    expect(labels).toContain("Date meteo lipsă");
    expect(labels).toContain("Date personale lipsă");
    expect(labels).toContain("Date de altitudine ale traseului lipsă");
  });

  test("missing-data input scores higher than full-data equivalent", () => {
    expect(calculateRisk(minimalInput).score).toBeGreaterThan(calculateRisk(baseInput).score);
  });

  test("dataCompleteness reflects missing vs full data", () => {
    expect(calculateRisk(minimalInput).dataCompleteness.overall).toBe("limited");
    expect(calculateRisk(baseInput).dataCompleteness.overall).toBe("full");
  });

  test("distance ramp is smooth around 15km", () => {
    const score145 = calculateRisk({ ...baseInput, distanceKm: 14.5 }).score;
    const score150 = calculateRisk({ ...baseInput, distanceKm: 15 }).score;

    expect(Math.abs(score150 - score145)).toBeLessThanOrEqual(2);
  });

  test("elevation ramp is smooth around 1000m", () => {
    const score990 = calculateRisk({ ...baseInput, elevationGainM: 990 }).score;
    const score1005 = calculateRisk({ ...baseInput, elevationGainM: 1005 }).score;

    expect(Math.abs(score1005 - score990)).toBeLessThanOrEqual(2);
  });

  test("backpack burden matters for beginner on long steep hot route", () => {
    const route = {
      ...baseInput,
      distanceKm: 16,
      elevationGainM: 900,
      temperatureC: 30,
      estimatedDurationH: 8,
      experienceLevel: "beginner",
      fitnessLevel: "Casual",
      userWeightKg: 70,
      fatigueScore: 0,
    };
    const back0 = calculateRisk({ ...route, backpackWeightKg: 0 }).score;
    const back15 = calculateRisk({ ...route, backpackWeightKg: 15 }).score;

    expect(back15 - back0).toBeGreaterThanOrEqual(8);
  });

  test("backpack burden stays modest for expert on short flat cool route", () => {
    const route = {
      ...baseInput,
      distanceKm: 6,
      elevationGainM: 150,
      temperatureC: 12,
      estimatedDurationH: 3,
      experienceLevel: "expert",
      fitnessLevel: "Athletic",
      userWeightKg: 75,
      fatigueScore: 0,
    };
    const back0 = calculateRisk({ ...route, backpackWeightKg: 0 }).score;
    const back15 = calculateRisk({ ...route, backpackWeightKg: 15 }).score;

    expect(back15 - back0).toBeLessThanOrEqual(5);
  });

  test("stacked synergies remain capped at score 100", () => {
    const result = calculateRisk({
      ...baseInput,
      distanceKm: 25,
      elevationGainM: 1400,
      estimatedDurationH: 9,
      startTime: "13:00",
      sunsetTime: "18:00",
      soloHiker: true,
      precipitationProbability: 90,
      precipitationLast7DaysMm: 60,
      weatherCode: 95,
      maxAltitudeM: 2600,
      routeDifficulty: "expert",
      experienceLevel: "beginner",
      isolationScore: 0.9,
      userAvgActualVsEstimatedRatio: 1.3,
      daysSinceLastHighAltitudeHike: 120,
    });

    expect(result.factors.filter((factor) => factor.category === "synergy").length).toBeGreaterThanOrEqual(3);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  test("confidence is low when weather and personal data are missing", () => {
    const result = calculateRisk({
      distanceKm: 4,
      elevationGainM: 200,
      estimatedDurationH: 2,
      backpackWeightKg: 0,
      startTime: "09:00",
      maxAltitudeM: 600,
      surfaceType: "dirt",
    });

    expect(result.confidence.level).toBe("low");
    expect(result.confidence.missing).toContain("weather");
    expect(result.confidence.missing).toContain("personal_profile");
  });

  test("confidence is high when full data is available", () => {
    const result = calculateRisk(baseInput);

    expect(result.confidence.level).toBe("high");
  });
});
