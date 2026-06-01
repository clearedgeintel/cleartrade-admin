import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';
import type { Tenant } from '@/db/schema';
import { getTenantSecrets } from '@/lib/tenant-secrets';
import { buildBotEnvVars, generateBotApiKey } from './env-vars';
import {
  createSupabaseProject,
  parseProjectRef,
  waitForProjectReady,
} from './supabase';
import {
  addCustomDomain,
  createBotService,
  getLatestDeploymentStatus,
} from './railway';
import { addCNAME } from './cloudflare';
import { clearProvisionEvents, emitProvisionEvent } from './events';

const BOT_IMAGE =
  process.env.BOT_DOCKER_IMAGE ?? 'ghcr.io/clearedgeintel/alpaca-trader:latest';
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

  // Fresh log for this attempt.
  await clearProvisionEvents(tenantId);
  await emitProvisionEvent(
    tenantId,
    'info',
    `Starting provisioning for "${tenant.name}" (${tenant.slug})`
  );

  const secrets = await getTenantSecrets(tenantId);
  if (!secrets) {
    await emitProvisionEvent(
      tenantId,
      'error',
      'Onboarding incomplete — no Alpaca credentials on file.'
    );
    throw new Error(
      `tenant ${tenantId} has no secrets — onboarding incomplete`
    );
  }

  const baseDomain = process.env.BASE_DOMAIN;
  if (!baseDomain) {
    await emitProvisionEvent(tenantId, 'error', 'BASE_DOMAIN is not set.');
    throw new Error('BASE_DOMAIN is not set');
  }

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
  } else if (!infra.subdomain || !infra.botApiKey) {
    // The row may have been pre-created by the provisioning worker purely to
    // hold its claim lock (subdomain/botApiKey null). Backfill the identity
    // fields before any stage relies on them. Only fill what's missing so a
    // re-run never rotates an already-issued bot API key.
    [infra] = await db
      .update(tenantInfra)
      .set({
        subdomain: infra.subdomain ?? `${tenant.slug}.${baseDomain}`,
        botApiKey: infra.botApiKey ?? generateBotApiKey(),
      })
      .where(eq(tenantInfra.tenantId, tenantId))
      .returning();
  }

  // Stage 1: create tenant Postgres (separate Supabase project).
  if (!infra.databaseUrl) {
    await emitProvisionEvent(
      tenantId,
      'info',
      'Creating isolated database (new Supabase project)…'
    );
    const { databaseUrl, projectRef } = await createSupabaseProject({
      name: `bot-${tenant.slug}`,
    });
    [infra] = await db
      .update(tenantInfra)
      .set({ databaseUrl })
      .where(eq(tenantInfra.tenantId, tenantId))
      .returning();
    await emitProvisionEvent(
      tenantId,
      'success',
      `Database created (project ${projectRef}).`
    );
  } else {
    await emitProvisionEvent(tenantId, 'info', 'Database already provisioned — skipping.');
  }

  // Stage 1b: wait for the database to actually be reachable before we deploy
  // the bot — otherwise the bot crashes on its first connection. Skipped once
  // the Railway service already exists (we're past this point on a resume).
  if (!infra.railwayServiceId) {
    const projectRef = parseProjectRef(infra.databaseUrl!);
    if (projectRef) {
      await emitProvisionEvent(
        tenantId,
        'info',
        'Waiting for the database to come online…'
      );
      const ready = await waitForProjectReady(projectRef, {
        onStatus: (s) =>
          emitProvisionEvent(tenantId, 'info', `Database status: ${s}`),
      });
      if (ready) {
        await emitProvisionEvent(tenantId, 'success', 'Database is ready.');
      } else {
        await emitProvisionEvent(
          tenantId,
          'warn',
          'Database still coming up — will resume provisioning shortly.'
        );
        throw new Error(
          `tenant ${tenant.slug}: database not ready yet; provisioning will resume`
        );
      }
    }
  }

  // Stage 2: create Railway service with env vars.
  if (!infra.railwayServiceId) {
    await emitProvisionEvent(
      tenantId,
      'info',
      'Creating bot service on Railway from the container image…'
    );
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
    await emitProvisionEvent(
      tenantId,
      'success',
      'Bot service created — image is building.'
    );
  } else {
    await emitProvisionEvent(tenantId, 'info', 'Bot service already exists — skipping.');
  }

  // Stage 3: custom domain on Railway + Cloudflare CNAME.
  if (infra.railwayServiceId && infra.railwayEnvId) {
    await emitProvisionEvent(
      tenantId,
      'info',
      `Configuring subdomain ${infra.subdomain}…`
    );
    const { defaultDomain } = await addCustomDomain({
      serviceId: infra.railwayServiceId,
      environmentId: infra.railwayEnvId,
      domain: infra.subdomain!,
    }).catch(async (err) => {
      // If the domain already exists on the service, Railway errors —
      // treat that as success and fall back to the convention.
      await emitProvisionEvent(
        tenantId,
        'warn',
        `Railway custom domain step: ${(err as Error).message} — using default domain.`
      );
      return { defaultDomain: `bot-${tenant.slug}.up.railway.app` };
    });

    await addCNAME({
      name: tenant.slug,
      target: defaultDomain,
    })
      .then(() =>
        emitProvisionEvent(
          tenantId,
          'success',
          `DNS record created: ${infra.subdomain} → ${defaultDomain}`
        )
      )
      .catch((err) =>
        // If the DNS record already exists, continue — we're idempotent.
        emitProvisionEvent(
          tenantId,
          'warn',
          `DNS step: ${(err as Error).message}`
        )
      );
  }

  // Stage 4: wait for the bot to come online (and surface deploy failures).
  await emitProvisionEvent(
    tenantId,
    'info',
    'Waiting for the bot to deploy and pass its health check…'
  );
  const healthUrl = `https://${infra.subdomain}/api/health`;
  const healthy = await pollHealthy({
    url: healthUrl,
    tenantId,
    serviceId: infra.railwayServiceId ?? undefined,
    environmentId: infra.railwayEnvId ?? undefined,
  });

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

  if (healthy) {
    await emitProvisionEvent(
      tenantId,
      'success',
      `Bot is live at https://${infra.subdomain} ✅`
    );
  } else {
    await emitProvisionEvent(
      tenantId,
      'error',
      `Bot did not become healthy in time — tenant left paused. Check the bot deploy logs on Railway.`
    );
    throw new Error(
      `tenant ${tenant.slug} provisioned but failed health check after ${
        (HEALTH_POLL_MS * HEALTH_POLL_MAX) / 1000
      }s`
    );
  }
}

async function pollHealthy(opts: {
  url: string;
  tenantId: string;
  serviceId?: string;
  environmentId?: string;
}): Promise<boolean> {
  const { url, tenantId, serviceId, environmentId } = opts;
  let lastDeployStatus: string | null = null;

  for (let attempt = 0; attempt < HEALTH_POLL_MAX; attempt++) {
    // Surface Railway deploy-status transitions in the live log, and bail
    // early if the deploy failed — no point waiting out the whole poll.
    if (serviceId && environmentId) {
      try {
        const status = await getLatestDeploymentStatus({
          serviceId,
          environmentId,
        });
        if (status && status !== lastDeployStatus) {
          lastDeployStatus = status;
          const failed = status === 'FAILED' || status === 'CRASHED';
          await emitProvisionEvent(
            tenantId,
            failed ? 'error' : 'info',
            `Bot deployment status: ${status}`
          );
          if (failed) return false;
        }
      } catch {
        // status check is best-effort
      }
    }

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
