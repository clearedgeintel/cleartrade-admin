import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { subscriptions, tenants } from '@/db/schema';
import { PLANS } from '@/lib/plans';
import { PortalButton } from './portal-button';

export default async function BillingPage({
  params,
}: {
  params: { tenantId: string };
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const [row] = await db
    .select({
      tenant: tenants,
      subscription: subscriptions,
    })
    .from(tenants)
    .leftJoin(subscriptions, eq(subscriptions.tenantId, tenants.id))
    .where(and(eq(tenants.id, params.tenantId), eq(tenants.ownerId, userId)))
    .limit(1);

  if (!row) notFound();

  const { tenant, subscription } = row;
  const plan = PLANS[tenant.plan];

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link
          href={`/dashboard/${tenant.id}`}
          className="text-lg font-semibold tracking-tight"
        >
          ← {tenant.name}
        </Link>
      </header>

      <section className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage payment method, upgrade or cancel your plan, and view invoices.
        </p>

        <div className="mt-8 rounded-lg border border-border p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                Current plan
              </div>
              <div className="mt-1 text-2xl font-semibold">{plan.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                ${plan.priceMonthly}/month
              </div>
            </div>
            {subscription && (
              <StatusBadge status={subscription.status} />
            )}
          </div>

          <div className="mt-6 grid gap-3 text-sm">
            <KV
              k="Subscription status"
              v={subscription?.status ?? 'no subscription'}
            />
            <KV
              k="Renews on"
              v={
                subscription?.currentPeriodEnd
                  ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                  : '—'
              }
            />
            <KV
              k="Stripe customer"
              v={
                subscription?.stripeCustomerId
                  ? `${subscription.stripeCustomerId.slice(0, 12)}…`
                  : '—'
              }
            />
          </div>

          <div className="mt-8 border-t border-border pt-6">
            {subscription?.stripeCustomerId ? (
              <>
                <PortalButton tenantId={tenant.id} />
                <p className="mt-2 text-xs text-muted-foreground">
                  Opens Stripe&apos;s hosted billing portal. Changes sync back
                  to ClearTrade automatically.
                </p>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">
                No subscription to manage yet. Complete checkout from{' '}
                <Link href="/pricing" className="underline">
                  pricing
                </Link>{' '}
                to get started.
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'active'
      ? 'bg-green-500/10 text-green-600'
      : status === 'past_due'
      ? 'bg-yellow-500/10 text-yellow-600'
      : status === 'cancelled'
      ? 'bg-red-500/10 text-red-600'
      : 'bg-muted text-muted-foreground';
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono text-xs">{v}</span>
    </div>
  );
}
