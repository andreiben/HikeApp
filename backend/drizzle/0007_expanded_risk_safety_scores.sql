ALTER TABLE "routes" ADD COLUMN "sac_scale" integer;--> statement-breakpoint
ALTER TABLE "routes" ADD COLUMN "isolation_score" real;--> statement-breakpoint
ALTER TABLE "hikes" ADD COLUMN "risk_score_at_start" integer;
