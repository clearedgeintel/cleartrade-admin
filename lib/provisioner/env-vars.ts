import { randomBytes } from 'crypto';
import type { Tenant } from '@/db/schema';
import type { PlainTenantSecrets } from '@/lib/tenant-secrets';
import { PLANS } from '@/lib/plans';

// Preset watchlists. The bot reads WATCHLIST as a comma-separated string.
const WATCHLIST_PRESETS: Record<'top8' | 'crypto', string[]> = {
  top8: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META'],
  crypto: ['BTC/USD', 'ETH/USD', 'SOL/USD', 'DOGE/USD', 'AVAX/USD'],
};

const RISK_PCT: Record<'conservative' | 'moderate' | 'aggressive', number> = {
  conservative: 1,
  moderate: 2,
  aggressive: 4,
};

/**
 * Produces the full env-var map the bot needs. Pure — no I/O — so it's
 * easy to test and reason about. `databaseUrl` and `apiKey` are provided
 * by the orchestrator (generated/resolved at provisioning time).
 */
export function buildBotEnvVars({
  tenant,
  secrets,
  databaseUrl,
  apiKey,
}: {
  tenant: Tenant;
  secrets: PlainTenantSecrets;
  databaseUrl: string;
  apiKey: string;
}): Record<string, string> {
  const plan = PLANS[tenant.plan];

  const watchlist =
    tenant.watchlistPreset === 'custom'
      ? tenant.customSymbols ?? []
      : tenant.watchlistPreset
      ? WATCHLIST_PRESETS[tenant.watchlistPreset]
      : WATCHLIST_PRESETS.top8;

  const useAgency = tenant.agencyMode === 'ai' ? 'true' : 'false';
  const riskPct = tenant.riskTolerance ? RISK_PCT[tenant.riskTolerance] : 2;

  return {
    NODE_ENV: 'production',
    PORT: '3001',

    // Alpaca
    ALPACA_API_KEY: secrets.alpacaApiKey,
    ALPACA_API_SECRET: secrets.alpacaApiSecret,
    ALPACA_BASE_URL: secrets.alpacaBaseUrl,

    // Storage (tenant's own Supabase project)
    DATABASE_URL: databaseUrl,

    // LLM — tenant's own key if set, else fall back to shared
    ANTHROPIC_API_KEY:
      secrets.anthropicApiKey ?? process.env.SHARED_ANTHROPIC_KEY ?? '',
    ...(secrets.polygonApiKey ? { POLYGON_API_KEY: secrets.polygonApiKey } : {}),

    // Admin ↔ bot auth
    API_KEY: apiKey,

    // Strategy config
    USE_AGENCY: useAgency,
    STRATEGY_MODE: tenant.agencyMode ?? 'hybrid',
    RISK_PCT: String(riskPct),
    WATCHLIST: watchlist.join(','),

    // Plan-derived caps
    MAX_SCAN_SYMBOLS: String(plan.maxScanSymbols),
    LLM_DAILY_COST_CAP_USD: String(plan.llmDailyCostCapUsd),
  };
}

export function generateBotApiKey(): string {
  return randomBytes(32).toString('hex');
}
