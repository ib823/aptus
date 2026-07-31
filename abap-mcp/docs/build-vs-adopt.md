# Build vs Adopt — the ADT "pipe" under abap-mcp

**Status:** decision paper for senior review. Not yet decided.
**Date of research:** 30 July 2026. Landscape is moving fast — re-check before
acting on this more than a quarter from now.
**Decision owner:** Ikmal, with a senior technical reviewer for the code read.

---

## The question

Our architecture separates a **pipe** (an ADT REST client that turns tool calls
into HTTPS requests) from **our value above the pipe** (playbooks, governance
pack, per-client profiles, installer, estimation linkage). v0.1 built our own
pipe in Python. Should we keep building it, or adopt a community/vendor server
underneath and put our layer on top?

## The finding that reframes it

**SAP now ships its own ADT MCP Server**, bundled free inside ABAP Development
Tools for Eclipse and ADT for VS Code — and separately, an **SAP S/4HANA Custom
Code Migration Agent** that does automated ATC execution, results analysis,
deterministic quick fixes, and AI-powered remediation over whole packages.

Sources: [ADT MCP Server (Eclipse)](https://help.sap.com/docs/abap-ai/generative-ai-in-abap-cloud/enabling-adt-mcp-server-6f6e72852b9746ffbe083d5a818fbbec) ·
[MCP Tools](https://help.sap.com/docs/abap-ai/generative-ai-in-abap-cloud/mcp-tools) ·
[Custom Code Migration Agent](https://help.sap.com/docs/abap-ai/generative-ai-in-abap-cloud/custom-code-migration-agent-1)

**The pipe is being commoditised by the vendor.** Every engineering hour we put
into our own ADT client is an hour on the one layer SAP is giving away. That
alone argues against "keep building our own" as the primary strategy.

It does **not** mean SAP's server is usable for us today — see below.

## Candidates assessed

| | ARC-1 | fr0ster | aibap.mcp | SAP ADT MCP | ours (v0.1) |
|---|---|---|---|---|---|
| Repo | arc-mcp/arc-1 | fr0ster/mcp-abap-adt | Hochfrequenz/aibap.mcp | (no repo) | this repo |
| Licence | **MIT** | **MIT** | **MIT** | proprietary | ours |
| Runtime | TS / Node ≥22 | TS / Node ≥22 | **Go, static binary** | Eclipse/VS Code plugin | Python |
| Latest release | 0.9.27 (2026-07-13) | 8.13.0 (2026-07-24) | GitHub releases | doc build 2026-07-15 | — |
| Read-only enforceable **server-side** | **✅ default; `SAP_ALLOW_*` opt-in** | ✅ `--exposition=readonly` | ⚠️ group toggles, writes **on** by default | **❌ client-side only** | ✅ by absence |
| Package write allow-list | ✅ `--allowed-packages` | ❌ | ❌ | ❌ | n/a |
| Source read / search | ✅ | ✅ | ✅ | **❌ not in the documented tool list** | ✅ |
| ATC | ✅ | ? | ✅ | ✅ + AI quick-fix | ✅ (now the real 4-step flow) |
| Syntax check | ✅ | ? | ✅ | ✅ | ✅ |
| SSO / SNC | ✅ Cloud Connector principal propagation | ❌ | ✅ OAuth2 + SAML | ✅ inherits IDE logon | ❌ basic only |
| ECC 6 EhP7 / NW 7.5x | **unverified** | claims BASIS < 7.50 | **✅ states "NetWeaver 7.40+"** | unstated | our target |
| Credential redaction in logs | ✅ documented | ❌ | ⚠️ | ? | n/a |
| Audit logging | ✅ 3 sinks + BTP Audit Log | ❌ | ⚠️ structured stderr | ? | ❌ |
| Bus factor | 2 | **1** | ~1 | vendor | 1 (us) |

Also reviewed and **rejected**: `mario-andreschak/*` (no ATC; basic auth only),
`YahorNovik/mcp-adt` (**README claims MIT but there is no LICENSE file in the
repo** — no rights granted; plus an ungated free-SQL tool),
`akhilp2020/ABAP-MCP-server` (repository not reachable; listed 23 July, gone by
30 July — a live demonstration of supply-chain risk).

Worth knowing, not a pipe: **ROSA** (MIT) wraps SAP's own
[Cloudification Repository](https://github.com/SAP/abap-atc-cr-cv-s4hc) so an
agent knows which objects are released for ABAP Cloud and what to substitute —
directly complementary to our playbooks, and not worth rebuilding.

## Recommendation (for review, not yet adopted)

**Hybrid, weighted toward adopt — in three parts:**

**1. Evaluate ARC-1 as the primary pipe.** It independently arrived at our own
design rule and made it the product: read-only by default, writes as positive
opt-ins, package-scoped writes, deny-lists, secret redaction, audit sinks, SBOM
and provenance. It has the ATC/syntax/where-used/dependency surface the
playbooks need, and the only real enterprise auth story in the field — which is
what lets us say "the agent acts as the named developer, under their SAP
authorisations" in a client security review.

**2. Keep our Python client, but demote it to a fallback adapter.** Two reasons
not to retire it: ARC-1's minimum SAP release is genuinely unverified and our
core market is ECC 6 EhP7 / NW 7.5x; and ARC-1 is 0.9.x with a two-person bus
factor and four months of history. Budget it as maintenance, not roadmap.

**3. Build the anti-corruption layer — this is the actual engineering
deliverable.** Define our own capability interface (`read_source`,
`search_objects`, `where_used`, `syntax_check`, `run_atc`,
`get_transport_objects`) and implement adapters behind it. Playbooks and
governance bind to the interface, never to a vendor's tool name. Days of work,
and it is what makes the pipe genuinely swappable. It keeps its value whichever
vendor wins.

**Why not SAP's server as the pipe today:** it needs a developer's Eclipse or
VS Code session (unusable headless or in a pipeline), has no server-side
read-only enforcement (only a client-side approval dialog), and its documented
tool list contains **no source-read or object-search tool** — startling for a
read-only remediation use case. Track it; do not build on it yet.

## Conditions that flip the decision

| Trigger | New position |
|---|---|
| PoC shows ARC-1 fails on ECC 6 EhP7 / NW 7.5x | Switch to **aibap.mcp** (states "NetWeaver 7.40+", single Go binary, OAuth2/SAML) or keep ours for ECC and ARC-1 for S/4 targets |
| ARC-1 goes quiet (>3 months, no release) | Fork at a known-good tag (MIT permits it) or fall back to aibap.mcp / erpl-adt (Apache-2.0) |
| Clients standardise on SAP Joule + the ADT MCP Server | Reposition our playbooks as skills/instructions **on top of** SAP's server rather than a competing pipe |
| Node.js vetoed by a client platform team | aibap.mcp (static Go binary, no runtime) becomes primary |
| SAP's Custom Code Migration Agent proves effective on real brownfield estates | Stop competing on remediation mechanics; move up-stack to scoping, decommissioning analysis, prioritisation, governance and sign-off — the parts SAP's agent explicitly leaves to the customer |

## Governance risk we had not raised: the SAP API Policy

Two independent community projects put an explicit warning in their README
about driving ADT REST programmatically. aibap.mcp, verbatim:

> "**Obey SAP API Guidelines.** … **You must not use this MCP server for
> purposes outside the intended scope of the ADT API as a development tooling
> framework.** Specifically… not intended for programmatic reading of
> application tables or export of business data, SQL execution against SAP
> backend systems, business data integration or runtime orchestration…"

The [SAP API Policy](https://help.sap.com/doc/sap-api-policy/latest/en-US/API_Policy_latest.pdf)
is live and downloadable. **We have not read its clauses.**

Commercial consequence: if a client's SAP account executive raises the API
Policy during a licence conversation, "we wrote our own client" is a weaker
position than "we use a server whose documented design constraint is
development-tooling-only, no data extraction, writes disabled by construction."
**Adopting a server with a published, auditable safety posture is a risk-
transfer and evidence artefact, not just an engineering shortcut.**

→ **Action: have counsel read the API Policy before the next SOW.** This
belongs on the open-items list regardless of the build-vs-adopt outcome.

---

## What the senior reviewer must check before we adopt anything

**Licence and IP**
1. Fetch and archive the actual `LICENSE` file **at the exact commit/tag we
   pin** — not the GitHub sidebar, not npm metadata, not a README sentence.
   (The YahorNovik case is precisely this failure.)
2. Transitive dependency licence scan. MIT at the top says nothing about depth.
   **Check the `@sap/*` packages specifically** — SAP's npm modules are often
   under the SAP Developer Licence, not MIT/Apache, with redistribution
   restrictions relevant to a consulting deliverable.
3. Decide and write into the SOW whether we **ship** the server to clients
   (distribution → MIT notice obligations travel with it) or run it inside our
   own delivery environment (internal use → effectively none).

**Credential handling — read the code, not the README**
4. Grep every place credentials are read, held and passed: env, file, HTTP
   header, CLI arg. **CLI args are visible in `ps`; HTTP headers land in proxy
   logs** — fr0ster accepts `x-sap-login` / `x-sap-password` as request headers.
5. Verify redaction **empirically**: run at debug log level against a throwaway
   system with a distinctive password, then grep every sink for it.
6. Confirm TLS verification is on by default; locate the escape hatch
   (`TLS_REJECT_UNAUTHORIZED`, `verify_ssl=false`, `InsecureSkipVerify`) and ban
   it by policy outside sandboxes.

**Data exfiltration surface**
7. Confirm no ABAP source, table rows or object names leave the process except
   to the MCP host. `grep -rn "https://"` for non-SAP hosts; check for any
   analytics/Sentry/OTLP client.
8. Establish the telemetry default and how consent is expressed.
9. **Deliberately test the free-SQL and table-preview paths.** Confirm they are
   off by default and that turning them off is server-side, not "we didn't
   register the tool in the host config". Under the SAP API Policy these are the
   highest-risk tools in the whole surface.

**Read-only by construction — prove it, don't read it**
10. Adversarial test: with all safety flags unset, attempt write, lock,
    activate, transport-create and transport-release. **Confirm refusal happens
    in the server with an audit event**, not in the host's approval dialog.
11. Confirm no "universal"/passthrough/raw-request tool bypasses the safety
    chain, and that read-only cannot be flipped by tool *arguments* (only by
    process-level env/CLI) — otherwise a prompt-injected agent can escalate.
12. Keep the SAP-side lock as the primary boundary regardless: `S_DEVELOP`
    ACTVT 03 only, no `S_TRANSPRT`. Server-side read-only is the second lock.

**Injection blast radius**
13. Grep for `exec`, `spawn`, `child_process`, `eval`, `subprocess`.
14. **Treat retrieved ABAP source as untrusted input.** A comment in a client's
    Z-program can carry instructions. Our governance layer must not let a tool
    be invoked purely on the strength of retrieved content.

**Release coverage — the check that actually decides this**
15. **Run the capability matrix against a real ECC 6 EhP7 / NW 7.5x sandbox
    before committing.** Object search, source read (PROG/CLAS/FUGR/INCL),
    where-used, syntax check, ATC run + result retrieval, package tree. Record
    which endpoints 404 or return a different XML shape.
    → `scripts/adt_probe.py` in this repo already does exactly this for our own
    client. Run it first; it gives the baseline to compare any candidate against.

**Operational**
16. Pin an exact version and hash. Never `@latest` — fr0ster shipped 128 npm
    versions in 7 months, ARC-1 51 in 4.
17. Mirror the artefact internally so a repo deletion cannot break a live
    engagement. (akhilp2020's repo disappearing within a week of being listed is
    this failure mode, observed live during this research.)
18. Read the last ~50 commits and the open issues for responsiveness and
    unresolved security items.

---

## Provenance

Licences, npm publish dates, tool lists and safety-flag documentation were read
from primary sources (raw `LICENSE` files, npm registry, SAP Help Portal).
GitHub commit dates, contributor counts and star counts could not be verified
via the GitHub API from the research environment and are second-hand — they do
not carry weight in the recommendation. ARC-1's minimum SAP release, and the
question of whether SAP's ADT MCP Server has an undocumented source-read tool,
are both **unverified and both material** — resolve them in the PoC.
