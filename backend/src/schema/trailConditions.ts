import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { routes } from "./routes";
import { users } from "./users";

export const trailConditions = pgTable("trail_conditions", {
  id: uuid("id").defaultRandom().primaryKey(),
  routeId: uuid("route_id")
    .notNull()
    .references(() => routes.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  condition: text("condition").notNull(),
  notes: text("notes"),
  photoUrl: text("photo_url"),
  severity: text("severity").notNull().default("moderate"),
  isTrailVerified: boolean("is_trail_verified").notNull().default(false),
  isSuppressed: boolean("is_suppressed").notNull().default(false),
  reportedAt: timestamp("reported_at").defaultNow().notNull(),
});
