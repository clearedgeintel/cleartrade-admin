import Link from 'next/link';
import { desc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { PLANS } from '@/lib/plans';

export default async function AdminOverviewPage() {
  // Counts by status and plan, and MRR. Everything is a single roundtrip
  // because the admin page is a quick-glance view — expensive joins get
  // their own page.
  const [statusCounts, planCounts, recent] = await Promise.all([
    db
      .select({
        status: tenants.status,
        count: sql<number>`count(*)::int`,
      })
      .from(tenants)
      .groupBy(tenants.status),
    db
      .select({
        plan: tenants.plan,
        count: sql<number>`count(*)::int`,
      })
      .from(tenants)
      .groupBy(tenants.plan),
    db
      .select()
      .from(tenants)
      .orderBy(desc(tenants.createdAt))
      .limit(10),
  ]);

  const totalTenants = statusCounts.reduce((acc, r) => acc + r.count, 0);
  const activeCount =
    statusCounts.find((r) => r.status === 'active')?.count ?? 0;
  const mrr = planCounts.reduce(
    (acc, r) => acc + PLANS[r.plan].priceMonthly * r.count,
    0
  );

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Fleet overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Back-of-envelope state across all tenants.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric label="Total tenants" value={String(totalTenants)} />
        <Metric label="Active" value={String(activeCount)} />
        <Metric
          label="Estimated MRR"
          value={mrr.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
          })}
        />
        <Metric
          label="New this week"
          value={String(
            recent.filter(
              (t) =>
                Date.now() - new Date(t.createdAt).getTime() <
                7 * 24 * 60 * 60 * 1000
            ).length
          )}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="By status">
          {statusCounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tenants yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {statusCounts.map((r) => (
                <li
                  key={r.status}
                  className="flex items-center justify-between"
                >
                  <span className="font-mono">{r.status}</span>
                  <span className="font-medium">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="By plan">
          {planCounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tenants yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {planCounts.map((r) => (
                <li key={r.plan} className="flex items-center justify-between">
                  <span>{PLANS[r.plan].name}</span>
                  <span className="font-medium">
                    {r.count} · {(
                      PLANS[r.plan].priceMonthly * r.count
                    ).toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      maximumFractionDigits: 0,
                    })}
                    /mo
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Most recent signups">
        {recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tenants yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {recent.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div>
                  <Link
                    href={`/admin/tenants/${t.id}`}
                    className="font-medium hover:underline"
                  >
                    {t.name}
                  </Link>
                  <span className="ml-2 text-muted-foreground">
                    {t.slug} · {t.plan}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>{t.status}</span>
                  <span>{new Date(t.createdAt).toLocaleDateString()}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-4 py-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}
