CREATE TABLE "hike_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hike_id" uuid NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"altitude" double precision,
	"accuracy" double precision,
	"recorded_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hikes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"route_name" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"duration_s" integer,
	"moving_time_s" integer,
	"distance_m" double precision,
	"elevation_gain_m" double precision,
	"elevation_loss_m" double precision,
	"avg_speed_kmh" double precision,
	"avg_pace_min_km" double precision,
	"min_altitude_m" double precision,
	"max_altitude_m" double precision,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hike_points" ADD CONSTRAINT "hike_points_hike_id_hikes_id_fk" FOREIGN KEY ("hike_id") REFERENCES "public"."hikes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hikes" ADD CONSTRAINT "hikes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;