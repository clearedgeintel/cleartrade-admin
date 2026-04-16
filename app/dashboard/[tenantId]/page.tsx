import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';
import { PLANS } from '@/lib/plans';
import { ProvisionButton } from './provision-button';

export default async function TenantDetailPage({
  params,
}: {
  params: { tenantId: string };
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const [row] = await db
    .select({
      tenant: tenants,
      infra: tenantInfra,
    })
    .from(tenants)
    .leftJoin(tenantInfra, eq(tenantInfra.tenantId, tenants.id))
    .where(and(eq(tenants.id, params.tenantId), eq(tenants.ownerId, userId)))
    .limit(1);

  if (!row) notFound();

  const { tenant, infra } = row;
  const plan = PLANS[tenant.plan];
  const needsOnboarding = !tenant.onboardingCompletedAt;
  const readyToProvision =
    tenant.onboardingCompletedAt && tenant.status !== 'active';

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
          ← ClearTrade
        </Link>
      </header>

      <section className="mx-auto w-full max-w-3xl px-6 py-12">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {tenant.name}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {tenant.slug} · {plan.name} plan · status{' '}
              <StatusBadge status={tenant.status} />
            </p>
          </div>
          {infra?.subdomain && tenant.status === 'active' && (
            <a
              href={`https://${infra.subdomain}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Open bot UI ↗
            </a>
          )}
        </div>

        {needsOnboarding && (
          <div className="mt-8 rounded-lg border border-border p-6">
            <h2 className="text-lg font-semibold">Finish onboarding</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Provide your Alpaca keys and preferences before we can spin up
              your bot.
            </p>
            <Link
              href="/onboarding"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Continue onboarding →
            </Link>
          </div>
        )}

        {readyToProvision && (
          <div className="mt-8 rounded-lg border border-border p-6">
            <h2 className="text-lg font-semibold">
              {infra?.provisionedAt ? 'Retry provisioning' : 'Provision bot'}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              This creates a dedicated Postgres, deploys your bot to Railway,
              wires up DNS, and waits for it to become healthy. Takes about
              2 minutes.
            </p>
            <div className="mt-4">
              <ProvisionButton tenantId={tenant.id} />
            </div>
          </div>
        )}

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <InfoCard label="Subdomain" value={infra?.subdomain ?? '—'} />
          <InfoCard
            label="Health"
            value={infra?.healthStatus ?? 'unknown'}
          />
          <InfoCard
            label="Railway service"
            value={infra?.railwayServiceId ?? '—'}
          />
          <InfoCard
            label="Provisioned at"
            value={
              infra?.provisionedAt
                ? new Date(infra.provisionedAt).toLocaleString()
                : '—'
            }
          />
        </div>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'active'
      ? 'bg-green-500/10 text-green-600'
      : status === 'provisioning'
      ? 'bg-blue-500/10 text-blue-600'
      : status === 'paused' || status === 'past_due'
      ? 'bg-yellow-500/10 text-yellow-600'
      : status === 'cancelled'
      ? 'bg-red-500/10 text-red-600'
      : 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border px-4 py-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate font-mono text-sm">{value}</div>
    </div>
  );
}
