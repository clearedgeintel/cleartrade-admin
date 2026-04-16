import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { PLANS, type PlanId } from '@/lib/plans';
import { CheckoutButton } from './checkout-button';

export default async function PricingPage() {
  const { userId } = await auth();
  const order: PlanId[] = ['starter', 'pro', 'enterprise'];

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          ClearTrade
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {userId ? (
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
          ) : (
            <Link href="/sign-in" className="text-muted-foreground hover:text-foreground">
              Sign in
            </Link>
          )}
        </nav>
      </header>

      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight">Pricing</h1>
          <p className="mt-3 text-muted-foreground">
            Pick a plan. You can change or cancel anytime from the billing portal.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {order.map((id) => {
            const plan = PLANS[id];
            const highlighted = id === 'pro';
            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-6 ${
                  highlighted ? 'border-foreground shadow-lg' : 'border-border'
                }`}
              >
                <div className="flex items-baseline justify-between">
                  <h2 className="text-xl font-semibold">{plan.name}</h2>
                  {highlighted && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      Most popular
                    </span>
                  )}
                </div>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold">
                    ${plan.priceMonthly}
                  </span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </div>
                <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
                  {plan.features.map((f) => (
                    <li key={f}>· {f}</li>
                  ))}
                </ul>
                <div className="mt-8">
                  {userId ? (
                    <CheckoutButton plan={plan.id} highlighted={highlighted} />
                  ) : (
                    <Link
                      href={`/sign-up?redirect_url=/pricing`}
                      className={`block w-full rounded-md px-4 py-2 text-center font-medium ${
                        highlighted
                          ? 'bg-primary text-primary-foreground hover:opacity-90'
                          : 'border border-border hover:bg-muted'
                      }`}
                    >
                      Sign up to start
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
