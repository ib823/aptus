# SAP Connection Keystone — Slice 1 (data model + sealed secrets + resolver)

Branch: `feat/sap-connection-keystone`

## Why

Today every SAP call uses ONE shared tenant baked into `S4_TDD_*` env vars. That
is right for the ABeam TDD demo and wrong for the team's ask — *"deploy into each
client's own SAP environment."* This slice adds a **per-Organization SAP
connection**, stored in the DB with **secrets sealed at rest**, plus a resolver
that is **additive and non-breaking**: no stored connection → the existing env
path runs unchanged.

It composes with work already on `main`: the stored probe is **already
tenant-keyed** (`SapHubContent.rawMetadataJson.probes[tenantKey]`,
`readStoredProbe` / `mergeStoredProbe`) and the catalogue read is already
`force-dynamic` + `no-store`. This slice supplies the missing half — the
**per-client connection** those tenant keys point at.

## What slice 1 delivers (this branch)

| File | Role |
|---|---|
| `prisma/schema.prisma` → `model SapConnection` (+ `Organization.sapConnections`) | One SAP tenant connection owned by an Organization; secrets as ciphertext only |
| `prisma/migrations/20260725120000_sap_connection_keystone/migration.sql` | Non-destructive `CREATE TABLE` + FK to Organization |
| `src/lib/sap-public/connection-crypto.ts` | AES-256-GCM seal/open of the secret bundle (mirrors `ai-key-crypto.ts`) |
| `src/lib/sap-public/connection-resolver.ts` | `resolveSapConnections` / `resolveSapConnection` / `buildAuthHeaderFromConnection` / `toSapTenant` / `upsertSapConnection` / `redactConnection` |
| `tests/unit/sap-public/connection-crypto.test.ts` | Round-trip, empty-pruning, no-plaintext-leak, GCM tamper, wrong-key |
| `.env.example` → `SAP_CONNECTION_ENCRYPTION_KEY` | The sealing key |

**Verified here:** `prisma validate` → *schema valid*; the GCM algorithm proven
by a standalone round-trip/tamper/wrong-key run (6/6). **Not run here** (needs
your DB + full deps — run in CI): `prisma migrate`, `prisma generate`,
`typecheck:strict`, `vitest`, `lint:strict`.

## Setup

```bash
# 1. Sealing key (store in Vercel env, NOT in git)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # → SAP_CONNECTION_ENCRYPTION_KEY

# 2. Apply the migration + regenerate the client
pnpm prisma migrate deploy         # or: pnpm prisma migrate dev --name sap_connection_keystone
pnpm db:generate

# 3. Gates
pnpm typecheck:strict
pnpm vitest run tests/unit/sap-public/connection-crypto.test.ts
pnpm lint:strict
```

## Add a client connection (the write path)

```ts
import { upsertSapConnection } from "@/lib/sap-public/connection-resolver";

await upsertSapConnection({
  organizationId: org.id,          // the client Organization
  product: "s4hana",
  key: "prod",                     // becomes the tenant key stored probes are recorded under
  label: "Acme S/4 Public (PROD)",
  baseUrl: "https://my123456-api.s4hana.cloud.sap",
  authType: "oauth-client-credentials",
  oauthTokenUrl: "https://my123456.authentication.sap.hana.ondemand.com/oauth/token",
  secrets: { clientId: "sb-...", clientSecret: "..." },  // sealed at rest, never returned
  writeEnabled: false,
});
```

## Next slice — wire the routes (each is ~4 lines, non-breaking)

The connector is still env-driven via `getConfiguredSapTenants(prefix)` /
`getSapTenant(prefix,key)` / `buildAuthHeader(prefix)`. Wire each SAP route to
**prefer a resolved connection, fall back to env**:

```ts
const user = await getCurrentUser();
const conns = user ? await resolveSapConnections(user.organizationId, product.key) : [];
const tenants = conns.length ? conns.map(toSapTenant) : getConfiguredSapTenants(product.envPrefix);
// auth: conns.length ? buildAuthHeaderFromConnection(conn) : buildAuthHeader(product.envPrefix)
```

Integration points (call sites to update):
`src/app/api/sap/tdd/{hub-content,hub-content/probe-all,operations,entities,preview,write,capabilities}/route.ts`.
Because probe storage is already keyed by the tenant `key`, using each
connection's `key` makes per-client status isolation work end-to-end with no
further storage change.

Deferred beyond wiring: admin UI to manage connections; connector auth-header
refactor to take a config object (so env + DB share one code path); key rotation
tooling.

## Security notes

Secrets are sealed with AES-256-GCM (auth-tag tamper detection) and only ever
held in memory on the resolved object. `redactConnection` strips secrets **and**
`baseUrl`/host before anything crosses the client boundary. Deleting an
Organization cascades its connections. Rotating `SAP_CONNECTION_ENCRYPTION_KEY`
requires re-sealing existing rows (decrypt-with-old → `sealSecrets`-with-new);
add a `migrate:reseal` script when rotation is needed.
