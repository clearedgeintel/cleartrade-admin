import { computeOrphans } from '@/lib/admin/reconcile';
import { CleanupActions } from './cleanup-actions';

// Hits Railway + Supabase APIs on every load — never cache.
export const dynamic = 'force-dynamic';

export default async function AdminCleanupPage() {
  const report = await computeOrphans();
  const total = report.railway.length + report.supabase.length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Resource cleanup
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Bot resources in the cloud that no longer belong to a live tenant —
          leftovers from failed or cancelled provisions. Keeping{' '}
          {report.liveServiceCount} live Railway service
          {report.liveServiceCount === 1 ? '' : 's'} and{' '}
          {report.liveSupabaseCount} live database
          {report.liveSupabaseCount === 1 ? '' : 's'}.
        </p>
      </div>

      {report.errors.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700">
          Couldn&apos;t fully reconcile: {report.errors.join('; ')}
        </div>
      )}

      {total === 0 ? (
        <div className="rounded-lg border border-border px-6 py-12 text-center text-sm text-muted-foreground">
          ✓ No orphaned resources. Everything in the cloud maps to a live
          tenant.
        </div>
      ) : (
        <CleanupActions
          railway={report.railway}
          supabase={report.supabase}
        />
      )}
    </div>
  );
}
