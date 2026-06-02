import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { PLANS, type PlanId } from '@/lib/plans';
import { Logo, Panel, btn } from '@/components/ui';
import { CheckoutButton } from './checkout-button';

export default async function PricingPage() {
  const { userId } = await auth();
  const order: PlanId[] = ['starter', 'pro', 'enterprise'];

  return (
    <main className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-30" />
      <div className="pointer-events-none absolute left-1/2 top-[-10rem] -z-10 h-[28rem] w-[52rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />

      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3.5">
          <Link href="/">
            <Logo />
          </Link>
          <nav className="text-sm">
            {userId ? (
              <Link href="/dashboard" className={btn.ghost}>
                Dashboard
              </Link>
            ) : (
              <Link
                href="/sign-in"
                className="text-muted-foreground hover:text-foreground"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl px-6 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-semibold tracking-tight">
            Simple, per-bot pricing
          </h1>
          <p className="mt-3 text-muted-foreground">
            Each bot is its own isolated instance. Change or cancel anytime.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {order.map((id) => {
            const plan = PLANS[id];
            const highlighted = id === 'pro';
            return (
              <Panel
                key={plan.id}
                className={
                  highlighted ? 'relative p-6 ring-1 ring-primary/40' : 'p-6'
                }
              >
                {highlighted && (
                  <span className="absolute right-4 top-4 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Popular
                  </span>
                )}
                <h2 className="text-sm font-semibold">{plan.name}</h2>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="tnum font-mono text-4xl font-semibold tracking-tight">
                    ${plan.priceMonthly}
                  </span>
                  <span className="text-sm text-muted-foreground">/mo</span>
                </div>
                <ul className="mt-6 space-y-2.5 text-sm text-muted-foreground">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <span className="mt-0.5 text-primary">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <div className="mt-7">
                  {userId ? (
                    <CheckoutButton plan={plan.id} highlighted={highlighted} />
                  ) : (
                    <Link
                      href={`/sign-up?redirect_url=/pricing`}
                      className={`w-full ${highlighted ? btn.primary : btn.ghost}`}
                    >
                      Sign up to start
                    </Link>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-muted-foreground">
          Software only. You bring your own Alpaca account — we never take
          custody of funds.
        </p>
      </section>
    </main>
  );
}
