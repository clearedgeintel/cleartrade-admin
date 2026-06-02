CREATE TYPE "public"."provision_event_level" AS ENUM('info', 'warn', 'error', 'success');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provision_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"level" "provision_event_level" DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "provision_events" ADD CONSTRAINT "provision_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provision_events_tenant_created_idx" ON "provision_events" USING btree ("tenant_id","created_at");