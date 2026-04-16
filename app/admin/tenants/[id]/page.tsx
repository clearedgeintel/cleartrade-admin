import Link from 'next/link';
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import {
  subscriptions,
  tenantInfra,
  tenantSecrets,
  tenants,
} from '@/db/schema';
import { PLANS } from '@/lib/plans';

export default async function AdminTenantDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [tenantRow] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, params.id))
    .limit(1);

  if (!tenantRow) notFound();

  const [infra, secrets, subs] = await Promise.all([
    db
      .select()
      .from(tenantInfra)
      .where(eq(tenantInfra.tenantId, params.id))
      .limit(1),
    db
      .select()
      .from(tenantSecrets)
      .where(eq(tenantSecrets.tenantId, params.id))
      .limit(1),
    db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, params.id))
      .limit(1),
  ]);

  const tenant = tenantRow;
  const infraRow = infra[0];
  const secretsRow = secrets[0];
  const subRow = subs[0];
  const plan = PLANS[tenant.plan];

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/admin/tenants"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← All tenants
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            {tenant.name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tenant.slug} · {plan.name} · status{' '}
            <span className="font-mono">{tenant.status}</span>
          </p>
        </div>
        {infraRow?.subdomain && (
          <a
            href={`https://${infraRow.subdomain}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            Open bot UI ↗
          </a>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Tenant">
          <KV k="ID" v={tenant.id} />
          <KV k="Owner (Clerk)" v={tenant.ownerId} />
          <KV k="Plan" v={plan.name} />
          <KV k="Status" v={tenant.status} />
          <KV k="Watchlist preset" v={tenant.watchlistPreset ?? '—'} />
          <KV
            k="Custom symbols"
            v={tenant.customSymbols?.join(', ') || '—'}
          />
          <KV k="Risk tolerance" v={tenant.riskTolerance ?? '—'} />
          <KV k="Agency mode" v={tenant.agencyMode ?? '—'} />
          <KV
            k="Onboarded"
            v={
              tenant.onboardingCompletedAt
                ? new Date(tenant.onboardingCompletedAt).toLocaleString()
                : '—'
            }
          />
          <KV k="Created" v={new Date(tenant.createdAt).toLocaleString()} />
        </Card>

        <Card title="Infrastructure">
          <KV k="Subdomain" v={infraRow?.subdomain ?? '—'} />
          <KV k="Health" v={infraRow?.healthStatus ?? 'unknown'} />
          <KV
            k="Last health check"
            v={
              infraRow?.lastHealthCheck
                ? new Date(infraRow.lastHealthCheck).toLocaleString()
                : '—'
            }
          />
          <KV
            k="Railway service"
            v={infraRow?.railwayServiceId ?? '—'}
          />
          <KV
            k="Railway environment"
            v={infraRow?.railwayEnvId ?? '—'}
          />
          <KV
            k="Bot image"
            v={infraRow?.version ?? '—'}
          />
          <KV
            k="Provisioned"
            v={
              infraRow?.provisionedAt
                ? new Date(infraRow.provisionedAt).toLocaleString()
                : '—'
            }
          />
          <KV
            k="Bot DATABASE_URL"
            v={infraRow?.databaseUrl ? redactUrl(infraRow.databaseUrl) : '—'}
          />
        </Card>

        <Card title="Credentials (masked)">
          <KV
            k="Alpaca API key"
            v={secretsRow?.alpacaApiKey ? mask(secretsRow.alpacaApiKey) : '—'}
          />
          <KV
            k="Alpaca secret"
            v={
              secretsRow?.alpacaApiSecret
                ? mask(secretsRow.alpacaApiSecret)
                : '—'
            }
          />
          <KV k="Alpaca base URL" v={secretsRow?.alpacaBaseUrl ?? '—'} />
          <KV
            k="Anthropic key"
            v={
              secretsRow?.anthropicApiKey
                ? mask(secretsRow.anthropicApiKey)
                : '(using shared)'
            }
          />
          <KV
            k="Bot API_KEY (x-api-key)"
            v={infraRow?.botApiKey ? mask(infraRow.botApiKey) : '—'}
          />
        </Card>

        <Card title="Subscription">
          {subRow ? (
            <>
              <KV k="Stripe customer" v={subRow.stripeCustomerId} />
              <KV
                k="Stripe subscription"
                v={subRow.stripeSubscriptionId ?? '—'}
              />
              <KV k="Status" v={subRow.status} />
              <KV k="Plan" v={subRow.plan} />
              <KV
                k="Period ends"
                v={
                  subRow.currentPeriodEnd
                    ? new Date(subRow.currentPeriodEnd).toLocaleString()
                    : '—'
                }
              />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No subscription.</p>
          )}
        </Card>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <dl className="mt-4 space-y-2">{children}</dl>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/50 pb-2 last:border-0 last:pb-0">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="truncate text-right font-mono text-xs" title={v}>
        {v}
      </dd>
    </div>
  );
}

function mask(s: string): string {
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function redactUrl(url: string): string {
  // Strip password from a postgres URL before showing to an admin.
  return url.replace(/(postgresql:\/\/[^:]+:)[^@]+(@)/, '$1••••$2');
}
