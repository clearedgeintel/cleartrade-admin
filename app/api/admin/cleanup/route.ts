import { NextResponse } from 'next/server';
import { isCurrentUserAdmin } from '@/lib/admin-auth';
import { computeOrphans } from '@/lib/admin/reconcile';
import { deleteService } from '@/lib/provisioner/railway';
import { deleteSupabaseProject } from '@/lib/provisioner/supabase';
import { removeDNSRecordsFor } from '@/lib/provisioner/cloudflare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Tears down selected orphaned bot resources. Safety: we recompute the orphan
 * set server-side and only act on IDs that are *currently* orphans — a stale or
 * tampered request can never delete a resource that belongs to a live tenant.
 */
export async function POST(req: Request) {
  if (!(await isCurrentUserAdmin())) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    railwayServiceIds?: string[];
    supabaseRefs?: string[];
  };
  const reqRailway = new Set(body.railwayServiceIds ?? []);
  const reqSupabase = new Set(body.supabaseRefs ?? []);

  const report = await computeOrphans();
  const baseDomain = process.env.BASE_DOMAIN;

  const deleted: { railway: string[]; supabase: string[] } = {
    railway: [],
    supabase: [],
  };
  const errors: string[] = [];

  // Railway services (+ their DNS records). Only confirmed orphans.
  for (const svc of report.railway) {
    if (!reqRailway.has(svc.id)) continue;
    try {
      await deleteService(svc.id);
      deleted.railway.push(svc.name);
    } catch (err) {
      errors.push(`railway ${svc.name}: ${(err as Error).message}`);
      continue;
    }
    // Best-effort: drop the matching subdomain CNAME (bot-{slug} → {slug}).
    if (baseDomain && svc.name.startsWith('bot-')) {
      const slug = svc.name.slice('bot-'.length);
      await removeDNSRecordsFor(`${slug}.${baseDomain}`).catch((err) =>
        errors.push(`dns ${slug}: ${(err as Error).message}`)
      );
    }
  }

  // Supabase projects. Only confirmed orphans.
  for (const proj of report.supabase) {
    if (!reqSupabase.has(proj.ref)) continue;
    try {
      await deleteSupabaseProject(proj.ref);
      deleted.supabase.push(proj.name);
    } catch (err) {
      errors.push(`supabase ${proj.name}: ${(err as Error).message}`);
    }
  }

  return NextResponse.json({ ok: true, deleted, errors });
}
