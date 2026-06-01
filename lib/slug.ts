import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenants } from '@/db/schema';

// Subdomain labels must be DNS-safe and stay well under the 63-char limit.
const MAX_LEN = 40;

/**
 * Turns a human tenant name into a DNS-safe label: lowercase, [a-z0-9]
 * plus hyphens, no leading/trailing/double hyphens. Returns '' if the name
 * has no usable characters (caller supplies a fallback).
 */
export function slugify(name: string): string {
  return name
    .normalize('NFKD') // decompose accents so they drop cleanly below
    .replace(/[^\w\s-]/g, '') // strip punctuation/symbols (keeps _ for now)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-') // spaces + underscores -> hyphen
    .replace(/-+/g, '-') // collapse repeats
    .replace(/^-+|-+$/g, '') // trim hyphens
    .slice(0, MAX_LEN)
    .replace(/-+$/g, ''); // re-trim in case slice landed on a hyphen
}

/**
 * A DNS-safe, unique tenant slug derived from `name`. Falls back to a random
 * label when the name slugifies to nothing, and resolves collisions with a
 * numeric suffix (`acme`, `acme-2`, …), then a random one as a last resort.
 * The slug column is UNIQUE, so callers should still handle a 23505 on insert
 * to cover the race between this check and the write.
 */
export async function uniqueTenantSlug(name: string): Promise<string> {
  const base = slugify(name) || `bot-${randomBytes(2).toString('hex')}`;

  let candidate = base;
  for (let n = 2; n <= 99; n++) {
    if (!(await slugTaken(candidate))) return candidate;
    candidate = `${base}-${n}`;
  }
  return `${base}-${randomBytes(2).toString('hex')}`;
}

async function slugTaken(slug: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.slug, slug))
    .limit(1);
  return !!row;
}
