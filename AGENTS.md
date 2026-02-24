# AGENTS.md — workers-sdk-ci-analyzer

A Cloudflare Workers dashboard (React Router 7 SSR) for analyzing CI health, test flakiness, and GitHub issue/PR metrics for the cloudflare/workers-sdk repository.

## STRUCTURE
```
workers-sdk-ci-analyzer/
├── workers/app.ts       # Single Worker entry: all API handlers + cron scheduled() + React Router SSR
├── app/
│   ├── routes.ts        # React Router route config (file-based, maps URLs to route files)
│   ├── routes/          # Per-page route components (ci-flakes, issues, prs, bus-factor, issue-triage, pr-health)
│   ├── components/      # Shared UI components (charts, tables, layout)
│   ├── hooks/           # Data-fetching hooks (one per API endpoint)
│   └── utils/helpers.ts # Shared utility functions
├── wrangler.jsonc        # Worker name, KV binding, cron triggers
├── .dev.vars            # Local secrets (not committed; copy from .dev.vars.example)
└── scripts/fix-build.js # Post-build patch (runs automatically via deploy chain)
```

## WHERE TO LOOK
| Task | Location |
|---|---|
| Add/modify API endpoints | `workers/app.ts` — add handler fn + register in `fetch()` |
| Add a new dashboard page/route | `app/routes/` + register in `app/routes.ts` |
| Fetch data in a route component | `app/hooks/` — one hook per API endpoint |
| Change cron schedule | `wrangler.jsonc` → `triggers.crons` |
| Change KV binding name | `wrangler.jsonc` → `kv_namespaces[].binding` + `workers/app.ts` Env interface |
| Add new UI component | `app/components/` |
| Worker env type definitions | `workers/worker-configuration.d.ts` |

## CODE MAP
| Symbol | Type | Location | Role |
|---|---|---|---|
| `default export` (Worker) | object | `workers/app.ts` | Entry: `fetch()` routes requests, `scheduled()` runs crons |
| `fetchAndStoreCIData` | fn | `workers/app.ts` | Fetches GitHub Actions runs → processes → writes KV |
| `syncGitHubItems` | fn | `workers/app.ts` | Incremental/reconcile sync of issues+PRs to KV |
| `Env` | interface | `workers/app.ts` | `CI_DATA_KV: KVNamespace`, `GITHUB_TOKEN?: string` |
| `GitHubItem` | interface | `workers/app.ts` | Normalized issue/PR stored in KV |
| `routes` | config | `app/routes.ts` | React Router route tree |
| `useCIData` | hook | `app/hooks/useCIData.ts` | Fetches `/api/ci-data` with optional date range |
| `useGitHubItems` | hook | `app/hooks/useGitHubItems.ts` | Fetches `/api/github-items` |
| `MainLayout` | component | `app/components/MainLayout.tsx` | Shell with `<Tabs>` nav |

## CONVENTIONS
- **All API logic lives in `workers/app.ts`** — no separate `functions/` directory (README mentions it but the actual structure uses the single Worker file).
- **One hook per API endpoint** — hooks in `app/hooks/` call the Worker API; route components import hooks, not raw `fetch`.
- **KV keys**: `ci-data` (current), `daily:YYYY-MM-DD` (snapshots), `date-index` (list of snapshot dates), `github-items`, `github-items-meta`, `bus-factor-cache`.
- **SSR enabled** — `react-router.config.ts` sets `ssr: true`; avoid `window`/`document` in route loaders.
- **TypeScript split**: `app/tsconfig.json` covers `app/`, `workers/tsconfig.json` covers `workers/`. Both must pass for typecheck.

## COMMANDS
```bash
npm install          # Install dependencies
npm run dev          # Dev server at http://localhost:5173 (Workers + React HMR)
npm run build        # Production build → dist/
npm run typecheck    # Type-check both app/ and workers/
npm run typegen      # Regenerate workers/worker-configuration.d.ts from wrangler.jsonc
npm run deploy       # Build + deploy to staging (wrangler deploy)
npm run deploy:prod  # Build + deploy to production env
wrangler tail        # Stream live Worker logs
wrangler kv:key get --binding=CI_DATA_KV ci-data  # Inspect cached CI data
```

## ENV VARS
| Var | Notes |
|---|---|
| `GITHUB_TOKEN` | Required for GitHub API (5k req/hr vs 60 without). Set locally in `.dev.vars`; in prod: `wrangler secret put GITHUB_TOKEN`. Needs scopes: `public_repo`, `read:org`, `read:project` |

## ANTI-PATTERNS
- **NEVER add API routes to `app/routes/`** — API handlers belong in `workers/app.ts`; file-based routing only applies to React pages.
- **NEVER import Worker-side code into `app/`** — the `workers/` and `app/` TypeScript configs are separate; cross-imports will break the build.
- **NEVER deploy manually to production** — production deploys go through GitLab CI on `main`; use `npm run deploy` only for staging/emergencies.
- **NEVER commit `.dev.vars`** — it contains secrets; it is gitignored. Use `.dev.vars.example` as template.
- **NEVER rename `CI_DATA_KV` binding** without updating both `wrangler.jsonc` and the `Env` interface in `workers/app.ts`.

## NOTES
- **No test script** — `npm test` is not defined. The CI "test" stage runs `typecheck` via the GitLab wrangler2 component.
- **KV auto-provisioned on first deploy** — the `id` field in `wrangler.jsonc` is intentionally commented out; Wrangler creates the namespace automatically. Add the ID only if you need `wrangler kv:*` CLI commands locally.
- **Cron triggers**: CI data refreshes daily at 06:00 UTC; GitHub items sync hourly; weekly reconciliation runs Sundays at 00:00 UTC — all handled in `scheduled()` in `workers/app.ts`.
- **Historical backfill**: POST `/api/refresh?backfill=true` detects and fills date gaps in KV snapshots.
