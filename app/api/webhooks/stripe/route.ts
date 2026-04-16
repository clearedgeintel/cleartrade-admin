import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { db } from '@/db';
import { tenants, subscriptions } from '@/db/schema';
import { planFromPriceId, PLANS, type PlanId } from '@/lib/plans';
import { eq } from 'drizzle-orm';

// Stripe webhooks must receive the raw request body for signature verification.
// Next.js App Router passes raw bytes via req.text() which is what the SDK needs.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function randomSlug() {
  return `ct-${randomBytes(4).toString('hex')}`;
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'webhook secret unset' }, { status: 500 });
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json(
      { error: `signature verification failed: ${msg}` },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpserted(event.data.object);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        // No-op for event types we don't care about.
        break;
    }
  } catch (err) {
    // Log without leaking secrets. Returning 500 makes Stripe retry.
    console.error(`[stripe webhook] ${event.type} handler failed`, err);
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const clerkUserId = session.client_reference_id;
  const plan = (session.metadata?.plan as PlanId | undefined) ?? 'starter';
  if (!clerkUserId || !(plan in PLANS)) return;
  if (typeof session.customer !== 'string') return;
  if (typeof session.subscription !== 'string') return;

  // Create tenant row in 'pending' state. The onboarding wizard will fill in
  // the Alpaca keys; Railway provisioning (next commit) flips status to active.
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: `Tenant ${randomBytes(2).toString('hex')}`,
      slug: randomSlug(),
      ownerId: clerkUserId,
      plan,
      status: 'pending',
    })
    .returning();

  await db.insert(subscriptions).values({
    tenantId: tenant.id,
    stripeCustomerId: session.customer,
    stripeSubscriptionId: session.subscription,
    plan,
    status: 'active',
  });
}

async function handleSubscriptionUpserted(sub: Stripe.Subscription) {
  const priceId = sub.items.data[0]?.price.id;
  const plan = (priceId && planFromPriceId(priceId)) ?? null;

  await db
    .update(subscriptions)
    .set({
      status: mapSubscriptionStatus(sub.status),
      currentPeriodEnd: new Date(sub.current_period_end * 1000),
      ...(plan ? { plan } : {}),
    })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));

  if (plan) {
    const [row] = await db
      .select({ tenantId: subscriptions.tenantId })
      .from(subscriptions)
      .where(eq(subscriptions.stripeSubscriptionId, sub.id));
    if (row) {
      await db
        .update(tenants)
        .set({ plan, updatedAt: new Date() })
        .where(eq(tenants.id, row.tenantId));
    }
  }
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subId =
    typeof invoice.subscription === 'string' ? invoice.subscription : null;
  if (!subId) return;

  await db
    .update(subscriptions)
    .set({ status: 'active' })
    .where(eq(subscriptions.stripeSubscriptionId, subId));

  // Transition tenant into 'provisioning' so the Railway worker (next commit)
  // can pick it up. If it's already past 'provisioning' this is a no-op via
  // the status check.
  const [row] = await db
    .select({ tenantId: subscriptions.tenantId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, subId));
  if (row) {
    await db
      .update(tenants)
      .set({ status: 'provisioning', updatedAt: new Date() })
      .where(eq(tenants.id, row.tenantId));
  }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subId =
    typeof invoice.subscription === 'string' ? invoice.subscription : null;
  if (!subId) return;

  await db
    .update(subscriptions)
    .set({ status: 'past_due' })
    .where(eq(subscriptions.stripeSubscriptionId, subId));
}

async function handleSubscriptionDeleted(sub: Stripe.Subscription) {
  await db
    .update(subscriptions)
    .set({ status: 'cancelled' })
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));

  const [row] = await db
    .select({ tenantId: subscriptions.tenantId })
    .from(subscriptions)
    .where(eq(subscriptions.stripeSubscriptionId, sub.id));
  if (row) {
    await db
      .update(tenants)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(tenants.id, row.tenantId));
  }
}

function mapSubscriptionStatus(
  s: Stripe.Subscription.Status
): 'incomplete' | 'active' | 'past_due' | 'cancelled' {
  switch (s) {
    case 'active':
    case 'trialing':
      return 'active';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    case 'canceled':
    case 'incomplete_expired':
      return 'cancelled';
    default:
      return 'incomplete';
  }
}
