import "dotenv/config";
import { Hono } from "hono";
import authRouter from "./src/routes/auth";
import favoritesRouter from "./src/routes/favorites";
import usersRouter from "./src/routes/users";
import profileRouter from "./src/routes/profile";
import hikesRouter from "./src/routes/hikes";
import routesRouter from "./src/routes/routes";
import riskAssessmentsRouter from "./src/routes/riskAssessments";
import poisRouter from "./src/routes/pois";
import { compress } from "hono/compress";

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const app = new Hono();

app.use("*", compress());

app.get("/", (c) => {
  return c.json({
    message: "HikeApp backend is running",
  });
});

app.route("/auth", authRouter);
app.route("/favorites", favoritesRouter);
app.route("/users", usersRouter);
app.route("/profile", profileRouter);
app.route("/hikes", hikesRouter);
app.route("/routes", routesRouter);
app.route("/risk-assessments", riskAssessmentsRouter);
app.route("/pois", poisRouter);

export default {
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
};
