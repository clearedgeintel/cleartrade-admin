import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { subscriptions, tenantInfra, tenants } from '@/db/schema';
import { PLANS } from '@/lib/plans';
import { getTenantSecrets, upsertTenantSecrets } from '@/lib/tenant-secrets';
import { upsertServiceVariables } from '@/lib/provisioner/railway';
import { deprovisionTenant } from '@/lib/provisioner/deprovision';
import { stripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const maxDuration = 300;

interface PatchBody {
  // Alpaca rotation — require both together.
  alpacaApiKey?: string;
  alpacaApiSecret?: string;
  useLive?: boolean;

  // Bot preferences.
  watchlistPreset?: 'top8' | 'crypto' | 'custom';
  customSymbols?: string[];
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
  agencyMode?: 'rules' | 'hybrid' | 'ai';
}

const PAPER_URL = 'https://paper-api.alpaca.markets';
const LIVE_URL = 'https://api.alpaca.markets';

const RISK_PCT_MAP = {
  conservative: '1',
  moderate: '2',
  aggressive: '4',
} as const;

const WATCHLIST_PRESETS = {
  top8: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META'],
  crypto: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'DOGE/USD', 'AVAX/USD'],
} as const;

export async function PATCH(
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

  const body = (await req.json()) as PatchBody;
  const plan = PLANS[tenant.plan];

  const envDelta: Record<string, string> = {};

  // ─── Alpaca rotation ────────────────────────────────────────────
  if (body.alpacaApiKey || body.alpacaApiSecret) {
    if (!body.alpacaApiKey || !body.alpacaApiSecret) {
      return NextResponse.json(
        { error: 'alpaca key and secret must be rotated together' },
        { status: 400 }
      );
    }
    if (body.useLive && !plan.liveTradingAllowed) {
      return NextResponse.json(
        { error: `live trading is not available on the ${tenant.plan} plan` },
        { status: 400 }
      );
    }

    const existing = await getTenantSecrets(tenant.id);
    if (!existing) {
      return NextResponse.json(
        { error: 'complete onboarding before rotating keys' },
        { status: 409 }
      );
    }

    const baseUrl =
      body.useLive !== undefined
        ? body.useLive
          ? LIVE_URL
          : PAPER_URL
        : existing.alpacaBaseUrl;

    await upsertTenantSecrets(tenant.id, {
      ...existing,
      alpacaApiKey: body.alpacaApiKey,
      alpacaApiSecret: body.alpacaApiSecret,
      alpacaBaseUrl: baseUrl,
    });

    envDelta.ALPACA_API_KEY = body.alpacaApiKey;
    envDelta.ALPACA_API_SECRET = body.alpacaApiSecret;
    envDelta.ALPACA_BASE_URL = baseUrl;
  }

  // ─── Bot preferences ────────────────────────────────────────────
  const prefsPatch: Partial<typeof tenant> = {};

  if (body.watchlistPreset) {
    if (
      body.watchlistPreset === 'custom' &&
      (!body.customSymbols || body.customSymbols.length === 0)
    ) {
      return NextResponse.json(
        { error: 'custom watchlist needs at least one symbol' },
        { status: 400 }
      );
    }
    if (
      body.watchlistPreset === 'custom' &&
      body.customSymbols &&
      body.customSymbols.length > plan.maxScanSymbols
    ) {
      return NextResponse.json(
        {
          error: `custom watchlist exceeds ${tenant.plan} plan limit of ${plan.maxScanSymbols}`,
        },
        { status: 400 }
      );
    }
    prefsPatch.watchlistPreset = body.watchlistPreset;
    prefsPatch.customSymbols =
      body.watchlistPreset === 'custom' ? body.customSymbols ?? [] : null;
    const symbols =
      body.watchlistPreset === 'custom'
        ? body.customSymbols ?? []
        : [...WATCHLIST_PRESETS[body.watchlistPreset]];
    envDelta.WATCHLIST = symbols.join(',');
  }

  if (body.riskTolerance) {
    prefsPatch.riskTolerance = body.riskTolerance;
    envDelta.RISK_PCT = RISK_PCT_MAP[body.riskTolerance];
  }

  if (body.agencyMode) {
    if (body.agencyMode === 'ai' && tenant.plan === 'starter') {
      return NextResponse.json(
        { error: 'full AI agency is not available on the starter plan' },
        { status: 400 }
      );
    }
    prefsPatch.agencyMode = body.agencyMode;
    envDelta.USE_AGENCY = body.agencyMode === 'ai' ? 'true' : 'false';
    envDelta.STRATEGY_MODE = body.agencyMode;
  }

  if (Object.keys(prefsPatch).length > 0) {
    await db
      .update(tenants)
      .set({ ...prefsPatch, updatedAt: new Date() })
      .where(eq(tenants.id, tenant.id));
  }

  // ─── Push deltas to Railway so a restart picks them up ──────────
  // Hot-reload via bot runtime-config is a future commit — for now we
  // require a restart / re-provision for the bot process to see changes.
  if (Object.keys(envDelta).length > 0) {
    const [infra] = await db
      .select()
      .from(tenantInfra)
      .where(eq(tenantInfra.tenantId, tenant.id))
      .limit(1);
    if (infra?.railwayServiceId && infra.railwayEnvId) {
      try {
        await upsertServiceVariables({
          serviceId: infra.railwayServiceId,
          environmentId: infra.railwayEnvId,
          variables: envDelta,
        });
      } catch (err) {
        console.error(
          `[settings] failed to update Railway vars for ${tenant.slug}: ${(err as Error).message}`
        );
        // Don't fail the request — DB is updated, next provision will
        // push the variables through. Surface a warning instead.
        return NextResponse.json({
          ok: true,
          warning:
            'settings saved locally but Railway update failed — re-provision to apply',
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// ─── DELETE: cancel + deprovision ─────────────────────────────────────
// Cancels the Stripe subscription and tears down all tenant infra
// (Railway service, Cloudflare CNAME, Supabase project). Idempotent.
export async function DELETE(
  _req: Request,
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
  if (tenant.status === 'cancelled') {
    return NextResponse.json({ ok: true, already: 'cancelled' });
  }

  // Cancel Stripe first — if billing teardown fails we abort to avoid
  // continuing to bill for a deprovisioned tenant. Idempotent on Stripe's
  // side: cancelling an already-cancelled sub returns 200.
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenant.id))
    .limit(1);
  if (sub?.stripeSubscriptionId && sub.status !== 'cancelled') {
    try {
      await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      return NextResponse.json(
        { error: `stripe cancel failed: ${msg}` },
        { status: 502 }
      );
    }
  }

  try {
    await deprovisionTenant(tenant.id);
  } catch (err) {
    // Partial teardown — tenant is marked cancelled but some upstream
    // resource lingered. Admin can retry from the admin panel.
    const msg = err instanceof Error ? err.message : 'unknown';
    console.error(`[delete tenant ${tenant.slug}] ${msg}`);
    return NextResponse.json(
      { ok: true, warning: msg },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true });
}
