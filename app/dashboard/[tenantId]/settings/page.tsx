import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/db';
import { tenants } from '@/db/schema';
import { PLANS } from '@/lib/plans';
import { getTenantSecrets, maskSecret } from '@/lib/tenant-secrets';
import { SettingsForm } from './settings-form';

export default async function TenantSettingsPage({
  params,
}: {
  params: { tenantId: string };
}) {
  const { userId } = await auth();
  if (!userId) return null;

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.id, params.tenantId), eq(tenants.ownerId, userId)))
    .limit(1);
  if (!tenant) notFound();

  const secrets = await getTenantSecrets(tenant.id);
  const plan = PLANS[tenant.plan];

  return (
    <main className="min-h-screen">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <Link
          href={`/dashboard/${tenant.id}`}
          className="text-lg font-semibold tracking-tight"
        >
          ← {tenant.name}
        </Link>
      </header>

      <section className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Changes are pushed to Railway so the bot picks them up on its next
          restart. Use the billing portal to change plan.
        </p>

        <SettingsForm
          tenantId={tenant.id}
          plan={tenant.plan}
          current={{
            watchlistPreset: tenant.watchlistPreset,
            customSymbols: tenant.customSymbols,
            riskTolerance: tenant.riskTolerance,
            agencyMode: tenant.agencyMode,
            alpacaBaseUrl: secrets?.alpacaBaseUrl ?? null,
            alpacaKeyMask: secrets?.alpacaApiKey
              ? maskSecret(secrets.alpacaApiKey)
              : null,
          }}
          planLimits={{
            maxScanSymbols: plan.maxScanSymbols,
            liveTradingAllowed: plan.liveTradingAllowed,
          }}
        />
      </section>
    </main>
  );
}
