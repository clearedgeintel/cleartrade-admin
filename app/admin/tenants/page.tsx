import Link from 'next/link';
import { desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';
import { Panel, StatusBadge, StatusDot } from '@/components/ui';

export default async function AdminTenantsPage() {
  const rows = await db
    .select({ tenant: tenants, infra: tenantInfra })
    .from(tenants)
    .leftJoin(tenantInfra, eq(tenantInfra.tenantId, tenants.id))
    .orderBy(desc(tenants.createdAt));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Tenants</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {rows.length} total · all owners
        </p>
      </div>

      <Panel className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Subdomain</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Health</th>
              <th className="px-4 py-3 font-medium">Created</th>
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
                <tr key={tenant.id} className="hover:bg-surface-2/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/tenants/${tenant.id}`}
                      className="font-medium hover:text-primary"
                    >
                      {tenant.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {infra?.subdomain ?? tenant.slug}
                  </td>
                  <td className="px-4 py-3 capitalize">{tenant.plan}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={tenant.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <StatusDot
                        tone={
                          infra?.healthStatus === 'healthy'
                            ? 'profit'
                            : infra?.healthStatus === 'unhealthy'
                            ? 'loss'
                            : 'muted'
                        }
                      />
                      {infra?.healthStatus ?? 'unknown'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(tenant.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
