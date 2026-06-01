import { eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';
import { listProjectServices } from '@/lib/provisioner/railway';
import {
  listSupabaseProjects,
  parseProjectRef,
} from '@/lib/provisioner/supabase';

export interface RailwayOrphan {
  id: string;
  name: string;
}
export interface SupabaseOrphan {
  ref: string;
  name: string;
  status: string;
}

export interface OrphanReport {
  railway: RailwayOrphan[];
  supabase: SupabaseOrphan[];
  errors: string[];
  // counts of resources kept because they belong to a live (non-cancelled)
  // tenant — shown so the admin can sanity-check the reconcile.
  liveServiceCount: number;
  liveSupabaseCount: number;
}

/**
 * Cross-references the cloud (Railway services, Supabase projects) against the
 * admin DB to find ClearTrade bot resources that no longer belong to any live
 * tenant — leftovers from failed or cancelled provisions that are still
 * costing money.
 *
 * A resource is an orphan iff its name starts with `bot-` AND it is not
 * referenced by a tenant whose status is not 'cancelled'. The `bot-` prefix
 * guards the admin's own service and unrelated Supabase projects in the org.
 */
export async function computeOrphans(): Promise<OrphanReport> {
  const errors: string[] = [];

  // Resources currently in use by a live tenant.
  const live = await db
    .select({
      serviceId: tenantInfra.railwayServiceId,
      databaseUrl: tenantInfra.databaseUrl,
    })
    .from(tenantInfra)
    .innerJoin(tenants, eq(tenants.id, tenantInfra.tenantId))
    .where(ne(tenants.status, 'cancelled'));

  const liveServiceIds = new Set(
    live.map((l) => l.serviceId).filter((v): v is string => !!v)
  );
  const liveRefs = new Set(
    live
      .map((l) => (l.databaseUrl ? parseProjectRef(l.databaseUrl) : null))
      .filter((v): v is string => !!v)
  );

  const [services, projects] = await Promise.all([
    listProjectServices().catch((e: Error) => {
      errors.push(`railway: ${e.message}`);
      return [] as { id: string; name: string }[];
    }),
    listSupabaseProjects().catch((e: Error) => {
      errors.push(`supabase: ${e.message}`);
      return [] as { ref: string; name: string; status: string }[];
    }),
  ]);

  const railway = services.filter(
    (s) => s.name.startsWith('bot-') && !liveServiceIds.has(s.id)
  );
  const supabase = projects.filter(
    (p) => p.name.startsWith('bot-') && !liveRefs.has(p.ref)
  );

  return {
    railway,
    supabase,
    errors,
    liveServiceCount: liveServiceIds.size,
    liveSupabaseCount: liveRefs.size,
  };
}
