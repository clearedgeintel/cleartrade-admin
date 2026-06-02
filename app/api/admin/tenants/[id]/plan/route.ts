import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { subscriptions, tenantInfra, tenants } from '@/db/schema';
import { PLANS, type PlanId } from '@/lib/plans';
import { isCurrentUserAdmin } from '@/lib/admin-auth';
import { upsertServiceVariables } from '@/lib/provisioner/railway';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Admin override of a tenant's plan tier. Updates the tenant (and its
 * subscription mirror) and best-effort re-syncs the plan-derived caps on the
 * running bot. NOTE: Stripe remains the billing source of truth — this is a
 * manual override (e.g. comping a beta user or correcting drift); it does not
 * change what Stripe charges.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { plan?: string };
  const plan = body.plan;
  if (!plan || !(plan in PLANS)) {
    return NextResponse.json({ error: 'invalid plan' }, { status: 400 });
  }
  const planId = plan as PlanId;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, params.id))
    .limit(1);
  if (!tenant) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  await db
    .update(tenants)
    .set({ plan: planId, updatedAt: new Date() })
    .where(eq(tenants.id, tenant.id));

  // Keep the subscription mirror consistent if one exists.
  await db
    .update(subscriptions)
    .set({ plan: planId })
    .where(eq(subscriptions.tenantId, tenant.id));

  // Best-effort: push the new plan caps to the live bot. The full set applies
  // on next restart; these two are the plan-derived limits.
  let warning: string | null = null;
  const [infra] = await db
    .select()
    .from(tenantInfra)
    .where(eq(tenantInfra.tenantId, tenant.id))
    .limit(1);

  if (infra?.railwayServiceId && infra.railwayEnvId) {
    const p = PLANS[planId];
    try {
      await upsertServiceVariables({
        serviceId: infra.railwayServiceId,
        environmentId: infra.railwayEnvId,
        variables: {
          MAX_SCAN_SYMBOLS: String(p.maxScanSymbols),
          LLM_DAILY_COST_CAP_USD: String(p.llmDailyCostCapUsd),
        },
      });
    } catch (err) {
      warning = `plan saved, but Railway env sync failed: ${
        (err as Error).message
      }`;
    }
  }

  return NextResponse.json({ ok: true, plan: planId, warning });
}
