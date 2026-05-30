import { and, eq, isNotNull, lt, or, isNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { tenantInfra, tenants } from '@/db/schema';
import { provisionTenant } from './index';

// How long to wait before re-attempting a tenant that's still 'provisioning'.
// Doubles as a soft lock: a tenant whose last attempt is newer than this is
// considered "claimed" by a recent/overlapping sweep and is skipped.
const RETRY_THROTTLE_MS = 3 * 60_000; // 3 min

// After this many failed attempts we stop retrying and park the tenant in
// 'paused' with the last error recorded, so the admin can investigate and
// retry manually instead of the sweep hammering a broken tenant forever.
const MAX_ATTEMPTS = 5;

// Cap work per sweep so a single cron invocation stays within its time budget.
// Each tenant can take ~2 min (Railway build + DNS + health poll), and the
// cron route has maxDuration=300, so process a few sequentially at most.
const MAX_PER_SWEEP = 3;

// Stop starting new tenants once we're this close to the route's time budget.
const TIME_BUDGET_MS = 240_000; // 4 min — leaves headroom under maxDuration=300

export interface SweepResult {
  claimed: number;
  succeeded: number;
  failed: number;
  parked: number; // hit MAX_ATTEMPTS → moved to 'paused'
  skipped: number; // throttled / claimed by another sweep
  details: Array<{ tenantId: string; slug: string; outcome: string }>;
}

/**
 * Finds tenants stuck in 'provisioning' (onboarding complete) and drives each
 * through the idempotent provisioning pipeline. Designed to be called from a
 * cron route on a short interval — this is what makes provisioning hands-off
 * and resilient to the user closing the tab mid-flow.
 *
 * Concurrency safety: before attempting a tenant we atomically "claim" it by
 * stamping last_provision_attempt_at, only succeeding if no attempt happened
 * within RETRY_THROTTLE_MS. Two overlapping sweeps therefore can't both grab
 * the same tenant.
 */
export async function runProvisioningSweep(): Promise<SweepResult> {
  const startedAt = Date.now();
  const result: SweepResult = {
    claimed: 0,
    succeeded: 0,
    failed: 0,
    parked: 0,
    skipped: 0,
    details: [],
  };

  // Candidates: provisioning + onboarded. Left-join infra to read attempt
  // bookkeeping (infra row may not exist yet on the very first attempt).
  const candidates = await db
    .select({
      id: tenants.id,
      slug: tenants.slug,
      attempts: tenantInfra.provisionAttempts,
      lastAttemptAt: tenantInfra.lastProvisionAttemptAt,
    })
    .from(tenants)
    .leftJoin(tenantInfra, eq(tenantInfra.tenantId, tenants.id))
    .where(
      and(
        eq(tenants.status, 'provisioning'),
        isNotNull(tenants.onboardingCompletedAt)
      )
    )
    .limit(MAX_PER_SWEEP * 4); // over-fetch; many may be throttled out

  for (const c of candidates) {
    if (result.claimed >= MAX_PER_SWEEP) break;
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;

    // Park tenants that have exhausted their retries.
    if ((c.attempts ?? 0) >= MAX_ATTEMPTS) {
      await db
        .update(tenants)
        .set({ status: 'paused', updatedAt: new Date() })
        .where(
          and(eq(tenants.id, c.id), eq(tenants.status, 'provisioning'))
        );
      result.parked++;
      result.details.push({
        tenantId: c.id,
        slug: c.slug,
        outcome: `parked after ${c.attempts} failed attempts`,
      });
      continue;
    }

    const claimed = await claimTenant(c.id);
    if (!claimed) {
      result.skipped++;
      continue;
    }
    result.claimed++;

    try {
      await provisionTenant(c.id);
      // Success: clear the error and reset the attempt counter.
      await db
        .update(tenantInfra)
        .set({ lastProvisionError: null, provisionAttempts: 0 })
        .where(eq(tenantInfra.tenantId, c.id));
      result.succeeded++;
      result.details.push({ tenantId: c.id, slug: c.slug, outcome: 'provisioned' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'provisioning failed';
      await recordFailure(c.id, message);
      result.failed++;
      result.details.push({
        tenantId: c.id,
        slug: c.slug,
        outcome: `failed: ${message}`,
      });
    }
  }

  return result;
}

/**
 * Atomically claims a tenant for this sweep by stamping the attempt time,
 * but only if no attempt has happened within RETRY_THROTTLE_MS. Returns true
 * if we won the claim. Ensures an infra row exists first (provisionTenant
 * also creates one, but we need it now to hold the lock).
 */
async function claimTenant(tenantId: string): Promise<boolean> {
  const cutoff = new Date(Date.now() - RETRY_THROTTLE_MS);

  // Ensure an infra row exists so the claim UPDATE has a target. No-op if it
  // already exists; we don't overwrite any populated fields.
  await db
    .insert(tenantInfra)
    .values({ tenantId })
    .onConflictDoNothing({ target: tenantInfra.tenantId });

  const claimed = await db
    .update(tenantInfra)
    .set({ lastProvisionAttemptAt: new Date() })
    .where(
      and(
        eq(tenantInfra.tenantId, tenantId),
        or(
          isNull(tenantInfra.lastProvisionAttemptAt),
          lt(tenantInfra.lastProvisionAttemptAt, cutoff)
        )
      )
    )
    .returning({ tenantId: tenantInfra.tenantId });

  return claimed.length > 0;
}

async function recordFailure(tenantId: string, message: string): Promise<void> {
  await db
    .update(tenantInfra)
    .set({
      lastProvisionError: message.slice(0, 500),
      provisionAttempts: sql`${tenantInfra.provisionAttempts} + 1`,
    })
    .where(eq(tenantInfra.tenantId, tenantId));
  console.error(`[provision worker] tenant ${tenantId} failed: ${message}`);
}
