import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { auth } from '@clerk/nextjs/server';
import { and, eq, ne, count } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { PLANS, type PlanId } from '@/lib/plans';

export const runtime = 'nodejs';

interface CreateBody {
  name?: string;
  plan?: PlanId;
}

/**
 * Creates a new tenant in 'pending' state for the authed user, without a
 * Stripe subscription attached. The user proceeds directly to /onboarding.
 *
 * In production the Stripe checkout.session.completed webhook is the
 * canonical creation path (so billing is always in sync). This endpoint
 * is the dev/bypass path — useful until Stripe products + webhook
 * forwarding are wired up.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as CreateBody;
  const plan: PlanId = body.plan && body.plan in PLANS ? body.plan : 'starter';
  const name = body.name?.trim() || `Bot ${randomBytes(2).toString('hex')}`;
  const slug = `ct-${randomBytes(4).toString('hex')}`;

  // Enforce the plan's bot limit (CLAUDE.md: WHERE owner_id = ? AND status !=
  // 'cancelled'). This is the dev/bypass creation path with no Stripe gating,
  // so it's the main spam vector — cap it here. The new tenant uses `plan`,
  // but the limit applies across all of the owner's live bots regardless of
  // plan, using the most permissive limit they're entitled to.
  const [{ value: liveBots }] = await db
    .select({ value: count() })
    .from(tenants)
    .where(and(eq(tenants.ownerId, userId), ne(tenants.status, 'cancelled')));

  const maxBots = PLANS[plan].maxBots;
  if (liveBots >= maxBots) {
    return NextResponse.json(
      {
        error: `bot limit reached: the ${plan} plan allows ${maxBots} bot${
          maxBots === 1 ? '' : 's'
        }. Cancel an existing bot or upgrade your plan.`,
      },
      { status: 409 }
    );
  }

  const [tenant] = await db
    .insert(tenants)
    .values({
      name,
      slug,
      ownerId: userId,
      plan,
      status: 'pending',
    })
    .returning();

  return NextResponse.json({ tenantId: tenant.id });
}
