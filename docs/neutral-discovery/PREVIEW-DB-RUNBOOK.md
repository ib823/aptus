# Preview-DB isolation (P6) — dedicated synthetic Neon project

**Goal:** give the Vercel **Preview** environment its own database, seeded with
**synthetic data only**, so the Neutral-Discovery e2e suite can run against a real
preview without ever reading or writing production data.

**Who applies this:** a human with Vercel + Neon dashboard access. The assistant
does not hold prod/Neon credentials and applies nothing here — it only produced
this runbook and the verifier (`scripts/verify-preview-db-isolation.sh`).

---

## Why a dedicated project — and explicitly NOT branch-per-deploy

A Neon **branch** is a copy-on-write clone of its parent. Branch-per-deploy would
copy **whatever prod holds** — potentially real client/pilot data — into **every**
preview database, each of which is reachable via the deployment-protection bypass
token the harness uses. A **dedicated, empty Neon project** starts with zero prod
data; only the synthetic fixtures we seed ever exist in it.

- ❌ Do **not** enable Neon branch-per-deploy for previews.
- ❌ Do **not** `pg_dump`/restore or otherwise clone the production database.
- ✅ Do create a **separate Neon project** and seed it with synthetic data.

---

## Steps (~15 min)

### 1 · Create a dedicated Neon project
- Neon console → **New Project** → name e.g. `aptus-preview` — a **separate project**
  from the production one (prod endpoint today is `ep-dawn-flower-…`, region
  `ap-southeast-1`).
- **Region:** match production (`ap-southeast-1`) for latency parity.
- Copy both connection strings from the dashboard:
  - **Pooled** (host contains `-pooler`) → for `DATABASE_URL`
  - **Unpooled / direct** (no `-pooler`) → for `DIRECT_DATABASE_URL` / `DATABASE_URL_UNPOOLED`

### 2 · Point Vercel **Preview** (only) at the new project
Vercel → project **aptus** → **Settings → Environment Variables**. For the
**Preview** environment **only** (leave Production untouched), set/overwrite:

| Variable | Value |
|---|---|
| `DATABASE_URL` | new project **pooled** string |
| `DIRECT_DATABASE_URL` | new project **unpooled** string |
| `DATABASE_URL_UNPOOLED` | new project **unpooled** string |

> Double-check the **scope toggle is Preview**, not Production. This is the one
> step that, done wrong, defeats the whole exercise.

### 3 · Apply migrations from full history (bootable, zero-drift)
From a checkout of `main`, with the **preview** strings exported in your shell
(never commit them):

```bash
export DATABASE_URL="<preview pooled>"
export DIRECT_DATABASE_URL="<preview unpooled>"
pnpm db:generate
pnpm exec prisma migrate deploy      # NOT db push — deploy from committed history
```

This was proven to yield a **bootable, zero-drift** schema, including the
Brownfield reconcile migration (`20260716000000_brownfield_subsystem_reconcile`)
that used to leave the app unbootable.

### 4 · Seed **synthetic** reference data
The app needs catalog/reference rows (e.g. an active `ScopeCatalogVersion`) to
function; the e2e harness seeds its own test users/grants at run time.

```bash
pnpm db:seed        # tsx prisma/seed.ts — synthetic catalog/reference data
```

No production dump. No prod data. If `db:seed` needs additional discovery
fixtures, those come from the Stage-2 harness seed path, still synthetic.

### 5 · Run the isolation verifier — the gate
```bash
./scripts/verify-preview-db-isolation.sh
```
- **✅ PASS** (exit 0): Preview endpoint ≠ Production endpoint → Stage 2 may proceed.
- **❌ FAIL** (exit 1): they still share a database → **stop**, re-check step 2.
- **INCONCLUSIVE** (exit 2): env not readable → treat as unsafe, do not proceed.

The verifier is **read-only**: it never connects to a database and never prints a
password — only a masked endpoint label + short fingerprint.

---

## Guardrails (why each matters)
- **Separate project, not a branch** — a branch copies prod data into previews.
- **`migrate deploy`, not `db push`** — history-built and audit-traceable; matches
  what a real preview/prod deploy does.
- **Verifier is the hard gate** — Stage 2's harness refuses to run unless this
  passes, so a test-login backdoor can never be pointed at the prod database.

## Hand-off
Once the verifier prints **PASS**, reply and Stage 2 (preview-capable harness:
BASE_URL-derived cookie domain, Preview-gated test-login, remote seed,
protection-bypass, flag-off variant) proceeds on its own branch/PR.
