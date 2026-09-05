import "dotenv/config";
import { eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { routes } from "../src/schema/routes";
import { decimateGeometry } from "../src/utils/geometry";

async function main() {
  const routeRows = await db
    .select({
      id: routes.id,
      geometry: routes.geometry,
    })
    .from(routes)
    .where(isNull(routes.geometrySimplified));

  let updated = 0;
  let skipped = 0;

  for (const route of routeRows) {
    const simplified = decimateGeometry(route.geometry, 50);

    await db
      .update(routes)
      .set({ geometrySimplified: simplified })
      .where(eq(routes.id, route.id));

    updated++;

    if (updated % 100 === 0) {
      console.log(`Backfilled simplified geometry for ${updated}/${routeRows.length} routes.`);
    }
  }

  console.log(
    `Backfilled simplified geometry for ${updated} routes (${skipped} skipped).`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Backfill simplified geometry failed:", error);
    process.exit(1);
  });
