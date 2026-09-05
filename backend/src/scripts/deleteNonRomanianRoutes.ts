import "dotenv/config";
import { like, ilike, or, inArray } from "drizzle-orm";
import { db } from "../db";
import { routes } from "../schema/routes";
import { hikes } from "../schema/hikes";
import { riskAssessments } from "../schema/riskAssessments";
import { routeFavorites } from "../schema/routeFavorites";
import { trailConditions } from "../schema/trailConditions";

// "Z (" matches Hungarian trail-code routes like "Z (Gyula â€“ ...)"
// NOT ZÄƒrneÈ™ti / Zlatna which are Romanian towns starting with Z
const nonRomanianCondition = or(
  like(routes.name, "Z (%"),
  like(routes.name, "S+%"),
  like(routes.name, "S (%"),
  like(routes.name, "P+%"),
  like(routes.name, "P (%"),
  ilike(routes.name, "m_ria-_t%"),
  like(routes.name, "Maria-ut%"),
  like(routes.name, "Mariaut%"),
  like(routes.name, "M05%"),
  ilike(routes.name, "%tan%svény%"),
  ilike(routes.name, "%túraösvény%"),
  ilike(routes.name, "%bélyegző%"),
  ilike(routes.name, "via mariae%"),
  ilike(routes.name, "via_mariae%"),
);


async function main() {
  const toDelete = await db
    .select({ id: routes.id, name: routes.name })
    .from(routes)
    .where(nonRomanianCondition);

  if (toDelete.length === 0) {
    console.log("No non-Romanian routes matched.");
    return;
  }

  console.log("Routes to delete:");
  for (const r of toDelete) console.log(`  - ${r.name}`);

  const ids = toDelete.map((r) => r.id);

  // Nullify FK references before deleting (route_id is nullable on these tables)
  await db.update(hikes).set({ routeId: null }).where(inArray(hikes.routeId, ids));
  await db.update(riskAssessments).set({ routeId: null }).where(inArray(riskAssessments.routeId, ids));

  // Hard-delete dependent rows with non-nullable FKs
  await db.delete(routeFavorites).where(inArray(routeFavorites.routeId, ids));
  await db.delete(trailConditions).where(inArray(trailConditions.routeId, ids));

  const deleted = await db.delete(routes).where(inArray(routes.id, ids)).returning({ id: routes.id });
  console.log(`\nDeleted ${deleted.length} routes.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error("Failed:", err); process.exit(1); });


