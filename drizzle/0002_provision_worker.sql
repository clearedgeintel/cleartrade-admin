ALTER TABLE "tenant_infra" ADD COLUMN "provision_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_infra" ADD COLUMN "last_provision_error" text;--> statement-breakpoint
ALTER TABLE "tenant_infra" ADD COLUMN "last_provision_attempt_at" timestamp with time zone;