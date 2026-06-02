import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';
import { isCurrentUserAdmin } from '@/lib/admin-auth';
import { setServiceImage } from '@/lib/provisioner/railway';
import { isAllowedImage, latestImageRef } from '@/lib/releases';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Deploys a specific bot image to one tenant's service (update to latest, pin
 * to a version, or roll back). Records the deployed ref on the infra row.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
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

  const [infra] = await db
    .select()
    .from(tenantInfra)
    .where(eq(tenantInfra.tenantId, params.id))
    .limit(1);

  if (!infra?.railwayServiceId || !infra.railwayEnvId) {
    return NextResponse.json(
      { error: 'bot has no running service to deploy to' },
      { status: 409 }
    );
  }

  try {
    await setServiceImage({
      serviceId: infra.railwayServiceId,
      environmentId: infra.railwayEnvId,
      image,
    });
    await db
      .update(tenantInfra)
      .set({ version: image })
      .where(eq(tenantInfra.tenantId, params.id));
    await db
      .update(tenants)
      .set({ updatedAt: new Date() })
      .where(eq(tenants.id, params.id));
    return NextResponse.json({ ok: true, image });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'deploy failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
