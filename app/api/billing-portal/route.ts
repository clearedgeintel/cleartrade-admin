import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { stripe } from '@/lib/stripe';
import { db } from '@/db';
import { tenants, subscriptions } from '@/db/schema';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { tenantId } = (await req.json()) as { tenantId?: string };
  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId required' }, { status: 400 });
  }

  // Verify the tenant belongs to the caller before exposing billing access.
  const [row] = await db
    .select({
      customerId: subscriptions.stripeCustomerId,
    })
    .from(subscriptions)
    .innerJoin(tenants, eq(tenants.id, subscriptions.tenantId))
    .where(and(eq(tenants.id, tenantId), eq(tenants.ownerId, userId)))
    .limit(1);

  if (!row?.customerId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  const portal = await stripe.billingPortal.sessions.create({
    customer: row.customerId,
    return_url: `${baseUrl}/dashboard/${tenantId}/billing`,
  });

  return NextResponse.json({ url: portal.url });
}
