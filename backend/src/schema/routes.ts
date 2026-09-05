import {
  bigint,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const routes = pgTable("routes", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: text("name").notNull(),
  region: text("region").notNull(),

  distanceKm: doublePrecision("distance_km").notNull(),
  elevationGainM: integer("elevation_gain_m").notNull(),
  maxElevationM: integer("max_elevation_m"),
  estimatedDurationH: doublePrecision("estimated_duration_h").notNull(),

  difficulty: text("difficulty").notNull().default("moderate"),
  surfaceType: text("surface_type").notNull().default("dirt"),
  source: text("source").notNull().default("manual"),
  osmRelationId: bigint("osm_relation_id", { mode: "number" }).unique(),
  tags: jsonb("tags"),
  description: text("description"),
  bestSeason: text("best_season"),

  startLatitude: doublePrecision("start_latitude").notNull(),
  startLongitude: doublePrecision("start_longitude").notNull(),
  endLatitude: doublePrecision("end_latitude").notNull(),
  endLongitude: doublePrecision("end_longitude").notNull(),

  geometry: jsonb("geometry").notNull(),
  geometrySimplified: jsonb("geometry_simplified"),
  elevationProfile: jsonb("elevation_profile"),
  isolationScore: real("isolation_score"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});
