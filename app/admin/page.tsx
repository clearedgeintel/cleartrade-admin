import Link from 'next/link';
import { desc, sql } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { PLANS } from '@/lib/plans';
import { Panel, PanelHeader, StatusBadge } from '@/components/ui';

export default async function AdminOverviewPage() {
  const [statusCounts, planCounts, recent] = await Promise.all([
    db
      .select({ status: tenants.status, count: sql<number>`count(*)::int` })
      .from(tenants)
      .groupBy(tenants.status),
    db
      .select({ plan: tenants.plan, count: sql<number>`count(*)::int` })
      .from(tenants)
      .groupBy(tenants.plan),
    db.select().from(tenants).orderBy(desc(tenants.createdAt)).limit(10),
  ]);

  const totalTenants = statusCounts.reduce((a, r) => a + r.count, 0);
  const activeCount = statusCounts.find((r) => r.status === 'active')?.count ?? 0;
  const mrr = planCounts.reduce(
    (a, r) => a + PLANS[r.plan].priceMonthly * r.count,
    0
  );
  const newWeek = recent.filter(
    (t) =>
      Date.now() - new Date(t.createdAt).getTime() < 7 * 24 * 60 * 60 * 1000
  ).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Fleet overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          State across all tenants.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
        <Metric label="Total bots" value={String(totalTenants)} />
        <Metric label="Active" value={String(activeCount)} tone="profit" />
        <Metric
          label="Est. MRR"
          value={mrr.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
          })}
        />
        <Metric label="New this week" value={String(newWeek)} />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel>
          <PanelHeader title="By status" />
          <div className="divide-y divide-border">
            {statusCounts.length === 0 ? (
              <Empty />
            ) : (
              statusCounts.map((r) => (
                <div
                  key={r.status}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <StatusBadge status={r.status} />
                  <span className="tnum font-mono font-medium">{r.count}</span>
                </div>
              ))
            )}
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="By plan · MRR" />
          <div className="divide-y divide-border">
            {planCounts.length === 0 ? (
              <Empty />
            ) : (
              planCounts.map((r) => (
                <div
                  key={r.plan}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <span>{PLANS[r.plan].name}</span>
                  <span className="tnum font-mono text-muted-foreground">
                    {r.count} ·{' '}
                    <span className="text-foreground">
                      {(PLANS[r.plan].priceMonthly * r.count).toLocaleString(
                        'en-US',
                        { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }
                      )}
                      /mo
                    </span>
                  </span>
                </div>
              ))
            )}
          </div>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Recent signups" />
        <div className="divide-y divide-border">
          {recent.length === 0 ? (
            <Empty />
          ) : (
            recent.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/tenants/${t.id}`}
                    className="font-medium hover:text-primary"
                  >
                    {t.name}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {t.slug} · {t.plan}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={t.status} />
                  <span className="text-xs text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Panel>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'profit';
}) {
  return (
    <div className="bg-surface px-5 py-4">
      <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`tnum mt-1.5 font-mono text-2xl font-semibold tracking-tight ${
          tone === 'profit' ? 'text-profit' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Empty() {
  return (
    <div className="px-4 py-6 text-sm text-muted-foreground">No tenants yet.</div>
  );
}
