ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "source" text NOT NULL DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "osm_relation_id" bigint UNIQUE;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "tags" jsonb;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN IF NOT EXISTS "best_season" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_routes_source" ON "routes" ("source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_routes_osm_relation_id" ON "routes" ("osm_relation_id") WHERE "osm_relation_id" IS NOT NULL;
