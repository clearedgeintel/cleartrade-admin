import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';

export default async function AdminTenantsPage() {
  const rows = await db
    .select({
      tenant: tenants,
      infra: tenantInfra,
    })
    .from(tenants)
    .leftJoin(tenantInfra, eq(tenantInfra.tenantId, tenants.id))
    .orderBy(desc(tenants.createdAt));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Tenants</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length} total · all owners
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Health</th>
              <th className="px-4 py-3">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No tenants yet.
                </td>
              </tr>
            ) : (
              rows.map(({ tenant, infra }) => (
                <tr key={tenant.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/tenants/${tenant.id}`}
                      className="font-medium hover:underline"
                    >
                      {tenant.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{tenant.slug}</td>
                  <td className="px-4 py-3">{tenant.plan}</td>
                  <td className="px-4 py-3">
                    <StatusPill status={tenant.status} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={infra?.healthStatus ?? 'unknown'} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const color =
    status === 'active' || status === 'healthy'
      ? 'bg-green-500/10 text-green-600'
      : status === 'provisioning'
      ? 'bg-blue-500/10 text-blue-600'
      : status === 'degraded' || status === 'paused' || status === 'past_due'
      ? 'bg-yellow-500/10 text-yellow-600'
      : status === 'cancelled' || status === 'unhealthy'
      ? 'bg-red-500/10 text-red-600'
      : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}
