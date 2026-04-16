'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PlanId } from '@/lib/plans';

type WatchlistPreset = 'top8' | 'crypto' | 'custom';
type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';
type AgencyMode = 'rules' | 'hybrid' | 'ai';

export function SettingsForm({
  tenantId,
  plan,
  current,
  planLimits,
}: {
  tenantId: string;
  plan: PlanId;
  current: {
    watchlistPreset: WatchlistPreset | null;
    customSymbols: string[] | null;
    riskTolerance: RiskTolerance | null;
    agencyMode: AgencyMode | null;
    alpacaBaseUrl: string | null;
    alpacaKeyMask: string | null;
  };
  planLimits: {
    maxScanSymbols: number;
    liveTradingAllowed: boolean;
  };
}) {
  const router = useRouter();

  // Each section submits independently — rotating keys shouldn't force
  // preferences to be re-submitted and vice versa.
  return (
    <div className="mt-8 space-y-10">
      <AlpacaSection
        tenantId={tenantId}
        currentKeyMask={current.alpacaKeyMask}
        currentBaseUrl={current.alpacaBaseUrl}
        liveTradingAllowed={planLimits.liveTradingAllowed}
        onSuccess={() => router.refresh()}
      />
      <PreferencesSection
        tenantId={tenantId}
        plan={plan}
        current={current}
        planLimits={planLimits}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}

// ─── Alpaca key rotation ──────────────────────────────────────────

function AlpacaSection({
  tenantId,
  currentKeyMask,
  currentBaseUrl,
  liveTradingAllowed,
  onSuccess,
}: {
  tenantId: string;
  currentKeyMask: string | null;
  currentBaseUrl: string | null;
  liveTradingAllowed: boolean;
  onSuccess: () => void;
}) {
  const [key, setKey] = useState('');
  const [secret, setSecret] = useState('');
  const [useLive, setUseLive] = useState(
    currentBaseUrl === 'https://api.alpaca.markets'
  );
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<
    { type: 'ok' | 'err'; text: string } | null
  >(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          alpacaApiKey: key,
          alpacaApiSecret: secret,
          useLive,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      setKey('');
      setSecret('');
      setMessage({
        type: 'ok',
        text: body.warning ?? 'Keys rotated. Restart the bot to apply.',
      });
      onSuccess();
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Alpaca credentials</h2>
        <p className="text-sm text-muted-foreground">
          Current key: <span className="font-mono">{currentKeyMask ?? '—'}</span>
          . Enter new values below to rotate.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium">New API key</span>
        <input
          type="text"
          autoComplete="off"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">New API secret</span>
        <input
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono"
        />
      </label>
      {liveTradingAllowed ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useLive}
            onChange={(e) => setUseLive(e.target.checked)}
          />
          Use live trading (uncheck for paper)
        </label>
      ) : (
        <p className="text-xs text-muted-foreground">
          Paper trading only — upgrade to Pro or Enterprise for live.
        </p>
      )}

      {message && (
        <p
          className={`text-sm ${
            message.type === 'ok' ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !key || !secret}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? 'Rotating…' : 'Rotate keys'}
      </button>
    </form>
  );
}

// ─── Preferences ──────────────────────────────────────────────────

function PreferencesSection({
  tenantId,
  plan,
  current,
  planLimits,
  onSuccess,
}: {
  tenantId: string;
  plan: PlanId;
  current: {
    watchlistPreset: WatchlistPreset | null;
    customSymbols: string[] | null;
    riskTolerance: RiskTolerance | null;
    agencyMode: AgencyMode | null;
  };
  planLimits: { maxScanSymbols: number };
  onSuccess: () => void;
}) {
  const [watchlistPreset, setWatchlistPreset] = useState<WatchlistPreset>(
    current.watchlistPreset ?? 'top8'
  );
  const [customSymbolsRaw, setCustomSymbolsRaw] = useState(
    current.customSymbols?.join(', ') ?? ''
  );
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>(
    current.riskTolerance ?? 'moderate'
  );
  const [agencyMode, setAgencyMode] = useState<AgencyMode>(
    current.agencyMode ?? (plan === 'starter' ? 'hybrid' : 'ai')
  );
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<
    { type: 'ok' | 'err'; text: string } | null
  >(null);

  const customSymbols = customSymbolsRaw
    .split(/[,\s]+/)
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          watchlistPreset,
          customSymbols: watchlistPreset === 'custom' ? customSymbols : undefined,
          riskTolerance,
          agencyMode,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      setMessage({
        type: 'ok',
        text: body.warning ?? 'Preferences saved. Restart the bot to apply.',
      });
      onSuccess();
    } catch (err) {
      setMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Bot preferences</h2>
        <p className="text-sm text-muted-foreground">
          Watchlist, risk tolerance, and agency mode. Plan cap:{' '}
          {planLimits.maxScanSymbols} symbols.
        </p>
      </div>

      <RadioGroup
        label="Watchlist"
        value={watchlistPreset}
        onChange={(v) => setWatchlistPreset(v as WatchlistPreset)}
        options={[
          { value: 'top8', label: 'Top 8 equities' },
          { value: 'crypto', label: 'Crypto', disabled: plan === 'starter' },
          { value: 'custom', label: 'Custom' },
        ]}
      />
      {watchlistPreset === 'custom' && (
        <label className="block space-y-1">
          <span className="text-sm font-medium">
            Custom symbols (comma or space separated)
          </span>
          <textarea
            rows={3}
            value={customSymbolsRaw}
            onChange={(e) => setCustomSymbolsRaw(e.target.value)}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono"
          />
          <span className="text-xs text-muted-foreground">
            {customSymbols.length} symbol{customSymbols.length === 1 ? '' : 's'}
          </span>
        </label>
      )}

      <RadioGroup
        label="Risk tolerance"
        value={riskTolerance}
        onChange={(v) => setRiskTolerance(v as RiskTolerance)}
        options={[
          { value: 'conservative', label: 'Conservative · 1% risk' },
          { value: 'moderate', label: 'Moderate · 2% risk' },
          { value: 'aggressive', label: 'Aggressive · 4% risk' },
        ]}
      />

      <RadioGroup
        label="Agency mode"
        value={agencyMode}
        onChange={(v) => setAgencyMode(v as AgencyMode)}
        options={[
          { value: 'rules', label: 'Rules only' },
          { value: 'hybrid', label: 'Hybrid' },
          { value: 'ai', label: 'Full AI agency', disabled: plan === 'starter' },
        ]}
      />

      {message && (
        <p
          className={`text-sm ${
            message.type === 'ok' ? 'text-green-600' : 'text-red-600'
          }`}
        >
          {message.text}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? 'Saving…' : 'Save preferences'}
      </button>
    </form>
  );
}

function RadioGroup({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">{label}</div>
      <div className="grid gap-2">
        {options.map((opt) => (
          <button
            type="button"
            key={opt.value}
            onClick={() => !opt.disabled && onChange(opt.value)}
            disabled={opt.disabled}
            className={`rounded-md border px-4 py-2 text-left text-sm transition ${
              value === opt.value
                ? 'border-foreground bg-muted'
                : 'border-border hover:bg-muted/50'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            {opt.label}
            {opt.disabled && (
              <span className="ml-2 text-xs text-muted-foreground">
                (not on this plan)
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
