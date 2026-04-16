import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { tenantSecrets } from '@/db/schema';
import { decryptSecret, encryptSecret } from './crypto';

export interface PlainTenantSecrets {
  alpacaApiKey: string;
  alpacaApiSecret: string;
  alpacaBaseUrl: string;
  anthropicApiKey: string | null;
  polygonApiKey: string | null;
}

/**
 * Reads tenant_secrets and decrypts the sensitive fields. Returns null if
 * the row doesn't exist.
 */
export async function getTenantSecrets(
  tenantId: string
): Promise<PlainTenantSecrets | null> {
  const [row] = await db
    .select()
    .from(tenantSecrets)
    .where(eq(tenantSecrets.tenantId, tenantId))
    .limit(1);
  if (!row) return null;

  return {
    alpacaApiKey: decryptSecret(row.alpacaApiKey),
    alpacaApiSecret: decryptSecret(row.alpacaApiSecret),
    alpacaBaseUrl: row.alpacaBaseUrl,
    anthropicApiKey: row.anthropicApiKey
      ? decryptSecret(row.anthropicApiKey)
      : null,
    polygonApiKey: row.polygonApiKey
      ? decryptSecret(row.polygonApiKey)
      : null,
  };
}

/**
 * Encrypts sensitive fields and upserts the row. `alpacaBaseUrl` is not
 * sensitive (it's a public endpoint) so it stays plaintext.
 */
export async function upsertTenantSecrets(
  tenantId: string,
  input: PlainTenantSecrets
): Promise<void> {
  const encryptedRow = {
    tenantId,
    alpacaApiKey: encryptSecret(input.alpacaApiKey),
    alpacaApiSecret: encryptSecret(input.alpacaApiSecret),
    alpacaBaseUrl: input.alpacaBaseUrl,
    anthropicApiKey: input.anthropicApiKey
      ? encryptSecret(input.anthropicApiKey)
      : null,
    polygonApiKey: input.polygonApiKey
      ? encryptSecret(input.polygonApiKey)
      : null,
  };

  await db
    .insert(tenantSecrets)
    .values(encryptedRow)
    .onConflictDoUpdate({
      target: tenantSecrets.tenantId,
      set: {
        alpacaApiKey: encryptedRow.alpacaApiKey,
        alpacaApiSecret: encryptedRow.alpacaApiSecret,
        alpacaBaseUrl: encryptedRow.alpacaBaseUrl,
        anthropicApiKey: encryptedRow.anthropicApiKey,
        polygonApiKey: encryptedRow.polygonApiKey,
      },
    });
}

/**
 * For the admin UI — shows the last 4 of each key without decrypting the
 * whole thing in memory longer than needed. The encrypted blob is opaque,
 * so we still need to decrypt to mask; callers should only invoke this
 * from admin-gated routes.
 */
export function maskSecret(s: string): string {
  if (s.length <= 8) return '••••';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}
