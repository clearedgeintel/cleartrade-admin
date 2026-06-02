import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';
import { desc, eq } from 'drizzle-orm';
import { PLANS } from '@/lib/plans';
import { Logo, Panel, StatusBadge, StatusDot } from '@/components/ui';
import { NewBotButton } from './new-bot-button';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const rows = await db
    .select({ tenant: tenants, infra: tenantInfra })
    .from(tenants)
    .leftJoin(tenantInfra, eq(tenantInfra.tenantId, tenants.id))
    .where(eq(tenants.ownerId, userId))
    .orderBy(desc(tenants.createdAt));

  const live = rows.filter((r) => r.tenant.status !== 'cancelled');

  return (
    <main className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-30" />

      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3.5">
          <Logo />
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden items-center gap-1.5 text-xs text-muted-foreground sm:flex">
              <StatusDot tone="profit" pulse /> {live.length} live
            </span>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl px-6 py-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your bots</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {rows.length === 0
                ? 'No bots yet — spin up your first trading bot.'
                : `${live.length} active · ${rows.length} total`}
            </p>
          </div>
          <NewBotButton />
        </div>

        {rows.length === 0 ? (
          <Panel className="mt-8 flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 16l4-5 4 3 7-8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15 6h5v5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Your trading bots will show up here. Create one to get started.
            </p>
          </Panel>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {rows.map(({ tenant, infra }) => {
              const plan = PLANS[tenant.plan];
              const dimmed = tenant.status === 'cancelled';
              return (
                <Link
                  key={tenant.id}
                  href={`/dashboard/${tenant.id}`}
                  className={`group ${dimmed ? 'opacity-55' : ''}`}
                >
                  <Panel className="p-5 transition hover:border-border-strong hover:bg-surface-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-base font-semibold tracking-tight">
                          {tenant.name}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                          {infra?.subdomain ?? tenant.slug}
                        </div>
                      </div>
                      <StatusBadge status={tenant.status} />
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border">
                      <Cell label="Plan" value={plan.name} />
                      <Cell
                        label="Health"
                        value={
                          <span className="inline-flex items-center gap-1.5">
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
                        }
                      />
                      <Cell label="Mode" value={tenant.agencyMode ?? '—'} />
                    </div>

                    <div className="mt-4 flex items-center justify-end text-xs text-muted-foreground transition group-hover:text-primary">
                      Open desk →
                    </div>
                  </Panel>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-xs font-medium capitalize">
        {value}
      </div>
    </div>
  );
}
