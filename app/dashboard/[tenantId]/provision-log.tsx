'use client';

import { useEffect, useRef, useState } from 'react';

type Level = 'info' | 'warn' | 'error' | 'success';
interface Ev {
  id: string;
  level: Level;
  message: string;
  createdAt: string;
}

const TERMINAL = new Set(['active', 'paused', 'cancelled']);

const levelStyle: Record<Level, string> = {
  info: 'text-slate-300',
  warn: 'text-amber-400',
  error: 'text-red-400',
  success: 'text-emerald-400',
};
const levelMark: Record<Level, string> = {
  info: '•',
  warn: '!',
  error: '✕',
  success: '✓',
};

/**
 * Polls the provisioning activity log every ~1.5s while `active`, rendering it
 * as a live terminal. Stops when the tenant reaches a terminal status and
 * notifies the parent so it can refresh the page.
 */
export function ProvisionLog({
  tenantId,
  active,
  onTerminal,
}: {
  tenantId: string;
  active: boolean;
  onTerminal?: (status: string) => void;
}) {
  const [events, setEvents] = useState<Ev[]>([]);
  const [status, setStatus] = useState<string>('provisioning');
  const seen = useRef<Set<string>>(new Set());
  const endRef = useRef<HTMLDivElement | null>(null);
  const onTerminalRef = useRef(onTerminal);
  onTerminalRef.current = onTerminal;

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      try {
        const res = await fetch(`/api/tenants/${tenantId}/provision/events`, {
          cache: 'no-store',
        });
        if (res.ok) {
          const data = (await res.json()) as { status: string; events: Ev[] };
          setStatus(data.status);
          const fresh = data.events.filter((e) => !seen.current.has(e.id));
          if (fresh.length) {
            fresh.forEach((e) => seen.current.add(e.id));
            setEvents((prev) => [...prev, ...fresh]);
          }
          if (TERMINAL.has(data.status)) {
            stopped = true;
            // brief delay so the final lines render before the page refreshes
            setTimeout(() => onTerminalRef.current?.(data.status), 1200);
            return;
          }
        }
      } catch {
        // transient — keep polling
      }
      if (!stopped) timer = setTimeout(tick, 1500);
    };
    tick();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [active, tenantId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [events]);

  if (!active && events.length === 0) return null;

  const running = !TERMINAL.has(status);

  return (
    <div className="mt-4 max-h-72 overflow-y-auto rounded-md border border-border bg-slate-950 p-3 font-mono text-xs leading-relaxed">
      {events.length === 0 && (
        <div className="text-slate-500">Waiting for the first step…</div>
      )}
      {events.map((e) => (
        <div key={e.id} className={`flex gap-2 ${levelStyle[e.level]}`}>
          <span className="shrink-0 text-slate-600">
            {new Date(e.createdAt).toLocaleTimeString()}
          </span>
          <span className="shrink-0">{levelMark[e.level]}</span>
          <span className="whitespace-pre-wrap break-words">{e.message}</span>
        </div>
      ))}
      {running && (
        <div className="mt-1 animate-pulse text-slate-500">▌ working…</div>
      )}
      <div ref={endRef} />
    </div>
  );
}
