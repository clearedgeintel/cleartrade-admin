import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { provisionTenant } from '@/lib/provisioner';

// Provisioning can take ~1-2 minutes (Railway build + DNS + health poll).
// Keep the route on the Node runtime so we have access to long-running I/O.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(
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

  if (tenant.status === 'active') {
    return NextResponse.json({ ok: true, already: 'active' });
  }

  if (!tenant.onboardingCompletedAt) {
    return NextResponse.json(
      { error: 'complete onboarding first' },
      { status: 409 }
    );
  }

  try {
    await provisionTenant(tenant.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'provisioning failed';
    console.error(`[provision route] ${tenant.slug}: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
