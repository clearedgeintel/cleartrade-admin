const CF_API = 'https://api.cloudflare.com/client/v4';

interface CloudflareResponse<T> {
  success: boolean;
  errors: { code: number; message: string }[];
  result: T;
}

/**
 * Upserts a CNAME so `{slug}.{BASE_DOMAIN}` points at the Railway custom-domain
 * target. DNS-only (grey cloud, `proxied: false`) — Railway must see the record
 * resolve to its own target to validate ownership and issue the TLS cert; a
 * proxied record resolves to Cloudflare IPs and breaks that. Upsert (not just
 * create) so a re-run repoints a stale record (e.g. an old proxied one).
 */
export async function addCNAME(input: {
  name: string; // e.g. "acme"
  target: string; // e.g. "ub2j2yfi.up.railway.app"
}): Promise<{ recordId: string }> {
  return upsertRecord({
    type: 'CNAME',
    name: input.name,
    content: input.target,
    proxied: false,
  });
}

/**
 * Upserts the TXT record Railway requires to verify domain ownership
 * (`_railway-verify.{slug}` → `railway-verify=…`).
 */
export async function addTXT(input: {
  name: string; // e.g. "_railway-verify.acme"
  content: string; // e.g. "railway-verify=…"
}): Promise<{ recordId: string }> {
  return upsertRecord({ type: 'TXT', name: input.name, content: input.content });
}

async function upsertRecord(rec: {
  type: 'CNAME' | 'TXT';
  name: string;
  content: string;
  proxied?: boolean;
}): Promise<{ recordId: string }> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const baseDomain = process.env.BASE_DOMAIN;
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN is not set');
  if (!zoneId) throw new Error('CLOUDFLARE_ZONE_ID is not set');

  const fqdn = rec.name.endsWith(`.${baseDomain}`)
    ? rec.name
    : `${rec.name}.${baseDomain}`;
  const headers = {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
  };
  const payload = {
    type: rec.type,
    name: rec.name,
    content: rec.content,
    ttl: 1, // auto
    ...(rec.type === 'CNAME' ? { proxied: rec.proxied ?? false } : {}),
  };

  // Find an existing record of the same type+name to update in place.
  const listRes = await fetch(
    `${CF_API}/zones/${zoneId}/dns_records?type=${rec.type}&name=${encodeURIComponent(
      fqdn
    )}`,
    { headers }
  );
  const listBody = (await listRes.json()) as CloudflareResponse<
    { id: string }[]
  >;
  const existingId = listBody.success ? listBody.result?.[0]?.id : undefined;

  const res = existingId
    ? await fetch(`${CF_API}/zones/${zoneId}/dns_records/${existingId}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      })
    : await fetch(`${CF_API}/zones/${zoneId}/dns_records`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

  const body = (await res.json()) as CloudflareResponse<{ id: string }>;
  if (!res.ok || !body.success) {
    const msg = body.errors?.map((e) => e.message).join('; ') ?? res.statusText;
    throw new Error(`Cloudflare ${rec.type} upsert failed: ${msg}`);
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
