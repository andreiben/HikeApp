CREATE TABLE IF NOT EXISTS "risk_assessments" (
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
