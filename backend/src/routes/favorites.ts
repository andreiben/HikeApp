import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { routeFavorites } from "../schema/routeFavorites";
import { routes } from "../schema/routes";
import { getAuthUser } from "../utils/getAuthUser";

const favoritesRouter = new Hono();

favoritesRouter.get("/", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const favorites = await db
      .select({
        id: routeFavorites.id,
        routeId: routeFavorites.routeId,
        createdAt: routeFavorites.createdAt,
        route: routes,
      })
      .from(routeFavorites)
      .innerJoin(routes, eq(routeFavorites.routeId, routes.id))
      .where(eq(routeFavorites.userId, authUser.sub))
      .orderBy(desc(routeFavorites.createdAt));

    return c.json({ favorites });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

favoritesRouter.get("/ids", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const favoriteRows = await db
      .select({ routeId: routeFavorites.routeId })
      .from(routeFavorites)
      .where(eq(routeFavorites.userId, authUser.sub));

    return c.json({ routeIds: favoriteRows.map((favorite) => favorite.routeId) });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

favoritesRouter.post("/:routeId", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const routeId = c.req.param("routeId");
    const [routeRow] = await db
      .select({ id: routes.id })
      .from(routes)
      .where(eq(routes.id, routeId))
      .limit(1);

    if (!routeRow) {
      return c.json({ error: "Route not found" }, 404);
    }

    await db
      .insert(routeFavorites)
      .values({
        userId: authUser.sub,
        routeId,
      })
      .onConflictDoNothing({
        target: [routeFavorites.userId, routeFavorites.routeId],
      });

    return c.json({ routeId }, 201);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

favoritesRouter.delete("/:routeId", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const routeId = c.req.param("routeId");

    await db
      .delete(routeFavorites)
      .where(
        and(
          eq(routeFavorites.userId, authUser.sub),
          eq(routeFavorites.routeId, routeId)
        )
      );

    return c.json({ routeId });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default favoritesRouter;
