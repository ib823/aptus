# D2 · Decision brief — four calls that are yours, not CCC's

Assessed at `690418f` (#177 — two PRs later than the brief's table; see D1 §0). Evidence in D1. Each item:
recommendation first, then what would change my mind.

**One change since the last version of this brief.** #175 merged unchanged, so its five findings are live
rather than pending; and #177 revealed that both workspaces and all four Ops endpoints were unreachable in
production between #173/#175 and #177. That does not alter any recommendation below, but it sharpens
Decision 3: the backend capability you are deciding whether to extend has, until now, never actually been
reachable.

---

## Decision 1 · The production exposure from #168

**Recommendation: run the query below before doing anything else. Do not revert.**

The change is correct and the exposure is almost certainly small — but nobody has looked, and "almost
certainly" is not a basis for leaving a live read path in an unknown state.

**The exposure is wider than the brief describes.** The brief names one breaking class; the code has three
(`connection-resolver.ts:183-213`):

| Class | Condition | Before #168 | Now |
|---|---|---|---|
| A | ≥2 active connections for the product, none declaring an environment | oldest row served | **refused** — `AMBIGUOUS` |
| B | ≥2 connections declaring the **same** environment | oldest row served | **refused** — `AMBIGUOUS` |
| C | every connection declares an environment, **none matches the credential's** | oldest row served | **refused** — `NO_MATCH_FOR_ENVIRONMENT` |
| — | exactly one connection, undeclared | served | served, flagged `bindingUnverified` — **no loss** |

Class C is the one to worry about. It became reachable the moment #164 added the column and somebody filled it
in: a single connection labelled `DEV` serving a credential stamped `SANDBOX` now fails. Matching is
`UPPER(TRIM())` on both sides, so `"prod"` and `" PROD "` unify — but `"PRODUCTION"` does not match a `PROD`
credential.

**The query that settles it.** Read-only, safe to run against production.

```sql
WITH live_client AS (
  SELECT c."organizationId", c."solutionId", c.label,
         UPPER(TRIM(c.environment)) AS client_env
  FROM "SolutionClient" c
  WHERE c."isActive" AND c."revokedAt" IS NULL
    AND (c."expiresAt" IS NULL OR c."expiresAt" > now())
),
demand AS (                       -- every (org, product, env) the broker can be asked for
  SELECT DISTINCT lc."organizationId", i."sapProduct" AS product, lc.client_env, lc.label
  FROM live_client lc
  JOIN "Interface" i ON i."solutionId" = lc."solutionId"
),
by_env AS (                       -- connections per declared environment
  SELECT "organizationId", product, UPPER(NULLIF(TRIM(environment), '')) AS env, COUNT(*) AS n
  FROM "SapConnection" WHERE "isActive" GROUP BY 1, 2, 3
),
supply AS (
  SELECT "organizationId", product, COUNT(*) AS total,
         COUNT(*) FILTER (WHERE NULLIF(TRIM(environment), '') IS NULL) AS undeclared,
         ARRAY_AGG(COALESCE(UPPER(NULLIF(TRIM(environment), '')), '(undeclared)')) AS envs
  FROM "SapConnection" WHERE "isActive" GROUP BY 1, 2
)
SELECT d."organizationId", d.product, d.client_env, d.label AS credential,
       COALESCE(s.total, 0) AS active_connections, s.envs, COALESCE(m.n, 0) AS exact_matches,
       CASE
         WHEN s.total IS NULL           THEN 'unchanged — no connection before or after'
         WHEN COALESCE(m.n, 0) = 1      THEN 'OK'
         WHEN COALESCE(m.n, 0) > 1      THEN 'BREAKS — class B (duplicate declared env)'
         WHEN s.undeclared = 0          THEN 'BREAKS — class C (no connection for this env)'
         WHEN s.total = 1               THEN 'DEGRADED — served, binding unverified'
         ELSE                                'BREAKS — class A (undeclared beside others)'
       END AS verdict
FROM demand d
LEFT JOIN supply s ON s."organizationId" = d."organizationId" AND s.product = d.product
LEFT JOIN by_env m ON m."organizationId" = d."organizationId" AND m.product = d.product
                  AND m.env = d.client_env
ORDER BY verdict DESC, 1, 2;
```

**What to do with each result.**

- **Zero `BREAKS` rows** — accept, close the item, and let the `bindingUnverified` backlog do its work. Most
  likely outcome given the estate's age.
- **`BREAKS` rows, all class C, small count** — **hotfix the data, not the code.** Declaring the right
  environment on the connection is one field in a UI that already ships (#167). Faster than any code change and
  it moves the estate toward the state the whole design assumes.
- **`BREAKS` rows in class A or B** — still data, not code: declare the environments, or deactivate the
  duplicate. Reverting would reinstate a defect where a SANDBOX credential can be served from a PROD
  connection while the audit row says "SANDBOX", which is worse than a refused read.
- **A large or client-facing count** — then it is a temporary relief valve, not a revert: allow class C to fall
  back to the single-connection read with `bindingUnverified: true`, behind an env flag, with an expiry date.
  Keep the write refusal absolute in every case.

**What would change my mind:** a client-facing integration currently down because of this. That converts it
from "run the query when convenient" to "run it now", but still not to a revert — the relief valve above is
strictly better than restoring the old behaviour.

---

## Decision 2 · `dc3` — commission, narrow, or bypass

**Recommendation: narrow it. Commission a CT3-only tranche, and unblock the backend work immediately —
it is not actually blocked.**

I wrote the gate. Having now read `dc2` against what shipped, **the gate is stricter than the evidence
supports**, for a reason that did not exist when I wrote it: the delta list has since been written down.

**Is `dc2` genuinely unusable?** No. My element-by-element audit put 47 elements backable as-drawn, 21
unbackable, and the rest gated behind a named PR. The layout, chrome, component language, state coverage
(empty / needs-setup / error / loading all designed), the drawer pattern and the honest-status chip vocabulary
for broker traffic are all correct and are the bulk of the file. The 21 defects are enumerated, located by line,
and each has a stated correction — in the design commission's §4 A1–A4 and §5 B1–B6. **That prose is the
missing design intent.** A builder given `dc2` + Inventory v3 + that delta list has a complete specification;
what they lack is a rendering of it.

**So what is actually lost by proceeding without `dc3`?** Three things, and only three:

1. **B5, the provenance-note component.** Four Ops screens need a permanent "this number is incomplete and
   here is why" treatment. Prose cannot settle whether that reads as design language or as fine print, and it
   is the single highest-leverage visual decision in the front.
2. **B1's visual resolution.** "Binding unverified" must be legible as distinct from both a health status and
   an environment chip — and the existing rule is that an unknown environment renders *no chip at all*. Getting
   that wrong produces a screen that looks like a bug.
3. **B4, thin-not-empty.** One pending grant should not look like a broken screen. A density judgement.

Everything else in the delta list is determinate. A1 (drop `NEVER_TESTED` from the scale, add `NO_PROBE_PATH`,
count it under *unknown*), A2 (count what is countable), A3 (omit latency in all five places), B3 (the empty
state, whose copy is already written) — a competent implementer produces the same answer from the prose that a
designer would produce in HTML.

**And two gating assumptions have expired.** B6 (workspace chrome) is **already built** — #173 shipped the
breadcrumb fix, both section lists (`StudioRail.tsx:50-70`) and both gated route groups. And A4's two revoke
controls live on `ct-tokenreg` and `ct-connreg`, which are **CT4**, not CT3. Neither blocks the Operations
Center.

**The minimum `dc3` to unblock CT3 alone:** B5, B1 (connections view + traffic-row triad), B4, and A1's chip
set. That is one designer sitting, not a redesign. A4 and B2 (grant expiry states) can follow in a second
tranche for CT4 without holding anything up.

**Meanwhile nothing about the backend is blocked, and it never was.** PR #175's four endpoints, plus the three
remaining ones in Decision 3, are pure server work. The gate binds at CT3, and #175 is not CT3.

**What would change my mind:** if the designer produces the full `dc3` inside a few days, take it — the narrow
tranche is a hedge against delay, not an improvement. And if CT3 is built without `dc3` at all, I would want the
three substitutions above named explicitly in the PR description, so the shortcut is visible rather than
discovered later in a screenshot.

---

## Decision 3 · The three remaining Ops endpoints (throttle, catalogue freshness, incidents)

**Recommendation: build throttle and incidents. Do not build catalogue freshness — respecify it first.**

- **Throttle** — the expensive part is done. `peekRateLimit` is written, non-consuming, and now properly
  tested on both backends after #176 added the Upstash coverage (`rate-limit.ts:173-199`;
  `tests/unit/security/peek-rate-limit-upstash.test.ts`). The endpoint is the cheap half. Leaving the primitive
  with no caller is the worst of both states: the cost is paid and the value is not banked. Build it.
- **Incidents** — the derivation rules are a product decision that needs writing down as named, tested
  constants either way. Doing that while the reasoning is fresh is worth more than doing it in three weeks.
  Build it.
- **Catalogue freshness — do not build it as specified.** Bible v3 §7 (`:491`) calls for
  `GET /api/ops/freshness`, but the underlying data cannot be organization-scoped: `SapHubContent` has no
  `organizationId`, probes are keyed by env tenant, and the only writer is an admin-gated route that probes
  env-configured tenants only. An org-scoped freshness endpoint would return empty for every organization whose
  tenant keys are not also env tenant keys — which is all of them. Build it as an explicitly
  **deployment-scoped** panel, or not at all. This one needs a spec correction before code.

**What would change my mind on throttle and incidents:** if `dc3` lands within days, build all three together
against a known design and skip the round trip. The recommendation above assumes `dc3` is weeks away.

---

## Decision 4 · Two things my review surfaced that are yours, not CCC's

### 4a · The developer loop needs two humans, and the product ships one persona

The loop is not walkable end to end (D1 §6). Two steps — issuing a credential and approving a grant — each
require a **second `consultant`**, and `/dev-login` ships exactly one
(`src/lib/auth/dev-login.ts:57-62`). Both gates are working as designed; segregation of duties is doing its job.

**Recommendation: add a second consultant persona to `/dev-login`, and treat this as a demo-readiness fix, not
a governance change.** The route already accepts any `@abeam.test` address with any role into the same org
(`test-login/route.ts:92-130`), so this is one array entry. Do not weaken either gate.

But note what it means: **the loop cannot be demonstrated by one person.** If a demo is coming, either two
browser profiles are needed, or someone should decide now that the demo narrative shows the refusal — *"I
cannot approve my own request, and that is the point"* — which is arguably the better story and needs no code.

**What would change my mind:** nothing about the fixture. But if you would rather the demo not depend on two
logins at all, say so and the narrative choice above becomes the answer instead.

### 4b · Owners can only be claimed, never assigned

The ownership UI offers **claim** (set to yourself) and **release** (set to null) and has no user picker
(`SolutionsClient.tsx:299-303`), though the PATCH route accepts an arbitrary id (`solutions/route.ts:41-43`).
So through the product, all three owner slots can only ever hold the acting consultant — which is what makes
the credential-issuance gate unsatisfiable for a single user.

This is a governance question, not a UI convenience: **should a consultant be able to name someone else as an
owner, or must each owner claim their own slot?** Claim-only is defensible — it means nobody is made
accountable without acting — but it is currently an accident of the UI rather than a stated position, and the
server disagrees with it.

**Recommendation: decide the position, then make the code say it.** If claim-only is intended, tighten the
PATCH schema to refuse an id that is not the caller's, and say so in the copy. If assignment is intended, add
the picker. Leaving the two layers disagreeing is the thing to avoid.

**What would change my mind:** if a client has already asked to assign owners centrally, that settles it toward
the picker.

---

## Decision 5 · NEW — a reachability check before the next surface ships

**Recommendation: adopt it as a standing rule, and it costs nothing because #177 already built the mechanism.**

Both workspaces and all four Ops endpoints shipped complete, gated, tested — and **unreachable in production**,
because `/operations`, `/control-tower` and `/api/ops/` were missing from `WORKBENCH_PATHS` and the middleware
redirects before auth and before RBAC (D1 §10a). It went unnoticed because `WORKBENCH_ONLY` is unset on a dev
server, so every local test passed against a middleware that was never consulted.

**This is the second occurrence, and the file's own header had already recorded the first** — nineteen PRs of
CoreEdge Console, dark in production, because `/studio` was missing from the same list. A warning written in a
comment did not prevent the repeat. #177's test, which derives its expectation from the route groups rather
than restating a list, is the thing that will.

Why this is yours rather than CCC's: the code fix is done, but the **question of what "shipped" means** is a
process call. My previous review verified route groups, layouts, RBAC gates and breadcrumbs and pronounced the
shell sound — it was sound, and it was dark. If a "done" claim is going to mean reachable, that has to be
stated, because neither CCC's definition of done nor mine included it.

**Recommendation:** add one line to the definition of done — *a PR that adds a user-facing surface names the
deployment path that makes it reachable, and a test proves it* — and treat #177's derived test as the pattern.

**What would change my mind:** if `WORKBENCH_ONLY` is not set on the production deployment, the exposure was
theoretical rather than actual and this drops to a hygiene item. Worth confirming, because it also tells you
whether anything was genuinely dark or merely at risk.

---

## What is CCC's, not yours

For completeness, so these do not land on your desk: N1 (the `callable` advisory contradicting enforcement),
N2 (the unscoped `upsert`), N3's `flow-engine` routing bug and the remaining untyped registries, N4
(`scripts/migrate-roles.ts`), N5 (the stale doc comment), and N6–N10, which are now live on `main` rather than
pending review. All are specified in D3.

Closed since the last version, no action needed: the `permissions.ts` deny-lists and the `typecheck:strict`
crash (both #176), the `WORKBENCH_PATHS` allow-listing (#177), and the Upstash `peekRateLimit` test gap (#176).

---

*End of D2.*
