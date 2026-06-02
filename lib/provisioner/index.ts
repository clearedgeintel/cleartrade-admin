import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';
import type { Tenant } from '@/db/schema';
import { getTenantSecrets } from '@/lib/tenant-secrets';
import { buildBotEnvVars, generateBotApiKey } from './env-vars';
import {
  createSupabaseProject,
  parseProjectRef,
  waitForDatabaseConnectable,
  waitForProjectReady,
} from './supabase';
import {
  addCustomDomain,
  createBotService,
  getLatestDeploymentStatus,
  getOrCreateServiceDomain,
} from './railway';
import { addCNAME, addTXT } from './cloudflare';
import { clearProvisionEvents, emitProvisionEvent } from './events';
import { resolveLatestImage } from '@/lib/releases';

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
  } else if (
    !infra.subdomain ||
    !infra.botApiKey ||
    !infra.subdomain.endsWith(`.${baseDomain}`)
  ) {
    // Backfill/repair the identity fields:
    //  - subdomain/botApiKey may be null if the worker pre-created the row to
    //    hold its claim lock;
    //  - the subdomain is re-derived if it doesn't match the current
    //    BASE_DOMAIN (e.g. the base domain was changed after the row was
    //    seeded), so a stale domain can't persist into DNS.
    // botApiKey is only ever filled when missing, never rotated.
    const subdomainOk =
      infra.subdomain && infra.subdomain.endsWith(`.${baseDomain}`);
    [infra] = await db
      .update(tenantInfra)
      .set({
        subdomain: subdomainOk
          ? infra.subdomain!
          : `${tenant.slug}.${baseDomain}`,
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
      if (!ready) {
        await emitProvisionEvent(
          tenantId,
          'warn',
          'Database still coming up — will resume provisioning shortly.'
        );
        throw new Error(
          `tenant ${tenant.slug}: database not ready yet; provisioning will resume`
        );
      }
      await emitProvisionEvent(tenantId, 'success', 'Database is healthy.');

      // ACTIVE_HEALTHY is not enough: the connection pooler registers the new
      // project a little later. Wait until it actually accepts a connection —
      // otherwise the bot crashes on boot with "tenant/user ... not found".
      await emitProvisionEvent(
        tenantId,
        'info',
        'Verifying the database accepts connections…'
      );
      const connectable = await waitForDatabaseConnectable(infra.databaseUrl!);
      if (connectable) {
        await emitProvisionEvent(
          tenantId,
          'success',
          'Database is accepting connections.'
        );
      } else {
        await emitProvisionEvent(
          tenantId,
          'warn',
          'Database not accepting connections yet — will resume provisioning shortly.'
        );
        throw new Error(
          `tenant ${tenant.slug}: database pooler not ready yet; provisioning will resume`
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
    // Pin to the exact commit `:latest` currently points at, so the bot records
    // its precise version from day one (falls back to `:latest` if unresolved).
    const image = await resolveLatestImage();
    const { serviceId, environmentId } = await createBotService({
      tenantSlug: tenant.slug,
      image,
      envVars,
    });
    [infra] = await db
      .update(tenantInfra)
      .set({
        railwayServiceId: serviceId,
        railwayEnvId: environmentId,
        version: image,
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

  // Stage 3: networking. Create a Railway service domain (works on every plan)
  // to health-check against, then best-effort attach the friendly custom
  // subdomain — its TLS cert provisions asynchronously, so we don't block on it.
  let healthHost = infra.subdomain!; // fallback if the service domain step fails
  if (infra.railwayServiceId && infra.railwayEnvId) {
    const projectId = process.env.RAILWAY_PROJECT_ID;
    if (!projectId) throw new Error('RAILWAY_PROJECT_ID is not set');

    await emitProvisionEvent(tenantId, 'info', 'Setting up bot networking…');
    try {
      healthHost = await getOrCreateServiceDomain({
        projectId,
        serviceId: infra.railwayServiceId,
        environmentId: infra.railwayEnvId,
      });
      await emitProvisionEvent(tenantId, 'success', `Bot URL: ${healthHost}`);
    } catch (err) {
      await emitProvisionEvent(
        tenantId,
        'warn',
        `Service domain step: ${(err as Error).message}`
      );
    }

    // Friendly custom subdomain ({slug}.BASE_DOMAIN): register on Railway, then
    // create the CNAME (DNS-only) + ownership TXT in Cloudflare. Best-effort —
    // if the plan or DNS isn't ready, the bot still works on its Railway URL.
    await emitProvisionEvent(tenantId, 'info', `Attaching ${infra.subdomain}…`);
    try {
      const cd = await addCustomDomain({
        projectId,
        serviceId: infra.railwayServiceId,
        environmentId: infra.railwayEnvId,
        domain: infra.subdomain!,
      });
      await addCNAME({ name: tenant.slug, target: cd.cnameTarget });
      if (cd.verificationHost && cd.verificationToken) {
        await addTXT({
          name: cd.verificationHost,
          content: cd.verificationToken,
        });
      }
      await emitProvisionEvent(
        tenantId,
        'success',
        `${infra.subdomain} attached — TLS cert provisioning (live in a few minutes).`
      );
    } catch (err) {
      await emitProvisionEvent(
        tenantId,
        'warn',
        `Custom domain skipped: ${(err as Error).message}. Bot reachable at ${healthHost}.`
      );
    }
  }

  // Stage 4: wait for the bot to come online. Health-check the Railway domain
  // (reachable immediately — the custom domain's cert is still provisioning),
  // sending the bot API key so authenticated endpoints work too.
  await emitProvisionEvent(
    tenantId,
    'info',
    'Waiting for the bot to deploy and pass its health check…'
  );
  const healthUrl = `https://${healthHost}/api/health`;
  const healthy = await pollHealthy({
    url: healthUrl,
    tenantId,
    apiKey: infra.botApiKey ?? undefined,
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
      `Bot is live ✅ at https://${healthHost} (also https://${infra.subdomain} once its cert finishes).`
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
  apiKey?: string;
  serviceId?: string;
  environmentId?: string;
}): Promise<boolean> {
  const { url, tenantId, apiKey, serviceId, environmentId } = opts;
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
      const res = await fetch(url, {
        cache: 'no-store',
        headers: apiKey ? { 'x-api-key': apiKey } : {},
      });
      if (res.ok) return true;
    } catch {
      // still booting — fall through to wait
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_MS));
  }
  return false;
}
