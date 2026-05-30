import { NextResponse } from 'next/server';
import { runProvisioningSweep } from '@/lib/provisioner/worker';

// Drives stuck 'provisioning' tenants through the pipeline. Invoked on a
// schedule (Vercel Cron via vercel.json, or any external scheduler that hits
// this URL with the CRON_SECRET). Idempotent and self-throttling — safe to
// call as often as you like.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Authorizes the caller. Accepts either:
 *  - `Authorization: Bearer <CRON_SECRET>` (Vercel Cron sends this when
 *    CRON_SECRET is set as a project env var), or
 *  - `x-cron-secret: <CRON_SECRET>` (convenient for external schedulers).
 */
function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if unconfigured
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  if (req.headers.get('x-cron-secret') === secret) return true;
  return false;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const result = await runProvisioningSweep();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'sweep failed';
    console.error(`[cron/provision] sweep error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Vercel Cron issues GET requests; support POST too for manual/curl triggers.
export const GET = handle;
export const POST = handle;
