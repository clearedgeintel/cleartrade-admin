import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';
import { PLANS } from '@/lib/plans';
import { fetchFromBot, resolveBotTarget } from '@/lib/bot-proxy';
import {
  Logo,
  Panel,
  PanelHeader,
  PnL,
  Sparkline,
  StatusBadge,
  StatusDot,
  btn,
} from '@/components/ui';
import { ProvisionButton } from './provision-button';
import { LifecycleButtons } from './lifecycle-buttons';

export const dynamic = 'force-dynamic';

interface BotHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks?: Record<string, { ok?: boolean; available?: boolean; error?: string }>;
}
interface BotAccount {
  portfolio_value?: string | number;
  buying_power?: string | number;
  cash?: string | number;
  equity?: string | number;
  last_equity?: string | number;
}
interface BotPosition {
  symbol?: string;
  side?: string;
  qty?: string | number;
  market_value?: string | number;
  unrealized_plpc?: string | number;
}

export default async function TenantDetailPage({
  params,
}: {
  params: { tenantId: string };
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const [row] = await db
    .select({ tenant: tenants, infra: tenantInfra })
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

  let health: BotHealth | null = null;
  let account: BotAccount | null = null;
  let positions: BotPosition[] = [];
  let perf: number[] = [];
  let liveError: string | null = null;

  if (tenant.status === 'active') {
    const target = await resolveBotTarget(tenant.id, userId);
    if (target) {
      const [h, a, p, pf] = await Promise.all([
        fetchFromBot<BotHealth>({ target, path: '/api/health' }).catch(
          (e) => ((liveError = e.message), null)
        ),
        fetchFromBot<BotAccount>({ target, path: '/api/account' }).catch(
          () => null
        ),
        fetchFromBot<{ data?: BotPosition[] } | BotPosition[]>({
          target,
          path: '/api/positions',
        }).catch(() => null),
        fetchFromBot<unknown>({ target, path: '/api/performance' }).catch(
          () => null
        ),
      ]);
      health = h;
      account = a;
      positions = Array.isArray(p) ? p : p?.data ?? [];
      perf = extractSeries(pf);
    }
  }

  const dayPnl = account ? pnlDollars(account) : null;
  const dayPnlPct = account ? pnlPct(account) : null;

  return (
    <main className="relative min-h-screen">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-grid opacity-25" />

      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
              <Logo withWordmark={false} />
            </Link>
            <div className="h-5 w-px bg-border" />
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-semibold tracking-tight">
                  {tenant.name}
                </h1>
                <StatusBadge status={tenant.status} />
              </div>
              <div className="font-mono text-xs text-muted-foreground">
                {infra?.subdomain ?? tenant.slug} · {plan.name}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/${tenant.id}/settings`} className={btn.ghost}>
              Settings
            </Link>
            <Link
              href={`/dashboard/${tenant.id}/billing`}
              className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline"
            >
              Billing
            </Link>
            {infra?.subdomain && tenant.status === 'active' && (
              <a
                href={`https://${infra.subdomain}`}
                target="_blank"
                rel="noreferrer"
                className={btn.primary}
              >
                Open bot ↗
              </a>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl space-y-6 px-6 py-8">
        {needsOnboarding && (
          <Panel className="flex flex-col items-start gap-3 p-6">
            <h2 className="text-base font-semibold">Finish onboarding</h2>
            <p className="text-sm text-muted-foreground">
              Add your Alpaca keys and preferences to spin up this bot.
            </p>
            <Link href="/onboarding" className={btn.primary}>
              Continue onboarding →
            </Link>
          </Panel>
        )}

        {/* live trading metrics */}
        {tenant.status === 'active' && (
          <>
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
              <Metric
                label="Portfolio value"
                value={usd(account?.portfolio_value ?? account?.equity)}
                accent
              />
              <Metric
                label="Day P&L"
                value={dayPnl == null ? '—' : usdSigned(dayPnl)}
                sub={
                  dayPnlPct == null ? undefined : (
                    <PnL value={dayPnlPct} className="text-xs" />
                  )
                }
              />
              <Metric label="Buying power" value={usd(account?.buying_power)} />
              <Metric label="Cash" value={usd(account?.cash)} />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Panel className="lg:col-span-2">
                <PanelHeader
                  title="Equity curve"
                  right={
                    perf.length > 1 ? (
                      <PnL
                        value={
                          ((perf[perf.length - 1] - perf[0]) /
                            Math.abs(perf[0] || 1)) *
                          100
                        }
                        className="text-xs"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        no data yet
                      </span>
                    )
                  }
                />
                <div className="px-2 py-4">
                  {perf.length > 1 ? (
                    <Sparkline
                      data={perf}
                      up={perf[perf.length - 1] >= perf[0]}
                      height={150}
                    />
                  ) : (
                    <div className="grid h-[150px] place-items-center text-sm text-muted-foreground">
                      Performance history will appear after the first trading
                      day.
                    </div>
                  )}
                </div>
              </Panel>

              <Panel>
                <PanelHeader title="System health" />
                <div className="divide-y divide-border">
                  {health?.checks ? (
                    Object.entries(health.checks).map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-center justify-between px-4 py-2.5 text-sm"
                      >
                        <span className="capitalize text-muted-foreground">
                          {k}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <StatusDot
                            tone={
                              v.ok ?? v.available ? 'profit' : 'loss'
                            }
                          />
                          {v.ok ?? v.available ? 'ok' : v.error ?? 'down'}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-sm text-muted-foreground">
                      {liveError ? `Unreachable: ${liveError}` : 'No data.'}
                    </div>
                  )}
                </div>
              </Panel>
            </div>

            {/* positions */}
            <Panel>
              <PanelHeader
                title="Open positions"
                right={
                  <span className="text-xs text-muted-foreground">
                    {positions.length} held
                  </span>
                }
              />
              {positions.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No open positions.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="px-4 py-2 text-left font-medium">Symbol</th>
                      <th className="px-4 py-2 text-left font-medium">Side</th>
                      <th className="px-4 py-2 text-right font-medium">Qty</th>
                      <th className="px-4 py-2 text-right font-medium">Value</th>
                      <th className="px-4 py-2 text-right font-medium">P&L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {positions.map((p, i) => (
                      <tr key={i} className="hover:bg-surface-2/50">
                        <td className="px-4 py-2 font-mono font-medium">
                          {p.symbol}
                        </td>
                        <td className="px-4 py-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
                              (p.side ?? 'long') === 'long'
                                ? 'bg-profit/10 text-profit'
                                : 'bg-loss/10 text-loss'
                            }`}
                          >
                            {p.side ?? 'long'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono tnum">
                          {p.qty}
                        </td>
                        <td className="px-4 py-2 text-right font-mono tnum">
                          {usd(p.market_value)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <PnL
                            value={Number(p.unrealized_plpc ?? 0) * 100}
                            className="text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Panel>
          </>
        )}

        {/* provision */}
        {readyToProvision && (
          <Panel className="p-6">
            <h2 className="text-base font-semibold">
              {infra?.provisionedAt ? 'Retry provisioning' : 'Provision bot'}
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Creates a dedicated database, deploys the bot to its own service,
              wires up the subdomain, and waits for it to come online.
            </p>
            <div className="mt-4">
              <ProvisionButton tenantId={tenant.id} initialStatus={tenant.status} />
            </div>
          </Panel>
        )}

        {liveError && tenant.status === 'active' && !health && (
          <Panel className="border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">
            Can&apos;t reach bot: {liveError}
          </Panel>
        )}

        {/* lifecycle + infra */}
        <div className="grid gap-6 lg:grid-cols-2">
          {(tenant.status === 'active' || tenant.status === 'paused') && (
            <Panel className="p-5">
              <h2 className="text-sm font-semibold">Lifecycle</h2>
              <p className="mb-4 mt-1 text-sm text-muted-foreground">
                Pause to stop the bot without losing state. Cancel destroys the
                bot, its database, and subscription.
              </p>
              <LifecycleButtons tenantId={tenant.id} status={tenant.status} />
            </Panel>
          )}

          <Panel>
            <PanelHeader title="Instance" />
            <dl className="divide-y divide-border">
              <Row k="Subdomain" v={infra?.subdomain ?? '—'} mono />
              <Row k="Health" v={infra?.healthStatus ?? 'unknown'} />
              <Row k="Service" v={infra?.railwayServiceId ?? '—'} mono />
              <Row
                k="Provisioned"
                v={
                  infra?.provisionedAt
                    ? new Date(infra.provisionedAt).toLocaleString()
                    : '—'
                }
              />
            </dl>
          </Panel>
        </div>
      </section>
    </main>
  );
}

function Metric({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="bg-surface px-5 py-4">
      <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </div>
      <div
        className={`tnum mt-1.5 font-mono text-2xl font-semibold tracking-tight ${
          accent ? 'text-foreground' : ''
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className={`truncate text-right text-xs ${mono ? 'font-mono' : ''}`} title={v}>
        {v}
      </dd>
    </div>
  );
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
}
function usd(v: unknown): string {
  const n = num(v);
  if (n === null) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });
}
function usdSigned(n: number): string {
  return `${n >= 0 ? '+' : '−'}${usd(Math.abs(n))}`;
}
function pnlDollars(a: BotAccount): number | null {
  const eq = num(a.equity ?? a.portfolio_value);
  const last = num(a.last_equity);
  if (eq === null || last === null) return null;
  return eq - last;
}
function pnlPct(a: BotAccount): number | null {
  const eq = num(a.equity ?? a.portfolio_value);
  const last = num(a.last_equity);
  if (eq === null || last === null || last === 0) return null;
  return ((eq - last) / last) * 100;
}
function extractSeries(pf: unknown): number[] {
  if (!pf) return [];
  const arr = Array.isArray(pf)
    ? pf
    : ((pf as { data?: unknown[] }).data ?? []);
  if (!Array.isArray(arr)) return [];
  return arr
    .map((d) =>
      typeof d === 'number'
        ? d
        : num(
            (d as Record<string, unknown>)?.equity ??
              (d as Record<string, unknown>)?.portfolio_value ??
              (d as Record<string, unknown>)?.value ??
              (d as Record<string, unknown>)?.pnl
          )
    )
    .filter((n): n is number => n !== null);
}
