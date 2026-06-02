import { randomBytes } from 'crypto';
import postgres from 'postgres';

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

/**
 * Fetches a project's current provisioning status (e.g. COMING_UP,
 * ACTIVE_HEALTHY, INACTIVE), or null if it can't be read.
 */
export async function getProjectStatus(
  projectRef: string
): Promise<string | null> {
  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;
  if (!token) throw new Error('SUPABASE_MANAGEMENT_TOKEN is not set');

  // Transient network errors ("fetch failed") must not abort a provision that
  // is otherwise progressing — return null so the readiness poll keeps trying.
  try {
    const res = await fetch(`${SUPABASE_API}/v1/projects/${projectRef}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const project = (await res.json()) as { status?: string };
    return project.status ?? null;
  } catch {
    return null;
  }
}

/**
 * Polls until the project reports ACTIVE_HEALTHY (its database is up and
 * accepting connections) or we run out of attempts. A freshly created project
 * comes up over ~1–2 minutes; deploying the bot before this point makes it
 * crash on its first DB connection. `onStatus` fires only on status changes.
 */
export async function waitForProjectReady(
  projectRef: string,
  opts: {
    intervalMs?: number;
    maxAttempts?: number;
    onStatus?: (status: string) => void | Promise<void>;
  } = {}
): Promise<boolean> {
  const intervalMs = opts.intervalMs ?? 5_000;
  const maxAttempts = opts.maxAttempts ?? 30; // 30 * 5s = 2.5 min
  let last: string | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getProjectStatus(projectRef);
    if (status && status !== last) {
      last = status;
      await opts.onStatus?.(status);
    }
    if (status === 'ACTIVE_HEALTHY') return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

/**
 * Polls the project's pooler until it actually accepts a connection (a real
 * `select 1`), the exact thing the bot does on boot. The Supabase connection
 * pooler (Supavisor) registers a new project a bit AFTER the Management API
 * reports ACTIVE_HEALTHY — deploying the bot in that gap makes it crash with
 * "tenant/user ... not found". This closes that gap.
 */
export async function waitForDatabaseConnectable(
  databaseUrl: string,
  opts: {
    intervalMs?: number;
    maxAttempts?: number;
    onAttempt?: (n: number) => void | Promise<void>;
  } = {}
): Promise<boolean> {
  const intervalMs = opts.intervalMs ?? 5_000;
  const maxAttempts = opts.maxAttempts ?? 24; // 24 * 5s = 2 min

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const sql = postgres(databaseUrl, {
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 2,
      max: 1,
      onnotice: () => {},
    });
    try {
      await sql`select 1`;
      await sql.end({ timeout: 5 });
      return true;
    } catch {
      try {
        await sql.end({ timeout: 2 });
      } catch {
        // ignore
      }
      await opts.onAttempt?.(attempt + 1);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export async function listSupabaseProjects(): Promise<
  { ref: string; name: string; status: string }[]
> {
  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;
  if (!token) throw new Error('SUPABASE_MANAGEMENT_TOKEN is not set');

  const res = await fetch(`${SUPABASE_API}/v1/projects`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Supabase list projects failed (${res.status})`);
  }
  const projects = (await res.json()) as {
    ref: string;
    name: string;
    status: string;
  }[];
  return projects.map((p) => ({ ref: p.ref, name: p.name, status: p.status }));
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
