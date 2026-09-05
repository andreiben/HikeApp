import "dotenv/config";
import { eq, isNotNull } from "drizzle-orm";
import { db } from "../src/db";
import { routes } from "../src/schema/routes";
import { computeToblerDurationH } from "../src/utils/duration";

async function main() {
  const routeRows = await db
    .select({
      id: routes.id,
      distanceKm: routes.distanceKm,
      elevationProfile: routes.elevationProfile,
      estimatedDurationH: routes.estimatedDurationH,
    })
    .from(routes)
    .where(isNotNull(routes.elevationProfile));

  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < routeRows.length; i++) {
    const route = routeRows[i]!;
    const estimatedDurationH = computeToblerDurationH(route.elevationProfile, route.distanceKm);

    if (estimatedDurationH === null) {
      skipped++;
    } else {
      await db
        .update(routes)
        .set({ estimatedDurationH })
        .where(eq(routes.id, route.id));

      updated++;
    }

    const processed = i + 1;
    if (processed % 100 === 0) {
      console.log(`Backfilled duration for ${processed}/${routeRows.length} routes.`);
    }
  }

  console.log(`Backfilled duration for ${updated} routes (${skipped} skipped).`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill duration failed:", error);
    process.exit(1);
  });
