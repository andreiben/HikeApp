import "dotenv/config";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { routes } from "../src/schema/routes";

function hasKeyword(value: string, keywords: string[]) {
  const normalizedValue = value.toLowerCase();
  return keywords.some((keyword) => normalizedValue.includes(keyword));
}

function computeTags(route: {
  name: string;
  distanceKm: number;
  elevationGainM: number;
  difficulty: string;
}) {
  const tags: string[] = [];

  if (route.elevationGainM > 800) {
    tags.push("alpine", "scenic");
  }

  if (route.distanceKm * 1000 < 5000) {
    tags.push("family-friendly");
  }

  if (route.difficulty === "easy") {
    tags.push("family-friendly");
  }

  if (hasKeyword(route.name, ["mountain", "munte", "varf", "peak"])) {
    tags.push("alpine", "scenic");
  }

  if (hasKeyword(route.name, ["forest", "padure"])) {
    tags.push("forest");
  }

  if (hasKeyword(route.name, ["cascade", "waterfall", "cascada"])) {
    tags.push("waterfall", "scenic");
  }

  if (hasKeyword(route.name, ["lake", "lac"])) {
    tags.push("scenic");
  }

  return [...new Set(tags)];
}

function computeBestSeason(difficulty: string) {
  if (difficulty === "easy") {
    return "Spring\u2013Autumn";
  }

  if (difficulty === "moderate") {
    return "Summer\u2013Autumn";
  }

  if (difficulty === "hard") {
    return "Summer";
  }

  if (difficulty === "very_hard") {
    return "July\u2013August";
  }

  return "Summer";
}

function computeIsolationScore(
  elevationGainM: number,
  maxElevationM: number | null,
  distanceKm: number,
  difficulty: string
): number {
  const maxAlt = maxElevationM ?? 0;
  const altScore =
    maxAlt >= 2400 ? 0.40 :
    maxAlt >= 2000 ? 0.32 :
    maxAlt >= 1500 ? 0.20 :
    maxAlt >= 1000 ? 0.10 :
    0.05;
  const distScore =
    distanceKm >= 25 ? 0.25 :
    distanceKm >= 15 ? 0.18 :
    distanceKm >= 8 ? 0.10 :
    0.04;
  const diffScore =
    difficulty === "expert" ? 0.22 :
    difficulty === "hard" ? 0.18 :
    difficulty === "moderate" ? 0.10 :
    0.03;
  const gainScore =
    elevationGainM >= 1200 ? 0.15 :
    elevationGainM >= 700 ? 0.10 :
    elevationGainM >= 300 ? 0.05 :
    0.00;
  const raw = altScore + distScore + diffScore + gainScore;
  return Math.max(0.25, Math.min(1.0, Math.round(raw * 100) / 100));
}

async function seedRouteTags() {
  const allRoutes = await db.select().from(routes);

  for (const route of allRoutes) {
    const tags = computeTags(route);
    const bestSeason = computeBestSeason(route.difficulty);
    const updates: {
      tags: string[];
      bestSeason: string;
      isolationScore?: number;
    } = { tags, bestSeason };

    if (route.isolationScore === null) {
      updates.isolationScore = computeIsolationScore(
        route.elevationGainM,
        route.maxElevationM,
        route.distanceKm,
        route.difficulty
      );
    }

    await db
      .update(routes)
      .set(updates)
      .where(eq(routes.id, route.id));
  }

  console.log(`Prepared tag data for ${allRoutes.length} routes.`);
}

seedRouteTags()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed route tags failed:", error);
    process.exit(1);
  });

