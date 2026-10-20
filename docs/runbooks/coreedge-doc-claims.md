# Runbook: The document lint (`pnpm coreedge:doc-claims`)

Roadmap item P0.16 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2). This covers what the lint checks, what to do when it fails, and how to
keep a document true when the code moves.

## Why it exists

The CoreEdge documents drifted from the code without anything failing. The
security architecture marked the northbound broker, tenant-isolation
enforcement, the per-call audit and write idempotency "planned" months after
they shipped. The build-spec archive said "all BUILT", and the target expansion
spec said "Nothing applied", when much of it had been. A header comment said
nothing was callable at runtime. A developer or an auditor reading any of them
was told something untrue.

## What it checks

`scripts/coreedge/check-doc-claims.ts` reads every file in scope (below) and
fails on any sentence or table row that puts a **shipped feature** within 12
words of **not-built wording**.

| Part | Where | What it is |
|---|---|---|
| Shipped features | `src/lib/coreedge/shipped-features.ts` | One row per feature a reader looks for (the broker, step-up, envelope keys, grant binding, key expiry, rate limits, developer sign-up, customer-built services, and more): the capability-registry cells it is part of, the module and exports that implement it, and the words a document uses for it. A feature counts as shipped while the registry scores every one of its cells above none. |
| Not-built wording | `NOT_BUILT_WORDING` in `src/lib/coreedge/doc-claims.ts` | "planned", "not (yet) built / implemented / shipped / merged / wired / callable / available", "coming soon", "pending merge", "unmerged", "not in production", "still to build", "nothing is callable", "in a future release", "will be built". "A planned rotation" (scheduled) is not counted. |
| Scope | `DOC_CLAIMS_SCOPE` in `src/lib/coreedge/doc-claims-scope.ts` | `docs/coreedge/**`, `docs/coreedge-*.md`, `docs/runbooks/**`, `docs/adr/**`, `README.md`, `SECURITY.md`, `docs/deployment-urls.md`, and the comments (not the strings) in the CoreEdge code: the Studio, Control Tower, Operations and `/coreedge` pages; the API routes under `src/app/api/{coreedge,control-tower,northbound,ops,sap,studio}`; `src/middleware.ts`; `src/components/{studio,coreedge,control-tower}`; `src/lib/{coreedge,northbound,studio,auth,security,sap-public,audit}`; and every shipped feature's own module (`code.file` in `shipped-features.ts`, such as `src/lib/db/tenant-guard.ts`), read whatever directory it sits in. |

It also fails when a feature's module or one of its named exports no longer
exists, and on a malformed marker (below).

A sentence is a unit of prose: Markdown paragraphs and list items are split
into sentences; a table row (Markdown or HTML) is one unit, because a status
column speaks for its row. Fenced code, HTML comments, `<style>` and `<script>`
are not prose.

Wording in quotes or backticks in running prose is a word being mentioned, not
used, and is not counted: a sentence such as 'The page marked the broker
"planned" after it shipped' passes. In a table
row it is counted however it is written: `` | Step-up | `planned` | `` and
`| Step-up | 'planned' |` are statuses.

## Where it runs

| Step | Command | Fails when |
|---|---|---|
| CI Quality Gates, "CoreEdge documents match the code" | `pnpm coreedge:doc-claims` | any finding above |
| `pnpm test` | `tests/unit/coreedge/doc-claims.test.ts` | the same scan over the repository, plus the matcher's own tests |

`pnpm coreedge:doc-claims --list` prints every documented feature with its
registry cells and whether it counts as shipped.

## What happens on deploy

Nothing. The lint runs at development and CI time only. No route imports it, no
setting is added, and no data or user is touched.

## When it fails

The output names the file, the line, the feature, the term and the wording:

```
docs/coreedge/CoreEdge-Security-Architecture.html:95: "Northbound broker" (northbound-broker, shipped) is next to "planned":
    Northbound broker — OAuth2 client-credentials, per-solution identity, tenant-bound scopes, quotas planned
```

1. **Read the code, then correct the sentence.** Say what ships today, with
   its default if a setting switches it ("step-up warns by default; set
   `COREEDGE_STEP_UP=enforce` to refuse"). A lenient default is not "planned".
2. **If the sentence mixes a shipped feature with something that really is not
   built**, split it, so each sentence says one true thing. A table row that
   must keep both can carry an allow marker on its line or the line above:

   ```markdown
   <!-- doc-claims: allow northbound-broker: the row contrasts the shipped broker with the OAuth endpoint P2.5 adds -->
   | Broker | built; consumer OAuth planned (P2.5) |
   ```

   The marker names one feature id from `shipped-features.ts` and must give a
   reason; in code, put it in a comment (`// doc-claims: allow ...`).
3. **If the file is a record of the past** (a build specification, a dated
   audit) and should not be rewritten, declare it historical in its first 20
   lines, and say so in visible text there too, or the lint fails:

   ```markdown
   <!-- doc-claims: historical -->
   > **Historical build specification.** Kept for provenance: it says what was to be built, not what CoreEdge does today.
   ```

   Then correct only what a reader would act on, as a dated note (the Phase D
   §7 correction is the model).

Never weaken `NOT_BUILT_WORDING` or a feature's terms to make a finding go
away. If a term matches something it should not (as "client credentials", the
OAuth grant, would match runtime keys), narrow the term and add a test case.

## When the code changes

- **A feature ships** (a roadmap item lands): add a row to `DOCUMENTED_FEATURES`
  naming its registry cells, its module and exports, and the words documents
  use for it. Run the lint, correct what it finds, and read the item's own
  documents anyway: the lint finds only not-built wording, not every untrue
  sentence.
- **A feature's code moves or is renamed**: the lint fails naming the module or
  export. Update `code` in its row.
- **A feature stops** (its registry cell drops to none): the unit test
  "are every one shipped today" fails. Remove the row or point it at the cells
  that still hold, and correct the documents that describe it as shipped.

## Rollback

The change adds a script, three modules, a test and a CI step, and corrects
documents. Reverting the commit removes the lint; there is nothing to undo in
production.

## Limits, written down

- It finds **not-built wording only**. A document can still be wrong in other
  ways (a wrong default, a stale line number, "no X" where X now exists). The
  manual review recorded for P0.16 is in the pull request notes; repeat one when
  a phase lands.
- Twelve words is a judgement: close enough to catch a status column beside its
  feature, far enough to leave most two-clause sentences alone.
- Historical files are skipped whole. The visible notice is what keeps that
  honest.
