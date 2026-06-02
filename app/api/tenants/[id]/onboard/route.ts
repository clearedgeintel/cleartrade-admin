import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { PLANS } from '@/lib/plans';
import { upsertTenantSecrets } from '@/lib/tenant-secrets';

interface OnboardBody {
  alpacaApiKey: string;
  alpacaApiSecret: string;
  useLive: boolean;
  watchlistPreset: 'top8' | 'crypto' | 'custom';
  customSymbols?: string[];
  riskTolerance: 'conservative' | 'moderate' | 'aggressive';
  agencyMode: 'rules' | 'hybrid' | 'ai';
  // Optional bring-your-own credentials. Blank = we provide them.
  anthropicApiKey?: string;
  databaseUrl?: string;
}

const PAPER_URL = 'https://paper-api.alpaca.markets';
const LIVE_URL = 'https://api.alpaca.markets';

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.id, params.id), eq(tenants.ownerId, userId)))
    .limit(1);

  if (!tenant) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  if (tenant.status !== 'pending') {
    return NextResponse.json(
      { error: `tenant is ${tenant.status}, onboarding already complete` },
      { status: 409 }
    );
  }

  const body = (await req.json()) as OnboardBody;

  const err = validate(body, tenant.plan);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const baseUrl = body.useLive ? LIVE_URL : PAPER_URL;

  const byoDatabase = body.databaseUrl?.trim() || null;
  await upsertTenantSecrets(tenant.id, {
    alpacaApiKey: body.alpacaApiKey,
    alpacaApiSecret: body.alpacaApiSecret,
    alpacaBaseUrl: baseUrl,
    anthropicApiKey: body.anthropicApiKey?.trim() || null,
    polygonApiKey: null,
    databaseUrl: byoDatabase,
  });

  await db
    .update(tenants)
    .set({
      watchlistPreset: body.watchlistPreset,
      customSymbols:
        body.watchlistPreset === 'custom' ? body.customSymbols ?? [] : null,
      riskTolerance: body.riskTolerance,
      agencyMode: body.agencyMode,
      onboardingCompletedAt: new Date(),
      // Advance the state machine to 'provisioning'. The background worker
      // (lib/provisioner/worker.ts via /api/cron/provision) sweeps tenants in
      // this state and drives the Railway/Supabase/Cloudflare pipeline — no
      // manual button click required. In the Stripe flow the subscription is
      // already active by the time onboarding runs (checkout.session.completed
      // created the tenant); the dev-bypass flow has no subscription and still
      // provisions, which is intended for private beta.
      status: 'provisioning',
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenant.id));

  return NextResponse.json({ ok: true, tenantId: tenant.id });
}

function validate(body: OnboardBody, plan: keyof typeof PLANS): string | null {
  if (!body.alpacaApiKey?.trim() || !body.alpacaApiSecret?.trim()) {
    return 'alpaca key and secret required';
  }
  const byoDb = body.databaseUrl?.trim();
  if (byoDb && !/^postgres(ql)?:\/\/.+@.+\/.+/.test(byoDb)) {
    return 'database URL must be a Postgres connection string (postgresql://user:pass@host/db)';
  }
  const byoAnthropic = body.anthropicApiKey?.trim();
  if (byoAnthropic && !byoAnthropic.startsWith('sk-ant-')) {
    return 'Anthropic API key should start with "sk-ant-"';
  }
  if (body.useLive && !PLANS[plan].liveTradingAllowed) {
    return `live trading is not available on the ${plan} plan`;
  }
  if (body.agencyMode === 'ai' && plan === 'starter') {
    return 'full AI agency is not available on the starter plan';
  }
  if (
    body.watchlistPreset === 'custom' &&
    (!body.customSymbols || body.customSymbols.length === 0)
  ) {
    return 'at least one custom symbol required';
  }
  if (body.watchlistPreset === 'custom' && body.customSymbols) {
    const max = PLANS[plan].maxScanSymbols;
    if (body.customSymbols.length > max) {
      return `custom watchlist exceeds ${plan} plan limit of ${max} symbols`;
    }
    for (const s of body.customSymbols) {
      if (!/^[A-Z0-9.\/]{1,12}$/.test(s)) {
        return `invalid symbol: ${s}`;
      }
    }
  }
  return null;
}
