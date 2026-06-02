import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { NewBotButton } from './new-bot-button';

export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) return null; // middleware should have redirected

  const myTenants = await db
    .select()
    .from(tenants)
    .where(eq(tenants.ownerId, userId));

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          ClearTrade
        </Link>
        <UserButton afterSignOutUrl="/" />
      </header>

      <section className="mx-auto w-full max-w-5xl px-6 py-12">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Your bots</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {myTenants.length === 0
                ? 'No bots yet — finish onboarding to provision your first one.'
                : `${myTenants.length} bot${myTenants.length === 1 ? '' : 's'}.`}
            </p>
          </div>
          <NewBotButton />
        </div>

        <ul className="mt-8 divide-y divide-border rounded-lg border border-border">
          {myTenants.length === 0 ? (
            <li className="px-6 py-12 text-center text-sm text-muted-foreground">
              No tenants provisioned yet.
            </li>
          ) : (
            myTenants.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between px-6 py-4"
              >
                <div>
                  <div className="font-medium">{t.name}</div>
                  <div className="text-sm text-muted-foreground">
                    {t.slug} · {t.plan} · {t.status}
                  </div>
                </div>
                <Link
                  href={`/dashboard/${t.id}`}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Open →
                </Link>
              </li>
            ))
          )}
        </ul>
      </section>
    </main>
  );
}
