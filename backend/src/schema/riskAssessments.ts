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

export const riskAssessments = pgTable("risk_assessments", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  routeId: uuid("route_id").references(() => routes.id),
  startDate: text("start_date").notNull(),
  startTime: text("start_time").notNull(),
  backpackWeightKg: doublePrecision("backpack_weight_kg"),
  score: integer("score").notNull(),
  level: text("level").notNull(),
  reasons: text("reasons").array(),
  suggestions: text("suggestions").array(),
  weatherData: jsonb("weather_data"),
  factors: jsonb("factors"),
  subScores: jsonb("sub_scores"),
  counterfactuals: jsonb("counterfactuals"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
