import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';
import { deleteService } from './railway';
import { removeDNSRecordsFor } from './cloudflare';
import { deleteSupabaseProject, parseProjectRef } from './supabase';

/**
 * Tears down all infrastructure for a tenant. Idempotent: if something
 * is already gone (404 from an upstream API, field is null in our DB),
 * we continue. Collects errors and reports at the end so a single
 * upstream hiccup doesn't orphan the remaining resources.
 */
export async function deprovisionTenant(tenantId: string): Promise<void> {
  const [infra] = await db
    .select()
    .from(tenantInfra)
    .where(eq(tenantInfra.tenantId, tenantId))
    .limit(1);

  const errors: string[] = [];

  // Railway — delete the service. This also removes its custom domain.
  if (infra?.railwayServiceId) {
    try {
      await deleteService(infra.railwayServiceId);
    } catch (err) {
      errors.push(`railway: ${(err as Error).message}`);
    }
  }

  // Cloudflare — delete the CNAME for this tenant's subdomain.
  if (infra?.subdomain) {
    try {
      await removeDNSRecordsFor(infra.subdomain);
    } catch (err) {
      errors.push(`cloudflare: ${(err as Error).message}`);
    }
  }

  // Supabase — delete the tenant's dedicated project. Pulls the ref out
  // of the stored databaseUrl.
  if (infra?.databaseUrl) {
    const ref = parseProjectRef(infra.databaseUrl);
    if (ref) {
      try {
        await deleteSupabaseProject(ref);
      } catch (err) {
        errors.push(`supabase: ${(err as Error).message}`);
      }
    }
  }

  // Zero out the infra row so a retry starts clean.
  if (infra) {
    await db
      .update(tenantInfra)
      .set({
        railwayServiceId: null,
        railwayEnvId: null,
        databaseUrl: null,
        healthStatus: 'unknown',
        lastHealthCheck: null,
        provisionedAt: null,
      })
      .where(eq(tenantInfra.tenantId, tenantId));
  }

  await db
    .update(tenants)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(tenants.id, tenantId));

  if (errors.length > 0) {
    // Surface partial-failure so callers can log or retry. The DB is
    // already in a safe state — next retry is idempotent.
    throw new Error(`deprovision partial failure: ${errors.join('; ')}`);
  }
}
