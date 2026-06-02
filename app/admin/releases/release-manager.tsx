'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Panel, PanelHeader, StatusBadge, btn } from '@/components/ui';

interface Release {
  image: string;
  tag: string;
  shortSha: string;
  isLatest: boolean;
}
interface Bot {
  id: string;
  name: string;
  slug: string;
  status: string;
  version: string | null;
  hasService: boolean;
}

function label(image: string | null): string {
  if (!image) return 'unknown';
  const tag = image.slice(image.lastIndexOf(':') + 1);
  if (tag === 'latest') return 'latest';
  if (tag.startsWith('sha-')) return tag.replace(/^sha-/, '').slice(0, 7);
  return tag;
}

export function ReleaseManager({
  releases,
  latestImage,
  bots,
}: {
  releases: Release[];
  latestImage: string;
  bots: Bot[];
}) {
  const router = useRouter();
  const [fleetBusy, setFleetBusy] = useState(false);
  const [fleetResult, setFleetResult] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, string>>({});

  const options = [
    { image: latestImage, label: 'latest', isLatest: true },
    ...releases
      .filter((r) => !r.isLatest)
      .map((r) => ({ image: r.image, label: r.shortSha, isLatest: false })),
  ];

  async function updateAll() {
    if (
      !window.confirm(
        `Roll all ${bots.length} live bot(s) to latest? Each redeploys with ~30-60s of downtime.`
      )
    )
      return;
    setFleetBusy(true);
    setFleetResult(null);
    try {
      const res = await fetch('/api/admin/fleet/deploy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: latestImage }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      const failed = (body.results ?? []).filter((r: { ok: boolean }) => !r.ok);
      setFleetResult(
        `Rolled ${body.succeeded}/${body.total} bots to latest.` +
          (failed.length
            ? ` Failed: ${failed.map((f: { name: string }) => f.name).join(', ')}`
            : '')
      );
      router.refresh();
    } catch (err) {
      setFleetResult(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setFleetBusy(false);
    }
  }

  async function deployOne(bot: Bot) {
    const image = selected[bot.id] ?? latestImage;
    setRowBusy((s) => ({ ...s, [bot.id]: true }));
    setRowMsg((s) => ({ ...s, [bot.id]: '' }));
    try {
      const res = await fetch(`/api/admin/tenants/${bot.id}/deploy`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      setRowMsg((s) => ({ ...s, [bot.id]: `deploying ${label(image)}…` }));
      router.refresh();
    } catch (err) {
      setRowMsg((s) => ({
        ...s,
        [bot.id]: err instanceof Error ? err.message : 'failed',
      }));
    } finally {
      setRowBusy((s) => ({ ...s, [bot.id]: false }));
    }
  }

  return (
    <div className="space-y-6">
      {/* available builds + fleet action */}
      <Panel>
        <PanelHeader
          title="Available builds"
          right={
            <button
              onClick={updateAll}
              disabled={fleetBusy || bots.length === 0}
              className={btn.primary}
            >
              {fleetBusy ? 'Rolling…' : `Roll all ${bots.length} to latest`}
            </button>
          }
        />
        <div className="divide-y divide-border">
          {options.length === 0 ? (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              No builds found in the registry.
            </div>
          ) : (
            options.map((o) => (
              <div
                key={o.image}
                className="flex items-center justify-between px-4 py-2.5 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-medium">{o.label}</span>
                  {o.isLatest && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                      latest
                    </span>
                  )}
                </div>
                <span className="truncate font-mono text-xs text-muted-foreground">
                  {o.image}
                </span>
              </div>
            ))
          )}
        </div>
        {fleetResult && (
          <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            {fleetResult}
          </div>
        )}
      </Panel>

      {/* per-bot deploy / rollback */}
      <Panel>
        <PanelHeader title={`Bots (${bots.length})`} />
        {bots.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No live bots to manage.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {bots.map((bot) => (
              <div
                key={bot.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{bot.name}</span>
                    <StatusBadge status={bot.status} />
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    on{' '}
                    <span className="text-foreground">{label(bot.version)}</span>
                    {' · '}
                    {bot.slug}
                  </div>
                </div>

                <select
                  value={selected[bot.id] ?? latestImage}
                  onChange={(e) =>
                    setSelected((s) => ({ ...s, [bot.id]: e.target.value }))
                  }
                  disabled={!bot.hasService}
                  className="rounded-md border border-border-strong bg-surface px-2 py-1.5 text-xs"
                >
                  {options.map((o) => (
                    <option key={o.image} value={o.image}>
                      {o.label}
                      {o.isLatest ? ' (latest)' : ''}
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => deployOne(bot)}
                  disabled={rowBusy[bot.id] || !bot.hasService}
                  className={btn.ghost}
                >
                  {rowBusy[bot.id] ? 'Deploying…' : 'Deploy'}
                </button>

                {rowMsg[bot.id] && (
                  <span className="w-full text-right text-xs text-muted-foreground">
                    {rowMsg[bot.id]}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
