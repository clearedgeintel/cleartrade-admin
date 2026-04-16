'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Action = 'pause' | 'resume' | 'cancel';

export function LifecycleButtons({
  tenantId,
  status,
}: {
  tenantId: string;
  status: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function trigger(action: Action) {
    if (action === 'cancel') {
      const ok = window.confirm(
        'Cancel this bot? This stops billing and destroys the Railway service, Supabase project, and DNS record. This cannot be undone.'
      );
      if (!ok) return;
    }
    setRunning(action);
    setError(null);
    try {
      const path =
        action === 'cancel'
          ? `/api/tenants/${tenantId}`
          : `/api/tenants/${tenantId}/${action}`;
      const res = await fetch(path, {
        method: action === 'cancel' ? 'DELETE' : 'POST',
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      if (body.warning) {
        setError(`Completed with warning: ${body.warning}`);
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setRunning(null);
    }
  }

  const canPause = status === 'active';
  const canResume = status === 'paused';
  const canCancel = status !== 'cancelled';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {canPause && (
          <button
            onClick={() => trigger('pause')}
            disabled={running !== null}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            {running === 'pause' ? 'Pausing…' : 'Pause bot'}
          </button>
        )}
        {canResume && (
          <button
            onClick={() => trigger('resume')}
            disabled={running !== null}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {running === 'resume' ? 'Resuming…' : 'Resume bot'}
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => trigger('cancel')}
            disabled={running !== null}
            className="rounded-md border border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-500/10 disabled:opacity-60"
          >
            {running === 'cancel' ? 'Cancelling (this takes ~30s)…' : 'Cancel & delete'}
          </button>
        )}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
