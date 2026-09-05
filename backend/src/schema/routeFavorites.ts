import { pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { routes } from "./routes";
import { users } from "./users";

export const routeFavorites = pgTable(
  "route_favorites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    routeId: uuid("route_id")
      .notNull()
      .references(() => routes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [unique("route_favorites_user_id_route_id_unique").on(table.userId, table.routeId)]
);
