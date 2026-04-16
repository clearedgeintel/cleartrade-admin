'use client';

import { useState } from 'react';
import type { PlanId } from '@/lib/plans';

export function CheckoutButton({
  plan,
  highlighted,
}: {
  plan: PlanId;
  highlighted: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Checkout failed (${res.status})`);
      }
      const { url } = (await res.json()) as { url: string };
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={onClick}
        disabled={loading}
        className={`block w-full rounded-md px-4 py-2 text-center font-medium transition disabled:opacity-60 ${
          highlighted
            ? 'bg-primary text-primary-foreground hover:opacity-90'
            : 'border border-border hover:bg-muted'
        }`}
      >
        {loading ? 'Redirecting…' : 'Subscribe'}
      </button>
      {error && (
        <p className="mt-2 text-center text-xs text-red-500">{error}</p>
      )}
    </>
  );
}
