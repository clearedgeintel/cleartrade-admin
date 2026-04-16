import Link from 'next/link';
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';

export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          ClearTrade
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <SignedOut>
            <Link
              href="/sign-in"
              className="text-muted-foreground hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90"
            >
              Start trading
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground"
            >
              Dashboard
            </Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </nav>
      </header>

      <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">
          Automated trading, on autopilot.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Managed AI-powered Alpaca trading bots. Each customer gets their own
          isolated instance — your keys, your portfolio, your subdomain.
        </p>
        <div className="mt-10 flex gap-4">
          <Link
            href="/sign-up"
            className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90"
          >
            Start free trial
          </Link>
          <Link
            href="#pricing"
            className="rounded-md border border-border px-6 py-3 font-medium hover:bg-muted"
          >
            See pricing
          </Link>
        </div>
      </section>
    </main>
  );
}
