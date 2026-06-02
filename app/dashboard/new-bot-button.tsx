'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Mirror of lib/slug.ts slugify, just for a live preview. The server is the
// source of truth and also de-duplicates; this is only a hint.
function previewSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}

export function NewBotButton() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = previewSlug(name);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError('Enter a name for the bot.');
      return;
    }
    if (!slug) {
      setError('Name needs at least one letter or number.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), plan: 'starter' }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `Failed (${res.status})`);
      router.push(`/onboarding`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex items-start gap-2">
      <div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Bot name (e.g. Acme)"
          className="w-56 rounded-md border border-border bg-background px-3 py-2 text-sm"
        />
        {slug ? (
          <p className="mt-1 text-xs text-muted-foreground">
            → {slug}.&lt;your-domain&gt;
          </p>
        ) : null}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      <button
        type="submit"
        disabled={loading}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {loading ? 'Creating…' : 'New bot'}
      </button>
    </form>
  );
}
