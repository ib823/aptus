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
Organization cascades its connections. Keys are versioned and rotatable since
P0.10; see [Keys: envelope encryption, rotation, reseal, verify](#keys-envelope-encryption-rotation-reseal-verify-p010).

Ciphertexts are bound to their row by AAD — `connectionAad(org, product, key)`
for connections, `solutionClientAad(org, solution)` for runtime clients. Without
that binding a blob is a free-floating secret: anyone able to write to the table
could copy tenant A's `secretsCiphertext` onto tenant B's row and the platform
would decrypt it happily, then authenticate to A's SAP system as B. Rows sealed
before AAD existed still open (a deliberate migration bridge) and are re-bound on
their next write.

### Before real client credentials — the KMS gap

A raw env var is adequate for a POC and **is not the
enterprise bar** for storing customers' production SAP credentials. This
section listed three gaps, in priority order; their status after P0.10:

1. **KMS/Vault-backed key — the seam exists, the adapter does not.** Secrets
   are now sealed under per-organisation data keys wrapped by a `KeyProvider`.
   The shipped provider is still the environment (`env`), so the master key
   still sits in the deployment's environment, visible to anything that can
   read the process environment or a deployment config. A managed key never
   leaves the KMS; plugging one in is one adapter and one setting (below).
   Which KMS is an open product decision, so no cloud SDK is a dependency yet.
2. **Key versioning + rotation — done.** There used to be one key with no
   version marker, so rotation was all-or-nothing. Blobs now say which data
   key they were sealed under (`ce2:<version>:…`), data-key rows say which
   master version wraps them, and the `migrate:reseal` script this section
   asked for exists as `keys:reseal`, beside `keys:rotate` and `keys:verify`.
3. **A documented recovery path — done.** Losing the key means losing every
   stored connection secret with no way back; that consequence is now a
   written, drilled procedure rather than a discovery:
   [SAP-KEY-RESTORE-DRILL.md](./SAP-KEY-RESTORE-DRILL.md).

Real client production credentials still wait for item 1 on the hosted
deployment: the AAD binding closes the swap-a-ciphertext attack and the ring
makes the key versioned, but an environment key is still an environment key.

## Keys: envelope encryption, rotation, reseal, verify (P0.10)

### The model

```
master key (KeyProvider: env ring today, a cloud KMS later)
  └─ wraps ──> OrgDataKey row: one data key per organisation and version
                 └─ encrypts ──> ce2:<dataKeyVersion>:<iv>:<ciphertext+tag>
                                 (SapConnection / SolutionClient secretsCiphertext)
```

- **Who can decrypt a customer's SAP password?** Whoever can ask the
  `KeyProvider` to unwrap that organisation's data key. A database dump alone
  holds wrapped keys and ciphertext and nothing else.
- **The per-row binding is unchanged.** Each blob is still authenticated
  against `connectionAad(org, product, key)` or
  `solutionClientRowAad(org, solution, row)`, plus its own `ce2:<version>:`
  header, so neither the row nor the version can be swapped.
- **Unwrapped data keys are cached per process** for 10 minutes
  (`DATA_KEY_CACHE_TTL_MS`). That is also the longest a warm instance keeps
  opening secrets after a KMS grant is withdrawn, or keeps opening a data-key
  version after `keys:retire`. A cached key is tied to the `OrgDataKey` row it
  came from: a seal re-unwraps when the row changed (as after a restore), and
  an open that fails with a cached key retries once with the stored one.

Code: `src/lib/sap-public/keys/` (`keyring.ts`, `key-provider.ts`,
`org-data-key.ts`, `maintenance.ts`), `src/lib/sap-public/secret-envelope.ts`
(the call-site API), `src/lib/sap-public/connection-crypto.ts` (the legacy
codec underneath), `scripts/ce-keys.ts`, table `OrgDataKey`
(migrations `20261021010000_org_data_keys`, `20261021020000_org_data_key_retired_at`).

### Every sealed secret (the inventory the scripts cover)

| Column | Holds | Binding | Call site |
|---|---|---|---|
| `SapConnection.secretsCiphertext` | passwords, client secrets, bearer tokens, SAML private keys and assertions, API keys | `connectionAad(org, product, key)` | `connection-resolver.ts` (`upsertSapConnection`, `openConnectionRow`) |
| `SolutionClient.secretsCiphertext` | the per-credential write key | `solutionClientRowAad(org, solution, row)` | `northbound/write-credential.ts` |

Both go through `sealSecretsForOrg` / `openSecretsForOrg`;
`tests/unit/sap-public/sealing-call-sites.test.ts` fails if any other module
reaches for the legacy codec. **Not covered:** BYOAI provider keys
(`Organization.aiConfig.apiKey`) use a different helper
(`intelligence/ai-key-crypto.ts`) and key (`BYOAI_ENCRYPTION_KEY`).

### Settings

| Variable | Meaning |
|---|---|
| `SAP_CONNECTION_ENCRYPTION_KEY` | The legacy single key. Still valid; it **is** `v1`. |
| `SAP_CONNECTION_ENCRYPTION_KEYS` | `v1:<64 hex>,v2:<64 hex>` — every master key still needed. A `v1` entry must equal the legacy key if both are set. |
| `SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY` | The master version new data keys are wrapped under. **Setting it switches new writes to `ce2`.** |
| `SAP_CONNECTION_KEY_PROVIDER` | `env` (default) or the name of a registered KMS adapter, exactly (names are lowercase and case-sensitive). A non-env provider also switches writes to `ce2`. |

**Safe default.** With only `SAP_CONNECTION_ENCRYPTION_KEY` set, nothing
changes: same key, same format, `OrgDataKey` is never read or written. The
deploy gate (`scripts/check-production-env.js`) fails a build whose ring is
malformed, whose active key is not in it, or whose
`SAP_CONNECTION_KEY_PROVIDER` names a provider the application does not
register (`ENV`, or a KMS adapter that has not shipped), so a typo cannot reach
a running deployment.

**Rollback.** Code older than P0.10 cannot read `ce2`. To roll a deployment
back past this change, in this order:

1. **Stop writing `ce2`.** Unset `SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY` and set
   `SAP_CONNECTION_KEY_PROVIDER` to `env` (or unset it), keeping
   `SAP_CONNECTION_ENCRYPTION_KEYS` and the legacy key / `v1`, and redeploy
   the P0.10 code. It now writes legacy and still reads both formats. Skipping
   this step leaves every save made after the reseal in `ce2`, unreadable by
   the rolled-back code; `keys:reseal --to legacy --apply` refuses to run (exit
   2) while envelope sealing is still on.
2. `pnpm keys:reseal --to legacy --apply`, with the same settings.
3. `pnpm keys:verify --expect-format=legacy` — exit 0 means every blob is
   legacy and opens; exit 1 names any row still in `ce2` or failing.
4. Roll back.

### Commands

All run against `DATABASE_URL` with the deployment's key settings in the
environment. `rotate`, `reseal` and `retire` are **dry runs** unless given
`--apply`; a dry run still reads (and, for rotate and reseal, decrypts) every
row, so it reports exactly what would fail. They are idempotent and
resumable: re-running finds only what is left, and every write is conditional
on the row still holding the value that was read. **`rotate --rekey` is the
exception:** every run mints another data-key version for every organisation
whose newest key predates the run. Its report prints the cutoff it used; to
resume a rekey that failed part-way, re-run it with
`--rekey-before=<that value>` so organisations it already rekeyed are skipped.
Nothing secret is ever printed. `--json` gives a machine-readable report;
`--batch-size=<n>` tunes paging.

| Command | Does | Exit |
|---|---|---|
| `pnpm keys:verify [--expect-format=legacy\|ce2]` | Unwraps every data key and opens every sealed blob, from cold; counts blobs by format and data-key version, flags legacy blobs that are still unbound, data keys not on the active master, retired data keys, and `ce2` blobs still on a data key older than their organisation's newest (warns: reseal, then retire). A blob naming a retired version fails. `--expect-format` also fails every blob not in that format. | 0 all open, 1 any failure |
| `pnpm keys:rotate [--apply] [--rekey [--rekey-before=<ISO>]]` | Re-wraps every data key under the active provider and master version. `--rekey` also mints a new data-key version for each organisation whose newest key was created before the cutoff (default: now) — then reseal. | 0 / 1 on a failed row |
| `pnpm keys:reseal [--apply] [--to ce2\|legacy]` | Re-encrypts every blob into the target format: `ce2` under each organisation's newest data key (minting v1 if needed), re-binding unbound legacy blobs; or `legacy` for a rollback (refused with `--apply` while envelope sealing is on). Verifies each new blob before writing it. | 0 / 1 on a failed row |
| `pnpm keys:retire [--apply]` | Retires (`OrgDataKey.retiredAt`) every data-key version older than its organisation's newest that no sealed blob still names. A retired version opens nothing. Never retires the newest; a version still in use is reported and left open. | 0 / 1 on a version still in use |

Exit code 2 means the command or configuration is wrong; nothing was done.

### Procedure: switch an existing deployment to envelope encryption

1. Deploy this change with nothing new configured (migration is additive; no
   behaviour change). `pnpm keys:verify` → all blobs `legacy`, all open.
2. Generate a master key: `openssl rand -hex 32`. Set
   `SAP_CONNECTION_ENCRYPTION_KEYS="v2:<hex>"` and
   `SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY="v2"`, keeping
   `SAP_CONNECTION_ENCRYPTION_KEY` (it is `v1`). Redeploy. New saves are `ce2`.
3. `pnpm keys:reseal` (dry run) — check `failed 0`. Then
   `pnpm keys:reseal --apply`.
4. `pnpm keys:verify` → `legacy bound 0, legacy unbound 0`, every blob `ce2`.
5. Only now may `v1` leave the environment (unset
   `SAP_CONNECTION_ENCRYPTION_KEY` and drop any `v1:` entry): no blob needs it.
   Keep a sealed offline copy for the restore drill's window — see below.

### Procedure: rotate the master key (routine)

1. Generate `v3`. Set `SAP_CONNECTION_ENCRYPTION_KEYS="v2:<old>,v3:<new>"`,
   `SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY="v3"`. Redeploy.
2. `pnpm keys:rotate` (dry run), then `pnpm keys:rotate --apply`. No sealed
   blob changes; only `OrgDataKey` rows are re-wrapped (`rotatedAt` set).
3. `pnpm keys:verify` → `not on the active master key 0`.
4. Remove `v2` from the ring and redeploy; run `pnpm keys:verify` once more.

### Procedure: suspected data-key exposure (rekey)

A leaked data key, plus write access to the database, is enough to seal a blob
the application accepts (the AAD strings are public structure). Moving every
blob off the leaked key is not enough on its own; the old version must also
stop opening anything. In this order:

1. `pnpm keys:rotate --rekey --apply` — a new data-key version per
   organisation. Note the `--rekey-before=` value it prints; if it fails
   part-way, fix the cause and re-run with that value (never a bare re-run,
   which rekeys everyone again).
2. `pnpm keys:reseal --apply` — every blob onto the new version.
3. `pnpm keys:verify` — exit 0 and no "on a data key older than" warning.
4. `pnpm keys:retire` (dry run), then `pnpm keys:retire --apply` — the older
   versions now open nothing. Warm instances may keep a cached old version for
   up to 10 minutes (`DATA_KEY_CACHE_TTL_MS`); redeploy to cut that short.
5. `pnpm keys:verify` — `retired` counts the withdrawn versions. A blob that
   names one fails here: either one the reseal missed or a forgery.

Retired rows stay, wrapped: a backup taken before the reseal needs them, and
the restore drill un-retires them in its scratch database
([SAP-KEY-RESTORE-DRILL.md](./SAP-KEY-RESTORE-DRILL.md)).

### Plugging in a cloud KMS

A KMS adapter implements `KeyProvider` (`src/lib/sap-public/keys/key-provider.ts`)
in its own module under `src/lib/sap-public/keys/` and is added to the
registry's built-in list in `key-provider.ts`:

```ts
const BUILT_IN: ReadonlyArray<readonly [string, KeyProviderFactory]> = [
  [DEFAULT_KEY_PROVIDER, () => envKeyProvider()],
  ["aws-kms", () => awsKmsProvider({ keyId: process.env.SAP_KMS_KEY_ID ?? "" })],
];
```

Registering there, rather than from `src/instrumentation.ts`, means the
application and `scripts/ce-keys.ts` see the same providers — a rotation run
from the CLI must be able to unwrap what the app wrapped.
`registerKeyProvider(name, factory)` exists for tests and for an adapter
shipped as a separate package. `SAP_CONNECTION_KEY_PROVIDER=aws-kms` then
selects it for new data keys. Rows
wrapped by the env provider keep naming `env`, so keep the ring configured
until `pnpm keys:rotate --apply` has moved them onto the KMS, then verify.
What each adapter does ([verify each against the vendor's current docs before
building]):

| | `wrapDataKey` | `unwrapDataKey` | `keyVersion` stored | Binding (`wrapContext`) |
|---|---|---|---|---|
| **AWS KMS** | `Encrypt` with the KMS key ARN | `Decrypt` with the same `KeyId` | the key ARN (AWS rotates key material inside one key transparently; a new key = a new version) | `EncryptionContext: { coreedge: wrapContext(ctx) }`; IAM can require it via `kms:EncryptionContext:coreedge` |
| **GCP Cloud KMS** | `encrypt` on the CryptoKey | `decrypt` on the CryptoKey | the CryptoKeyVersion name returned by `encrypt` (rotation to a new primary → `keys:rotate`) | `additionalAuthenticatedData = wrapContext(ctx)` |
| **Azure Key Vault** | `wrapKey` (RSA-OAEP-256) on the key | `unwrapKey` with the versioned key id | the versioned key id returned by `wrapKey` | RSA wrap has no AAD: the per-row AAD on every blob still binds secrets to rows; Managed HSM AES-GCM wrapping does take AAD |

GCP Cloud KMS, Azure Key Vault and Vault Transit as shipped adapters are P4.5.
`sign` / `verify` / `publicJwks` are declared on the interface for P1.4, P2.5
and P3.10; the env provider refuses them.

