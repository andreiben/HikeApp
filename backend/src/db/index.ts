import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is missing");
}

const client = postgres(connectionString, {
  max: 3,
  idle_timeout: 20,
  connect_timeout: 10,
  max_lifetime: 1800,
});
export const db = drizzle(client);