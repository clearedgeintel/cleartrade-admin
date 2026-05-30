# Regulatory Posture & Customer-Control Notes

> **Status: internal working notes, not legal advice.** This document exists to
> make a securities/fintech attorney's review fast and concrete. It records
> *what the architecture actually does* and *where it is enforced in code*, so a
> lawyer can map those facts to the relevant rules. **Do not treat anything here
> as a determination that the operator is or isn't regulated.** Get a written
> opinion from qualified counsel before onboarding paying customers — especially
> before enabling live (real-money) trading or AI-driven trade decisions.

Last updated: 2026-05-29

---

## The model we are claiming

ClearTrade sells **self-hosted trading automation software**. Each customer:

1. Brings **their own Alpaca brokerage account** and supplies their own API
   key + secret at onboarding.
2. Gets a **fully isolated instance** of the bot (own process, own database,
   own subdomain) that runs against **their** brokerage account only.
3. Retains control: they configure risk, watchlist, strategy mode, and can
   pause/cancel at any time.

The operator (you) **never takes custody of customer funds**, never holds
discretionary trading authority over a shared pool, and never commingles
accounts. This is the architectural posture that *supports* a non-custodial,
software-vendor characterization.

## Where each control guarantee is enforced (code map)

| Guarantee a lawyer will ask about | Enforced in | Mechanism |
|---|---|---|
| Customer supplies their own brokerage credentials | [lib/provisioner/env-vars.ts](../lib/provisioner/env-vars.ts) (`ALPACA_API_KEY/SECRET`) | Keys come from the tenant's onboarding input, injected only into that tenant's instance |
| Funds stay in the customer's own brokerage account | (Alpaca account is the customer's) | The bot only holds API keys; it never moves money out of Alpaca |
| No commingling — physical data isolation | [lib/provisioner/supabase.ts](../lib/provisioner/supabase.ts) | A **separate Postgres project per tenant**, separate password |
| Separate compute per tenant | [lib/provisioner/railway.ts](../lib/provisioner/railway.ts) | One Railway service per tenant, own env vars |
| Customer retains operational control | `app/dashboard/[tenantId]/settings`, pause/resume/cancel routes | Customer sets risk/watchlist/strategy; can stop or delete at will |
| Credentials protected at rest | [lib/crypto.ts](../lib/crypto.ts), [lib/tenant-secrets.ts](../lib/tenant-secrets.ts) | AES-256-GCM; UI shows masked values only |
| Operator can't quietly trade for them | (no shared discretionary engine) | There is no central system that places trades across accounts |

## Open questions only counsel can close

These are **not** resolved by the architecture and are the real subject of the
legal review:

1. **Investment-adviser status.** Software that *decides or recommends* trades on
   a customer's behalf can trigger SEC/state investment-adviser regulation even
   when it runs on the customer's own account and keys. The **"AI agency" mode**
   and any "hybrid"/LLM strategy that exercises discretion are the features most
   likely to draw scrutiny. Ask counsel: does our automation cross from "tool
   the user configures" into "adviser exercising discretion"?

2. **Marketing & solicitation language.** "AI-powered bot that grows your money"
   leans toward advice/solicitation; "automation tooling you configure and
   control" leans toward software. Counsel should review all customer-facing
   copy (marketing site, pricing, onboarding).

3. **Live vs. paper trading.** Paper-only is materially lower risk. Real-money
   trading (Pro/Enterprise tiers) is where adviser/broker questions get sharp.
   Consider gating live trading until counsel signs off.

4. **Shared infrastructure boundaries.** The Starter plan falls back to a
   **shared Anthropic key** ([env-vars.ts](../lib/provisioner/env-vars.ts),
   `SHARED_ANTHROPIC_KEY`). Confirm no shared component undermines the
   "each customer is fully in control / isolated" claim.

5. **Terms of Service / disclaimers.** Need ToS that (a) characterize the
   product as software, (b) disclaim investment advice and warranties,
   (c) make the customer responsible for their own trading decisions and
   brokerage relationship, (d) address risk disclosure for automated trading.

6. **Jurisdiction.** Rules differ by state and country. Counsel should advise on
   where you can onboard customers and any registration/disclosure triggers.

## Recommended sequencing before taking real customers

1. Get written counsel opinion on items 1–6 above.
2. Until then, keep onboarding **paper-only** if you run a private beta.
3. Implement whatever ToS / disclaimers / gating counsel requires.
4. Revisit "AI agency" / discretionary modes specifically with counsel.
