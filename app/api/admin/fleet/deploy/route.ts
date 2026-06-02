import { NextResponse } from 'next/server';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';
import { isCurrentUserAdmin } from '@/lib/admin-auth';
import { setServiceImage } from '@/lib/provisioner/railway';
import { isAllowedImage, latestImageRef } from '@/lib/releases';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Rolls every live bot (active or paused) to the given image. Sequential and
 * best-effort: a failure on one bot is recorded and the rest continue. Each
 * bot redeploys independently (~30-60s of downtime each).
 */
export async function POST(req: Request) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as { image?: string };
  const image = body.image || latestImageRef();
  if (!isAllowedImage(image)) {
    return NextResponse.json(
      { error: 'image is not from the bot registry' },
      { status: 400 }
    );
  }

  const targets = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      serviceId: tenantInfra.railwayServiceId,
      environmentId: tenantInfra.railwayEnvId,
    })
    .from(tenants)
    .innerJoin(tenantInfra, eq(tenantInfra.tenantId, tenants.id))
    .where(
      and(
        inArray(tenants.status, ['active', 'paused']),
        isNotNull(tenantInfra.railwayServiceId)
      )
    );

  const results: { id: string; name: string; ok: boolean; error?: string }[] =
    [];

  for (const t of targets) {
    if (!t.serviceId || !t.environmentId) continue;
    try {
      await setServiceImage({
        serviceId: t.serviceId,
        environmentId: t.environmentId,
        image,
      });
      await db
        .update(tenantInfra)
        .set({ version: image })
        .where(eq(tenantInfra.tenantId, t.id));
      results.push({ id: t.id, name: t.name, ok: true });
    } catch (err) {
      results.push({
        id: t.id,
        name: t.name,
        ok: false,
        error: err instanceof Error ? err.message : 'deploy failed',
      });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  return NextResponse.json({
    ok: true,
    image,
    total: results.length,
    succeeded,
    results,
  });
}
