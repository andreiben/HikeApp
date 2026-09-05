import { Hono } from "hono";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { hikes, hikePoints } from "../schema/hikes";
import { riskAssessments } from "../schema/riskAssessments";
import { routeFavorites } from "../schema/routeFavorites";
import { userProfiles } from "../schema/userProfiles";
import { users } from "../schema/users";
import { getAuthUser } from "../utils/getAuthUser";

const usersRouter = new Hono();

usersRouter.delete("/me", async (c) => {
  try {
    const authUser = getAuthUser(c);

    if (!authUser) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await db.transaction(async (tx) => {
      const userHikes = await tx
        .select({ id: hikes.id })
        .from(hikes)
        .where(eq(hikes.userId, authUser.sub));

      if (userHikes.length > 0) {
        await tx
          .delete(hikePoints)
          .where(inArray(hikePoints.hikeId, userHikes.map((hike) => hike.id)));
      }

      await tx.delete(routeFavorites).where(eq(routeFavorites.userId, authUser.sub));
      await tx.delete(hikes).where(eq(hikes.userId, authUser.sub));
      await tx.delete(riskAssessments).where(eq(riskAssessments.userId, authUser.sub));
      await tx.delete(userProfiles).where(eq(userProfiles.userId, authUser.sub));
      await tx.delete(users).where(eq(users.id, authUser.sub));
    });

    return c.json({ message: "User deleted successfully" });
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default usersRouter;
