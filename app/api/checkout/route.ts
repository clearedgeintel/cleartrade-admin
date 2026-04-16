import { NextResponse } from 'next/server';
import { auth, currentUser } from '@clerk/nextjs/server';
import { stripe } from '@/lib/stripe';
import { PLANS, stripePriceId, type PlanId } from '@/lib/plans';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const { plan } = (await req.json()) as { plan?: PlanId };
  if (!plan || !(plan in PLANS)) {
    return NextResponse.json({ error: 'invalid plan' }, { status: 400 });
  }

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: stripePriceId(plan), quantity: 1 }],
    // client_reference_id is how the webhook links the payment back to a Clerk user.
    client_reference_id: userId,
    customer_email: email,
    metadata: { clerk_user_id: userId, plan },
    subscription_data: {
      metadata: { clerk_user_id: userId, plan },
    },
    success_url: `${baseUrl}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/pricing?canceled=1`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
