ALTER TABLE "hikes" ALTER COLUMN "route_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "hikes" ADD COLUMN "route_id" uuid;--> statement-breakpoint
ALTER TABLE "hikes" ADD CONSTRAINT "hikes_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;