import { NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { subscriptions, tenants } from '@/db/schema';
import { stripe } from '@/lib/stripe';
import { deprovisionTenant } from '@/lib/provisioner/deprovision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

interface UserDeletedEvent {
  type: 'user.deleted';
  data: { id: string };
}

type ClerkEvent = UserDeletedEvent | { type: string; data: unknown };

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'webhook secret unset' },
      { status: 500 }
    );
  }

  // Svix requires all three headers present for signature verification.
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json(
      { error: 'missing svix headers' },
      { status: 400 }
    );
  }

  const rawBody = await req.text();

  let event: ClerkEvent;
  try {
    event = new Webhook(secret).verify(rawBody, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkEvent;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json(
      { error: `signature verification failed: ${msg}` },
      { status: 400 }
    );
  }

  try {
    if (event.type === 'user.deleted') {
      await handleUserDeleted((event as UserDeletedEvent).data.id);
    }
    // Other event types are a no-op for now.
  } catch (err) {
    console.error(`[clerk webhook] ${event.type} handler failed`, err);
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

/**
 * When a Clerk user is deleted, tear down every tenant they own:
 * cancel Stripe billing first (so we don't keep charging a ghost), then
 * deprovision infra. Runs sequentially on purpose — Stripe API rate
 * limits + the small number of tenants per user make concurrency
 * unhelpful here.
 */
async function handleUserDeleted(clerkUserId: string) {
  const ownedTenants = await db
    .select()
    .from(tenants)
    .where(
      and(eq(tenants.ownerId, clerkUserId), ne(tenants.status, 'cancelled'))
    );

  for (const tenant of ownedTenants) {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.tenantId, tenant.id))
      .limit(1);

    if (sub?.stripeSubscriptionId && sub.status !== 'cancelled') {
      try {
        await stripe.subscriptions.cancel(sub.stripeSubscriptionId);
      } catch (err) {
        console.error(
          `[clerk webhook] stripe cancel failed for tenant ${tenant.slug}: ${(err as Error).message}`
        );
        // Continue with deprovision anyway — better to stop infra than
        // leave zombies if Stripe is flaky.
      }
    }

    try {
      await deprovisionTenant(tenant.id);
    } catch (err) {
      console.error(
        `[clerk webhook] deprovision failed for tenant ${tenant.slug}: ${(err as Error).message}`
      );
    }
  }
}
