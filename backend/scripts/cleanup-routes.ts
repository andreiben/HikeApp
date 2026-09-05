import "dotenv/config";
import { inArray } from "drizzle-orm";
import { db } from "../src/db";
import { routes } from "../src/schema/routes";
import { hikes } from "../src/schema/hikes";
import { riskAssessments } from "../src/schema/riskAssessments";
import { isInRomania, nearestRegion } from "../src/utils/geo";

function isJunkName(name: string | null): boolean {
  const trimmed = (name ?? "").trim();
  if (trimmed.length === 0) return true;
  if (/[•▲►◄●■♦↺▙▼◆◇○]/.test(trimmed)) {
    return true;
  }
  const alpha = trimmed.replace(/[^A-Za-zĂăÂâÎîȘșȚț]/g, "");
  return alpha.length <= 2;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const all = await db
    .select({
      id: routes.id,
      name: routes.name,
      region: routes.region,
      lat: routes.startLatitude,
      lon: routes.startLongitude,
    })
    .from(routes);
  console.log(`Total routes: ${all.length}`);

  const doomed: string[] = [];
  let foreignCount = 0;
  let junkCount = 0;
  for (const route of all) {
    const outside =
      route.lat == null || route.lon == null || !isInRomania(route.lat, route.lon);
    if (outside) {
      doomed.push(route.id);
      foreignCount += 1;
      continue;
    }
    if (isJunkName(route.name)) {
      doomed.push(route.id);
      junkCount += 1;
    }
  }
  console.log(
    `Doomed: ${doomed.length} (outside Romania: ${foreignCount}, junk-named inside Romania: ${junkCount})`
  );

  for (const part of chunk(doomed, 200)) {
    await db.update(hikes).set({ routeId: null }).where(inArray(hikes.routeId, part));
    await db
      .update(riskAssessments)
      .set({ routeId: null })
      .where(inArray(riskAssessments.routeId, part));
    await db.delete(routes).where(inArray(routes.id, part));
  }
  if (doomed.length > 0) {
    console.log(`Deleted ${doomed.length} routes (favorites cascade-removed).`);
  }

  const survivors = await db
    .select({
      id: routes.id,
      region: routes.region,
      lat: routes.startLatitude,
      lon: routes.startLongitude,
    })
    .from(routes);

  const byRegion = new Map<string, string[]>();
  for (const route of survivors) {
    if (route.lat == null || route.lon == null) continue;
    const correct = nearestRegion(route.lat, route.lon);
    if (correct !== route.region) {
      const ids = byRegion.get(correct) ?? [];
      ids.push(route.id);
      byRegion.set(correct, ids);
    }
  }
  let regionChanges = 0;
  for (const [region, ids] of byRegion) {
    for (const part of chunk(ids, 200)) {
      await db.update(routes).set({ region }).where(inArray(routes.id, part));
      regionChanges += part.length;
    }
  }
  console.log(`Survivors: ${survivors.length}, re-tagged region on ${regionChanges}.`);
  process.exit(0);
}

main().catch((error) => {
  console.error("Route cleanup failed:", error);
  process.exit(1);
});
