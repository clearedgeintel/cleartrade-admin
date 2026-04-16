import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Application-layer encryption for tenant secrets (Alpaca API keys etc).
 *
 * Format: base64(iv || authTag || ciphertext), 12-byte IV, 16-byte tag,
 * AES-256-GCM. A leaked DB dump reveals nothing without the key, and
 * changing the key is a matter of decrypt-with-old, encrypt-with-new.
 *
 * Key comes from TENANT_SECRETS_KEY — 32 bytes, base64-encoded. Generate
 * once with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
 * and store in a secrets manager, not a repo.
 */

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function loadKey(): Buffer {
  const raw = process.env.TENANT_SECRETS_KEY;
  if (!raw) throw new Error('TENANT_SECRETS_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `TENANT_SECRETS_KEY must decode to 32 bytes (got ${key.length})`
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptSecret(encoded: string): string {
  const key = loadKey();
  const buf = Buffer.from(encoded, 'base64');
  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error('encrypted secret is too short');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}
