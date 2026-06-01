import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { and, eq, isNull, lt, or } from 'drizzle-orm';
import { db } from '@/db';
import { tenants, tenantInfra } from '@/db/schema';
import { provisionTenant } from '@/lib/provisioner';

// Longer than maxDuration, so an in-flight run always still holds the lock.
const LOCK_MS = 6 * 60 * 1000;

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

  // Concurrency guard: a refresh or double-click must not launch a second
  // provision — two simultaneous runs collide on Railway service names. Claim
  // the tenant by stamping last_provision_attempt_at; only one caller wins
  // within the lock window. A loser just watches the live log (202, not error).
  await db
    .insert(tenantInfra)
    .values({ tenantId: tenant.id })
    .onConflictDoNothing({ target: tenantInfra.tenantId });

  const cutoff = new Date(Date.now() - LOCK_MS);
  const claimed = await db
    .update(tenantInfra)
    .set({ lastProvisionAttemptAt: new Date() })
    .where(
      and(
        eq(tenantInfra.tenantId, tenant.id),
        or(
          isNull(tenantInfra.lastProvisionAttemptAt),
          lt(tenantInfra.lastProvisionAttemptAt, cutoff)
        )
      )
    )
    .returning({ id: tenantInfra.tenantId });

  if (claimed.length === 0) {
    return NextResponse.json(
      { ok: true, already: 'in_progress' },
      { status: 202 }
    );
  }

  try {
    await provisionTenant(tenant.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'provisioning failed';
    console.error(`[provision route] ${tenant.slug}: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    // Release the lock so a retry after a failure isn't blocked for the full
    // window. (If the process is killed at maxDuration this won't run, and the
    // lock simply auto-expires after LOCK_MS.)
    await db
      .update(tenantInfra)
      .set({ lastProvisionAttemptAt: null })
      .where(eq(tenantInfra.tenantId, tenant.id))
      .catch(() => {});
  }
}
