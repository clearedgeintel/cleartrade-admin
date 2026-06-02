'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PLANS, type PlanId } from '@/lib/plans';

type WatchlistPreset = 'top8' | 'crypto' | 'custom';
type RiskTolerance = 'conservative' | 'moderate' | 'aggressive';
type AgencyMode = 'rules' | 'hybrid' | 'ai';

export function OnboardingForm({
  tenantId,
  plan,
}: {
  tenantId: string;
  plan: PlanId;
}) {
  const router = useRouter();
  const planInfo = PLANS[plan];

  const [alpacaApiKey, setAlpacaApiKey] = useState('');
  const [alpacaApiSecret, setAlpacaApiSecret] = useState('');
  const [useLive, setUseLive] = useState(false);
  const [watchlistPreset, setWatchlistPreset] =
    useState<WatchlistPreset>('top8');
  const [customSymbolsRaw, setCustomSymbolsRaw] = useState('');
  const [riskTolerance, setRiskTolerance] =
    useState<RiskTolerance>('moderate');
  const [agencyMode, setAgencyMode] = useState<AgencyMode>(
    plan === 'starter' ? 'hybrid' : 'ai'
  );
  const [anthropicApiKey, setAnthropicApiKey] = useState('');
  const [databaseUrl, setDatabaseUrl] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const customSymbols = useMemo(
    () =>
      customSymbolsRaw
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    [customSymbolsRaw]
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/tenants/${tenantId}/onboard`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          alpacaApiKey,
          alpacaApiSecret,
          useLive,
          watchlistPreset,
          customSymbols: watchlistPreset === 'custom' ? customSymbols : undefined,
          riskTolerance,
          agencyMode,
          anthropicApiKey: anthropicApiKey.trim() || undefined,
          databaseUrl: databaseUrl.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed (${res.status})`);
      }
      router.push(`/dashboard/${tenantId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-10">
      <Section
        title="Alpaca credentials"
        description="Your keys are encrypted and never leave this server except to be injected into your bot instance."
      >
        <Field label="API key">
          <input
            type="text"
            required
            autoComplete="off"
            value={alpacaApiKey}
            onChange={(e) => setAlpacaApiKey(e.target.value)}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono"
          />
        </Field>
        <Field label="API secret">
          <input
            type="password"
            required
            autoComplete="off"
            value={alpacaApiSecret}
            onChange={(e) => setAlpacaApiSecret(e.target.value)}
            className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono"
          />
        </Field>
        {planInfo.liveTradingAllowed ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useLive}
              onChange={(e) => setUseLive(e.target.checked)}
            />
            Use live trading (uncheck for paper trading)
          </label>
        ) : (
          <p className="text-xs text-muted-foreground">
            Paper trading only — upgrade to Pro or Enterprise for live trading.
          </p>
        )}
      </Section>

      <Section
        title="Watchlist"
        description={`Up to ${planInfo.maxScanSymbols} symbols on your plan.`}
      >
        <RadioGroup
          value={watchlistPreset}
          onChange={(v) => setWatchlistPreset(v as WatchlistPreset)}
          options={[
            {
              value: 'top8',
              label: 'Top 8',
              description: 'SPY, QQQ, AAPL, MSFT, GOOGL, AMZN, NVDA, META',
            },
            {
              value: 'crypto',
              label: 'Crypto',
              description: 'BTC/USD, ETH/USD, SOL/USD, and more',
              disabled: plan === 'starter',
            },
            {
              value: 'custom',
              label: 'Custom',
              description: 'Enter symbols below',
            },
          ]}
        />
        {watchlistPreset === 'custom' && (
          <Field label="Custom symbols (comma or space separated)">
            <textarea
              rows={3}
              value={customSymbolsRaw}
              onChange={(e) => setCustomSymbolsRaw(e.target.value)}
              placeholder="AAPL, TSLA, NVDA"
              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Parsed: {customSymbols.length} symbol
              {customSymbols.length === 1 ? '' : 's'}
            </p>
          </Field>
        )}
      </Section>

      <Section
        title="Risk tolerance"
        description="Controls position sizing (RISK_PCT) and stop-loss aggressiveness."
      >
        <RadioGroup
          value={riskTolerance}
          onChange={(v) => setRiskTolerance(v as RiskTolerance)}
          options={[
            {
              value: 'conservative',
              label: 'Conservative',
              description: '1% risk per trade, tight stops',
            },
            {
              value: 'moderate',
              label: 'Moderate',
              description: '2% risk per trade, standard stops',
            },
            {
              value: 'aggressive',
              label: 'Aggressive',
              description: '4% risk per trade, wider stops',
            },
          ]}
        />
      </Section>

      <Section
        title="Agency mode"
        description="How much autonomy the AI agents have in trading decisions."
      >
        <RadioGroup
          value={agencyMode}
          onChange={(v) => setAgencyMode(v as AgencyMode)}
          options={[
            {
              value: 'rules',
              label: 'Rules only',
              description: 'Deterministic signals, no LLM',
            },
            {
              value: 'hybrid',
              label: 'Hybrid',
              description: 'Rules filter candidates, LLM scores them',
            },
            {
              value: 'ai',
              label: 'Full AI agency',
              description: 'LLM drives the full decision loop',
              disabled: plan === 'starter',
            },
          ]}
        />
      </Section>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-sm font-medium text-primary hover:underline"
        >
          {showAdvanced ? '−' : '+'} Bring your own keys (optional)
        </button>
        {showAdvanced && (
          <div className="space-y-4 rounded-lg border border-border bg-surface/60 p-4">
            <p className="text-xs text-muted-foreground">
              Leave these blank and we provide them. Bring your own for full
              control over your LLM spend and your data.
            </p>
            <Field label="Anthropic API key">
              <input
                type="password"
                autoComplete="off"
                value={anthropicApiKey}
                onChange={(e) => setAnthropicApiKey(e.target.value)}
                placeholder="sk-ant-…"
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Blank uses our shared LLM key (subject to your plan&apos;s daily
                cap).
              </p>
            </Field>
            <Field label="Your database URL">
              <input
                type="password"
                autoComplete="off"
                value={databaseUrl}
                onChange={(e) => setDatabaseUrl(e.target.value)}
                placeholder="postgresql://user:pass@host:5432/postgres"
                className="w-full rounded-md border border-border bg-transparent px-3 py-2 font-mono text-sm"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Blank provisions an isolated database for you. Bring your own
                Postgres (e.g. a Supabase pooler URL) — it must be reachable
                from the internet, and we never delete it.
              </p>
            </Field>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-loss/30 bg-loss/10 px-4 py-2 text-sm text-loss">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-primary px-4 py-3 text-center font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {submitting ? 'Saving…' : 'Finish setup'}
      </button>
    </form>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

function RadioGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: {
    value: string;
    label: string;
    description: string;
    disabled?: boolean;
  }[];
}) {
  return (
    <div className="grid gap-2">
      {options.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            type="button"
            key={opt.value}
            onClick={() => !opt.disabled && onChange(opt.value)}
            disabled={opt.disabled}
            className={`rounded-md border px-4 py-3 text-left transition ${
              active
                ? 'border-foreground bg-muted'
                : 'border-border hover:bg-muted/50'
            } disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <div className="text-sm font-medium">
              {opt.label}
              {opt.disabled && (
                <span className="ml-2 text-xs text-muted-foreground">
                  (not on this plan)
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {opt.description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
