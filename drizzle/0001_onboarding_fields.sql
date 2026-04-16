CREATE TYPE "public"."agency_mode" AS ENUM('rules', 'hybrid', 'ai');--> statement-breakpoint
CREATE TYPE "public"."risk_tolerance" AS ENUM('conservative', 'moderate', 'aggressive');--> statement-breakpoint
CREATE TYPE "public"."watchlist_preset" AS ENUM('top8', 'crypto', 'custom');--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "watchlist_preset" "watchlist_preset";--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "custom_symbols" text[];--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "risk_tolerance" "risk_tolerance";--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "agency_mode" "agency_mode";--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "onboarding_completed_at" timestamp with time zone;