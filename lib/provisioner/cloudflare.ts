const CF_API = 'https://api.cloudflare.com/client/v4';

interface CloudflareResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

/**
 * Creates a CNAME record so `{slug}.{BASE_DOMAIN}` resolves to the Railway
 * service's default domain. Proxied through Cloudflare (orange cloud) to
 * get TLS termination + DDoS protection for free.
 */
export async function addCNAME(input: {
  name: string; // e.g. "acme"
  target: string; // e.g. "bot-acme.up.railway.app"
}): Promise<{ recordId: string }> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set');
  if (!zoneId) throw new Error('CLOUDFLARE_ZONE_ID is not set');

  const res = await fetch(`${CF_API}/zones/${zoneId}/dns_records`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      type: 'CNAME',
      name: input.name,
      content: input.target,
      ttl: 1, // auto
      proxied: true,
    }),
  });

  const body = (await res.json()) as CloudflareResponse<{ id: string }>;
  if (!res.ok || !body.success) {
    const msg = body.errors?.map((e) => e.message).join('; ') ?? res.statusText;
    throw new Error(`Cloudflare addCNAME failed: ${msg}`);
  }
  return { recordId: body.result.id };
}

/**
 * Removes all DNS records for a given hostname (typically one CNAME, but
 * we scan-and-delete to be safe on retries). Idempotent — empty set = no-op.
 */
export async function removeDNSRecordsFor(hostname: string): Promise<number> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set');
  if (!zoneId) throw new Error('CLOUDFLARE_ZONE_ID is not set');

  const listRes = await fetch(
    `${CF_API}/zones/${zoneId}/dns_records?name=${encodeURIComponent(hostname)}`,
    {
      headers: { authorization: `Bearer ${token}` },
    }
  );
  const listBody = (await listRes.json()) as CloudflareResponse<
    { id: string }[]
  >;
  if (!listRes.ok || !listBody.success) {
    const msg =
      listBody.errors?.map((e) => e.message).join('; ') ?? listRes.statusText;
    throw new Error(`Cloudflare list records failed: ${msg}`);
  }

  let deleted = 0;
  for (const record of listBody.result) {
    const delRes = await fetch(
      `${CF_API}/zones/${zoneId}/dns_records/${record.id}`,
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      }
    );
    if (delRes.ok) deleted++;
  }
  return deleted;
}
