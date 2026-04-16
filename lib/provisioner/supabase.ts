import { randomBytes } from 'crypto';

const SUPABASE_API = 'https://api.supabase.com';

interface CreateProjectResponse {
  id: string;
  ref: string;
  name: string;
  status: string;
  region: string;
  database: {
    host: string;
    version: string;
  };
}

/**
 * Creates a new Supabase project owned by the admin's organization.
 *
 * Full isolation per tenant (claude.md design decision #1): a WHERE-clause
 * bug in the bot can't leak into another tenant's trades if the databases
 * are physically separate.
 */
export async function createSupabaseProject(input: {
  name: string;
  region?: string;
}): Promise<{ databaseUrl: string; projectRef: string }> {
  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;
  const orgId = process.env.SUPABASE_ORG_ID;
  if (!token) throw new Error('SUPABASE_MANAGEMENT_TOKEN is not set');
  if (!orgId) throw new Error('SUPABASE_ORG_ID is not set');

  const dbPassword = randomBytes(24).toString('base64url');

  const region = input.region ?? 'us-west-2';

  const res = await fetch(`${SUPABASE_API}/v1/projects`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      name: input.name,
      organization_id: orgId,
      region,
      plan: 'free',
      db_pass: dbPassword,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase createProject failed (${res.status}): ${text}`);
  }

  const project = (await res.json()) as CreateProjectResponse;

  // Supabase connection pooler URL. Password is url-encoded to survive any
  // special chars in the generated password.
  const encodedPass = encodeURIComponent(dbPassword);
  const databaseUrl = `postgresql://postgres.${project.ref}:${encodedPass}@aws-1-${region}.pooler.supabase.com:5432/postgres`;

  return { databaseUrl, projectRef: project.ref };
}

/**
 * Parses the project ref out of a Supabase pooler URL the shape we emit:
 *   postgresql://postgres.{REF}:...@aws-1-{region}.pooler.supabase.com:5432/postgres
 */
export function parseProjectRef(databaseUrl: string): string | null {
  const match = databaseUrl.match(/postgres\.([a-z0-9]+):/);
  return match?.[1] ?? null;
}

export async function deleteSupabaseProject(projectRef: string): Promise<void> {
  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;
  if (!token) throw new Error('SUPABASE_MANAGEMENT_TOKEN is not set');

  const res = await fetch(`${SUPABASE_API}/v1/projects/${projectRef}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });

  // 404 is fine — it may already be gone from a prior teardown attempt.
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(
      `Supabase deleteProject(${projectRef}) failed (${res.status}): ${text}`
    );
  }
}
