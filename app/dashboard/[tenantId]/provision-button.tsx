'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ProvisionButton({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>(
    'idle'
  );
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setState('running');
    setError(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/provision`, {
        method: 'POST',
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Provisioning failed (${res.status})`);
      }
      setState('done');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState('error');
    }
  }

  return (
    <>
      <button
        onClick={onClick}
        disabled={state === 'running'}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {state === 'running'
          ? 'Provisioning (this takes ~2 min)…'
          : state === 'done'
          ? 'Done ✓'
          : 'Start provisioning'}
      </button>
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
    </>
  );
}
