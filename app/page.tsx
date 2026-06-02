import Link from 'next/link';
import { SignedIn, SignedOut, UserButton } from '@clerk/nextjs';
import { PLANS } from '@/lib/plans';
import {
  Logo,
  Panel,
  PnL,
  Sparkline,
  StatusDot,
  btn,
  mockSeries,
} from '@/components/ui';

const TICKER = [
  ['AAPL', 1.24],
  ['NVDA', 3.08],
  ['MSFT', 0.62],
  ['TSLA', -0.84],
  ['BTC/USD', 2.41],
  ['SPY', 0.41],
  ['AMZN', 1.05],
  ['META', -0.33],
  ['ETH/USD', 1.92],
  ['GOOGL', 0.58],
] as const;

export default function LandingPage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-x-hidden">
      {/* ambient backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-40" />
      <div className="pointer-events-none absolute left-1/2 top-[-12rem] -z-10 h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-primary/10 blur-[120px]" />

      {/* header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3.5">
          <Logo />
          <nav className="flex items-center gap-2 text-sm">
            <Link
              href="/pricing"
              className="hidden rounded-md px-3 py-2 text-muted-foreground transition hover:text-foreground sm:block"
            >
              Pricing
            </Link>
            <SignedOut>
              <Link
                href="/sign-in"
                className="rounded-md px-3 py-2 text-muted-foreground transition hover:text-foreground"
              >
                Sign in
              </Link>
              <Link href="/sign-up" className={btn.primary}>
                Start trading
              </Link>
            </SignedOut>
            <SignedIn>
              <Link href="/dashboard" className={btn.ghost}>
                Dashboard
              </Link>
              <UserButton afterSignOutUrl="/" />
            </SignedIn>
          </nav>
        </div>
      </header>

      {/* ticker */}
      <div className="overflow-hidden border-b border-border bg-surface/60">
        <div className="flex w-max animate-ticker gap-8 py-2">
          {[...TICKER, ...TICKER].map(([sym, chg], i) => (
            <span
              key={i}
              className="flex items-center gap-2 whitespace-nowrap text-xs"
            >
              <span className="font-mono font-medium text-muted-foreground">
                {sym}
              </span>
              <PnL value={chg} showSign />
            </span>
          ))}
        </div>
      </div>

      {/* hero */}
      <section className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 items-center gap-12 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1 text-xs text-muted-foreground">
            <StatusDot tone="profit" pulse /> AI agents · live + paper · your
            keys
          </span>
          <h1 className="mt-5 text-balance text-5xl font-semibold leading-[1.05] tracking-tightest sm:text-6xl">
            Your own{' '}
            <span className="text-primary text-glow">AI trading desk</span>,
            deployed in minutes.
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-lg text-muted-foreground">
            ClearTrade spins up a fully isolated, AI-powered Alpaca trading bot
            for every customer — your API keys, your portfolio, your subdomain.
            No shared accounts. No commingled funds.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/sign-up" className={`${btn.primary} px-6 py-3 text-base`}>
              Start free trial →
            </Link>
            <Link
              href="/pricing"
              className={`${btn.ghost} px-6 py-3 text-base`}
            >
              View pricing
            </Link>
          </div>
          <dl className="mt-12 grid max-w-md grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border">
            {[
              ['~2 min', 'to deploy'],
              ['100%', 'isolated'],
              ['24/7', 'monitored'],
            ].map(([v, l]) => (
              <div key={l} className="bg-surface px-4 py-3 text-center">
                <dt className="tnum font-mono text-xl font-semibold text-foreground">
                  {v}
                </dt>
                <dd className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {l}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* terminal mock */}
        <TerminalMock />
      </section>

      {/* features */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <Panel key={f.title} className="p-5">
              <div className="grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/20">
                {f.icon}
              </div>
              <h3 className="mt-4 text-sm font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
            </Panel>
          ))}
        </div>
      </section>

      {/* pricing teaser */}
      <section className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Simple, per-bot pricing
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Each bot is its own isolated instance. Scale up anytime.
            </p>
          </div>
          <Link
            href="/pricing"
            className="hidden text-sm text-primary hover:underline sm:block"
          >
            Full pricing →
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Object.values(PLANS).map((p) => (
            <Panel
              key={p.id}
              className={
                p.id === 'pro'
                  ? 'relative p-6 ring-1 ring-primary/40'
                  : 'p-6'
              }
            >
              {p.id === 'pro' && (
                <span className="absolute right-4 top-4 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Popular
                </span>
              )}
              <div className="text-sm font-semibold">{p.name}</div>
              <div className="mt-2">
                <span className="tnum font-mono text-3xl font-semibold">
                  ${p.priceMonthly}
                </span>
                <span className="text-sm text-muted-foreground">/mo</span>
              </div>
              <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
                {p.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2">
                    <span className="mt-0.5 text-primary">✓</span>
                    {feat}
                  </li>
                ))}
              </ul>
              <Link
                href="/sign-up"
                className={`mt-6 w-full ${p.id === 'pro' ? btn.primary : btn.ghost}`}
              >
                Start {p.name}
              </Link>
            </Panel>
          ))}
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-xs text-muted-foreground sm:flex-row">
          <Logo />
          <p>
            Software only. You control your brokerage account and keys. Not
            investment advice.
          </p>
          <p>© {2026} ClearTrade</p>
        </div>
      </footer>
    </main>
  );
}

function TerminalMock() {
  const series = mockSeries(3, 44, 1.2);
  const positions = [
    ['NVDA', 'long', 3.08, 12450],
    ['AAPL', 'long', 1.24, 8200],
    ['TSLA', 'short', -0.84, 5600],
    ['BTC/USD', 'long', 2.41, 9100],
  ] as const;

  return (
    <Panel className="glow-accent overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-surface-2/60 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-loss/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-warning/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-profit/70" />
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            acme.clearedgeintel.com
          </span>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-profit">
          <StatusDot tone="profit" pulse /> live
        </span>
      </div>

      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        <div className="px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Portfolio
          </div>
          <div className="tnum mt-1 font-mono text-2xl font-semibold">
            $124,503
          </div>
          <PnL value={2.41} className="text-xs" />
        </div>
        <div className="px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Buying power
          </div>
          <div className="tnum mt-1 font-mono text-2xl font-semibold">
            $48,210
          </div>
          <div className="text-xs text-muted-foreground">paper</div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Day P&L
          </div>
          <div className="tnum mt-1 font-mono text-2xl font-semibold text-profit">
            +$2,930
          </div>
          <div className="text-xs text-muted-foreground">7 trades</div>
        </div>
      </div>

      <div className="px-2 pt-2">
        <Sparkline data={series} up height={72} />
      </div>

      <div className="divide-y divide-border border-t border-border">
        {positions.map(([sym, side, chg, val]) => (
          <div
            key={sym}
            className="flex items-center justify-between px-4 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono font-medium">{sym}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
                  side === 'long'
                    ? 'bg-profit/10 text-profit'
                    : 'bg-loss/10 text-loss'
                }`}
              >
                {side}
              </span>
            </div>
            <div className="flex items-center gap-6">
              <span className="tnum font-mono text-muted-foreground">
                ${val.toLocaleString()}
              </span>
              <PnL value={chg} className="w-16 text-right text-xs" />
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

const FEATURES = [
  {
    title: 'Fully isolated',
    body: 'Each bot is its own process, database, and subdomain. A bug can never touch another customer.',
    icon: <IconShield />,
  },
  {
    title: 'Your keys, your funds',
    body: 'You bring your own Alpaca account. We never take custody — encrypted at rest, never logged.',
    icon: <IconKey />,
  },
  {
    title: 'Multi-agent AI',
    body: 'Screener, technical, news, and risk agents debate every trade. Rules, hybrid, or full AI.',
    icon: <IconBrain />,
  },
  {
    title: 'Deploy in minutes',
    body: 'Pick a plan, add your keys, and your bot is live on its own subdomain — health-checked end to end.',
    icon: <IconRocket />,
  },
];

function IconShield() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" strokeLinejoin="round" />
    </svg>
  );
}
function IconKey() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="8" cy="8" r="4" />
      <path d="M11 11l8 8M16 16l2-2M18 18l2-2" strokeLinecap="round" />
    </svg>
  );
}
function IconBrain() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M9 4a3 3 0 00-3 3 3 3 0 00-1 5 3 3 0 002 5 3 3 0 003 1V4zM15 4a3 3 0 013 3 3 3 0 011 5 3 3 0 01-2 5 3 3 0 01-3 1V4z" strokeLinejoin="round" />
    </svg>
  );
}
function IconRocket() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 15c-1 1-1 4-1 4s3 0 4-1m1-3a8 8 0 016-9 12 12 0 01-1 8 8 8 0 01-9 6l4-5z" strokeLinejoin="round" />
    </svg>
  );
}
