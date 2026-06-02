'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProvisionLog } from './provision-log';

export function ProvisionButton({
  tenantId,
  initialStatus,
}: {
  tenantId: string;
  initialStatus: string;
}) {
  const router = useRouter();
  // If the tenant is already provisioning (landed here from onboarding, the
  // worker is running, or a refresh mid-provision), start streaming + kick off
  // the run immediately. The server-side lock makes the POST idempotent.
  const [running, setRunning] = useState(initialStatus === 'provisioning');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  function startProvision() {
    startedRef.current = true;
    setRunning(true);
    setDone(false);
    setError(null);
    // Kick off provisioning but don't block the log polling on the long
    // request — the live log + status polling drives the UI. A concurrent
    // request just returns 202 and watches the same log.
    fetch(`/api/tenants/${tenantId}/provision`, { method: 'POST' })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body?.error ?? `Provisioning failed (${res.status})`);
          // The attempt ended without reaching a terminal status (e.g. the DB
          // wasn't ready yet). Re-enable the button so the user can resume —
          // the rerun picks up where this left off.
          setRunning(false);
          setDone(true);
          router.refresh();
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Unknown error');
        setRunning(false);
        setDone(true);
        router.refresh();
      });
  }

  // Auto-start when we arrive already in the provisioning state, so the bot
  // actually gets built instead of the log spinning with nothing happening.
  useEffect(() => {
    if (initialStatus === 'provisioning' && !startedRef.current) {
      startProvision();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleTerminal(status: string) {
    setRunning(false);
    setDone(true);
    if (status === 'paused') {
      setError(
        'Provisioning did not finish — the bot never became healthy. See the log above.'
      );
    }
    router.refresh();
  }

  return (
    <div>
      {!running && (
        <button
          onClick={startProvision}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          {done ? 'Provision again' : 'Start provisioning'}
        </button>
      )}
      {running && (
        <p className="text-sm text-muted-foreground">
          Provisioning… this takes ~2 minutes. Live progress below:
        </p>
      )}

      <ProvisionLog
        tenantId={tenantId}
        active={running}
        onTerminal={handleTerminal}
      />

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
