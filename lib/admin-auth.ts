import { currentUser } from '@clerk/nextjs/server';

/**
 * Returns true if the current user's primary email is in ADMIN_EMAILS.
 *
 * Email allowlist is the MVP approach — fast to set up, no role sync
 * with Clerk required. When the admin team grows, swap this for a
 * Clerk `publicMetadata.role === 'admin'` check or an organization
 * role check; all call sites use this helper so the migration is one file.
 */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const raw = process.env.ADMIN_EMAILS;
  if (!raw) return false;

  const allowlist = new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
  if (allowlist.size === 0) return false;

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!email) return false;

  return allowlist.has(email);
}
