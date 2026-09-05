CREATE TABLE "routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"distance_km" double precision NOT NULL,
	"elevation_gain_m" integer NOT NULL,
	"estimated_duration_h" double precision NOT NULL,
	"difficulty" text DEFAULT 'moderate' NOT NULL,
	"start_latitude" double precision NOT NULL,
	"start_longitude" double precision NOT NULL,
	"end_latitude" double precision NOT NULL,
	"end_longitude" double precision NOT NULL,
	"geometry" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
