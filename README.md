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

## Supabase MCP (Claude Code)

This repo ships a project-scoped [`.mcp.json`](./.mcp.json) that registers the
official [Supabase MCP server](https://github.com/supabase-community/supabase-mcp)
with Claude Code so the agent can introspect the admin database directly.

The config is read-only and pulls credentials from your shell — nothing
sensitive is checked in. Set these in your user environment (Windows:
`setx`, or a `~/.claude.json` user-scope override):

```
SUPABASE_ACCESS_TOKEN=<your personal access token from supabase.com/dashboard/account/tokens>
SUPABASE_PROJECT_REF=<the project ref from the Supabase project URL>
```

Restart Claude Code after setting them. Run `/mcp` inside Claude Code to
confirm the `supabase` server connects. Drop `--read-only` in `.mcp.json`
only when you deliberately want the agent to mutate the DB.

## Scripts

| Script              | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Next dev server                           |
| `npm run build`     | Production build                          |
| `npm run db:push`   | Sync schema to the DB (no migration file) |
| `npm run db:generate` | Generate a migration from schema diffs  |
| `npm run db:migrate`  | Apply generated migrations              |
| `npm run db:studio` | Drizzle Studio                            |
