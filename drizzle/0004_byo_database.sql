ALTER TABLE "tenant_infra" ADD COLUMN "managed_database" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "tenant_secrets" ADD COLUMN "database_url" text;