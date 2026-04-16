# ClearTrade Admin

Multi-tenant admin portal for the Alpaca Auto Trader SaaS. Handles
onboarding, billing, provisioning, and fleet management. See
[`claude.md`](./claude.md) for the full architecture.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Clerk + DATABASE_URL
npm run db:push              # push the admin schema to your Postgres
npm run dev                  # http://localhost:3000
```

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind
- Clerk for auth
- Drizzle ORM + Supabase Postgres for the admin DB
- Stripe for billing *(wired up in a later commit)*
- Railway + Cloudflare for provisioning *(wired up in a later commit)*

## Layout

```
app/              Next.js App Router pages + route handlers
  sign-in/        Clerk hosted sign-in
  sign-up/        Clerk hosted sign-up
  dashboard/      Authenticated tenant list
db/               Drizzle schema + client
  schema.ts       tenants, subscriptions, tenant_infra, tenant_secrets
  index.ts        Singleton drizzle client
lib/              Shared helpers
middleware.ts     Clerk auth gate for /dashboard, /onboarding, /admin, /api/tenants
drizzle.config.ts Drizzle Kit config
```

## Postgres MCP (Claude Code)

This repo ships a project-scoped [`.mcp.json`](./.mcp.json) that registers
[Postgres MCP Pro](https://github.com/crystaldba/postgres-mcp) with Claude
Code so the agent can introspect and query the admin database directly via
its connection string — no Supabase management API or access token needed.

**Prerequisites.** The server runs under [`uv`](https://docs.astral.sh/uv/):

```
winget install astral-sh.uv        # or: pip install uv
```

**Configuration.** Set `DATABASE_URL` in your shell environment so the MCP
config can expand it (Windows: `setx DATABASE_URL "<your supabase pooler url>"`
then restart your terminal). The same URL the Next app uses works here —
`.mcp.json` aliases it to `DATABASE_URI` which is what the server expects.

The config runs in `--access-mode=restricted` (read-only, with query
timeouts and schema-change blocks). Drop to `--access-mode=unrestricted`
only when you deliberately want the agent to run migrations.

Restart Claude Code after setting the env var; run `/mcp` to confirm the
`postgres` server connects.

## Scripts

| Script              | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Next dev server                           |
| `npm run build`     | Production build                          |
| `npm run db:push`   | Sync schema to the DB (no migration file) |
| `npm run db:generate` | Generate a migration from schema diffs  |
| `npm run db:migrate`  | Apply generated migrations              |
| `npm run db:studio` | Drizzle Studio                            |
