# Aptus

Proprietary software. **All rights reserved — see [LICENSE](./LICENSE).** This
repository is readable but not licensed for use, copying, modification or
redistribution. Nothing here is an offer to license it.

Two products share one Next.js application, one database and one deployment:

| Product | Surfaces | What it does |
|---|---|---|
| **ABeam Workbench** | `/workbench`, `/presales`, `/affirm`, `/discovery`, `/sap-explorer` | Pre-onboarding Fit-to-Standard decision workbench for SAP S/4HANA Cloud presales engagements. Consultants assemble scope bundles; prospects review, decide and sign them through guest links. |
| **CoreEdge Console** | `/studio`, `/operations`, `/control-tower`, `/api/northbound/*` | A runtime platform. Developers register solutions and interfaces in Studio, bind them to SAP tenants, and call the northbound API; Operations Center and Control Tower show what actually ran. |

## Getting started

Required toolchain — Node.js `22.22.1`, pnpm `10.23.0`. The exact Node version is
pinned by `.nvmrc`, `.node-version`, `.tool-versions` and enforced by
`scripts/check-node-version.mjs`, which runs before install, dev, build and test.

```bash
nvm use          # or: asdf install / mise install
pnpm install
cp .env.example .env.local     # then fill in the values
pnpm db:push && pnpm db:seed
pnpm dev                       # http://localhost:3003
```

`package.json#engines.node` deliberately says `22.x` rather than an exact patch,
so Vercel and other hosted builders can use the latest supported Node 22 runtime.
Local development stays pinned to `22.22.1` so installs, CI and production builds
agree on a known-good toolchain.

## Verifying a change

```bash
pnpm typecheck:strict    # strict tsc — run bare, never piped (see CONTRIBUTING)
pnpm lint src tests
pnpm test                # vitest, full suite
pnpm build               # what Vercel runs; the pre-push hook runs it too
```

`pnpm test:e2e` (Playwright) and `pnpm test:visual` (design regression) cover the
browser surfaces. [CONTRIBUTING.md](./CONTRIBUTING.md) is the workflow reference —
branch policy, the deploy promise, visual-baseline drift, and the dependency
security gate.

## Layout

```
src/app/            route groups — (workbench) (studio) (operations)
                    (control-tower) (portal) (external) (auth) (public)
src/lib/            domain logic; server-only, no "use client" imports
src/components/     React components, grouped by surface
prisma/             schema, migrations (checksummed — never edit an applied one), seeds
tests/              unit · integration · e2e · security · accessibility · visual
scripts/            ingest, migration and operational tooling
docs/               architecture, ADRs, runbooks, design contracts
abap-mcp/           vendored ABAP MCP server (Python, stdio-only)
```

Routing has one sharp edge worth knowing before you add a page:
`src/lib/routing/workbench-paths.ts` is an allow-list gate. On a single-host
deployment anything absent from it is redirected away *before* auth and RBAC run,
so a fully-built, fully-tested surface can still be unreachable in production.
Adding a surface means adding it there.

## Documentation

| Where | What |
|---|---|
| [`docs/presales-operating-model.md`](./docs/presales-operating-model.md) | The Workbench bundle lifecycle, redaction boundary and audit model |
| [`docs/deployment-urls.md`](./docs/deployment-urls.md) | Hostnames, which one is canonical, and what breaks when it changes |
| [`docs/coreedge/`](./docs/coreedge/) | CoreEdge build specifications and design contracts |
| [`docs/adr/`](./docs/adr/) | Architecture decision records |
| [`docs/runbooks/`](./docs/runbooks/) | Operational procedures |

## Security

Do not open a public issue for a suspected vulnerability. See
[SECURITY.md](./SECURITY.md).
