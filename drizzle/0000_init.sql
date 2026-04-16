CREATE TYPE "public"."health_status" AS ENUM('healthy', 'degraded', 'unhealthy', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."plan_tier" AS ENUM('starter', 'pro', 'enterprise');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('incomplete', 'active', 'past_due', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('pending', 'provisioning', 'active', 'paused', 'cancelled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"stripe_customer_id" text NOT NULL,
	"stripe_subscription_id" text,
	"status" "subscription_status" DEFAULT 'incomplete' NOT NULL,
	"current_period_end" timestamp with time zone,
	"plan" "plan_tier" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_infra" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"railway_service_id" text,
	"railway_env_id" text,
	"database_url" text,
	"subdomain" text,
	"bot_api_key" text,
	"health_status" "health_status" DEFAULT 'unknown',
	"last_health_check" timestamp with time zone,
	"provisioned_at" timestamp with time zone,
	"version" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenant_secrets" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"alpaca_api_key" text NOT NULL,
	"alpaca_api_secret" text NOT NULL,
	"alpaca_base_url" text DEFAULT 'https://paper-api.alpaca.markets' NOT NULL,
	"anthropic_api_key" text,
	"polygon_api_key" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_id" text NOT NULL,
	"status" "tenant_status" DEFAULT 'pending' NOT NULL,
	"plan" "plan_tier" DEFAULT 'starter' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_infra" ADD CONSTRAINT "tenant_infra_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tenant_secrets" ADD CONSTRAINT "tenant_secrets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
