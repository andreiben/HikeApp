import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is missing");

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const drizzleDir = path.join(rootDir, "drizzle");

// Postgres error codes that mean "already done"
const IDEMPOTENT_CODES = new Set([
  "42P07", // duplicate_table
  "42701", // duplicate_column
  "42710", // duplicate_object
  "42P06", // duplicate_schema
]);

const files = (await readdir(drizzleDir))
  .filter((f) => f.endsWith(".sql"))
  .sort();

const sql = postgres(connectionString, { max: 1 });

try {
  for (const file of files) {
    const sqlText = await readFile(path.join(drizzleDir, file), "utf8");
    const statements = sqlText
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    let skipped = 0;
    for (const statement of statements) {
      try {
        await sql.unsafe(statement);
      } catch (err) {
        if (IDEMPOTENT_CODES.has(err.code)) {
          skipped++;
        } else {
          throw err;
        }
      }
    }
    const note = skipped ? ` (${skipped} already existed)` : "";
    console.log(`Applied ${file}${note}`);
  }
} finally {
  await sql.end();
}
