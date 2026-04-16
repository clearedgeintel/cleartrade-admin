import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';

interface ResolvedBotTarget {
  subdomain: string;
  botApiKey: string;
}

/**
 * Resolves a tenant to its bot target, verifying the caller owns it.
 * Returns null if the tenant doesn't exist, isn't owned by `userId`, or
 * hasn't been provisioned far enough to have a subdomain + API key.
 */
export async function resolveBotTarget(
  tenantId: string,
  userId: string
): Promise<ResolvedBotTarget | null> {
  const [row] = await db
    .select({
      subdomain: tenantInfra.subdomain,
      botApiKey: tenantInfra.botApiKey,
    })
    .from(tenants)
    .innerJoin(tenantInfra, eq(tenantInfra.tenantId, tenants.id))
    .where(and(eq(tenants.id, tenantId), eq(tenants.ownerId, userId)))
    .limit(1);

  if (!row?.subdomain || !row.botApiKey) return null;
  return { subdomain: row.subdomain, botApiKey: row.botApiKey };
}

/**
 * Forwards a request to the tenant's bot and streams the response back.
 * The bot trusts the x-api-key header — generated per tenant at
 * provisioning time, stored in tenant_infra.bot_api_key, never exposed
 * to the client.
 */
export async function proxyToBot({
  target,
  path,
  method,
  body,
  searchParams,
}: {
  target: ResolvedBotTarget;
  path: string;
  method: string;
  body?: BodyInit | null;
  searchParams?: string;
}): Promise<Response> {
  const url = `https://${target.subdomain}${path}${
    searchParams ? `?${searchParams}` : ''
  }`;

  const upstream = await fetch(url, {
    method,
    headers: {
      'x-api-key': target.botApiKey,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body,
    cache: 'no-store',
  });

  // Pass through status + json body. We deliberately don't forward all
  // upstream headers (set-cookie, etc) to keep the blast radius small.
  const contentType =
    upstream.headers.get('content-type') ?? 'application/json';
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { 'content-type': contentType },
  });
}

/**
 * Convenience wrapper for server-side fetches (e.g. from a page component)
 * that want the parsed body directly instead of a Response.
 */
export async function fetchFromBot<T>({
  target,
  path,
}: {
  target: ResolvedBotTarget;
  path: string;
}): Promise<T> {
  const res = await proxyToBot({ target, path, method: 'GET' });
  if (!res.ok) {
    throw new Error(`bot returned ${res.status} for ${path}`);
  }
  return (await res.json()) as T;
}
