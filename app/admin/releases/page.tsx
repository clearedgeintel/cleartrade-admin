import { and, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';
import { latestImageRef, listReleases, type Release } from '@/lib/releases';
import { ReleaseManager } from './release-manager';

export const dynamic = 'force-dynamic';

export default async function AdminReleasesPage() {
  let releases: Release[] = [];
  let releasesError: string | null = null;
  try {
    releases = await listReleases();
  } catch (err) {
    releasesError = err instanceof Error ? err.message : 'could not list images';
  }

  const bots = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      status: tenants.status,
      version: tenantInfra.version,
      serviceId: tenantInfra.railwayServiceId,
    })
    .from(tenants)
    .innerJoin(tenantInfra, eq(tenantInfra.tenantId, tenants.id))
    .where(and(inArray(tenants.status, ['active', 'paused'])))
    .orderBy(desc(tenants.createdAt));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Releases</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Roll bots forward to the latest image or pin them to a specific build.
          New bots always provision on <code className="text-foreground">latest</code>.
        </p>
      </div>

      {releasesError && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          Couldn&apos;t read the image registry: {releasesError}
        </div>
      )}

      <ReleaseManager
        releases={releases}
        latestImage={latestImageRef()}
        bots={bots.map((b) => ({
          id: b.id,
          name: b.name,
          slug: b.slug,
          status: b.status,
          version: b.version,
          hasService: !!b.serviceId,
        }))}
      />
    </div>
  );
}
