import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenantInfra, tenantSecrets, tenants } from '@/db/schema';
import type { Tenant } from '@/db/schema';
import { buildBotEnvVars, generateBotApiKey } from './env-vars';
import { createSupabaseProject } from './supabase';
import { addCustomDomain, createBotService } from './railway';
import { addCNAME } from './cloudflare';

const BOT_IMAGE =
  process.env.BOT_DOCKER_IMAGE ?? 'ghcr.io/cleartrade/alpaca-trader:latest';
const HEALTH_POLL_MS = 5_000;
const HEALTH_POLL_MAX = 24; // 24 * 5s = 2 min

/**
 * Runs (or resumes) the full provisioning pipeline for one tenant.
 *
 * Idempotent at each step via `tenant_infra` — if a row exists, we skip the
 * already-completed stages and pick up where we left off. Safe to re-run on
 * failure.
 */
export async function provisionTenant(tenantId: string): Promise<void> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);
  if (!tenant) throw new Error(`tenant ${tenantId} not found`);

  const [secrets] = await db
    .select()
    .from(tenantSecrets)
    .where(eq(tenantSecrets.tenantId, tenantId))
    .limit(1);
  if (!secrets) {
    throw new Error(
      `tenant ${tenantId} has no secrets — onboarding incomplete`
    );
  }

  const baseDomain = process.env.BASE_DOMAIN;
  if (!baseDomain) throw new Error('BASE_DOMAIN is not set');

  // Load or seed the infra row. We keep partial progress here so reruns are
  // safe — each stage checks whether its field is already populated.
  let [infra] = await db
    .select()
    .from(tenantInfra)
    .where(eq(tenantInfra.tenantId, tenantId))
    .limit(1);

  if (!infra) {
    [infra] = await db
      .insert(tenantInfra)
      .values({
        tenantId,
        subdomain: `${tenant.slug}.${baseDomain}`,
        botApiKey: generateBotApiKey(),
      })
      .returning();
  }

  // Stage 1: create tenant Postgres (separate Supabase project).
  if (!infra.databaseUrl) {
    const { databaseUrl, projectRef } = await createSupabaseProject({
      name: `bot-${tenant.slug}`,
    });
    [infra] = await db
      .update(tenantInfra)
      .set({ databaseUrl })
      .where(eq(tenantInfra.tenantId, tenantId))
      .returning();
    console.info(
      `[provisioner] tenant ${tenant.slug}: supabase project ${projectRef} created`
    );
  }

  // Stage 2: create Railway service with env vars.
  if (!infra.railwayServiceId) {
    const envVars = buildBotEnvVars({
      tenant,
      secrets,
      databaseUrl: infra.databaseUrl!,
      apiKey: infra.botApiKey!,
    });
    const { serviceId, environmentId } = await createBotService({
      tenantSlug: tenant.slug,
      image: BOT_IMAGE,
      envVars,
    });
    [infra] = await db
      .update(tenantInfra)
      .set({
        railwayServiceId: serviceId,
        railwayEnvId: environmentId,
        version: BOT_IMAGE,
      })
      .where(eq(tenantInfra.tenantId, tenantId))
      .returning();
    console.info(
      `[provisioner] tenant ${tenant.slug}: railway service ${serviceId} created`
    );
  }

  // Stage 3: custom domain on Railway + Cloudflare CNAME.
  if (infra.railwayServiceId && infra.railwayEnvId) {
    const { defaultDomain } = await addCustomDomain({
      serviceId: infra.railwayServiceId,
      environmentId: infra.railwayEnvId,
      domain: infra.subdomain!,
    }).catch((err) => {
      // If the domain already exists on the service, Railway errors —
      // treat that as success and fall back to the convention.
      console.warn(
        `[provisioner] addCustomDomain warning: ${(err as Error).message}`
      );
      return { defaultDomain: `bot-${tenant.slug}.up.railway.app` };
    });

    await addCNAME({
      name: tenant.slug,
      target: defaultDomain,
    }).catch((err) => {
      // If the DNS record already exists, continue — we're idempotent.
      console.warn(
        `[provisioner] addCNAME warning: ${(err as Error).message}`
      );
    });
  }

  // Stage 4: poll bot /api/health until it returns 200 or we give up.
  const healthUrl = `https://${infra.subdomain}/api/health`;
  const healthy = await pollHealthy(healthUrl);

  const finalStatus: Tenant['status'] = healthy ? 'active' : 'paused';

  await db
    .update(tenantInfra)
    .set({
      healthStatus: healthy ? 'healthy' : 'unhealthy',
      lastHealthCheck: new Date(),
      provisionedAt: new Date(),
    })
    .where(eq(tenantInfra.tenantId, tenantId));

  await db
    .update(tenants)
    .set({ status: finalStatus, updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  if (!healthy) {
    throw new Error(
      `tenant ${tenant.slug} provisioned but failed health check after ${
        (HEALTH_POLL_MS * HEALTH_POLL_MAX) / 1000
      }s`
    );
  }
}

async function pollHealthy(url: string): Promise<boolean> {
  for (let attempt = 0; attempt < HEALTH_POLL_MAX; attempt++) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return true;
    } catch {
      // still booting — fall through to wait
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  return false;
}
