import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';
import { resumeService } from '@/lib/provisioner/railway';

export const runtime = 'nodejs';

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
  if (tenant.status !== 'paused') {
    return NextResponse.json(
      { error: `can't resume from status ${tenant.status}` },
      { status: 409 }
    );
  }

  const [infra] = await db
    .select()
    .from(tenantInfra)
    .where(eq(tenantInfra.tenantId, tenant.id))
    .limit(1);
  if (!infra?.railwayServiceId || !infra.railwayEnvId) {
    return NextResponse.json(
      { error: 'bot is not provisioned' },
      { status: 409 }
    );
  }

  try {
    await resumeService(infra.railwayServiceId, infra.railwayEnvId);
  } catch (err) {
    return NextResponse.json(
      { error: `railway resume failed: ${(err as Error).message}` },
      { status: 502 }
    );
  }

  // Railway takes a few seconds to come back up — we don't poll health
  // here, we just flip the status and let the dashboard's live fetch
  // reflect true state.
  await db
    .update(tenants)
    .set({ status: 'active', updatedAt: new Date() })
    .where(eq(tenants.id, tenant.id));

  return NextResponse.json({ ok: true });
}
