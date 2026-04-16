import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { PLANS } from '@/lib/plans';
import { OnboardingForm } from './onboarding-form';

export default async function OnboardingPage() {
  const { userId } = await auth();
  if (!userId) return null;

  // Find the most recent pending tenant for this user. The Stripe webhook
  // creates it on checkout.session.completed; if the user lands here without
  // a pending tenant, they need to pick a plan first.
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.ownerId, userId), eq(tenants.status, 'pending')))
    .orderBy(desc(tenants.createdAt))
    .limit(1);

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          ClearTrade
        </Link>
      </header>

      <section className="mx-auto w-full max-w-2xl px-6 py-12">
        {!tenant ? (
          <div className="rounded-lg border border-border p-8 text-center">
            <h1 className="text-2xl font-semibold">No tenant to onboard</h1>
            <p className="mt-2 text-muted-foreground">
              Looks like you haven&apos;t picked a plan yet — or your most
              recent setup is already complete.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <Link
                href="/pricing"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Choose a plan
              </Link>
              <Link
                href="/dashboard"
                className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                Go to dashboard
              </Link>
            </div>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-semibold tracking-tight">
              Set up your bot
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Plan: <span className="font-medium">{PLANS[tenant.plan].name}</span>
              {' · '}${PLANS[tenant.plan].priceMonthly}/mo
            </p>
            <div className="mt-8">
              <OnboardingForm tenantId={tenant.id} plan={tenant.plan} />
            </div>
          </>
        )}
      </section>
    </main>
  );
}
