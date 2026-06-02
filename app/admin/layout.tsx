import Link from 'next/link';
import { notFound } from 'next/navigation';
import { UserButton } from '@clerk/nextjs';
import { isCurrentUserAdmin } from '@/lib/admin-auth';

// Admin pages are always auth-gated + DB-backed — never safe to prerender.
export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Clerk middleware has already ensured the user is authenticated.
  // This is the second gate — non-admin authed users get a 404 rather
  // than a 403 (don't reveal that /admin exists).
  const ok = await isCurrentUserAdmin();
  if (!ok) notFound();

  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-8">
            <Link href="/admin" className="text-lg font-semibold tracking-tight">
              ClearTrade <span className="text-muted-foreground">admin</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/admin"
                className="text-muted-foreground hover:text-foreground"
              >
                Overview
              </Link>
              <Link
                href="/admin/tenants"
                className="text-muted-foreground hover:text-foreground"
              >
                Tenants
              </Link>
              <Link
                href="/admin/cleanup"
                className="text-muted-foreground hover:text-foreground"
              >
                Cleanup
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/dashboard"
              className="text-muted-foreground hover:text-foreground"
            >
              ← Back to user dashboard
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-6 py-10">{children}</main>
    </div>
  );
}
