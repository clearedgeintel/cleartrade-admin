import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { and, asc, eq, gt } from 'drizzle-orm';
import { db } from '@/db';
import { provisionEvents, tenants } from '@/db/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns the provisioning activity log for a tenant the caller owns, plus the
 * tenant's current status so the client knows when to stop polling. Pass
 * `?since=<iso>` to fetch only newer events.
 */
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const [tenant] = await db
    .select({ id: tenants.id, status: tenants.status })
    .from(tenants)
    .where(and(eq(tenants.id, params.id), eq(tenants.ownerId, userId)))
    .limit(1);

  if (!tenant) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const sinceParam = new URL(req.url).searchParams.get('since');
  const since = sinceParam ? new Date(sinceParam) : null;

  const where =
    since && !Number.isNaN(since.getTime())
      ? and(
          eq(provisionEvents.tenantId, tenant.id),
          gt(provisionEvents.createdAt, since)
        )
      : eq(provisionEvents.tenantId, tenant.id);

  const events = await db
    .select({
      id: provisionEvents.id,
      level: provisionEvents.level,
      message: provisionEvents.message,
      createdAt: provisionEvents.createdAt,
    })
    .from(provisionEvents)
    .where(where)
    .orderBy(asc(provisionEvents.createdAt))
    .limit(500);

  return NextResponse.json({ status: tenant.status, events });
}
