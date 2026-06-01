import { db } from '@/db';
import { provisionEvents } from '@/db/schema';

export type EventLevel = 'info' | 'warn' | 'error' | 'success';

/**
 * Appends one line to a tenant's provisioning activity log. Each call commits
 * immediately so the dashboard can poll and render progress live. Logging must
 * never break provisioning, so failures here are swallowed (and mirrored to the
 * server console).
 */
export async function emitProvisionEvent(
  tenantId: string,
  level: EventLevel,
  message: string
): Promise<void> {
  const line = message.slice(0, 1000);
  // eslint-disable-next-line no-console
  console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'](
    `[provision ${tenantId.slice(0, 8)}] ${line}`
  );
  try {
    await db
      .insert(provisionEvents)
      .values({ tenantId, level, message: line });
  } catch (err) {
    console.error(
      '[provision event] failed to record:',
      (err as Error).message
    );
  }
}

/**
 * Clears prior events for a tenant — called at the start of a (re)provision so
 * the live log reflects only the current attempt.
 */
export async function clearProvisionEvents(tenantId: string): Promise<void> {
  try {
    const { eq } = await import('drizzle-orm');
    await db.delete(provisionEvents).where(eq(provisionEvents.tenantId, tenantId));
  } catch (err) {
    console.error(
      '[provision event] failed to clear:',
      (err as Error).message
    );
  }
}
