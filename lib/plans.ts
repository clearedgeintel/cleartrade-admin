export type PlanId = 'starter' | 'pro' | 'enterprise';

export interface Plan {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceIdEnvVar: string;
  maxScanSymbols: number;
  liveTradingAllowed: boolean;
  maxBots: number;
  llmDailyCostCapUsd: number;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 49,
    priceIdEnvVar: 'STRIPE_STARTER_PRICE_ID',
    maxScanSymbols: 8,
    liveTradingAllowed: false,
    maxBots: 1,
    llmDailyCostCapUsd: 2,
    features: ['Paper trading', 'Rules + hybrid mode', '8-symbol watchlist'],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceMonthly: 149,
    priceIdEnvVar: 'STRIPE_PRO_PRICE_ID',
    maxScanSymbols: 40,
    liveTradingAllowed: true,
    maxBots: 1,
    llmDailyCostCapUsd: 10,
    features: [
      'Paper + live trading',
      'Full AI agency',
      '40-symbol watchlist + crypto',
    ],
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 499,
    priceIdEnvVar: 'STRIPE_ENTERPRISE_PRICE_ID',
    maxScanSymbols: 200,
    liveTradingAllowed: true,
    maxBots: 3,
    llmDailyCostCapUsd: 50,
    features: [
      'Everything in Pro',
      'Up to 3 bots',
      'Custom prompts + A/B testing',
      'Priority support',
    ],
  },
};

export function planFromPriceId(priceId: string): PlanId | null {
  for (const plan of Object.values(PLANS)) {
    if (process.env[plan.priceIdEnvVar] === priceId) return plan.id;
  }
  return null;
}

export function stripePriceId(plan: PlanId): string {
  const envVar = PLANS[plan].priceIdEnvVar;
  const value = process.env[envVar];
  if (!value) throw new Error(`${envVar} is not set`);
  return value;
}
