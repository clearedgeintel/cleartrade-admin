import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { PLANS } from '@/lib/plans';
import { Logo, Panel, btn } from '@/components/ui';
import { OnboardingForm } from './onboarding-form';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) return null;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.ownerId, userId), eq(tenants.status, 'pending')))
    .orderBy(desc(tenants.createdAt))
    .limit(1);

  return (
    <main className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-25" />

      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-2xl items-center justify-between px-6 py-3.5">
          <Link href="/">
            <Logo />
          </Link>
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <section className="mx-auto w-full max-w-2xl px-6 py-12">
        {!tenant ? (
          <Panel className="flex flex-col items-center gap-3 p-10 text-center">
            <h1 className="text-xl font-semibold">No bot to onboard</h1>
            <p className="max-w-sm text-sm text-muted-foreground">
              You haven&apos;t picked a plan yet — or your most recent setup is
              already complete.
            </p>
            <div className="mt-2 flex gap-3">
              <Link href="/pricing" className={btn.primary}>
                Choose a plan
              </Link>
              <Link href="/dashboard" className={btn.ghost}>
                Dashboard
              </Link>
            </div>
          </Panel>
        ) : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">
              Set up your bot
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Plan:{' '}
              <span className="font-medium text-foreground">
                {PLANS[tenant.plan].name}
              </span>
              {' · '}
              <span className="tnum font-mono">
                ${PLANS[tenant.plan].priceMonthly}/mo
              </span>
            </p>
            <Panel className="mt-8 p-6">
              <OnboardingForm tenantId={tenant.id} plan={tenant.plan} />
            </Panel>
          </>
        )}
      </section>
    </main>
  );
}
