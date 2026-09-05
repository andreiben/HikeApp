import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" })
    .unique(),

  displayName: text("display_name").notNull(),
  experienceLevel: text("experience_level").notNull(),
  heightCm: integer("height_cm"),
  weightKg: integer("weight_kg"),
  age: integer("age"),
  typicalBackpackWeightKg: integer("typical_backpack_weight_kg"),
  hikesSoloUsually: boolean("hikes_solo_usually").default(false).notNull(),
  units: text("units").notNull().default("metric"),
  riskAlertsEnabled: boolean("risk_alerts_enabled").notNull().default(true),
  achievementToastsEnabled: boolean("achievement_toasts_enabled").notNull().default(true),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
