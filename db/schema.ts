import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  boolean,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────────
export const tenantStatus = pgEnum('tenant_status', [
  'pending',
  'provisioning',
  'active',
  'paused',
  'cancelled',
]);

export const planTier = pgEnum('plan_tier', [
  'starter',
  'pro',
  'enterprise',
]);

export const subscriptionStatus = pgEnum('subscription_status', [
  'incomplete',
  'active',
  'past_due',
  'cancelled',
]);

export const healthStatus = pgEnum('health_status', [
  'healthy',
  'degraded',
  'unhealthy',
  'unknown',
]);

export const watchlistPreset = pgEnum('watchlist_preset', [
  'top8',
  'crypto',
  'custom',
]);

export const riskTolerance = pgEnum('risk_tolerance', [
  'conservative',
  'moderate',
  'aggressive',
]);

export const agencyMode = pgEnum('agency_mode', ['rules', 'hybrid', 'ai']);

export const provisionEventLevel = pgEnum('provision_event_level', [
  'info',
  'warn',
  'error',
  'success',
]);

// ─── Tenants ──────────────────────────────────────────────────────────────
// One row per customer bot instance. slug drives the subdomain.
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerId: text('owner_id').notNull(), // Clerk user ID
  status: tenantStatus('status').notNull().default('pending'),
  plan: planTier('plan').notNull().default('starter'),
  // Onboarding wizard captures these; the Railway provisioner reads them
  // to build the bot's env vars. Null until onboarding completes.
  watchlistPreset: watchlistPreset('watchlist_preset'),
  customSymbols: text('custom_symbols').array(),
  riskTolerance: riskTolerance('risk_tolerance'),
  agencyMode: agencyMode('agency_mode'),
  onboardingCompletedAt: timestamp('onboarding_completed_at', {
    withTimezone: true,
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Subscriptions ────────────────────────────────────────────────────────
// Stripe is source of truth; this table mirrors the subset we need to query.
export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  stripeCustomerId: text('stripe_customer_id').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').unique(),
  status: subscriptionStatus('status').notNull().default('incomplete'),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  plan: planTier('plan').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── Per-tenant infra state ───────────────────────────────────────────────
// Populated by the provisioning pipeline (Railway + Cloudflare).
export const tenantInfra = pgTable('tenant_infra', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  railwayServiceId: text('railway_service_id'),
  railwayEnvId: text('railway_env_id'),
  databaseUrl: text('database_url'), // tenant bot's own Postgres
  subdomain: text('subdomain'), // e.g. acme.cleartrade.ai
  botApiKey: text('bot_api_key'), // x-api-key we inject into the bot
  healthStatus: healthStatus('health_status').default('unknown'),
  lastHealthCheck: timestamp('last_health_check', { withTimezone: true }),
  provisionedAt: timestamp('provisioned_at', { withTimezone: true }),
  version: text('version'), // bot Docker image tag
  // True when we created the tenant's Postgres (and must tear it down). False
  // when the customer brought their own database — we never delete that.
  managedDatabase: boolean('managed_database').notNull().default(true),
  // Provisioning-worker bookkeeping. The background sweep increments
  // attempts on each failure, records the last error for the admin panel,
  // and uses last_provision_attempt_at as both a backoff throttle and a
  // soft lock so overlapping sweeps don't double-provision the same tenant.
  provisionAttempts: integer('provision_attempts').notNull().default(0),
  lastProvisionError: text('last_provision_error'),
  lastProvisionAttemptAt: timestamp('last_provision_attempt_at', {
    withTimezone: true,
  }),
});

// ─── Tenant credentials vault ─────────────────────────────────────────────
// HIGHLY SENSITIVE. Must be encrypted at rest (column encryption / Vault).
// Never log these values. The admin UI only ever shows masked versions.
export const tenantSecrets = pgTable('tenant_secrets', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  alpacaApiKey: text('alpaca_api_key').notNull(),
  alpacaApiSecret: text('alpaca_api_secret').notNull(),
  alpacaBaseUrl: text('alpaca_base_url')
    .notNull()
    .default('https://paper-api.alpaca.markets'),
  anthropicApiKey: text('anthropic_api_key'), // optional; falls back to shared key
  polygonApiKey: text('polygon_api_key'),
  // Optional customer-provided Postgres URL (encrypted). When set, the bot uses
  // this instead of a database we provision. Bring-your-own-database.
  databaseUrl: text('database_url'),
});

// ─── Provisioning activity log ────────────────────────────────────────────
// Append-only stream of provisioning steps, surfaced live in the dashboard
// while a tenant is being provisioned. Cascade-deleted with the tenant.
export const provisionEvents = pgTable(
  'provision_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    level: provisionEventLevel('level').notNull().default('info'),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tenantCreatedIdx: index('provision_events_tenant_created_idx').on(
      t.tenantId,
      t.createdAt
    ),
  })
);

// ─── Type exports ─────────────────────────────────────────────────────────
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export type TenantInfra = typeof tenantInfra.$inferSelect;
export type NewTenantInfra = typeof tenantInfra.$inferInsert;

export type TenantSecrets = typeof tenantSecrets.$inferSelect;
export type NewTenantSecrets = typeof tenantSecrets.$inferInsert;

export type ProvisionEvent = typeof provisionEvents.$inferSelect;
export type NewProvisionEvent = typeof provisionEvents.$inferInsert;
