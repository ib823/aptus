# Runbook: The capability registry and the gap study's figures

Roadmap item P0.15 (`docs/coreedge/CoreEdge-Gap-Study-and-Roadmap.md`, section
8.2), and P1.9 for the parity scorecard (section 8.3). This covers how
CoreEdge's capabilities are scored, how the gap study's simulated figures and
the scorecard are regenerated, and what CI and the deploy check.

## What changed, in one paragraph each

**CoreEdge's cells come from the code.** The gap study scores every combination
of SAP system, technology, pattern, origin, network, SAP login, consumer and
consumer login. CoreEdge's side used to be rated by hand in
`docs/coreedge/gap-matrix.json`, so a rating could outlive the code it
described. Now `src/lib/coreedge/capability-registry.ts` scores each cell from
the code, with the roadmap's own definitions (section 2.3):

| The cell is | When |
|---|---|
| none | the capability is not implemented |
| partial | it is implemented, with a material limit, or with no tests and document recorded for it |
| full | it is implemented, with no limit, and tests and a document exist (`EVIDENCE`) |

"Implemented" is read from code flags (the connector's products, the OData
versions a service path may carry, the host allow-list, the key providers built
in, the files the starter kit writes) or declared in `BROKER_FACTS` and checked
against the module that holds it by `tests/unit/coreedge/capability-registry.test.ts`.

**The figures are generated.** `pnpm coreedge:registry` writes
`docs/coreedge/capability-registry.json`; the simulator
(`scripts/coreedge/simulate-gap-matrix.mjs`) reads it beside the matrix; and
`pnpm coreedge:figures` rewrites every table in the gap study between
`<!-- figures:begin ID -->` and `<!-- figures:end ID -->`, and every figure a
sentence quotes through an inline block on one line (the `value-*` family, for
example `value-full-P5`, and whole claims such as section 3.1's supported
shape). In sections 1 and 3 no coverage figure may be typed into prose
outside a block: the check fails on one. A figure that is not simulator output
(a target) or that records a past result (section 3.0) is wrapped in
`<!-- figures:not-simulated begin -->`/`end -->` or
`<!-- figures:historical begin -->`/`end -->` and is not checked.

**The parity scorecard is generated with them (P1.9).** The same run of
`pnpm coreedge:figures` writes `docs/coreedge/parity-scorecard.json`, which
Control Tower renders at `/control-tower/parity` for platform administrators.
It is built from the same simulator results and with the same wording as the
roadmap's tables, and holds the sha256 of the matrix and of the registry but
no timestamp or commit: the page takes the commit from the deployment
(`VERCEL_GIT_COMMIT_SHA`, as `/api/build` does).

**Hosting is scored.** Network reach is scored per hosting mode (SHARED,
DEDICATED, SELF_HOSTED, CONNECTOR). The headline is SHARED, the production
deployment, which reaches neither private networks nor IP-allow-listed systems.

**The governance decision is property-tested.** `pnpm test:property` runs the
real northbound read and write routes over more than 46,000 generated
combinations against an oracle written from
`docs/runbooks/coreedge-governance-decision-table.md`, with another
organisation's rows beside the caller's in many of them.

## What CI checks

The Quality Gates job in `.github/workflows/ci.yml` runs, before the unit tests:

| Step | Command | Fails when |
|---|---|---|
| CoreEdge capability registry and roadmap figures | `pnpm coreedge:check` | the registry JSON no longer matches the code, a generated block in the gap study or the parity scorecard JSON no longer matches the simulator, or sections 1 and 3 type a coverage figure into prose outside a block. On success it prints the two input digests, and adds them to the run's step summary, so the run can be compared with the scorecard page served from the same commit |
| Governance property test | `pnpm test:property` | the broker's answer to any generated case differs from the decision table |

Both also run inside `pnpm test` (`tests/unit/coreedge/capability-registry.test.ts`,
`tests/unit/coreedge/gap-simulator.test.ts`, `tests/property/`). Together they
take under ten seconds.

## What happens on deploy

`vercel-build` runs `node scripts/coreedge/render-roadmap-figures.mjs
--check-scorecard` first, before the production environment check and the
migrations: it re-runs the simulator on the two committed inputs and fails
the build if the scorecard JSON differs. It is plain Node, reads three
committed files, and uses no network, database or tenant; it takes about two
seconds. It does not read the roadmap, so a prose rule can never block a
deploy. The Vercel upload excludes `docs/`, so `.vercelignore` keeps exactly
these three files (`tests/unit/build/runtime-assets.test.ts` checks the
rules under git's matcher and under the one Vercel's upload walker uses, which
tests each directory with no trailing slash); the check names them if one goes
missing.

The parity page imports the scorecard JSON statically, so it is bundled into
the page's function: nothing is simulated or read from disk at request time.
No route imports the registry, no setting is added, and no data or user is
touched.

## Routine operations

**A code change made `coreedge:check` fail.** The capabilities changed, so the
figures did too:

1. `pnpm coreedge:registry` regenerates the registry JSON. Read its diff: each
   cell that moved names the code it rests on (`basis`).
2. `pnpm coreedge:figures` rewrites the gap study's tables and the parity
   scorecard JSON.
3. Explain each figure that moved in the text around its table (section 3.0 is
   the model). Figures quoted through blocks move by themselves; read the
   sentences around them, which may no longer be true. Re-quote any figure the
   running text of the other sections repeats. Commit all four files: the
   code, the registry JSON, the gap study and the scorecard JSON.

**A deploy failed at `--check-scorecard`.** The commit's scorecard JSON is not
what the simulator gives for it: the matrix or the registry changed without
`pnpm coreedge:figures`, which CI's `coreedge:check` would also have caught.
Run it and commit the result. If it names a missing file instead, a
`.vercelignore` rule dropped one of the three from the upload.

**Compare the page with CI.** On `/control-tower/parity`, the commit is the
deployment's (it equals `/api/build`'s `commit`), and the two sha256 digests
equal the ones the CI run for that commit printed in its step summary.

**A registry test failed on a `BROKER_FACTS` value.** The broker changed
something the registry declares (the read row limit, the write operations,
the northbound routes, the auth types, a default). Update the value in
`BROKER_FACTS`, regenerate as above, and check that each cell it feeds still
says something true.

**Raise a cell.** Build the capability. If it is then partial only for want of
evidence, add an `EVIDENCE` entry naming its tests and its document (the test
checks the paths exist), regenerate, and re-quote. Never raise a cell by
editing the JSON: the test compares it with what the registry builds.

**Model a roadmap item.** Add or edit a `cellUpgrades` entry in the phase where
the item lands in `docs/coreedge/gap-matrix.json` (with `items` and `reason`),
then `pnpm coreedge:figures`.

**Change an Integration Suite cell or a feasibility rule.** Edit
`docs/coreedge/gap-matrix.json`, citing the source from the gap study's
Appendix C in the cell's note, then `pnpm coreedge:figures`.

**The property test failed.** See "When the property test fails" in
`docs/runbooks/coreedge-governance-decision-table.md`.

## Rollback

The change adds files and a CI step, and moves CoreEdge's cells out of the
matrix. Reverting the commit restores the hand-rated matrix and the old
figures. There is nothing to undo in production.

The parity scorecard (P1.9) adds a page, a generated file, a build step and
three `.vercelignore` exceptions, and no migration or setting. Reverting it
removes the page and its rail entry; there is nothing to undo in production.

## Open decisions

Recorded in the gap study, section 9.3:

- **D13:** whether the extended model (six more targets, data products and
  binary media, five more consumer types) joins the headline figures. Its
  feasibility rules are [unverified] today.
- **D14:** three lifecycle stages no roadmap item takes to full
  (PERFORMANCE_TEST, SUPPORT_INCIDENT, RETIRE).
- **D15:** whether "full" should also need a recent live run.
