'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface PlanOption {
  id: string;
  name: string;
  priceMonthly: number;
}

export function PlanSelector({
  tenantId,
  currentPlan,
  plans,
}: {
  tenantId: string;
  currentPlan: string;
  plans: PlanOption[];
}) {
  const router = useRouter();
  const [plan, setPlan] = useState(currentPlan);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn' | 'err'; text: string } | null>(
    null
  );

  const dirty = plan !== currentPlan;

  async function apply() {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/tenants/${tenantId}/plan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      if (body.warning) {
        setMsg({ kind: 'warn', text: body.warning });
      } else {
        setMsg({ kind: 'ok', text: `Plan set to ${body.plan}.` });
      }
      router.refresh();
    } catch (err) {
      setMsg({
        kind: 'err',
        text: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — ${p.priceMonthly}/mo
            </option>
          ))}
        </select>
        <button
          onClick={apply}
          disabled={!dirty || saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Applying…' : 'Apply'}
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Manual override. Stripe stays the billing source of truth — this won&apos;t
        change what the customer is charged.
      </p>
      {msg && (
        <p
          className={
            msg.kind === 'err'
              ? 'text-xs text-red-600'
              : msg.kind === 'warn'
              ? 'text-xs text-amber-600'
              : 'text-xs text-emerald-600'
          }
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}
