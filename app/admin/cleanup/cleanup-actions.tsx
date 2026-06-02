'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface RailwayOrphan {
  id: string;
  name: string;
}
interface SupabaseOrphan {
  ref: string;
  name: string;
  status: string;
}

export function CleanupActions({
  railway,
  supabase,
}: {
  railway: RailwayOrphan[];
  supabase: SupabaseOrphan[];
}) {
  const router = useRouter();
  const [railwaySel, setRailwaySel] = useState<Set<string>>(
    new Set(railway.map((r) => r.id))
  );
  const [supabaseSel, setSupabaseSel] = useState<Set<string>>(
    new Set(supabase.map((s) => s.ref))
  );
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    deleted: { railway: string[]; supabase: string[] };
    errors: string[];
  } | null>(null);

  const selectedCount = railwaySel.size + supabaseSel.size;

  function toggle(set: Set<string>, key: string): Set<string> {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  }

  async function tearDown() {
    if (selectedCount === 0) return;
    if (
      !window.confirm(
        `Permanently delete ${selectedCount} resource(s)? This destroys the Railway services and Supabase databases — it cannot be undone.`
      )
    ) {
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch('/api/admin/cleanup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          railwayServiceIds: [...railwaySel],
          supabaseRefs: [...supabaseSel],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      setResult({ deleted: body.deleted, errors: body.errors ?? [] });
      router.refresh();
    } catch (err) {
      setResult({
        deleted: { railway: [], supabase: [] },
        errors: [err instanceof Error ? err.message : 'Unknown error'],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {railway.length > 0 && (
        <Section title={`Orphaned Railway services (${railway.length})`}>
          {railway.map((r) => (
            <Row
              key={r.id}
              checked={railwaySel.has(r.id)}
              onChange={() => setRailwaySel((s) => toggle(s, r.id))}
              primary={r.name}
              secondary={r.id}
            />
          ))}
        </Section>
      )}

      {supabase.length > 0 && (
        <Section title={`Orphaned Supabase databases (${supabase.length})`}>
          {supabase.map((s) => (
            <Row
              key={s.ref}
              checked={supabaseSel.has(s.ref)}
              onChange={() => setSupabaseSel((x) => toggle(x, s.ref))}
              primary={s.name}
              secondary={`${s.ref} · ${s.status}`}
            />
          ))}
        </Section>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={tearDown}
          disabled={busy || selectedCount === 0}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {busy
            ? 'Tearing down…'
            : `Tear down ${selectedCount} selected`}
        </button>
        <span className="text-xs text-muted-foreground">
          Recomputed server-side before deletion — only confirmed orphans are
          touched.
        </span>
      </div>

      {result && (
        <div className="rounded-md border border-border p-4 text-sm">
          <p className="font-medium">
            Deleted {result.deleted.railway.length} service(s) and{' '}
            {result.deleted.supabase.length} database(s).
          </p>
          {(result.deleted.railway.length > 0 ||
            result.deleted.supabase.length > 0) && (
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {[...result.deleted.railway, ...result.deleted.supabase].join(
                ', '
              )}
            </p>
          )}
          {result.errors.length > 0 && (
            <p className="mt-2 text-xs text-red-600">
              Errors: {result.errors.join('; ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border">
      <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="divide-y divide-border">{children}</div>
    </div>
  );
}

function Row({
  checked,
  onChange,
  primary,
  secondary,
}: {
  checked: boolean;
  onChange: () => void;
  primary: string;
  secondary: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-muted/30">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-4 w-4"
      />
      <div className="min-w-0">
        <div className="font-medium">{primary}</div>
        <div className="truncate font-mono text-xs text-muted-foreground">
          {secondary}
        </div>
      </div>
    </label>
  );
}
