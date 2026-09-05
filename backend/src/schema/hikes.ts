import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { routes } from "./routes";
import { riskAssessments } from "./riskAssessments";

export const hikes = pgTable("hikes", {
  id: uuid("id").defaultRandom().primaryKey(),

  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  routeName: text("route_name"),
  routeId: uuid("route_id").references(() => routes.id),
  notes: text("notes"),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),

  durationS: integer("duration_s"),
  movingTimeS: integer("moving_time_s"),

  distanceM: doublePrecision("distance_m"),
  elevationGainM: doublePrecision("elevation_gain_m"),
  elevationLossM: doublePrecision("elevation_loss_m"),
  backpackWeightKg: doublePrecision("backpack_weight_kg"),
  riskScoreAtStart: integer("risk_score_at_start"),
  weatherSnapshotStart: jsonb("weather_snapshot_start"),
  riskAssessmentId: uuid("risk_assessment_id").references(() => riskAssessments.id, {
    onDelete: "set null",
  }),
  offTrailSeconds: integer("off_trail_seconds").notNull().default(0),
  userDifficultyRating: integer("user_difficulty_rating"),
  completionScore: integer("completion_score"),

  avgSpeedKmh: doublePrecision("avg_speed_kmh"),
  avgPaceMinKm: doublePrecision("avg_pace_min_km"),

  minAltitudeM: doublePrecision("min_altitude_m"),
  maxAltitudeM: doublePrecision("max_altitude_m"),

  status: text("status").notNull().default("in_progress"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const hikePoints = pgTable("hike_points", {
  id: uuid("id").defaultRandom().primaryKey(),

  hikeId: uuid("hike_id")
    .notNull()
    .references(() => hikes.id, { onDelete: "cascade" }),

  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  altitude: doublePrecision("altitude"),
  accuracy: doublePrecision("accuracy"),

  recordedAt: timestamp("recorded_at").notNull(),
});
