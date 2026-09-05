import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const drizzleDir = path.join(rootDir, "drizzle");
const metaDir = path.join(drizzleDir, "meta");
const migrationTag = "0006_risk_assessments";
const migrationFile = path.join(drizzleDir, `${migrationTag}.sql`);
const snapshotFile = path.join(metaDir, "0006_snapshot.json");
const journalFile = path.join(metaDir, "_journal.json");
const previousSnapshotFile = path.join(metaDir, "0005_snapshot.json");

const migrationSql = `CREATE TABLE IF NOT EXISTS "risk_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"route_id" uuid,
	"start_date" text NOT NULL,
	"start_time" text NOT NULL,
	"backpack_weight_kg" double precision,
	"score" integer NOT NULL,
	"level" text NOT NULL,
	"reasons" text[] NOT NULL,
	"suggestions" text[] NOT NULL,
	"weather_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "risk_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "risk_assessments_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action
);
`;

const riskAssessmentsSnapshot = {
  name: "risk_assessments",
  schema: "",
  columns: {
    id: {
      name: "id",
      type: "uuid",
      primaryKey: true,
      notNull: true,
      default: "gen_random_uuid()",
    },
    user_id: {
      name: "user_id",
      type: "uuid",
      primaryKey: false,
      notNull: true,
    },
    route_id: {
      name: "route_id",
      type: "uuid",
      primaryKey: false,
      notNull: false,
    },
    start_date: {
      name: "start_date",
      type: "text",
      primaryKey: false,
      notNull: true,
    },
    start_time: {
      name: "start_time",
      type: "text",
      primaryKey: false,
      notNull: true,
    },
    backpack_weight_kg: {
      name: "backpack_weight_kg",
      type: "double precision",
      primaryKey: false,
      notNull: false,
    },
    score: {
      name: "score",
      type: "integer",
      primaryKey: false,
      notNull: true,
    },
    level: {
      name: "level",
      type: "text",
      primaryKey: false,
      notNull: true,
    },
    reasons: {
      name: "reasons",
      type: "text[]",
      primaryKey: false,
      notNull: true,
    },
    suggestions: {
      name: "suggestions",
      type: "text[]",
      primaryKey: false,
      notNull: true,
    },
    weather_data: {
      name: "weather_data",
      type: "jsonb",
      primaryKey: false,
      notNull: false,
    },
    created_at: {
      name: "created_at",
      type: "timestamp",
      primaryKey: false,
      notNull: true,
      default: "now()",
    },
  },
  indexes: {},
  foreignKeys: {
    risk_assessments_user_id_users_id_fk: {
      name: "risk_assessments_user_id_users_id_fk",
      tableFrom: "risk_assessments",
      tableTo: "users",
      columnsFrom: ["user_id"],
      columnsTo: ["id"],
      onDelete: "cascade",
      onUpdate: "no action",
    },
    risk_assessments_route_id_routes_id_fk: {
      name: "risk_assessments_route_id_routes_id_fk",
      tableFrom: "risk_assessments",
      tableTo: "routes",
      columnsFrom: ["route_id"],
      columnsTo: ["id"],
      onDelete: "no action",
      onUpdate: "no action",
    },
  },
  compositePrimaryKeys: {},
  uniqueConstraints: {},
  policies: {},
  checkConstraints: {},
  isRLSEnabled: false,
};

async function ensureMigrationFile() {
  await writeFile(migrationFile, migrationSql, "utf8");
}

async function ensureSnapshot() {
  const previousSnapshot = JSON.parse(await readFile(previousSnapshotFile, "utf8"));
  const nextSnapshot = structuredClone(previousSnapshot);

  nextSnapshot.id = randomUUID();
  nextSnapshot.prevId = previousSnapshot.id;
  nextSnapshot.tables["public.risk_assessments"] = riskAssessmentsSnapshot;

  await writeFile(snapshotFile, `${JSON.stringify(nextSnapshot, null, 2)}\n`, "utf8");
}

async function ensureJournal() {
  const journal = JSON.parse(await readFile(journalFile, "utf8"));
  const existing = journal.entries.find((entry) => entry.tag === migrationTag);

  if (!existing) {
    journal.entries.push({
      idx: journal.entries.length,
      version: journal.version,
      when: Date.now(),
      tag: migrationTag,
      breakpoints: true,
    });
  }

  await writeFile(journalFile, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
}

await ensureMigrationFile();
await ensureSnapshot();
await ensureJournal();

console.log(`Generated ${migrationTag}`);
