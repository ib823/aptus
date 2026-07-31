# PROJECT BRIEF — abap-mcp (ABAP Remediation Toolkit)

Purpose of this file: drop it in the Cowork project folder alongside the
code so any new session starts with full context. It records what was
decided and why, not just what exists.

**Last updated: 30 July 2026.**

## What this is

A proprietary toolkit for AI-accelerated ABAP custom-code remediation on
brownfield S/4HANA conversions and upgrades, usable across many client
engagements. Owner: Ikmal. Status: **v0.2 — offline-tested, still unvalidated
against a live system.**

## Architecture decisions (settled — don't relitigate without new facts)

1. External MCP server over ADT REST APIs; zero footprint in client
   systems. Native-ABAP SDK and RFC routes rejected (client change
   management; PyRFC/node-rfc archived by SAP).
2. Read-only by construction. Write/transport tools are a later, gated
   phase. Permanent rule: AI proposes, humans review and transport.
3. Real security boundary is the SAP service user's display-only
   authorizations (S_ADT, S_DEVELOP ACTVT 03, ATC display) — the MCP
   tool list is convenience, not enforcement.
4. Hybrid sourcing strategy: evaluate mature community servers as plumbing
   alongside our scaffold — internal use imposes no open-source obligations.
   Our proprietary value sits ABOVE the pipe: playbooks, governance pack,
   per-client profiles, installer, estimation linkage. Swap pipes freely.
   **See `docs/build-vs-adopt.md` — this now has a researched recommendation.**
5. Honest scope: accelerates the mechanical majority of remediation;
   functional-judgment findings escalate to humans. SUM/DMO untouched. SDT
   engine work is partner territory (DMLT/SNP/cbs); we may later build only an
   SDT *support* shell, which carries a higher data-governance bar.

## Repo contents (abap-mcp/)

- `src/abap_mcp/` — FastMCP server (9 read-only tools), ADT client, parsers
- `tests/` — 73 offline tests: parsers over fixture XML from two release
  generations, ADT protocol against a mocked service, the tool layer, and a
  regression file with one test per defect found in adversarial review
- `scripts/adt_probe.py` — captures raw ADT responses from a sandbox, layer by
  layer, so parsers get fixed against real bytes
- `profiles/` — per-client YAML; creds via env vars only; gitignored
- `playbooks/` — konv-prcd-elements, matnr-field-length, vbuk-vbup-vbfa,
  open-sql-strict-mode. Each has a **Provenance** section separating
  SAP-verified facts from our engineering judgment
- `docs/team-testing-guide.md` — diagram, install, 10-step probe + agent smoke
  test, troubleshooting table
- `docs/client-onboarding-checklist.md` — governance-first onboarding
- `docs/build-vs-adopt.md` — MCP server landscape assessment + recommendation
- `docs/team-validation-email.md` — two ready-to-send drafts

## What v0.2 fixed

- **The ATC tool in v0.1 could not have worked.** It used a single-shot POST.
  The real ADT flow is `POST /atc/worklists?checkVariant=` (worklist id comes
  back as **plain text**) → `POST /atc/runs?worklistId=` → `GET
  /atc/worklists/{id}`. The `worklistId` parameter carries the **id, not the
  variant** — a widely-used community library misnames it at that call site,
  which is how the error propagates.
- Added `abap_syntax_check` (`/checkruns`) with a media-type fallback,
  `abap_check_connection`, and `abap_get_object_metadata`.
- Parsers match by **namespace URI**, not prefix. ADT declares namespaces on
  descendants; prefix matching silently returns zero findings.
- `atcfinding:location` handled in both shapes: source URI with `#start=`
  (NW 7.5x) and verdict URI with no position at all (S/4HANA 2022+).
- Release-dependent attributes treated as optional throughout.

## Defects found by adversarial review and fixed (keep this discipline)

Both the code and the playbooks were adversarially reviewed before delivery.
The reviews were worth more than the original drafts:

- **Silent false negatives.** An unrecognised 200 response parsed fine, matched
  nothing, and was reported as `clean: true` / zero findings / zero hits. On a
  release whose checkrun schema differs, the tool would have told a consultant
  an object was syntactically clean while it had errors. Parsers now assert the
  document shape and refuse to summarise what they do not recognise.
- **XML injection through tool input.** A crafted object URI injected elements
  into request bodies — including `chkrun:artifacts`, i.e. the read-only
  guarantee was bypassable from tool arguments. URIs are now validated and
  escaped.
- **A 403 authorization failure was misdiagnosed as a CSRF problem**, sending
  the operator to SICF for what was an S_DEVELOP issue, with the real response
  body discarded.
- **Nested ATC objects double-counted findings** — the numbers that feed the
  playbooks' effort estimates.
- **Non-ASCII ABAP source was silently corrupted** when the response had no
  charset, then handed to the model as if it were the real code.
- **Playbook: the strict-mode trigger rule was wrong.** An earlier draft claimed
  `@` drags a statement into the 7.50 "INTO must be last" rule. Strict modes are
  graded per release; it does not. Stated confidently to a 20-year ABAP
  reviewer, that one sentence would have cost the tool its credibility.
- **Playbook: `LFSTK` does not exist in `LIKP`** — a snippet that would not
  compile, in the very playbook that warns against trusting field lists.

**Every SAP Note number in all four playbooks was independently verified. None
was wrong.** The errors were all in technical claims and code, not citations —
which is where to keep looking.

## Known weak points (be upfront with the team)

- **Nothing has met a live SAP system yet.** Fixtures are reconstructed from
  documented/observed response shapes, not from the client's release.
- Basic auth only; no SSO/SNC/JWT.
- Where-used / dependency analysis and DDIC/CDS source retrieval not built.
- The ATC flow is correct according to two independent open-source clients.
  That is not the same as correct against a specific release.

## Open items / next actions

1. **Run `scripts/adt_probe.py` against the sandbox.** This is now the single
   highest-value hour available. Every failure it finds becomes a fixture and a
   test. Everything else waits on it.
2. Send the team validation email — `docs/team-validation-email.md`, Draft A
   first. Fill bracketed names/dates. Audience: 20+ yr ABAP veterans; frame as
   them falsifying the tool.
3. Basis setup on sandbox: service user + SICF `/sap/bc/adt` + HTTPS.
4. **Senior review of `docs/build-vs-adopt.md`** → build-vs-adopt decision for
   the pipe. The paper recommends evaluating ARC-1 (MIT, read-only by default,
   real SSO story) as the primary pipe, keeping our Python client as an
   ECC-era fallback, and building an anti-corruption layer so playbooks never
   bind to a vendor's tool names.
5. **NEW: have counsel read the [SAP API Policy](https://help.sap.com/doc/sap-api-policy/latest/en-US/API_Policy_latest.pdf)
   before the next SOW.** Two independent community projects put explicit
   warnings in their READMEs about driving ADT REST programmatically ("not
   intended for programmatic reading of application tables or export of
   business data"). We have not read the clauses. This is a commercial risk
   item, not just a technical one.
6. IP ownership: personal vs ABeam — clarify in writing before client use
   (built on whose time; deployed on whose engagements).
7. **NEW: SAP now ships its own ADT MCP Server (free, inside Eclipse/VS Code)
   and a Custom Code Migration Agent** doing automated ATC + AI remediation.
   The pipe is being commoditised by the vendor. This does not invalidate the
   toolkit — our value is the playbooks and governance — but it should shape
   how the offering is positioned, and it will come up in any senior review.
   Details in `docs/build-vs-adopt.md`.
8. Roadmap after validation: where-used analysis, more playbooks, one-command
   installer, SI/readiness-check readers, ABAP Unit via ADT, SUM-log analyzer.
9. Never claim in any deck: "automated conversion/remediation" or any SDT
   execution capability. Defensible: "AI-accelerated, human-reviewed."

## Playbook discipline (applies to every new playbook)

Each playbook must carry a **Provenance** section splitting:
- SAP-verified (cite freely, with the note number and source URL)
- Secondary-sourced (verify in-system before client use)
- Our engineering judgment (never present as "SAP says")

A wrong SAP Note number in a client deliverable costs more credibility than a
missing playbook. Verified during this research: **SAP Note 2213569 is NOT the
MATNR note** — it belongs to `S4TWL - Classification`, and it is widely
mis-cited in blog posts. The MATNR notes are 2267140 (business impact) and
2215852 / 2215424 (custom code).
