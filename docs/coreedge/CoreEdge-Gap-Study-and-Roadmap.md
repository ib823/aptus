# CoreEdge Gap Study and Roadmap

| | |
|---|---|
| Date | 20 October 2026 |
| Code baseline | `main` at `33d0ef86`, which includes audit batch 2 (#306) and is deployed to production at https://ab-workbench.vercel.app |
| In-flight work | Branch `custom-service-path` (head `eeb711bf` after four review rounds: commits `a4dd83d9`, `9ed76ba4`, then the review fixes `bbc9b3c0`, `ac7501b1`, `6c68d996` and `eeb711bf`), based directly on `33d0ef86`, was merged as PR #307 together with this document and is in production. Where P1.1 (section 8.3) and section 9.2 cite `bbc9b3c0` as the head or give 41 files, they describe the branch before the last review rounds. |
| Delivered since the baseline | P1.1 (#307); Phase 0a (#308: P0.7, P0.9's hosts and Basic warning, P0.10, P0.12, P0.18); Phase 0b wave 1a (PR #310: P0.1, P0.5, P0.11, P0.13); P0.15; P0.16. Each of those items in section 8 carries a **Status** line: what shipped, and the default of any setting that switches it. The problem statements in section 8 describe the code at `33d0ef86` and are kept as written. The governance bullets of section 1.1, the steps of section 1.5, the "CoreEdge today" columns of section 4 and the "Today" column of section 6 were brought up to date in P0.16, citing paths without line numbers. |
| Companion data | **In the repository.** The matrix is `docs/coreedge/gap-matrix.json`. It holds the dimensions, the SAP-feasibility tables, Integration Suite's cells (each with a note), the extended model (section 3.11) and each roadmap phase's `cellUpgrades`, listing the items that deliver each upgrade and why. **CoreEdge's cells are generated from the code** (P0.15): `src/lib/coreedge/capability-registry.ts` writes `docs/coreedge/capability-registry.json` (`pnpm coreedge:registry`). The simulator is `scripts/coreedge/simulate-gap-matrix.mjs` (add `--json` for the full results), and `pnpm coreedge:figures` rewrites every simulated table in this document from its output. CI fails when the registry JSON or any of those tables is stale, or when the prose of sections 1 and 3 types a coverage figure outside a generated block (`pnpm coreedge:check`). Every coverage count, percentage, lifecycle count and blocker ranking in sections 1-3, 8 and Appendix B is this output, marked **[simulated]**. See Appendix B. |
| Readers | The product owner (not from an SAP background) and the engineers who will build CoreEdge |
| Status | Research and plan. No code was changed to produce the first version. Since P0.15 the simulated figures are regenerated from the code; section 3.0 explains how they differ from the first version. |

**How to read the evidence**
- `path:line` means code on `main` at `33d0ef86`.
- `[E#]` refers to an external source listed in Appendix C.
- `[R#]` refers to the earlier internal research files listed in Appendix C.
- **[unverified]** means the claim was not checked against a primary source or not run against a live system.
- **[estimate]** means engineering judgement, not measurement.
- **[inferred]** means derived from other numbers, not read directly.
- **[simulated]** means output of `scripts/coreedge/simulate-gap-matrix.mjs` on `docs/coreedge/gap-matrix.json` and the code-generated `docs/coreedge/capability-registry.json`, as committed with this document. It is reproducible and CI-checked, but it is still a model of the code, not a live measurement.

**About the names.** The product owner uses Workbench, Aptus and CoreEdge for the same thing. In the code they are separate screens that share one engine:
- the Workbench "SAP Operations" explorer (`/sap-explorer`, `/api/sap/tdd/*`);
- Developer Studio (`/studio`);
- the northbound API (`/api/northbound/*`);
- the Operations Center (`/operations`);
- the Control Tower (`/control-tower`);
- the `/coreedge` board.

All of them use `src/lib/sap-public/*`. This document uses **CoreEdge** for the whole product.

---

## 1. Executive summary

### 1.1 Where CoreEdge stands, in numbers

We built every combination of eight dimensions: SAP system, technology, integration pattern, who built the API, network, SAP login method, consumer type and consumer login method. That gives <!-- figures:begin value-permutations -->1,119,744<!-- figures:end value-permutations --> permutations. Of these, <!-- figures:begin value-valid -->497,340<!-- figures:end value-valid --> are things SAP itself makes possible; these are the **valid scenarios**. We then scored each valid scenario for SAP Integration Suite and for CoreEdge (section 2 explains the method). CoreEdge's scores come from the code itself, through the capability registry (P0.15), for the hosted instance. Every figure in this section is **[simulated]** and regenerated in CI (Appendix B); section 3.0 explains how the figures differ from this document's first version.

<!-- figures:begin headline -->
| Measure | SAP Integration Suite | CoreEdge today (hosted) | CoreEdge after the whole roadmap (P6) |
|---|---|---|---|
| Valid scenarios fully supported | 133,875 (26.9%) | 0 (0.0%) | 30,360 (6.1%) |
| Valid scenarios at least partly supported | 466,725 (93.8%) | 1,512 (0.3%) | 265,599 (53.4%) |
| AI-agent consumers, fully supported | 14.3% | 0.0% | 7.3%, only if P6.1 clears SAP API Policy §2.2.2 (D2) |
| Lifecycle stages rated "full", out of 18 | 5 | 1 | 15 |
<!-- figures:end headline -->

Integration Suite is scored full for AI agents on the MCP Gateway path that SAP endorses (section 3.7). The 18 lifecycle stages include five that P0.15 added (section 3.8); three of them no roadmap item takes to full (D14).

**What the numbers mean**
- **Today CoreEdge handles one narrow shape of integration, and handles it well.** An approved program can read the first 100 rows or fewer of one OData API, SAP-published or customer-built (P1.1), on an SAP system reachable over the internet, or create one record in it (create works in code but has not been verified live, for V2 or V4; P1.8). Every other shape of integration is out of reach (section 3).
- **On governance design it is already stronger than Integration Suite.** The P0 fixes for its known holes have shipped behind lenient defaults that an operator switches on (P0.1, P0.12; section 1.5), and one hole is left for P3 (P3.10):
  - a second person must approve every access grant, and the approver passes a passkey step-up (P0.12; `COREEDGE_STEP_UP` defaults to `warn`, which records a missing step-up and lets the action go ahead);
  - every grant has a mandatory end date, checked on every call, and is bound to one interface and SAP product (P0.1; `COREEDGE_GRANT_BINDING` defaults to `legacy` until the backfill check is clean);
  - a key issued for one environment can never reach another;
  - creates are idempotent (a retried create cannot make a duplicate);
  - every broker call, including refusals, attempts an audit row. Broker audit writes are not yet fail-closed: a failed insert is logged and swallowed, even after a successful SAP create (P3.10). The Workbench write-back writes a `PlatformAuditEvent` before SAP is called, and refuses the write when it cannot record one (P0.7).
- **On breadth, the roadmap takes partial support most of the way, but full support only part of the way.** An earlier draft quoted <!-- figures:historical begin -->3.3% full and 14.8% partial<!-- figures:historical end --> after Phase 6 and concluded that the roadmap barely moves breadth. That draft used phase upgrades that missed many cells the roadmap items deliver. For example, SAP_STANDARD origin was never upgraded although P0.8 and P1.1-P1.4 fix exactly its limits. With every phase's upgrades tied to named items, the conclusion changes:
  - <!-- figures:begin breadth-partial -->**Partial support:** 0.3% today, 5.7% after Phase 4, 33.0% after Phase 5 (new protocols and patterns), 53.4% after Phase 6 (user-delegated login and principal propagation). That is more than half of the valid scenarios, against Integration Suite's 93.8%. So the "barely moves breadth" reading no longer holds for partial support.<!-- figures:end breadth-partial -->
  - <!-- figures:begin breadth-full -->**Full support:** 6.1% after Phase 6, under a quarter of Integration Suite's 26.9%. So for full support it still largely holds.<!-- figures:end breadth-full -->
  - **Why full support stays low:** a single partial cell holds a scenario below full (the min rule), and after Phase 6 some cells are still below full. These are SAML bearer and principal propagation toward RISE, on-premise S/4 and ECC; consumer mTLS, which no roadmap item credits; user-delegated login for most consumer types; and IDoc, file and B2B support (section 3.9).
  - **CoreEdge should not chase Integration Suite's breadth.** Integration Suite has about 75 named adapters and ten years of B2B/EDI work. The earlier hand estimate of <!-- figures:historical begin -->30-45% full after Phase 5<!-- figures:historical end --> is **not** supported: the simulator gives <!-- figures:begin value-full-P5 -->4.9%<!-- figures:end value-full-P5 -->. It should not be repeated.
- **On the developer and governance lifecycle, CoreEdge can lead.** After Phase 3, CoreEdge is rated full on <!-- figures:begin value-lifecycle-P3 -->12<!-- figures:end value-lifecycle-P3 --> of <!-- figures:begin value-lifecycle-stages -->18<!-- figures:end value-lifecycle-stages --> lifecycle stages [simulated], against Integration Suite's <!-- figures:begin value-lifecycle-IS -->5<!-- figures:end value-lifecycle-IS -->. That is where "the improved and innovative version of Integration Suite" is realistic: testing before code, contracts and SDKs in every language including ABAP, governance of the connected program before and after it ships, AI agents under the same controls, and continuous proof.
- **B2B/EDI: pair with Integration Suite, or build it natively? This is open decision D3 for the product owner.** The recommendation is to pair: CoreEdge calls Integration Suite as a governed backend for B2B/EDI and the long tail of adapters (P5.10). The trade-off, measured on the simulator:
  - <!-- figures:begin b2b-pairing -->Pairing already takes the B2B_EDI pattern (43,992 valid scenarios, 8.8%) to 63.8% partial after Phase 6, with 0.0% full.<!-- figures:end b2b-pairing -->
  - <!-- figures:begin b2b-native -->Making the B2B pattern natively full for every technology SAP allows (SOAP, REST, IDoc, files) would add 1,500 fully supported scenarios: +0.3 points, from 6.1% to 6.4%, with the B2B row at 3.4% full. The gain is small because the IDoc and file cells it rides on are still partial.<!-- figures:end b2b-native -->
  - <!-- figures:begin b2b-native-adapters -->Making the IDoc and file adapters full on every target as well would add 6,060 in total: +1.2 points, to 7.3%. That takes the B2B row to 13.8% full, against Integration Suite's 12.5%.<!-- figures:end b2b-native-adapters --> All of the gain is B2B scenarios.
  - <!-- figures:begin b2b-partial -->The first variant leaves the partial figure at 53.4%. The second raises it to 55.3% (274,914), because it also makes IDoc and file cells full that no phase credits.<!-- figures:end b2b-partial --> Among them are IDoc on Ariba and BTP services.
  - So native B2B/EDI (Trading Partner Management, Integration Advisor, AS2, AS4, OFTP2) would buy at most about one point of full coverage. Appendix B shows how to recompute this.

### 1.2 North star

Any developer can make a first working call within 30 minutes. That means ABAP (cloud or on-premise), JS/TS, Python, Java, .NET, low-code or an AI agent. The first call goes to a **Tenant Twin**, a simulated copy of the developer's own SAP system built from SAP's service description. The developer:
1. tests it like Postman before writing code;
2. ships through a CI gate that checks the generated client exposes only approved operations, flags raw calls and token literals, and runs the contract suites, while the runtime refuses any call outside the manifest (P3.1, P3.2);
3. from then on, sends every real call through one governed pipeline.

That pipeline gives every call a known owner and approver, declared limits, a one-click stop and an audit record, on any network, for OData, SOAP, REST, RFC/BAPI, IDoc, files and events. B2B/EDI and message brokers are reached through Integration Suite or the broker, used as a governed backend (P5.10).

**Integration Suite moves messages. CoreEdge decides who may call what, contains it and proves it.**

### 1.3 "Seamless", measured

The product owner asked for CoreEdge to be seamless. This document makes that a set of tests that pass or fail (full list in Appendix A.3):

| Test | Target |
|---|---|
| Time to first call, against the twin, self-service | 30 minutes or less (60 for ABAP on-premise) |
| Time to first real call, against a DEV system, from submitting the grant request (approver wait and SAP set-up included) | 1 business day or less, median |
| A customer-built `Z*`/`YY1_*` OData service | Registered, verified, tested, called and audited with no code change |
| "Postman before code" | A newcomer builds, asserts and saves a 3-step collection in under 10 minutes |
| Governed before commit | `coreedge verify` and `can-i-deploy` fail CI on an undeclared operation in the generated client, a raw call to CoreEdge (TS and Python lint), a missing grant or a token in code, with no secret stored in CI; the runtime refuses any call outside the manifest |
| Every language | TS, Python, Java, .NET and ABAP SDKs pass one shared conformance script |
| Containment | A stop switch halts <!-- figures:not-simulated begin -->100%<!-- figures:not-simulated end --> of matching calls within 5 seconds |
| No side doors | A static test proves every route that reaches SAP is governed and audited |
| Self-host | `docker compose up` reaches a first governed call in 15 minutes or less |
| SAP upgrades | A breaking change on the TEST system is flagged, naming the affected apps, before PROD is upgraded |
| Reliable | Published availability and latency objectives are met and load-tested before each phase exit (A.3 #14) |

### 1.4 Phases at a glance

Durations are **[estimate]** and assume 3-4 engineers; P0 and P1 were re-estimated from the size key and their dependency chains (section 8.1). Coverage numbers and lifecycle counts are **[simulated]**. Each phase applies its own `cellUpgrades` from `docs/coreedge/gap-matrix.json` on top of all earlier phases (section 8.1). The two figure columns below are rewritten by `pnpm coreedge:figures`; lifecycle counts are out of 18 (section 3.8).

<!-- figures:begin phases-glance -->
| Phase | Goal | Duration | Full / partial after | Lifecycle stages full | Headline outcome |
|---|---|---|---|---|---|
| Today |  |  | 0.0% / 0.3% | 1 |  |
| P0 Harden | Land `custom-service-path` first (P1.1, landed in #307); make what exists trustworthy: close the 33 open audit findings, add KMS, MFA step-up, onboarding, a release protocol and job leases, extract the pipeline, drive the simulator from the code | 9-12 weeks, as P0a (credential gate, 3-4 weeks) then P0b | 0.0% / 0.3% | 2 | Safe to hold real client credentials after P0a |
| P1 Any OData API | Customer-built APIs, contracts compiled from SAP's service description, filter/key/paging, Tenant Twin | 12-14 weeks | 0.0% / 0.3% | 3 | `Z*` APIs callable; build before SAP is configured |
| P2 Every developer | API Lab ("Postman for SAP"), full OData writes, SDKs (TS, Python, Java, .NET, ABAP), low-code connector, Studio MCP | 10-12 weeks | 0.1% / 1.3% | 4 | 30-minute first call |
| P3 Govern as code | App manifest, CLI, CI identity, promotion gates, policy engine, stop switches, monitors, upgrade radar, outbound routes, tamper-evident audit | 10-12 weeks | 0.1% / 1.6% | 12 | The connected program is governed before and after it ships |
| P4 Any landscape | Transport layer, outbound-only connector for RISE/on-premise/ECC, X.509, self-host package, staff SSO | 12-14 weeks | 1.5% / 5.7% | 13 | Private SAP systems reachable |
| P5 Every protocol | Adapter SDK, SOAP, REST, RFC/BAPI, IDoc, files, events/webhooks, durable runtime, mapping, flows, bulk, Integration Suite as backend | 16-20 weeks | 4.9% / 33.0% | 14 | Beyond OData |
| P6 AI-native and provable | Runtime MCP for agents, copilot, anomaly detection, evidence vault, acting-for and consent, Digital Access estimator | 10-12 weeks | 6.1% / 53.4% | 15 | Agents governed; continuous evidence |
<!-- figures:end phases-glance -->

### 1.5 What to do first

1. **Verify `custom-service-path` live** (P1.1). It was merged as PR #307, ahead of P0.1 as planned, and is in production. No `Z*` or `YY1_*` call has been recorded against a live tenant yet, so the live check on the X5M lab with one `YY1_*` and one `Z*` service is still owed (P1.1 Status, section 8.3). It removed the largest blocker that could be closed in a single merge, and the one ABAP teams hit first: <!-- figures:historical begin -->66.5% of valid scenarios (330,840) were held at zero because the API was built by the customer or a partner. On the first version's matrix it lifted partial coverage from 0.2% to 0.8%<!-- figures:historical end -->; with the hosted instance's network scored as it is (caveat 4), the registry measures <!-- figures:begin value-partial-Today -->0.3%<!-- figures:end value-partial-Today --> with it in place (section 3.0). The synchronous-only, OData-only and static-key blockers still apply. It scopes grants per path (`custom:<path>`); since P0.1 a grant is also bound to one interface and SAP product, which closes the cross-product gap (A47).
2. **Before any real client credential is stored, switch on what Phase 0a built.** Each item shipped in #308 with a default that changes nothing for current users; the operator steps are in the runbooks named:
   - envelope encryption (P0.10): set `SAP_CONNECTION_ENCRYPTION_KEYS` and `SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY`, reseal the stored secrets and run the restore drill (`docs/coreedge/SAP-CONNECTION-KEYSTONE-RUNBOOK.md`, `docs/coreedge/SAP-KEY-RESTORE-DRILL.md`). Until the active key is set, secrets are sealed with the single legacy key, as before. Which cloud KMS to plug in is still an open decision (P0.10 Status);
   - passkey step-up on approve, issue and revoke (P0.12): move `COREEDGE_STEP_UP` from `warn` to `enforce` once seven days pass with no approver acting without a passkey (`docs/runbooks/coreedge-step-up.md`);
   - the Workbench write-back audit (P0.7) needs no setting. Confirm that `S4_TDD_WRITE_ENABLED` is unset in production unless the write-back is wanted there (`docs/runbooks/sap-workbench-write-back.md`);
   - the deployment tenants' host check (P0.14b): run `pnpm coreedge:env-tenant-hosts` with production's variables, add any customer domain to `SAP_HOST_ALLOWLIST_EXTRA`, then move `COREEDGE_ENV_TENANT_HOSTS` from `observe` to `enforce` (`docs/runbooks/coreedge-console-pipeline.md`);
   - the console's grant check (P0.14b): review the console reads recorded with `ceilingWouldRefuse`, then move `COREEDGE_CONSOLE_GRANTS` from `observe` to `enforce` (`docs/runbooks/coreedge-console-pipeline.md`).

   Until then, the shared production host must not hold real SAP credentials. It also holds third-party client data [R1 §1].
3. **Switch on the governance fixes, then close the rest.** P0.1 fixed grants not bound to an interface (A47), activation gates that could be bypassed (A46) and departed owners still counting as owners (A69). Move `COREEDGE_GRANT_BINDING` from `legacy` to `strict` once `pnpm grants:binding --check` exits 0 (`docs/runbooks/coreedge-grant-binding.md`), and `TENANT_SCOPE_GUARD` to `throw` after seven clean days (`docs/runbooks/coreedge-step-up.md`). P0.2 made the lane board answer from the broker's own authorisation predicate, so a lane drawn Live is one the broker serves.
4. **Extract the governed pipeline** (P0.14). The simulator work is done (P0.15): CoreEdge's cells are generated from the code, CI regenerates and checks every simulated figure in this document, and a property test checks the broker's governance decision against the written rules on every pull request.
5. **Product owner decisions** (section 9.3):
   - the licence for distributed SDKs, CLI and connector;
   - a legal reading of SAP API Policy §1.2 and §2.2.2;
   - "pair with Integration Suite" as the breadth strategy (D3). Native B2B/EDI would add 0.3 to 1.2 points of full coverage after Phase 6 (section 1.1);
   - the first customer landscape, which sets Phase 4's priority.

---

## 2. How the gap was measured

All counts and percentages in sections 2 and 3 are **[simulated]**: the output of `node scripts/coreedge/simulate-gap-matrix.mjs --json` on `docs/coreedge/gap-matrix.json` and `docs/coreedge/capability-registry.json`. Every Integration Suite cell and feasibility rule can be read in the matrix, and every CoreEdge cell in the registry JSON; each cell carries a note with its evidence, and each CoreEdge cell also the code it rests on (`basis`). The internal sums reconcile: 9 × 8 × 8 × 3 × 3 × 6 × 9 × 4 = 1,119,744, and the per-target, per-tech, per-pattern, per-origin and per-network valid counts each add up to 497,340. The simulator reports any missing or unknown cell under `problems`, and that list is empty today.

### 2.1 The eight dimensions

A **scenario** is one value from each of the eight dimensions below (definitions in Appendix A.1).

| # | Dimension | Values | Count |
|---|---|---|---|
| 1 | Target SAP system (`target`) | S4_PUBLIC, S4_PRIVATE_RISE, S4_ONPREM, ECC, SUCCESSFACTORS, ARIBA, CONCUR, BTP_SERVICE, NON_SAP_SAAS | 9 |
| 2 | Technology (`tech`) | ODATA_V2, ODATA_V4, SOAP, REST, RFC_BAPI, IDOC, EVENTS, FILE_SFTP | 8 |
| 3 | Integration pattern (`pattern`) | SYNC_READ, SYNC_CREATE, SYNC_UPDATE_DELETE_ACTION, SAP_CALLS_OUT, A2A_FLOW_WITH_MAPPING, BULK_BATCH, EVENT_TO_APP, B2B_EDI | 8 |
| 4 | Who built the API (`origin`) | SAP_STANDARD, CUSTOMER_CUSTOM, PARTNER | 3 |
| 5 | Network position (`network`) | PUBLIC_INTERNET, SAP_SIDE_IP_ALLOWLIST, PRIVATE_NETWORK | 3 |
| 6 | Login method to SAP (`sapAuth`) | BASIC, OAUTH_CLIENT_CREDENTIALS, OAUTH_SAML_BEARER, X509_MTLS, PRINCIPAL_PROPAGATION, API_KEY | 6 |
| 7 | Consumer type (`consumer`) | JS_TS, PYTHON, JAVA, DOTNET, ABAP_ONPREM, ABAP_CLOUD, LOW_CODE, AI_AGENT, HUMAN_TESTER | 9 |
| 8 | Consumer login method to CoreEdge (`consumerAuth`) | STATIC_BEARER, OAUTH_CLIENT_CREDENTIALS, MTLS, USER_DELEGATED_OIDC | 4 |

9 × 8 × 8 × 3 × 3 × 6 × 9 × 4 = **1,119,744 permutations**. The values are read from `dimensions` in `docs/coreedge/gap-matrix.json`, which also lists the 18 lifecycle stages. Two more dimensions are scored apart from these permutations: where CoreEdge runs (hosting, section 3.10) and the extended model's added values (section 3.11).

### 2.2 The SAP-feasibility rule

A permutation is **valid** only if SAP itself makes it possible, whatever middleware is used. Examples: there is no IDoc on SuccessFactors, no RFC on Ariba, and no customer-controlled private network for a SaaS product. The SAP-side dimensions decide validity. The consumer side does not: every consumer type has exactly 55,260 valid scenarios, which is 497,340 / 9.

| Target | Valid scenarios |
|---|---|
| S4_PUBLIC | 50,760 |
| S4_PRIVATE_RISE, S4_ONPREM, ECC | 76,140 each |
| SUCCESSFACTORS | 30,240 |
| ARIBA | 24,192 |
| CONCUR | 4,320 |
| BTP_SERVICE | 91,368 |
| NON_SAP_SAAS | 68,040 |
| **Total** | **497,340 (44.4% of permutations)** |

By origin: SAP_STANDARD 166,500; CUSTOMER_CUSTOM 164,340; PARTNER 166,500. By network: PUBLIC_INTERNET 184,032; SAP_SIDE_IP_ALLOWLIST 184,032; PRIVATE_NETWORK 129,276.

The rule is stored as five `sapFeasibility` tables in the matrix:
- `avail`: target × tech;
- `authAvail`: target × sapAuth;
- `techPattern`: tech × pattern;
- `originAvail`: target × origin;
- `netApplicable`: target × network.

Each cell is yes, partial or no. A permutation is valid when every cell it touches is yes or partial. The consumer and consumer-login dimensions never affect validity.

### 2.3 Cells and the min rule

Each platform is described by **cells**. A cell is the support level for one value or a pair of values, rated none, partial or full:
- **full:** works end to end in code, is tested and documented, and has no material limit;
- **partial:** exists, but with a material limit;
- **none:** absent.

There are six tables of cells that a scenario touches, plus lifecycle:
- `targetTech`: target × tech;
- `techPattern`: tech × pattern;
- `sapAuth`: target × sapAuth, rated per target. A cell is stored either with row = target and col = login method, or with row = login method and an empty col, which applies the rating to every target. Today's Integration Suite and CoreEdge cells use the second form, one rating per login method. Phase upgrades use the first form, for example SuccessFactors SAML bearer in P0 and X.509 per target in P4. A per-target rating always overrides the all-targets rating;
- `consumerAuth`: consumer × consumerAuth;
- `origin`: single values;
- `network`: single values;
- `lifecycle`: the 18 stages, scored separately (below).

**Where the cells come from.** Integration Suite's cells are rated in the matrix from SAP's documentation, each citing its source. CoreEdge's are generated by the capability registry (`src/lib/coreedge/capability-registry.ts`), which applies the definitions above to the code: a cell is none when the capability is not implemented; partial when it is implemented with a material limit, or with no test and document recorded for it; full when it is implemented with no limit and tests and a document exist. "Implemented" is read from code flags (the connector's product registry, the OData versions a service path may carry, the host allow-list, the key providers built in, the files the starter kit writes) or declared in the registry and checked against the module that holds it (`tests/unit/coreedge/capability-registry.test.ts`). So a claim cannot outlive the code it rests on.

**Min rule.** A scenario is **fully supported** only if every cell it touches is full. It is **at least partly supported** only if every cell it touches is at least partial. One "none" anywhere makes the scenario unsupported.

The 18 **lifecycle stages** (Discover through Retire, section 3.8) are scored separately on 0 (none), 1 (partial) and 2 (full). They take no part in the per-scenario min rule. The simulator reports them as a separate count, `lifecycleFull`.

### 2.4 Totals

<!-- figures:begin totals -->
|  | Integration Suite | CoreEdge today (hosted) | CoreEdge after P6 |
|---|---|---|---|
| Total permutations | 1,119,744 | 1,119,744 | 1,119,744 |
| Valid scenarios | 497,340 | 497,340 | 497,340 |
| Fully supported | 133,875 (26.9%) | 0 (0.0%) | 30,360 (6.1%) |
| At least partly supported | 466,725 (93.8%) | 1,512 (0.3%) | 265,599 (53.4%) |
| Lifecycle stages full (of 18) | 5 | 1 | 15 |
<!-- figures:end totals -->

### 2.5 Caveats

1. **Cells were judged from code and documentation, not from live runs.** For CoreEdge, "full" means works end to end in code, tested, documented and with no material limit (section 2.3), and since P0.15 the capability registry applies that rule to the code; each cell's note and basis give the evidence. Whether "full" should also need a recent live run is open decision D15. For Integration Suite, the judgement relies on SAP's Feature Scope Description and 2026 decks [E1, E2, E3]. Some Integration Suite features depend on the edition (Standard, Premium, Enhanced), and the SAP note listing features per edition (2903776) was not read [unverified].
2. **"Partial" covers a wide range.** It means the capability exists but has a material limit: CoreEdge reads only the first 100 rows or fewer; a path is proven by unit tests only; or a workaround is needed (for example an ABAP Bearer header set in code). The simulation does not separate "almost full" from "barely works".
3. **Every scenario counts equally.** Real demand is concentrated in S/4HANA plus OData plus synchronous patterns, so the headline percentages understate how much of *actual* demand CoreEdge can serve. A demand-weighted view is open decision D6.
4. **Two over-credits, corrected in P0.15.** The first version credited CoreEdge partial on PRIVATE_NETWORK and SAP_SIDE_IP_ALLOWLIST, although the hosted instance reaches neither: IP literals and `.local`/`.internal` hosts are refused (`src/lib/studio/connection-url-guard.ts`), the broker's SAP calls use plain `fetch` with no tunnel, and there is no known fixed egress IP (Vercel egress is dynamic unless Static IPs are bought [E47]). The registry now scores both cells per hosting mode (section 3.10), and the headline uses the hosted instance, where both are none. The corrected figures are the ones this caveat predicted: 0.3% partial after P0 and P1, 1.3% after P2 and 1.6% after P3; from P4 onwards nothing changes, because P4 makes both cells full (section 3.0).
5. **Phase figures are projections**, and they assume every item ships as specified. Each phase's `cellUpgrades` in the matrix names the items that deliver the upgrade and the reason for the level given. An upgrade never lowers a cell, and phases apply cumulatively. Items without live evidence will carry an "untested" badge and be scored partial (P1.8).
6. **Blockers are ranked by the simulator.** For today and after every phase, `--json` returns `topBlockers`: the 30 cells with the most leverage. A cell's **leverage** is its share of the scenarios that are not fully supported. Each such scenario is split equally among the cells it touches that are below full, and the shares are added up per cell. `leveragePct` divides by all 497,340 valid scenarios. **Sole** counts the scenarios where that cell is the only one below full; this is exactly the number that become fully supported if that cell alone is made full. Section 3.9 explains the ranking in plain words.
7. **The matrix, the registry and the simulator are in the repository** (`docs/coreedge/gap-matrix.json`, `src/lib/coreedge/capability-registry.ts` and its generated `docs/coreedge/capability-registry.json`, `scripts/coreedge/simulate-gap-matrix.mjs`), and every simulated figure in this document is their output, written into the document by `pnpm coreedge:figures`. CI runs `pnpm coreedge:check`, which fails when the registry JSON no longer matches the code or a figure here no longer matches the simulator. The matrix's old `simulation` block, the stored output of the original one-off run that nothing regenerated, was removed in P0.15.
8. **Modelled since P0.15, apart from the headline.** (a) targets SAP Sales and Service Cloud, Fieldglass, IBP, Business ByDesign, Business One and Commerce Cloud; (b) technologies DATA_PRODUCT (a catalogue type in `prisma/schema.prisma`) and BINARY_MEDIA (OData media and attachments; CoreEdge carries JSON only); (c) consumers GO, PHP, MOBILE, SAP_CAP and SAP_BUILD. These are the extended model (section 3.11), run separately because the new targets' feasibility rules are [unverified]; folding them into the headline is open decision D13. (d) CoreEdge hosting (SHARED, DEDICATED, SELF_HOSTED, CONNECTOR) is scored in the registry, so caveat 4 is computed rather than corrected by hand (section 3.10). The five lifecycle stages section 3.8 listed are in the core model.
9. **Known differences between the matrix and this text.**
   - (a) Resolved in P0.15: the registry scores GOVERN_AUDIT_COMPLY partial while its holes are open by default, and a P3 upgrade (P0.1, P0.12, P3.10) makes it full.
   - (b) No phase credits consumer mTLS, although P4 mentions mTLS for self-hosted copies, so the MTLS consumer-login column stays at none throughout. That column is a quarter of all valid scenarios, so partial coverage cannot pass 75% under the current upgrades.
   - (c) SAML bearer toward RISE, on-premise S/4 and ECC is never upgraded beyond partial.

   Each is a candidate for the next matrix revision. Changing any of them changes the numbers here.

---

## 3. Results today

All figures in this section are **[simulated]**. Every table between `<!-- figures:begin ... -->` and `<!-- figures:end ... -->` markers is written by `pnpm coreedge:figures` (`scripts/coreedge/render-roadmap-figures.mjs`) from the simulator's output, and CI fails when one no longer matches (`pnpm coreedge:check`, P0.15). CoreEdge's cells come from the capability registry (`docs/coreedge/capability-registry.json`, generated from `src/lib/coreedge/capability-registry.ts`), scored on the code at `f65730f1` (PR #310, Phase 0b wave 1a) with this change on top. Integration Suite's cells, the SAP-feasibility rules and the roadmap phases come from `docs/coreedge/gap-matrix.json`. "CoreEdge today" is the hosted instance (section 3.10). Each table also shows CoreEdge after the whole roadmap (P6) for comparison. Section 8.1 gives every phase.

### 3.0 What changed from the figures first published (P0.15)

This section is a record of the change P0.15 made, as of the commit that made it, so its figures are marked historical and `pnpm coreedge:check` does not compare them with the simulator. A later change to the code or the matrix moves the generated tables elsewhere in this document, not this record.

<!-- figures:historical begin -->
This document was first published with figures from a hand-rated matrix of the code at `33d0ef86`. P0.15 replaced CoreEdge's hand ratings with the registry, and its acceptance asks for every difference from those figures to be explained. Three things moved the scenario figures, and nothing else did: run with the old matrix's cells, the new simulator reproduces every published figure exactly. Three more moved the lifecycle counts (D to F, at the end of this section).

- **A. Code that landed since `33d0ef86`.** Customer-built services (P1.1, #307) are in the code, so the registry scores CUSTOMER_CUSTOM and PARTNER origins, ECC OData V2 and V4, and SuccessFactors OData V4 as partial, where the old matrix said none and credited them only in P0. On its own this takes today's partial coverage from 936 to 3,996 scenarios: the old P0 row.
- **B. Caveat 4 corrected.** The hosted instance has no fixed egress address and refuses private hosts, so the registry scores SAP_SIDE_IP_ALLOWLIST and PRIVATE_NETWORK as none for it (section 3.10). On its own this takes today's partial coverage from 936 to 360. Together with A: 1,512 (0.3%). From P4 on nothing changes, because P4 makes both cells full. The figures caveat 4 predicted (0.3% after P0 and P1, 1.3% after P2, 1.6% after P3) are what the simulator now reports.
- **C. Integration Suite re-scored for AI agents (section 3.7).** OAuth for agents is full on the MCP Gateway path [E2, E9, E17]. The AI_AGENT row moves from 0% to 14.3% full, and because agents are a ninth of every slice, every Integration Suite "full" figure rises by one to two points: 126,000 (25.3%) to 133,875 (26.9%) overall. Partial figures do not change.

Lifecycle counts are now out of 18 (section 3.8). Integration Suite goes from 4 of 13 to 5 of 18 stages full, and CoreEdge today from 1 of 13 to 0 of 18; they moved at every phase, for D to F below.

No "full" scenario figure for CoreEdge changed at any phase, and no scenario-coverage figure after P4 changed (the lifecycle counts did, below). The rows of this section that moved by more than 0.1 points are the following. Every Integration Suite "full" figure rose, for reason C, so those rows are summarised in one line.

| Row | Column | Published | Now | Why (effect of each change on its own, in points) |
|---|---|---|---|---|
| Every target, technology, pattern, origin and network | IS full | 11.8-36.4% | 12.5-38.6% | C: AI agents, a ninth of each slice, now count (+0.7 to +2.2) |
| consumer AI_AGENT | IS full | 0.0% | 14.3% | C |
| All valid scenarios | CoreEdge today partial | 0.2% (936) | 0.3% (1,512) | A +0.6, B -0.1 |
| target S4_PUBLIC | CoreEdge today partial | 0.4% | 0.6% | A +0.9, B -0.2 |
| target ECC | CoreEdge today partial | 0.0% | 0.4% | A +1.3 |
| target SUCCESSFACTORS | CoreEdge today partial | 0.2% | 0.7% | A +1.2, B -0.1 |
| tech ODATA_V2 | CoreEdge today partial | 0.8% | 1.2% | A +2.3, B -0.5 |
| tech ODATA_V4 | CoreEdge today partial | 0.7% | 1.2% | A +2.4, B -0.4 |
| pattern SYNC_READ, SYNC_CREATE | CoreEdge today partial | 0.9% | 1.4% | A +2.9, B -0.6 |
| origin SAP_STANDARD | CoreEdge today partial | 0.6% | 0.3% | A +0.2, B -0.4 |
| origin CUSTOMER_CUSTOM, PARTNER | CoreEdge today partial | 0.0% | 0.3% | A +0.8 |
| network PUBLIC_INTERNET | CoreEdge today partial | 0.2% | 0.8% | A +0.6 |
| network SAP_SIDE_IP_ALLOWLIST, PRIVATE_NETWORK | CoreEdge today partial | 0.2% | 0.0% | A +0.6, B -0.2: the hosted instance reaches neither |

S4_PRIVATE_RISE and S4_ONPREM stay at 0.4% partial: A raised them and B took the private-network share away again, which is the drop the P0.15 acceptance expected. In the roadmap phase rows (section 8.1) the coverage columns moved for B only: partial after P0 and P1 from 3,996 to 1,512, after P2 from 16,872 to 6,384, after P3 from 21,090 to 7,980.

The lifecycle column of section 8.1 moved at every phase, for three matrix changes that are none of A, B and C:
- **D. GOVERN_AUDIT_COMPLY is partial until P3.** The old matrix rated it full from today. The registry scores it partial while its holes are open by default (caveat 9a), and a new P3 upgrade (P0.1, P0.12, P3.10) makes it full. So it no longer counts before P3, and counts again from P3.
- **E. API_VERSIONING is full from P1.** A stage P0.15 added (section 3.8), with a new P1 upgrade (P1.10).
- **F. PROVIDER_BUILD_TRANSPORT is full from P3.** A stage P0.15 added, with a new P3 upgrade (P1.2, P3.4, P3.8).

The other three added stages never reach full, so they move no count: PERFORMANCE_TEST is partial from P1 (P1.6a), and SUPPORT_INCIDENT (P3.7, P2.13, in P3) and RETIRE (P6.4, in P6) are upgraded to the partial they already have (D14).

| After | Lifecycle stages full, published (of 13) | Now (of 18) | Why |
|---|---|---|---|
| Today | 1 | 0 | D: GOVERN_AUDIT_COMPLY no longer counted (-1) |
| P0 | 2 | 1 | D (-1); SECRETS_KEYS becomes full in both |
| P1 | 3 | 3 | D (-1) and E (+1); DISCOVER becomes full in both |
| P2 | 4 | 4 | D (-1) and E (+1); MOCK_TEST_BEFORE_CODE becomes full in both |
| P3 | 10 | 12 | E (+1) and F (+1). D's upgrade counts GOVERN_AUDIT_COMPLY again, beside the six stages P3 made full before |
| P4 | 11 | 13 | E and F (+2); SELF_HOST_SETUP becomes full in both |
| P5 | 12 | 14 | E and F (+2); DESIGN_MAP becomes full in both |
| P6 | 13 | 15 | E and F (+2); AI_ASSIST becomes full in both. This is why the headline "after the whole roadmap" lifecycle figure moved |
| Integration Suite | 4 | 5 | API_VERSIONING is full for it [E66, E8]; its other added stages are partial or none |
<!-- figures:historical end -->

### 3.1 Overall

<!-- figures:begin overall -->
|  | Integration Suite full | Integration Suite partial | CoreEdge today full | CoreEdge today partial | CoreEdge after P6 full | CoreEdge after P6 partial |
|---|---|---|---|---|---|---|
| All valid scenarios (497,340) | 26.9% | 93.8% | 0 (0.0%) | 1,512 (0.3%) | 30,360 (6.1%) | 265,599 (53.4%) |
<!-- figures:end overall -->

<!-- figures:begin today-partial-shape -->
The 1,512 scenarios CoreEdge partly supports today all have:
- technology ODATA_V2 or ODATA_V4;
- pattern SYNC_READ or SYNC_CREATE;
- target S4_PUBLIC, S4_PRIVATE_RISE, S4_ONPREM, ECC or SUCCESSFACTORS;
- origin SAP_STANDARD, CUSTOMER_CUSTOM or PARTNER (every origin);
- network PUBLIC_INTERNET;
- consumer login STATIC_BEARER, for every consumer type.

These are the only values with non-zero partial coverage in the per-dimension results. Every other consumer login (OAUTH_CLIENT_CREDENTIALS, MTLS, USER_DELEGATED_OIDC) is scored none for every consumer type: the broker accepts one consumer login, STATIC_BEARER. The registry's note on each cell says why (`docs/coreedge/capability-registry.json`).
<!-- figures:end today-partial-shape -->

Customer- and partner-built services count since P1.1, and PUBLIC_INTERNET is the only network position the hosted instance reaches (section 3.10).

### 3.2 By target

<!-- figures:begin by-target -->
| Target | Valid | IS full | IS partial | CoreEdge today full | CoreEdge today partial | CoreEdge after P6 full | CoreEdge after P6 partial |
|---|---|---|---|---|---|---|---|
| S4_PUBLIC | 50,760 | 24.1% | 82.7% | 0.0% | 0.6% | 8.5% | 49.8% |
| S4_PRIVATE_RISE | 76,140 | 36.2% | 97.2% | 0.0% | 0.4% | 8.5% | 70.2% |
| S4_ONPREM | 76,140 | 36.2% | 97.2% | 0.0% | 0.4% | 8.5% | 70.2% |
| ECC | 76,140 | 23.1% | 97.2% | 0.0% | 0.4% | 7.4% | 70.2% |
| SUCCESSFACTORS | 30,240 | 22.9% | 97.2% | 0.0% | 0.7% | 8.3% | 54.6% |
| ARIBA | 24,192 | 18.6% | 97.2% | 0.0% | 0.0% | 5.6% | 50.9% |
| CONCUR | 4,320 | 18.9% | 97.2% | 0.0% | 0.0% | 6.9% | 30.0% |
| BTP_SERVICE | 91,368 | 19.1% | 86.9% | 0.0% | 0.0% | 2.1% | 29.3% |
| NON_SAP_SAAS | 68,040 | 28.3% | 97.2% | 0.0% | 0.0% | 2.0% | 33.9% |
<!-- figures:end by-target -->

RISE, on-premise and ECC reach <!-- figures:begin value-partial-Today-target-S4_ONPREM -->0.4%<!-- figures:end value-partial-Today-target-S4_ONPREM --> only over the public internet, which few such systems allow. Their usual position, a private network, is at <!-- figures:begin value-partial-Today-network-PRIVATE_NETWORK -->0.0%<!-- figures:end value-partial-Today-network-PRIVATE_NETWORK --> for the hosted instance (section 3.10).

### 3.3 By technology

<!-- figures:begin by-tech -->
| Technology | Valid | IS full | IS partial | CoreEdge today full | CoreEdge today partial | CoreEdge after P6 full | CoreEdge after P6 partial |
|---|---|---|---|---|---|---|---|
| ODATA_V2 | 64,152 | 38.6% | 97.2% | 0.0% | 1.2% | 13.0% | 44.7% |
| ODATA_V4 | 64,152 | 24.2% | 97.2% | 0.0% | 1.2% | 11.6% | 44.7% |
| SOAP | 92,448 | 24.5% | 97.2% | 0.0% | 0.0% | 1.9% | 59.5% |
| REST | 94,752 | 30.6% | 97.2% | 0.0% | 0.0% | 5.5% | 67.2% |
| RFC_BAPI | 55,188 | 16.6% | 83.9% | 0.0% | 0.0% | 8.8% | 33.0% |
| IDOC | 43,740 | 26.2% | 75.6% | 0.0% | 0.0% | 0.0% | 49.1% |
| EVENTS | 35,532 | 32.7% | 97.2% | 0.0% | 0.0% | 7.6% | 50.6% |
| FILE_SFTP | 47,376 | 20.3% | 97.2% | 0.0% | 0.0% | 0.0% | 67.2% |
<!-- figures:end by-tech -->

### 3.4 By pattern

<!-- figures:begin by-pattern -->
| Pattern | Valid | IS full | IS partial | CoreEdge today full | CoreEdge today partial | CoreEdge after P6 full | CoreEdge after P6 partial |
|---|---|---|---|---|---|---|---|
| SYNC_READ | 52,668 | 37.3% | 95.2% | 0.0% | 1.4% | 11.1% | 55.1% |
| SYNC_CREATE | 52,668 | 37.3% | 95.2% | 0.0% | 1.4% | 11.1% | 55.1% |
| SYNC_UPDATE_DELETE_ACTION | 52,668 | 37.3% | 95.2% | 0.0% | 0.0% | 11.1% | 55.1% |
| EVENT_TO_APP | 51,876 | 21.2% | 91.6% | 0.0% | 0.0% | 2.6% | 35.2% |
| SAP_CALLS_OUT | 85,104 | 23.1% | 93.8% | 0.0% | 0.0% | 2.8% | 51.3% |
| A2A_FLOW_WITH_MAPPING | 85,104 | 34.1% | 93.8% | 0.0% | 0.0% | 6.9% | 55.6% |
| BULK_BATCH | 73,260 | 13.2% | 93.2% | 0.0% | 0.0% | 4.3% | 56.4% |
| B2B_EDI | 43,992 | 12.5% | 92.9% | 0.0% | 0.0% | 0.0% | 63.8% |
<!-- figures:end by-pattern -->

### 3.5 By origin of the API

<!-- figures:begin by-origin -->
| Origin | Valid | IS full | IS partial | CoreEdge today full | CoreEdge today partial | CoreEdge after P6 full | CoreEdge after P6 partial |
|---|---|---|---|---|---|---|---|
| SAP_STANDARD | 166,500 | 26.9% | 93.9% | 0.0% | 0.3% | 6.1% | 53.3% |
| CUSTOMER_CUSTOM | 164,340 | 27.0% | 93.8% | 0.0% | 0.3% | 6.1% | 53.6% |
| PARTNER | 166,500 | 26.9% | 93.9% | 0.0% | 0.3% | 6.1% | 53.3% |
<!-- figures:end by-origin -->

### 3.6 By network position

<!-- figures:begin by-network -->
| Network | Valid | IS full | IS partial | CoreEdge today full | CoreEdge today partial | CoreEdge after P6 full | CoreEdge after P6 partial |
|---|---|---|---|---|---|---|---|
| PUBLIC_INTERNET | 184,032 | 26.5% | 93.5% | 0.0% | 0.8% | 6.3% | 53.1% |
| SAP_SIDE_IP_ALLOWLIST | 184,032 | 26.5% | 93.5% | 0.0% | 0.0% | 6.3% | 53.1% |
| PRIVATE_NETWORK | 129,276 | 28.2% | 94.8% | 0.0% | 0.0% | 5.6% | 54.2% |
<!-- figures:end by-network -->

### 3.7 By consumer type

<!-- figures:begin by-consumer -->
| Consumer | Valid | IS full | IS partial | CoreEdge today full | CoreEdge today partial | CoreEdge after P6 full | CoreEdge after P6 partial |
|---|---|---|---|---|---|---|---|
| JS_TS | 55,260 | 28.5% | 96.5% | 0.0% | 0.3% | 7.3% | 53.4% |
| PYTHON | 55,260 | 28.5% | 96.5% | 0.0% | 0.3% | 7.3% | 53.4% |
| JAVA | 55,260 | 42.8% | 96.5% | 0.0% | 0.3% | 7.3% | 53.4% |
| DOTNET | 55,260 | 28.5% | 96.5% | 0.0% | 0.3% | 7.3% | 53.4% |
| ABAP_ONPREM | 55,260 | 28.5% | 96.5% | 0.0% | 0.3% | 3.7% | 53.4% |
| ABAP_CLOUD | 55,260 | 28.5% | 96.5% | 0.0% | 0.3% | 3.7% | 53.4% |
| LOW_CODE | 55,260 | 28.5% | 96.5% | 0.0% | 0.3% | 3.7% | 53.4% |
| AI_AGENT | 55,260 | 14.3% | 96.5% | 0.0% | 0.3% | 7.3% | 53.4% |
| HUMAN_TESTER | 55,260 | 14.3% | 72.4% | 0.0% | 0.3% | 7.3% | 53.4% |
<!-- figures:end by-consumer -->

**AI agents.** Integration Suite is now scored full for agents using OAuth, and partial for the other three logins. SAP API Policy §2.2.2 prohibits API use for "interaction or integration with (semi-) autonomous or generative AI systems" except "through and within the limits of SAP-endorsed architectures" [E17], and SAP's July 2026 update calls the MCP Gateway the "Endorsed pathway for Agents to access SAP APIs" [E2, E9]; MCP authorization is OAuth-based [E40]. The edition the MCP Gateway needs is [unverified]: E9 defers availability to SAP Note 2903776, which was not read, and edition gating is not modelled for any other feature either (caveat 1). Whether the gateway accepts an API Management key as an agent's credential was not checked, so the static-key cell stays partial. The re-score raises Integration Suite's AI_AGENT row from <!-- figures:historical begin -->0%<!-- figures:historical end --> to <!-- figures:begin value-full-IS-consumer-AI_AGENT -->14.3%<!-- figures:end value-full-IS-consumer-AI_AGENT --> full; human testers stay at <!-- figures:begin value-full-IS-consumer-HUMAN_TESTER -->14.3%<!-- figures:end value-full-IS-consumer-HUMAN_TESTER --> because browser Try Out cannot present a client certificate.

**CoreEdge does not lead here.** A CoreEdge runtime MCP straight to SAP (P6.1) would be the restricted route, so P6.1 is blocked until SAP endorses it or the D2 legal reading permits it. The <!-- figures:begin value-full-P6-consumer-AI_AGENT -->7.3%<!-- figures:end value-full-P6-consumer-AI_AGENT --> full for agents after P6 assumes that P6.1 ships; both P6 upgrades that make agent logins full list P6.1 as a delivering item. Without P6.1, the agent row would stay at its P5 level of <!-- figures:begin value-full-P5-consumer-AI_AGENT -->0.0%<!-- figures:end value-full-P5-consumer-AI_AGENT --> full [inferred from the P5 row]. The safer design is to govern agents that call SAP through Integration Suite's MCP Gateway as a backend (P5.10).

### 3.8 Lifecycle stages

Scores: 0 = none, 1 = partial, 2 = full. The IS column is the matrix's `lifecycle` cells; the CoreEdge-today column is the registry's. "Reaches full in" is the first phase after which the simulator reports the stage at 2.

<!-- figures:begin lifecycle -->
| Stage | What it means | IS | CoreEdge today | CoreEdge reaches full in |
|---|---|---|---|---|
| DISCOVER | Find which APIs exist and which work on *this* system | 2 | 1 | P1 |
| DESIGN_MAP | Define the contract, the fields and the mapping | 2 | 1 | P5 |
| MOCK_TEST_BEFORE_CODE | Try and test an API before writing a program | 1 | 1 | P2 |
| DEVELOP_SDK_CODEGEN | Typed client in the developer's language | 1 | 1 | P3 |
| CI_PRECOMMIT_GOVERNANCE | Checks in the developer's commit and CI pipeline | 1 | 0 | P3 |
| DEPLOY_PROMOTE_ENVIRONMENTS | Move DEV to TEST to PROD with evidence | 1 | 1 | P3 |
| RUN_MONITOR_ALERT | Watch, trace and alert the right people | 2 | 1 | P3 |
| GOVERN_AUDIT_COMPLY | Approvals, separation of duties, audit | 1 | 1 | P3 |
| SECRETS_KEYS | Custody and rotation of credentials | 2 | 1 | P0 |
| SAP_UPGRADE_IMPACT | Know what an SAP release breaks before it breaks | 1 | 1 | P3 |
| SELF_HOST_SETUP | Install and run it yourself | 1 | 1 | P4 |
| AI_ASSIST | AI help that is checked against real runs | 1 | 0 | P6 |
| ONBOARDING_TIME_TO_FIRST_CALL | From sign-up to first call | 1 | 1 | P3 |
| PROVIDER_BUILD_TRANSPORT | Build a Z*/YY1_* service, verify it per environment, transport it | 1 | 1 | P3 |
| API_VERSIONING | CoreEdge's own contract with consumers: versions, deprecation, changelog | 2 | 2 | Today |
| PERFORMANCE_TEST | Load-test before promotion | 0 | 0 | Never; partial at most (no item delivers the rest) |
| SUPPORT_INCIDENT | Who is paged, the status page, consumer tickets | 1 | 1 | Never; partial at most (no item delivers the rest) |
| RETIRE | Revoke keys, archive evidence, delete fixtures and twin data | 1 | 1 | Never; partial at most (no item delivers the rest) |
<!-- figures:end lifecycle -->

**Why CoreEdge scores what it does today** (each from the registry's notes, `docs/coreedge/capability-registry.json`):
- **GOVERN = 1:** the design is strong: two-person rule and mandatory grant expiry (`src/lib/studio/grants.ts`); grants bound to one interface (P0.1, `src/lib/studio/grant-binding.ts`); environment binding; a per-call audit row including refusals (`src/lib/northbound/audit.ts`). It is held at partial because the holes are still open by default: `COREEDGE_GRANT_BINDING` defaults to `legacy`, `COREEDGE_STEP_UP` to `warn`, and a failed broker audit insert is logged and swallowed. The registry reads the first default from the code and the test checks the other two against it. This was caveat 9a; the matrix used to rate the stage full.
- **SECRETS_KEYS = 1:** SAP secrets are sealed under per-organisation data keys and consumer keys expire and rotate with an overlap (P0.10, P0.11), but the only key provider built in is `env` (`src/lib/sap-public/keys/key-provider.ts`), so the master key is still an environment variable.
- **CI = 0:** the starter kit ships no CI workflow (the registry reads the files `buildScaffold` writes), and Studio APIs accept browser sessions only.
- **AI = 0:** no AI in CoreEdge: `/api/mcp` is a reserved rate-limit prefix with no route.

**The five stages P0.15 added.**
- **PROVIDER_BUILD_TRANSPORT:** partial on both. CoreEdge registers a `Z*`/`YY1_*` service by path and verifies it from `$metadata` per environment (P1.1), but nothing re-verifies or gates it on promotion until P3.4. Integration Suite does not build the provider's service either; it transports its own content [E1, E7]. Full in P3 (P1.2, P3.4, P3.8).
- **API_VERSIONING:** Integration Suite full: API Management publishes versioned API products to the Developer Hub [E66, E8]. CoreEdge full since P1.10 shipped: dated versions named by `CoreEdge-Version`, `/api/northbound/v1/*` beside the original path, `Deprecation` and `Sunset` headers under a 6-month overlap checked in CI, and a changelog; the starter kit and the ABAP lab-guide samples are replayed against every supported version in CI. Before P1.10 it was none (the routes were unversioned).
- **PERFORMANCE_TEST:** none on both. Integration Suite's simulation is functional, not load [E4]; CoreEdge has no broker load test. The P1.6a twin gives a load test something to run against, so it becomes partial in P1. **No roadmap item delivers the load test that A.3 #14 asks for**, so it never reaches full (open decision D14).
- **SUPPORT_INCIDENT:** partial on both. Integration Suite has monitoring, external logging, Cloud ALM alerting and an SLA [E5, E14, E19, E67]; CoreEdge has stored incidents and a daily probe email. P3.7 adds owner paging, but **no item delivers a public status page or consumer ticket intake**, so it stays partial (D14).
- **RETIRE:** partial on both. CoreEdge revokes both keys at once, keeps dropped keys, and refuses a RETIRED app at runtime; Integration Suite withdraws API products and revokes keys [E66]. P6.4's evidence packs archive what a retired app did, but **no item deletes fixtures and twin data at retirement**, so it stays partial (D14).

<!-- figures:begin lifecycle-summary -->So after the whole roadmap CoreEdge is full on 15 of 18 stages; the 3 it misses (PERFORMANCE_TEST, SUPPORT_INCIDENT, RETIRE) are the ones no roadmap item takes to full.<!-- figures:end lifecycle-summary -->

### 3.9 The blocking gaps, in plain words

All rankings in this section are the `topBlockers` lists in the simulator's `--json` output (`coreedgeToday.topBlockers`, and `phases[i].topBlockers` after each phase).

**How to read the ranking.** A scenario that is not fully supported is held back by every cell it touches that is below full. The simulator splits each such scenario equally among those cells, so a scenario held back by four cells gives each of them a quarter.
- **Leverage** is the sum of a cell's shares. It is printed as a number of scenarios and as a percentage of all <!-- figures:begin value-valid -->497,340<!-- figures:end value-valid --> valid scenarios. Because each scenario is shared out, the leverages of all cells add up to the number of scenarios not fully supported.
- **Sole** is the number of scenarios where the cell is the only one below full. Fix that cell alone and exactly that many scenarios become fully supported.

So high leverage with a sole of 0 means a cell is part of the problem in many scenarios but never the last thing in the way. A high sole count means fixing the cell pays off at once.

**Today.** Every scenario is held back by several cells at once: a technology CoreEdge does not speak, a pattern it does not offer, a consumer login it does not accept, and so on. As a result, no cell is ever the only blocker (sole is 0 for all 30 ranked cells), and the leverage is spread thin. "Raised in" is the first phase that makes the cell full, or how far the roadmap takes it.

<!-- figures:begin blockers-today -->
| Rank | Cell | Rating today | Leverage | Sole | Raised in |
|---|---|---|---|---|---|
| 1 | network SAP_SIDE_IP_ALLOWLIST | none | 33,314 (6.7%) | 0 | Full in P4 |
| 2 | origin PARTNER | partial | 32,616 (6.6%) | 0 | Full in P1 |
| 3 | origin SAP_STANDARD | partial | 32,616 (6.6%) | 0 | Full in P1 |
| 4 | origin CUSTOMER_CUSTOM | partial | 32,172 (6.5%) | 0 | Full in P1 |
| 5 | network PRIVATE_NETWORK | none | 23,294 (4.7%) | 0 | Full in P4 |
| 6 | targetTech BTP_SERVICE / REST | none | 2,986 (0.6%) | 0 | Full in P5 |
| 7 | targetTech BTP_SERVICE / SOAP | none | 2,986 (0.6%) | 0 | Partial from P5; never full |
| 8 | targetTech NON_SAP_SAAS / REST | none | 2,986 (0.6%) | 0 | Full in P5 |
| 9 | targetTech NON_SAP_SAAS / SOAP | none | 2,986 (0.6%) | 0 | Partial from P5; never full |
| 10 | sapAuth BTP_SERVICE / API_KEY | partial | 2,724 (0.5%) | 0 | Partial today; never full |
| 11 | sapAuth BTP_SERVICE / OAUTH_SAML_BEARER | partial | 2,724 (0.5%) | 0 | Partial today; never full |
| 12 | sapAuth BTP_SERVICE / PRINCIPAL_PROPAGATION | none | 2,724 (0.5%) | 0 | Never raised |
| 13 | sapAuth BTP_SERVICE / X509_MTLS | none | 2,724 (0.5%) | 0 | Partial from P4; never full |
| 14 | sapAuth ECC / OAUTH_SAML_BEARER | partial | 2,724 (0.5%) | 0 | Partial today; never full |
| 15 | sapAuth ECC / PRINCIPAL_PROPAGATION | none | 2,724 (0.5%) | 0 | Partial from P6; never full |
| 16 | sapAuth ECC / X509_MTLS | none | 2,724 (0.5%) | 0 | Full in P4 |
| 17 | sapAuth S4_ONPREM / OAUTH_SAML_BEARER | partial | 2,724 (0.5%) | 0 | Partial today; never full |
| 18 | sapAuth S4_ONPREM / PRINCIPAL_PROPAGATION | none | 2,724 (0.5%) | 0 | Partial from P6; never full |
| 19 | sapAuth S4_ONPREM / X509_MTLS | none | 2,724 (0.5%) | 0 | Full in P4 |
| 20 | sapAuth S4_PRIVATE_RISE / OAUTH_SAML_BEARER | partial | 2,724 (0.5%) | 0 | Partial today; never full |
| 21 | sapAuth S4_PRIVATE_RISE / PRINCIPAL_PROPAGATION | none | 2,724 (0.5%) | 0 | Partial from P6; never full |
| 22 | sapAuth S4_PRIVATE_RISE / X509_MTLS | none | 2,724 (0.5%) | 0 | Full in P4 |
| 23 | consumerAuth ABAP_CLOUD / MTLS | none | 2,687 (0.5%) | 0 | Never raised |
| 24 | consumerAuth ABAP_CLOUD / OAUTH_CLIENT_CREDENTIALS | none | 2,687 (0.5%) | 0 | Full in P2 |
| 25 | consumerAuth ABAP_CLOUD / STATIC_BEARER | partial | 2,687 (0.5%) | 0 | Partial today; never full |
| 26 | consumerAuth ABAP_CLOUD / USER_DELEGATED_OIDC | none | 2,687 (0.5%) | 0 | Partial from P6; never full |
| 27 | consumerAuth ABAP_ONPREM / MTLS | none | 2,687 (0.5%) | 0 | Never raised |
| 28 | consumerAuth ABAP_ONPREM / OAUTH_CLIENT_CREDENTIALS | none | 2,687 (0.5%) | 0 | Full in P2 |
| 29 | consumerAuth ABAP_ONPREM / STATIC_BEARER | partial | 2,687 (0.5%) | 0 | Partial today; never full |
| 30 | consumerAuth ABAP_ONPREM / USER_DELEGATED_OIDC | none | 2,687 (0.5%) | 0 | Partial from P6; never full |
<!-- figures:end blockers-today -->

**The ranked cells in plain words.**
- **network SAP_SIDE_IP_ALLOWLIST and PRIVATE_NETWORK (none):** systems that accept calls only from known IP addresses, and RISE, on-premise S/4 and ECC on private networks. The hosted instance has no fixed outbound IP and refuses private hosts; there is no agent and no tunnel. A self-hosted copy or a dedicated deployment with Static IPs would score partial (section 3.10). Full in P4 (P4.1, P4.2, P4.4, P4.7).
- **origin SAP_STANDARD, PARTNER, CUSTOMER_CUSTOM (partial):** who built the API. SAP's own APIs resolve through the catalogue, where a non-curated V4 path is derived from the API id and reads unverified until a probe of exactly it answers 200 (P0.8; wrapper rows have no address); customer- and partner-built services are registered by path (P1.1). All three are held at partial because reads send only `$top`. Full in P1 (P0.8, P1.1-P1.4, P1.8).
- **targetTech BTP_SERVICE and NON_SAP_SAAS with SOAP or REST (none):** there is no connector for BTP services or non-SAP SaaS. P5: REST full (P5.3, P5.10), SOAP partial (P5.2).
- **sapAuth toward BTP_SERVICE, S4_PRIVATE_RISE, S4_ONPREM and ECC:** how CoreEdge logs in to SAP. It signs SAML bearer assertions only for SuccessFactors, has no certificate login, and does not pass the end user's identity through to SAP. X.509 becomes full toward S/4 and ECC in P4 (P4.3); principal propagation partial in P6 (P6.5); SAML bearer outside SuccessFactors is never upgraded (caveat 9c).
- **consumerAuth (the ABAP rows shown; the same pattern continues for other consumer types below rank 30):** a program proves who it is only with a long-lived `ce_` key. OAuth client credentials become full in P2 (P2.5, P2.7); mTLS is never credited (caveat 9b).

**After each phase.** The second column counts the valid scenarios still not fully supported.

<!-- figures:begin blockers-phases -->
| After | Not fully supported | Biggest remaining blockers: leverage (sole) |
|---|---|---|
| P0 | 497,340 | network SAP_SIDE_IP_ALLOWLIST 6.7% (0); origin PARTNER 6.6% (0); origin SAP_STANDARD 6.6% (0); origin CUSTOMER_CUSTOM 6.5% (0); network PRIVATE_NETWORK 4.7% (0) |
| P1 | 497,304 | network SAP_SIDE_IP_ALLOWLIST 8.6% (36); network PRIVATE_NETWORK 5.9% (0); targetTech BTP_SERVICE / REST 0.7% (0); targetTech BTP_SERVICE / SOAP 0.7% (0); targetTech NON_SAP_SAAS / REST 0.7% (0) |
| P2 | 496,908 | network SAP_SIDE_IP_ALLOWLIST 9.2% (432); network PRIVATE_NETWORK 6.3% (0); targetTech BTP_SERVICE / REST 0.8% (0); targetTech BTP_SERVICE / SOAP 0.8% (0); targetTech NON_SAP_SAAS / REST 0.8% (0) |
| P3 | 496,692 | network SAP_SIDE_IP_ALLOWLIST 9.5% (648); network PRIVATE_NETWORK 6.5% (0); targetTech BTP_SERVICE / REST 0.8% (0); targetTech BTP_SERVICE / SOAP 0.8% (0); targetTech NON_SAP_SAAS / REST 0.8% (0) |
| P4 | 489,780 | sapAuth ECC / OAUTH_SAML_BEARER 1.0% (648); sapAuth ECC / PRINCIPAL_PROPAGATION 1.0% (648); sapAuth S4_ONPREM / OAUTH_SAML_BEARER 1.0% (648); sapAuth S4_ONPREM / PRINCIPAL_PROPAGATION 1.0% (648); sapAuth S4_PRIVATE_RISE / OAUTH_SAML_BEARER 1.0% (648) |
| P5 | 473,052 | sapAuth S4_ONPREM / OAUTH_SAML_BEARER 1.4% (1,728); sapAuth S4_ONPREM / PRINCIPAL_PROPAGATION 1.4% (1,728); sapAuth S4_PRIVATE_RISE / OAUTH_SAML_BEARER 1.4% (1,728); sapAuth S4_PRIVATE_RISE / PRINCIPAL_PROPAGATION 1.4% (1,728); sapAuth ECC / OAUTH_SAML_BEARER 1.3% (1,512) |
| P6 | 466,980 | sapAuth S4_ONPREM / OAUTH_SAML_BEARER 1.4% (2,160); sapAuth S4_ONPREM / PRINCIPAL_PROPAGATION 1.4% (2,160); sapAuth S4_PRIVATE_RISE / OAUTH_SAML_BEARER 1.4% (2,160); sapAuth S4_PRIVATE_RISE / PRINCIPAL_PROPAGATION 1.4% (2,160); sapAuth ECC / OAUTH_SAML_BEARER 1.4% (1,890) |
<!-- figures:end blockers-phases -->

Until P4 the network cells dominate: making the IP allow-list cell full alone would add <!-- figures:begin value-sole-P2-network-SAP_SIDE_IP_ALLOWLIST -->432<!-- figures:end value-sole-P2-network-SAP_SIDE_IP_ALLOWLIST --> fully supported scenarios after P2 and <!-- figures:begin value-sole-P3-network-SAP_SIDE_IP_ALLOWLIST -->648<!-- figures:end value-sole-P3-network-SAP_SIDE_IP_ALLOWLIST --> after P3. From P4 the network is full, and the limits become how CoreEdge logs in to private SAP systems (SAML bearer and principal propagation toward RISE, on-premise and ECC) and how consumers log in. Even after the whole roadmap no ranked cell is worth more than about <!-- figures:begin value-max-sole-points-P6 -->0.4<!-- figures:end value-max-sole-points-P6 --> points (<!-- figures:begin value-max-sole-P6 -->2,160<!-- figures:end value-max-sole-P6 --> of <!-- figures:begin value-valid -->497,340<!-- figures:end value-valid -->), which is why full coverage climbs slowly: many cells have to be raised together.

**The structural gaps behind the cells.** These are the dimension values outside today's supported shape. They overlap, so their shares do not add up. Each row counts the valid scenarios that fall outside the shape on that dimension: those whose value on it has no partial coverage today. The third column is rewritten by `pnpm coreedge:figures`.

<!-- figures:begin structural-gaps -->
| # | Gap | Valid scenarios outside | Plain explanation | Fixed in |
|---|---|---|---|---|
| 1 | Only synchronous read and create | 392,004 (78.8%) | CoreEdge can read a page of rows or create a record. It cannot update, delete, run an action, send a batch, receive an event, run a multi-step flow, let SAP call out, or exchange EDI documents. | P2 (update/delete/batch), P3.9 (SAP calls out), P5 (flows, events, bulk) |
| 2 | Only OData | 369,036 (74.2%) | OData is SAP's main web API, but S/4HANA also publishes 212 SOAP APIs [R1 §5]. Older systems run on RFC/BAPI (remote function calls into SAP) and IDoc (SAP's business-document messages). CoreEdge speaks none of these. | P5.2-P5.5 |
| 3 | Reads limited to the first page | every supported scenario | Reads send only `$top` and `$format` and return 100 rows or fewer (`src/lib/northbound/read.ts`). There is no filter, key lookup or paging. This is what holds all three origins, SAP-, customer- and partner-built, at partial now that customer-built services are registered by path (P1.1). | P1.3, P1.4 |
| 4 | Consumer can only log in with a static key | 373,005 (75.0%): 3 of the 4 consumer logins, which never affect validity | A program proves who it is only with a long-lived `ce_` string (`src/lib/northbound/auth.ts`). There is no OAuth, no mTLS and no user-delegated login. ABAP credential stores cannot hold such a header natively. | P2.5, P6.5. P4 mentions mTLS for self-hosted copies, but the matrix does not credit it (caveat 9b) |
| 5 | Systems CoreEdge has no connector for | 187,920 (37.8%) | Ariba is environment-variable only and not on the broker. Concur, BTP services and non-SAP SaaS have no connector. ECC is reachable by registered path (P1.1), but only over the public internet from the hosted instance. | P5.3 (Ariba, Concur, BTP), P5.10 (SaaS), P4.7 (ECC end to end) |
| 6 | No private-network or IP allow-list reach | 313,308 (63.0%) for the hosted instance | RISE, on-premise and ECC usually sit on private networks, and many SAP systems admit only known addresses. CoreEdge has no agent, no tunnel and no fixed outbound IP. | P4.1-P4.4 |
| 7 | No X.509 or principal propagation to SAP | 2 of the 6 SAP login methods scored none on every target today | SAP recommends certificates or OAuth over passwords [R1 §3]. CoreEdge has neither certificates nor per-person identity toward SAP (`src/lib/sap-public/connection-resolver.ts`, `SapAuthType`), and its SAML bearer assertion is built for SuccessFactors only, so that login is partial. | P4.3 (X.509); P6.5 (principal propagation, partial) |
| 8 | Nothing is "full" | All 1,512 supported scenarios | Even the supported shape is limited: reads are first-page only, and no create (V2 or V4) has been verified live; V4 create is unit-tested only. | P1.4, P1.8 |
| 9 | No CI or AI at all (lifecycle) | not a scenario count | Nothing checks a developer's code before commit, and no AI help exists. | P2.11, P3.2, P3.3, P6.2 |
<!-- figures:end structural-gaps -->

Before the column was generated (P0.15 review), row 5 was written by hand as <!-- figures:historical begin -->188,280 (37.9%)<!-- figures:historical end -->, 360 more than the four targets without a connector (Ariba, Concur, BTP services and non-SAP SaaS) add up to; the generated figure is their sum.

### 3.10 By where CoreEdge runs (hosting)

Network reach depends on where CoreEdge runs (caveat 8d), so the registry scores the three network cells per hosting mode, and the simulator runs CoreEdge today under each. The headline everywhere in this document is SHARED: the one production deployment.

<!-- figures:begin hosting -->
| Hosting | PUBLIC_INTERNET | SAP_SIDE_IP_ALLOWLIST | PRIVATE_NETWORK | Full today | Partial today |
|---|---|---|---|---|---|
| SHARED (headline) | full | none | none | 0 (0.0%) | 1,512 (0.3%) |
| DEDICATED | full | partial | none | 0 (0.0%) | 3,024 (0.6%) |
| SELF_HOSTED | full | partial | partial | 0 (0.0%) | 3,996 (0.8%) |
| CONNECTOR | none | none | none | 0 (0.0%) | 0 (0.0%) |
<!-- figures:end hosting -->

- **SHARED and DEDICATED** run the same code on Vercel. Neither reaches a private network: `src/lib/studio/connection-url-guard.ts` refuses IP literals and `.local` and `.internal` names, and SAP calls use the platform `fetch` with no proxy or tunnel. The shared deployment has no Static IPs recorded (D11; P4.4 adds fixed egress), while a dedicated deployment is scored as one that buys them for its own project [E47], so only it scores partial on IP allow-listing (untested).
- **SELF_HOSTED** is a copy inside the customer's network: a private DNS name added with `SAP_HOST_ALLOWLIST_EXTRA` is reachable, from the operator's own address. Partial on both, because it has never been tested end to end and IP literals, custom CAs and proxies are still refused.
- **CONNECTOR** does not exist yet (P4.2), so it scores none.

### 3.11 The extended model: values the core model leaves out

Caveat 8 listed dimension values the model did not cover: six more targets (Sales and Service Cloud, Fieldglass, IBP, Business ByDesign, Business One, Commerce Cloud), two technologies (DATA_PRODUCT and BINARY_MEDIA) and five consumer types (Go, PHP, mobile apps, SAP CAP and SAP Build). P0.15 models them in `extendedModel` in the matrix, with SAP-feasibility rules, Integration Suite cells and registry cells, and the simulator runs them as a separate model.

They are kept out of the headline figures. The feasibility rules for the six new targets are general SAP knowledge, each marked low confidence and [unverified], and folding them in would make every headline figure rest on them. Whether to fold them in once they are checked is open decision D13. Integration Suite's cells for them cite E1, E3, E8 and E63, and are as uncertain as the rules beneath them.

<!-- figures:begin extended -->
Permutations 3,628,800; valid scenarios 1,168,272. CoreEdge after P6: 30,360 full (2.6%), 304,947 partial (26.1%).

| Slice | Valid | IS full | IS partial | CoreEdge today full | CoreEdge today partial | CoreEdge after P6 full | CoreEdge after P6 partial |
|---|---|---|---|---|---|---|---|
| All valid scenarios | 1,168,272 | 20.8% | 91.5% | 0.0% | 0.2% | 2.6% | 26.1% |
| target SAP_SALES_SERVICE_CLOUD | 58,800 | 14.6% | 98.2% | 0.0% | 0.0% |  |  |
| target SAP_FIELDGLASS | 17,472 | 16.1% | 98.2% | 0.0% | 0.0% |  |  |
| target SAP_IBP | 47,040 | 9.9% | 84.2% | 0.0% | 0.0% |  |  |
| target SAP_BYDESIGN | 36,288 | 18.9% | 98.2% | 0.0% | 0.0% |  |  |
| target SAP_BUSINESS_ONE | 13,608 | 6.9% | 98.2% | 0.0% | 0.0% |  |  |
| target SAP_COMMERCE_CLOUD | 64,512 | 21.8% | 98.2% | 0.0% | 0.0% |  |  |
| tech DATA_PRODUCT | 53,088 | 0.0% | 0.0% | 0.0% | 0.0% |  |  |
| tech BINARY_MEDIA | 147,840 | 0.0% | 98.2% | 0.0% | 0.0% |  |  |
| consumer GO | 83,448 | 22.4% | 93.2% | 0.0% | 0.2% |  |  |
| consumer PHP | 83,448 | 22.4% | 93.2% | 0.0% | 0.2% |  |  |
| consumer MOBILE | 83,448 | 0.0% | 93.2% | 0.0% | 0.0% |  |  |
| consumer SAP_CAP | 83,448 | 33.6% | 93.2% | 0.0% | 0.2% |  |  |
| consumer SAP_BUILD | 83,448 | 22.4% | 93.2% | 0.0% | 0.2% |  |  |
<!-- figures:end extended -->

What it shows: CoreEdge supports none of the six new targets, neither new technology (the broker carries JSON only, so no OData media stream or attachment passes through it) and no mobile app (a long-lived key compiled into a distributed app is a leaked key, and there is no user-delegated login for one to use instead). Go, PHP, CAP and SAP Build reach the same <!-- figures:begin value-partial-Today-extended-consumer-GO -->0.2%<!-- figures:end value-partial-Today-extended-consumer-GO --> partial as every other language, through the static key. Integration Suite reaches the new targets through generic adapters, does not consume data products (Business Data Cloud and Datasphere do), and carries binary payloads only partly.

---

## 4. Capability gap analysis

Each table compares Integration Suite (IS), the best-of-breed tools, CoreEdge today, and the target with the roadmap item that delivers it. External sources are listed in Appendix C.

### 4.1 Connectivity

| Capability | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| SAP cloud systems on the internet | Yes, through receiver adapters [E1] | Yes | Yes, for S/4HANA Cloud Public and SuccessFactors; every SuccessFactors API host (`sapsf.*` included) is on the allow-list since P0.9 (`src/lib/studio/sap-host-allowlist.ts`) | Kept |
| Private networks (RISE, on-premise, ECC) | Cloud Connector (reverse-invoke agent, serves BTP subaccounts only) [E12]; Edge Integration Cell (customer-run Kubernetes) [E11] | Workato on-prem agent: outbound-only, mTLS [E34]; Cloudflare Tunnel [E35] | None. IP literals and `.local`/`.internal` hosts refused (`connection-url-guard.ts:15-33`) | P4.2 CoreEdge Connector: one container, outbound 443, access list held by the customer |
| Fixed outbound IP | Fixed per BTP region | Static IPs or NAT | None configured in product; production setting unknown [unverified] | P4.4: Vercel Static IPs or Secure Compute [E47, E48], self-host NAT, egress echo |
| Outbound proxy and custom CA | Supported on Edge Integration Cell | Standard | None; plain `fetch` (`tdd-connector.ts:614-627`) | P4.1 transport layer |
| Login methods to SAP | Basic, OAuth2 client credentials, SAML bearer, authorization code, X.509, principal propagation via Cloud Connector [E1] | n/a | Basic, bearer, OAuth client credentials, OAuth SAML bearer (signed in-app), API key (`connection-resolver.ts:39-62`) | P4.3: X.509, principal propagation |
| Non-SAP SaaS | About 75 named adapters plus 150+ Open Connectors apps [E1] | MuleSoft, Workato, Nango | None | P5.10: top 5 SaaS plus "pair with Integration Suite" |

### 4.2 Protocols

| Protocol | Integration Suite | CoreEdge today | Target |
|---|---|---|---|
| OData V2 / V4 | Receiver: V2 with MERGE/PATCH, and V4. Sender: V2 only [E1] | Read (first 100 rows or fewer) and create | P1.4 query surface; P2.4 full writes |
| SOAP | SOAP 1.x with WS-Security, SOAP RM [E1] | None | P5.2 with a JSON facade and a SOAP twin |
| REST / HTTP | HTTP receiver, OpenAPI-based API artifacts [E1] | None (Ariba is env-only) | P5.3 |
| RFC / BAPI | RFC receiver via Cloud Connector; RFC sender on Edge Integration Cell only [E1] | None | P5.4 through the connector, with customer-supplied JCo [unverified licence terms] |
| IDoc | IDoc over SOAP [E1] | None | P5.5 |
| Events | Event Mesh (1 MB messages, 250 queues), Advanced Event Mesh [E13] | None; 147 catalogued events cannot be used [R3] | P5.7: governed webhooks plus a change-feed for systems without events |
| Files (SFTP, FTP, SMB) | Yes [E1] | None | P5.5 SFTP |
| JMS, Kafka, AMQP, JDBC, mail | Yes [E1] | None | Not planned. Consume brokers, do not become one (section 9.1) |
| B2B: AS2, AS4, OFTP2, EDI | Yes, plus Integration Advisor and Trading Partner Management [E1] | None | Not planned natively. Pair with Integration Suite (P5.10) |

### 4.3 Data operations

| Operation | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| Read with filter, select, key, paging, expand | Yes (OData receiver; SuccessFactors adapter adds paging) [E1] | Standard | `$top` and `$format` only, 100 rows or fewer (`src/lib/northbound/read.ts:56`) | P1.4: allow-listed query options, opaque cursor paging |
| Field-level scope | Custom JavaScript or XSLT masking | Azure APIM content validation [E33] | Whole rows returned; field picker cannot save (`src/app/(coreedge)/coreedge/apps/[app]/add-feed/page.tsx:23-35`) | P1.5: field grants driven by SAP's PersonalData annotations [E46] |
| Create | Yes | Stripe-style idempotency [E27] | Yes: write key plus mandatory Idempotency-Key, 24-hour replay (`src/lib/northbound/idempotency.ts:33`). Create works in code; not verified live for V2 or V4 (V4 unit-tested only) [R1 §7] | P1.8 live verification of V2 and V4 create |
| Update and delete with ETag | Yes | Standard | Refused; UPDATE can never be activated (`src/app/api/studio/interfaces/route.ts:259-261`) | P2.4 |
| Actions, function imports, deep insert, `$batch` | Yes | n/a | None | P2.4 |
| Customer-built `Z*`/`YY1_*` services | Any endpoint | n/a | Registered by service path and verified from `$metadata` per environment, then read and created through the broker like catalogue services (P1.1, #307; `src/lib/sap-public/service-path.ts`, `interface-service.ts`). No such call is recorded against a live tenant | P1.2 discovery from the tenant's catalogue; P1.8 live verification |
| Bulk extraction and batch create | Splitter, Aggregator, JMS | n/a | None | P5.9, with budgets under SAP API Policy §2.1 [E17] |

### 4.4 Mapping and flows

| Capability | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| Mapping | Graphical message mapping, XSLT 3.0, Groovy/JS scripts, value maps [E1] | DataWeave Playground (MuleSoft) | None. The Mapping card is greyed out and `mappingVersion` is always null (`src/components/studio/InterfacesClient.tsx:273-279`) | P5.8: versioned JSONata in a sandbox, unit-tested against fixtures |
| Multi-step orchestration | Router, Multicast, 7 splitter types, Join, Aggregator, process calls [E1] | Temporal durable workflows [E38] | One call to one entity set | P5.8: code-first flows with saga compensation |
| Queues, retries, dead-letter queue | JMS queues (capacity limits [E15]) with configurable retry; a dead-letter option that sets aside a message which has crashed the worker (out of memory) on two retries, not a general dead-letter queue [E65] [page not re-read for this revision] | Temporal, Svix | No queue. A circuit breaker per SAP system on every governed call, shared through Upstash, observing only until `COREEDGE_CIRCUIT_BREAKER=enforce` (`src/lib/governed/containment.ts`, P0.14) | P5.6 durable runtime |
| Idempotency | Idempotent process call | Stripe [E27] | Yes: 24 hours, 409 on a different body | Kept; reused per flow step |

### 4.5 Events

| Capability | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| Consume SAP business events | Event Mesh and Advanced Event Mesh adapters [E13] | n/a | None | P5.7 ingress |
| Deliver to an app's endpoint | Event Mesh queue webhooks | Standard Webhooks signing [E36]; Svix 8-attempt retry [E37] | None (no webhook code in `src`) | P5.7: signed, retried, dead-letter queue, replay, SUBSCRIBE grants |
| Events from systems that publish none (ECC, `Z` services) | No | No | No | P5.7 change-feed synthesiser |
| Local development | No | `stripe listen` | No | `coreedge listen --forward-to localhost` |

### 4.6 Developer experience and testing

| Capability | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| Discover what works on *this* system | Business Accelerator Hub lists SAP's menu, not what is active on the tenant | Backstage catalogue | Catalogue with live probes; ACTIVATED only on a real 200. Since P0.8 the 148 wrapper rows have no address and are never probed or counted callable, and a V4 address reads "unverified" until a probe of exactly it answers 200 on the system on screen (`src/lib/sap-public/catalogue-address-verification.ts`); non-curated V4 paths are still derived, not discovered | P1.2 tenant discovery plus the SAP admin checklist |
| Try before code | Hub "Try Out" against SAP's sandbox or a configured own tenant, for SAP-published APIs only; no `Z*` services, assertions or saved collections [E61, E69]; iFlow simulation: 10 steps, under 100 KB input, no real calls, no Aggregator [E4] | Postman collections and mock servers [E24] | Test Console: read-only, 50 rows or fewer, needs a key and an approved grant first (`src/app/api/studio/test/broker-run/route.ts:62`) | P1.6 Tenant Twin; P2.1-P2.2 API Lab |
| Assertions and collections | No regression suite; SAP points to partners Figaf and INT4 [E3] | Postman `pm.test`; Pact [E28]; Schemathesis [E29] | `expectation` field stored, never evaluated (`src/app/api/studio/test-cases/route.ts:30`) | P2.1 server-side declarative assertions |
| Import and export | n/a | Postman v2.1, Bruno [E25] | None | P2.3 |
| SDKs | None for consumers | Stainless, Speakeasy; AWS SDK for SAP ABAP | One TypeScript read-only starter kit per interface (`src/lib/studio/scaffold.ts:1017-1035`) | P2.6 TS, Python, Java, .NET; P2.7 ABAP Cloud and classic via abapGit |
| CLI | n/a | Stripe CLI, Postman CLI | None (copy blocked, `src/lib/coreedge/copy.ts:788-808`) | P3.2 |
| Contract from SAP's own description | API designer stubs | OASIS odata-openapi converter [E45] | Schema inferred from sampled rows (`src/lib/studio/schema-capture.ts:1-25`); writes have no request schema | P1.3 Contract Compiler |
| Docs per interface | Developer Hub | Stripe docs | One markdown guide | P2.10 |
| Request log for developers | Monitor app | Stripe Workbench [E64] | Developers cannot open Operations (`src/lib/studio/rbac.ts:106-118`) | P3.7 |

### 4.7 Governance and assurance

| Capability | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| Two-person approval with mandatory expiry | No built-in rule; external approval routing only [E16] | Kong approvals [E31] | **Yes**, stronger: requester and owners cannot approve; every grant must have an expiry (`src/lib/studio/grants.ts:166-286`) | Kept; plus MFA step-up (P0.12) |
| Grant scope | Product and app | MuleSoft contracts | One interface on one SAP product (P0.1, `src/lib/studio/grant-binding.ts`). A grant approved before P0.1 that matched no interface or several is flagged for re-approval and keeps its old matching while `COREEDGE_GRANT_BINDING` is `legacy`, the default | `strict` once `pnpm grants:binding --check` passes |
| Program identity | API key, OAuth, client certificate service keys | Stripe test/live and restricted keys [E26]; OIDC workload identity [E55] | Static key, hashed, shown once, prefixed `ce_live_` (PROD) or `ce_test_`; TEST and PROD keys expire (90 days at most by default) and rotation overlaps for 24 hours (P0.11, `src/lib/northbound/key-policy.ts`); keys issued earlier may still have no expiry and are flagged | P2.5 OAuth; P3.3 workload identity; P4 mTLS |
| Policies | 31 prebuilt: quota, spike arrest, IP access control, threat protection, schema validation [E8] | Apigee [E32], Azure APIM [E33] | Fixed 60 calls a minute per key (`src/lib/security/rate-limit.ts:234`) | P3.5 policy packs with shadow replay |
| Stop switch | Undeploy or revoke per artifact | Per-app kill switch | Per object only: revoke key, revoke grant, retire app, deactivate connection | P3.6 scoped FREEZE, READ_ONLY, THROTTLE |
| Before-commit governance | Git sync (import, pull and push from the tenant) for iFlows only, GitHub cloud only, PAT per operation [E6, E2]; the CI/CD service's documented flow still uses zip exports [E7] | Pact can-i-deploy [E28]; Spectral lint; MuleSoft API governance [E42] | None | P3.1-P3.3 manifest, CLI, CI identity |
| Promotion gates | Transport via CTS+ or Cloud TMS | Pact record-deployment | Report only; PROD not gated on TEST (`src/lib/studio/grants.ts:288-296`) | P3.4 |
| Audit | Message logs 30 days; access logs [E5] | n/a | Per-call row including refusals; retention 7-3,650 days (`src/lib/northbound/retention.ts:57-66`); append-only enforced by a test only; audit writes are best-effort on every path: a failed insert is logged and swallowed (`audit.ts:136-144`), including after a successful SAP create (`src/app/api/northbound/interfaces/[id]/data/write/route.ts:342-394`); no export | P3.10 hash chain, export; P6.4 SIEM |
| Self-service developer portal | Developer Hub: products, subscriptions, monetization [E66] | Kong Dev Portal [E31] | A developer workspace sign-up with Discover, the catalogue and SANDBOX tenants only (P0.13, `src/lib/auth/developer-workspace.ts`), off unless `COREEDGE_DEVELOPER_SIGNUP=open`; no product pages or subscriptions | P2.9; P2.10 |
| SAP licensing (Digital Access) | No insight | n/a | Usage counts calls, rows and writes, not document types | P6.6 estimator |
| SAP API Policy guardrails | n/a | n/a | Catalogue-only resolution matches §1.2 by accident | P3.5 SAP API Controls pack [E17] |
| Per-person identity and consent | Principal propagation via Cloud Connector | RFC 8693 acting-for [E52] | One communication user per connection for every app: one active connection per organisation, product, environment and client (`SapConnection_active_binding_tuple`, `prisma/schema.prisma:744-753`) | P3.11 (one SAP communication user per app, and a tenant ceiling); P6.5 (per person) |

### 4.8 Operations and monitoring

| Capability | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| Message log and trace | Trace switches off after 10 minutes, payload kept 1 hour, logs 30 days [E5] | OpenTelemetry | One audit row per call, metadata only, with correlation id (`src/lib/northbound/respond.ts:44-84`); no OpenTelemetry | P3.7: OpenTelemetry spans per pipeline step; W3C `traceparent` [E39] |
| External export | Splunk, JSON or OTLP, one target at a time, set up via API call [E14] | Vercel drains | None | P3.10 export; P6.4 SIEM streaming |
| Alerts | Cloud ALM routes to email, Teams, ServiceNow | PagerDuty | One nightly drift email to platform admins (`src/lib/ops/connection-probe-sweep.ts:47-86`) | P3.7: stored incidents, alerts to app owners |
| Synthetic checks | Cloud ALM health, every 5 minutes | Postman monitors | Nightly connection probe and lane check (`vercel.json:4-29`) | P3.7: monitors every 5 minutes or less |
| Custom (`Z`) interfaces | Cloud ALM's AIF message monitoring for S/4HANA Cloud: "ODATA/API messages coming from Z-interfaces are, currently, not visualized in CALM" [E19]; broader Cloud ALM coverage of custom APIs [unverified] | n/a | Callable through the broker since P1.1 (#307), with the same audit row per call as catalogue services; no monitor of their own | P3.7: CoreEdge becomes the monitoring layer for customer-built APIs |
| SAP upgrade impact | Upgrade checks for its own Groovy scripts | Stripe API versioning | SAP's lifecycle state, version and named successor are stamped on every deploy from the committed Hub snapshot (P0.8, `scripts/apply-hub-lifecycle.ts`, `HUB_LIFECYCLE_ON_DEPLOY`); before P0.8 `hubState` was null on all 954 production rows [R3]. Every deprecated row shows a successor line, but only 6 of the 61 name one, and nothing alerts an interface owner | P3.8 upgrade radar |

### 4.9 Deployment and security

| Capability | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| Hosting | SaaS on BTP Cloud Foundry, plus the customer-managed Edge Integration Cell runtime on Kubernetes (FSD §3.10) [E1, E11] | Container or Helm | Vercel only: build steps exist only in `vercel-build` (`package.json:22-23`); no Dockerfile; no `output: 'standalone'` (`next.config.ts`) | P4.5 container image, compose, Helm, Terraform |
| Secret custody | Keystore with SAP key renewal, 8 credential types [E1] | KMS envelope encryption | AES-256-GCM with per-row binding, under per-organisation data keys and versioned, rotatable master keys (P0.10, `src/lib/sap-public/secret-envelope.ts`; off until `SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY` is set). The only key provider is `env`, so the master key is an environment variable | A cloud KMS provider (which one is open) |
| Staff sign-in | SAP IAS, BTP roles | OIDC, SAML, SCIM | Magic link to enrol, then optional passkey (WebAuthn) sign-in, which also satisfies MFA (`src/app/api/auth/webauthn/authenticate/verify/route.ts:113-122`; `src/lib/auth/permissions.ts:354-371`). No OIDC or SAML SSO (settings stored, unused). The first platform admin of a new instance is claimed with a one-time bootstrap token, not by signing in first (P0.13, `src/lib/auth/bootstrap.ts`). Whether the passkey login screen is reachable under `WORKBENCH_ONLY` is [unverified] | P0.13; P2.9; P4.6 |
| MFA on governance actions | BTP | Step-up | Every governance route calls `requireStepUp` (P0.12, `src/lib/auth/step-up.ts`): a passkey assertion from the last 5 minutes. `COREEDGE_STEP_UP` defaults to `warn`, which lets the action through and records a `STEP_UP_MISSING` audit row | `enforce` once approvers have passkeys and `WEBAUTHN_RP_ID` is settled |
| Tenant isolation | Separate tenants | Postgres row-level security | Guard defaults to "log" in production (`src/lib/db/tenant-guard.ts`); each violation is counted in `TenantGuardViolation` (P0.12) | `throw` after seven days with no violation recorded |
| HA and DR | Multi-AZ; 99.95% SLA per SAP's April 2026 monthly update [E67], a non-binding deck; the contractual SLA is per the BTP Supplement [unverified] | n/a | Breaker and token caches are per instance; every cron runs inside a `JobLease` row (P0.18, `src/lib/ops/job-lease.ts`) | P4.5 |
| Licence for other teams | n/a | n/a | Proprietary, all rights reserved (`LICENSE:8-14`) | P4.8 decision (taken in Phase 0) |

### 4.10 AI

| Capability | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| AI agents as governed consumers | MCP Gateway, which SAP calls the endorsed pathway for agents [E2]; edition requirement [unverified] (E9 defers to SAP Note 2903776); principal propagation on roadmap [E9] | Azure APIM [E44]; MuleSoft Agent Fabric [E43] | None | P5.10: govern agents that reach SAP through the MCP Gateway; P6.1 runtime MCP only after D2; writes confirmed by a person |
| AI for developers | Flow generation, error resolution, script optimisation, OpenAPI generation; Premium or Enhanced only; a free promotion "until the January 2027 software release" per help.sap.com [E10], whereas SAP's March 2026 update said AI Unit charges were "anticipated to take effect in late Q2 2026" and metering would ship "by the end of Q3 2026 at the latest" [E68] | Postbot | None | P2.11 Studio MCP and failed-call explainer; P6.2 copilot |
| Anomaly detection | API Management anomaly detection | Apigee per-app analytics | 10 fixed rules, computed when a page loads (`src/lib/ops/incidents.ts:404-458`) | P6.3 |
| Rule for AI claims | n/a | n/a | n/a | A "works" answer must carry a passing run id (P2.11, P6.2) |

### 4.11 Content and migration

| Capability | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| Prebuilt content | 10,500+ artifacts to copy and configure (SAP's figure, all products) [R1 §3] | Workato recipes; MuleSoft Exchange | Catalogue lists 1,366 Integration rows and 308 scenarios; runs none [R3] | P2.14 Starter solutions: a manifest, interfaces, a Lab collection and the SAP-admin checklist generated from one communication scenario (`SapCommScenario`) |
| Migration from SAP PO or Cloud Integration | Migration Assessment, at no extra cost [E70] | n/a | None | P5.11 Inventory import, ahead of SAP PO 7.5's end of mainstream maintenance (31 December 2027 per a 2020 SAP post [E71]; verify on SAP's current maintenance calendar) |

---

## 5. Developer journeys

### 5.1 The target journey for every developer

```
 1 Sign up             self-service workspace, test key issued at once                  (P0.13, P1.7)
 2 Discover            catalogue + this tenant's own services + "ask Basis for SAP_COM_x" (P1.2)
 3 Try                 API Lab against the Tenant Twin: no grant, no SAP admin needed     (P1.6, P2.2)
 4 Get a client        coreedge pull -> SDK in your language + contract + twin seed     (P2.6, P2.7, P3.2)
 5 Build               code against the twin (hosted, or offline with `coreedge twin up`)
 6 Pre-commit          coreedge verify: declared calls only, no token literals, suites green (P3.2)
 7 CI                  GitHub/GitLab/Azure action, OIDC identity, no stored secret       (P3.3)
 8 Ask for real access coreedge request: DEV grant with CI evidence attached             (P3.1)
 9 First real call     second person approves; key or OAuth client delivered            (target 1 business day)
10 Promote             release DEV -> TEST -> PROD through evidence gates                (P3.4)
11 Run                 monitors, traces, alerts to the app's owners, request log         (P3.7)
12 Survive upgrades    upgrade radar warns from the TEST tenant before PROD              (P3.8)
```

### 5.2 "Test before you write code" (the Postman-like flow)

| Step | Today | Target |
|---|---|---|
| Open a request builder | No builder. The Test Console needs a solution with three owners, an interface, a grant approved by a second person and a key issued by a non-owner (`src/app/api/studio/test/broker-run/route.ts:137`) | `/studio/lab` opens with the Twin environment selected and no grant needed (P2.2) |
| Choose an API | SAP-published catalogue only | Catalogue plus the tenant's own services, or an uploaded EDMX (SAP's service description file) (P1.2) |
| Build the request | Entity set and a row count of 50 or fewer | Filter, select, key, order, paging within the interface's query policy; create, update, delete and actions on the twin (P1.4, P2.4) |
| Add checks | Stored but never evaluated | Status, row-count range, schema match, JSONPath, latency, failure reason (P2.1) |
| Chain requests | No | Captured values feed later steps, for example create then read back (P2.1) |
| Save and share | Saved case with no assertions | Collections with environments: TWIN, SANDBOX, DEV, TEST, PROD (P2.1) |
| Take it elsewhere | No | Export to Postman v2.1, Bruno, `.http`; Newman runs it in CI (P2.3) |
| Turn it into access | Manual | "Save as interface and request DEV grant" attaches the run as evidence (P2.2) |
| Get code | A TypeScript read-only kit | Snippets for curl, fetch, Python, Java, C#, ABAP Cloud, classic ABAP, Power Automate and MCP (P2.2); full SDK (P2.6, P2.7) |

### 5.3 Governance before commit

| Step | Today | Target |
|---|---|---|
| Declare what the program needs | Nothing; the app is a name, three owners and an optional repository URL | `coreedge.yaml` manifest (P3.1) |
| Check locally | Nothing | `coreedge verify` as a pre-commit hook (P3.2) |
| Check in CI | Only by calling discovery with a stored long-lived key, which spends the 60 calls a minute and is audited as app traffic | GitHub, GitLab or Azure DevOps action using OIDC workload identity; a non-main branch can never hold a PROD token (P3.3) |
| Catch leaked keys | `ce_` prefix exists (`src/lib/northbound/auth.ts:25`) but nothing scans for it | Secret-scanning patterns; GitHub partner programme registration [E56] (P0.11) |
| Gate a deployment | Nothing | `coreedge can-i-deploy --to PROD`: grants, contract compatibility, suites, upgrade acknowledgements (P3.2, P3.4) |

### 5.4 Journeys by developer type

**JS/TS**

| Step | Today | Target |
|---|---|---|
| Access | About 12 steps and at least 2 people before the first call [R1 §6] | Test key at sign-up; twin in minutes (P1.7) |
| Client | Starter kit per interface, reads only; OpenAPI always describes GET even for create interfaces (`scaffold.ts:62-198`) | Typed SDK per solution covering every operation; retries only on 429/503 honouring Retry-After (P2.6) |
| Local mock | Node `mock.mjs` with real tenant rows, gitignored (`scaffold.ts:748-860`) | Hosted twin, or `coreedge twin up` offline with synthetic data (P1.6, P3.2) |
| Browser apps | Token must stay server-side | Backend-for-frontend template; acting-for user tokens (P6.5) |

**Python**

| Step | Today | Target |
|---|---|---|
| Client | "Run openapi-generator" against OpenAPI 3.1, which openapi-generator calls beta [E60] | Python SDK from the same contract (P2.6) |
| Mock | Needs Node | Hosted twin; CLI twin (P1.6, P3.2) |
| CI | Nothing | Same action as JS/TS (P3.3) |

**Java and .NET**

| Step | Today | Target |
|---|---|---|
| Client | Generic generator; SAP Cloud SDK does not apply (the northbound API is REST/JSON, not OData) | Java and .NET SDKs (P2.6b); optional OData facade so SAP Cloud SDK and CAP can be used natively (P6.7) [E63] |
| Integration tests | No container image | Twin reachable over HTTP; container image of the twin (P1.6, P4.5) |
| Auth | Static key | OAuth client credentials with `private_key_jwt` (P2.5); mTLS when self-hosted (P4) |

**ABAP on-premise** (classic ABAP on S/4HANA on-premise, RISE or ECC)

| Step | Today | Target |
|---|---|---|
| Destination | SM59 type G connection, STRUST trust for the CoreEdge certificate chain, client-side SNI (`icm/HTTPS/client_sni_enabled`, SAP Note 2124480); untested outline [R4] | Same set-up steps, generated as a checklist (P2.10) |
| Credential | Static Bearer header set in code; SM59 cannot store arbitrary headers | OAuth client credentials via an OA2C_CONFIG profile [unverified: reportedly release 750 plus SAP Note 3324172] (P2.5) |
| Client | Hand-written HTTP and JSON casing | Generated `ZCL_CE_CLIENT_CLASSIC` plus typed structures and V2 date/decimal converters, delivered via abapGit and checked by abaplint (P2.7) |
| Tests | None | ABAP Unit test double that serves twin fixtures (P2.7) |
| SAP calling an external program | Not governed | Governed outbound route with an egress grant (P3.9) |
| Exposing on-premise SAP to other programs | Not reachable from hosted CoreEdge | CoreEdge Connector (P4.2) |

**ABAP Cloud** (S/4HANA Cloud developer extensibility or the BTP ABAP environment)

| Step | Today | Target |
|---|---|---|
| Outbound set-up | Outbound HTTP service, communication scenario and arrangement with the "Unauthenticated" method; `cl_web_http_client_manager`; header set in code. This is SAP-documented [E20] but untested against CoreEdge | Same, with the arrangement generated as a checklist |
| Credential | Static header in code | Communication system with an OAuth client-credentials outbound user [unverified per release] (P2.5) |
| TLS trust | Unknown how the CoreEdge certificate is trusted [unverified] | Verified in the P2.7 lab test |
| Client and CI | None | `ZCL_CE_CLIENT_CLOUD` via abapGit; Project Piper ABAP Unit/ATC step (SAP_COM_0735) [E22] |

**Low-code** (Power Automate, UiPath)

| Step | Today | Target |
|---|---|---|
| Import | Power Platform needs Swagger 2.0 under 1 MB [E23]; CoreEdge emits OpenAPI 3.1 only | One generic connector: the interface list comes from `x-ms-dynamic-values` and typed fields from `x-ms-dynamic-schema` [E59] (P2.8) |
| Triggers | None | `x-ms-trigger` on governed events (P5.7) |
| Shared IP | The per-IP limit of 300 GET a minute is shared by every caller behind one address (A43) | Credential-keyed backstop (P0.5) |

**AI agents**

| Step | Today | Target |
|---|---|---|
| Coding agents (Claude Code, Cursor, Copilot) | No MCP | Studio MCP: search, read contracts, run the twin, draft. It can never approve or issue (P2.11) |
| Runtime agents | No path | Through Integration Suite's MCP Gateway as a governed backend (P5.10); a CoreEdge `/api/mcp/{solution}` only after D2 (P6.0, P6.1): OAuth 2.1 resource server [E40]; tools generated only from live grants; writes confirmed by a person; each agent is its own principal (P6.1) |
| SAP rules | Not addressed | SAP API Policy §2.2.2 restricts agents; deny-by-default until the organisation records a legal attestation [E17] |

**Human testers**

| Step | Today | Target |
|---|---|---|
| Role | None; only consultants can build in Studio, platform admins can view it read-only, and no tester role exists (`src/lib/studio/rbac.ts:92-104`) | `tester` role: Lab and collection runs only (P2.9) |
| Tools | Postman by hand with a once-shown key | Lab, collections, exports, nightly suites, monitors (P2.1-P2.3, P3.7) |
| Evidence | None | Suite results attached to promotions (P3.4) |

### 5.5 Journeys by non-developer role

**ABAP provider and key user** (the customer's own team building `Z*`/`YY1_*` services)

| Step | Today | Target |
|---|---|---|
| Build | A RAP or `YY1_` service in ADT or the key-user apps; CoreEdge calls it once it is registered by path (P1.1, #307) | Same tools |
| Expose | Add it to a custom communication scenario | Same; the checklist names the scenario (P2.10) |
| Register and verify | Register by path and verify per environment (P1.1, `Interface.serviceVerifications`); the path is typed, not discovered | Discovery from the tenant's catalogue (P1.2) |
| Contract and twin | Schema from sampled rows | Twin from its `$metadata` (P1.3, P1.6) |
| Transport | Not tracked | DEV -> TEST -> PROD, re-verified on each, with a P3.4 gate "service verified on the target environment"; contract diffs on the `Z` service (P3.8) |

**SAP administrator (Basis)**

| Step | Today | Target |
|---|---|---|
| Know what to switch on | Asked by email; an administrator must open each API [R1 §6 step 3] | A generated per-tenant checklist (P2.10), marked done in CoreEdge |
| Diagnose | All connection failures look the same | Connectivity Doctor results (P4.4) |
| Role | None in CoreEdge | A read-and-acknowledge role (P2.9) |

**Approver and data owner**

| Step | Today | Target |
|---|---|---|
| Learn a request is waiting | Nothing notifies them | Inbox, notifications, reminders and delegation (P2.13) |
| Who may approve | Any second builder or platform admin (`src/lib/studio/rbac.ts:102`, `canMutateControlTower` at `:145`) | WRITE and PERSONAL_DATA grants need the recorded data owner (P2.13) |

**Auditor**

| Step | Today | Target |
|---|---|---|
| Evidence | Control Tower screens only | Read-only evidence export (P3.10, P6.4) |

**CoreEdge operator** (runs CoreEdge itself)

| Step | Today | Target |
|---|---|---|
| Release and recover | One production deployment and one database (`docs/deployment-urls.md:8,23,43-45`). The release protocol is written and checked (P0.17, `docs/runbooks/coreedge-release.md`): migration gates, rehearsed backout SQL and a post-deploy check. No timed restore has been run, and the RPO and RTO are not set | A timed restore that meets the RPO and RTO the product owner sets (P0.17) |
| Keys | One raw environment key | KMS rotation and reseal (P0.10) |
| Connectors | None | Fleet enrolment and updates (P4.2, P4.5) |

---

## 6. Governing external programs

The product owner asked that "the external program connected is also being controlled and governed". Governance here means five things, done for every program, in both directions: a program calling SAP, and SAP calling a program.

| Verb | What it means | Today (evidence) | Gap | Target |
|---|---|---|---|---|
| **Identify** | Know which program is calling, which build it is, and on whose behalf | One static `ce_` key per solution per environment (`src/lib/northbound/auth.ts:25-37`; unique per org, solution and environment in `prisma/schema.prisma:1128-1160`) | No proof of possession; no build identity; no end user; no source IP in audit | Manifest (P3.1); OAuth with `private_key_jwt` (P2.5); CI workload identity (P3.3); build header (P3.1); acting-for `sub`/`act` (P6.5); source IP in audit (P3.10); DPoP-bound tokens for proof of possession (P2.5) |
| **Approve** | A second person decides on evidence, for a limited time | Two-person rule, mandatory expiry, write checklist, owners cannot issue their own keys (`src/lib/studio/grants.ts:166-286`; `src/app/api/studio/clients/route.ts:156-176`) | Grants approved before P0.1 keep their old matching while `COREEDGE_GRANT_BINDING` is `legacy` (the default); step-up only warns while `COREEDGE_STEP_UP` is `warn` (the default); PROD not gated on TEST | Switch both to refuse (`strict`, `enforce`); promotion gates on evidence (P3.4); quarterly recertification (P6.4) |
| **Contain** | Limit what the program can do and stop it at once | 60 calls a minute per key; revoke key or grant; retire app (`src/lib/security/rate-limit.ts:234`) | No quotas, budgets, field scope, IP ranges or time windows; no scoped stop switch; breaker not wired | Field grants (P1.5); policy packs (P3.5); FREEZE, READ_ONLY and THROTTLE by scope with dual control (P3.6); graded automatic response (P6.3) |
| **Monitor** | See behaviour and tell the owners | Audit row per call; 10 incident rules computed when a page loads; nightly lane checks | No stored incidents; alerts go only to platform admins; no traces | Monitors, OpenTelemetry, owner alerts (P3.7); behavioural baselines (P6.3) |
| **Prove** | Show an auditor what was allowed, by whom, and what happened | ConfigAudit and NorthboundAuditEvent; retention configurable | Append-only by test only; no hash chain, export or SIEM; audit writes best-effort on every broker path (`audit.ts`), including after a successful SAP create. Workbench write-backs are audited fail-closed before SAP is called (P0.7) | Hash chain plus daily anchors, export, fail-closed writes (P3.10); SIEM, evidence packs, access reviews (P6.4) |

**A program's life under governance (target).**
1. The team commits `coreedge.yaml`. It declares the interfaces, fields, operations, budgets, networks and whether the program is an AI agent.
2. CI checks that the generated client exposes only declared operations, flags raw calls and token literals, and runs the contract suites; the runtime refuses anything outside the manifest.
3. A manifest change raises grant requests. Only people approve them.
4. Each call carries the manifest version and a decision id.
5. Policy runs in shadow mode before it is enforced.
6. A stop switch contains the program by scope.
7. Owners recertify every quarter; anything not recertified expires.
8. Retiring the app stops every key.

**SAP's own rules are part of governance.** SAP API Policy v.4.2026a [E17]:
- §1.1 and §1.2: Published APIs are those on the Business Accelerator Hub "or otherwise identified in product-specific Documentation". Non-published APIs must not be used "except as permitted by the Documentation or otherwise authorized by SAP (e.g., customers may use custom-developed ABAP interfaces in private cloud and on-premise deployments)". Private cloud and on-premise custom ABAP interfaces are given as an example of permitted use, not as an exclusive list; whether S/4HANA Cloud Public extensibility documentation permits `YY1_*` or `Z*` APIs is the D2 question.
- §2.1: SAP-published rate and extraction limits apply.
- §2.2.2: AI agents and bulk extraction are prohibited outside SAP-endorsed paths. SAP names Integration Suite's MCP Gateway as the endorsed pathway for agents [E2].
- §3: controls must not be circumvented through intermediaries such as proxies and gateways.

SAP's 2018 Digital Access paper [E18] says middleware does not count as an SAP application, so CoreEdge does not reduce a customer's indirect-use exposure. The SAP API Controls policy pack (P3.5) and the Digital Access estimator (P6.6) turn these into checks. How §1.2 applies to `YY1_*` services on S/4HANA Cloud Public needs a legal reading (decision D2).

---

## 7. Target architecture and innovations

### 7.1 Architecture

```
 CONSUMERS  TS/Py/Java/.NET apps | ABAP Cloud & on-prem (abapGit SDK) | Power Platform/UiPath | AI agents (MCP) | testers (Lab)
  +----------- ENTRY POINTS (all call the same pipeline) ------------------------------------------------------+
  | /api/northbound/v1/*  (ce_live_/ce_test_ key or OAuth2 JWT)    /api/northbound/oauth/token   /api/mcp      |
  | /api/twin/...   /api/outbound/{route} (SAP calls out)   /api/events/ingest/*   webhooks out                 |
  | /api/mgmt/v1 (personal tokens, CI OIDC) <- CLI     Studio Lab / Test Console / Workbench console reads      |
  +-----------------------------------------------+-------------------------------------------------------------+
  +----------- GOVERNED PIPELINE  src/lib/governed/pipeline.ts (new; extracted from data/route.ts, write/route.ts)
  | 0 containment switch -> 1 identity -> 2 manifest version -> 3 grant (interface, product, env, op, fields)  |
  | -> 4 policy (shadow or enforce) -> 5 quota/budget -> 6 binding to SAP connection -> 7 circuit breaker      |
  | -> 8 ADAPTER (plan, dispatch) -> 9 response guard (hide SAP host, field scope, PII mask)                    |
  | -> 10 audit (outbox, fail-closed on writes, hash chain, decision id) -> 11 meter (one call = one unit)     |
  +-----------------------------------------------+-------------------------------------------------------------+
     ADAPTERS   odata-v2 | odata-v4 | soap | rest | rfc | idoc | file | event-mesh
     TRANSPORTS (the existing fetchImpl seam: read.ts:143-145, write.ts:220-222, connection-health.ts:215,
                 connection-resolver.ts:660,747; plus tdd-connector.ts:614-628 sapFetch and ariba-connector.ts,
                 which call fetch directly and must be moved onto it)
       +- direct     undici dispatcher: proxy, custom CA, X.509    -> S/4 Public, SuccessFactors, Ariba, BTP, SaaS
       +- twin       Tenant Twin engine (TwinStore: Postgres hosted, SQLite/in-memory in the CLI) -> no network, synthetic data
       +- connector  via Relay, outbound mTLS on 443               -> RISE, on-prem S/4, ECC (OData/SOAP/RFC/IDoc)
       +- integration-suite  an iFlow or API proxy as backend      -> B2B/EDI and the long tail
  +----------- CONTROL PLANE (the existing Next.js app on Vercel, or the container image) ---------------------+
  | Service registry (+ custom paths, tenant discovery)   Contract Compiler: $metadata/EDMX/WSDL -> Contract IR  |
  |   -> OpenAPI 3.1 / 3.0.3 / 2.0, JSON Schema, PII tags, SDKs, twin, docs, MCP tools, upgrade diff            |
  | API Lab (collections, assertions, monitors)   Manifest, releases, promotion gates, can-i-deploy              |
  | Policy store (packs, shadow replay, decision log)   Identity (dual keys, OAuth AS, token exchange, CI trust)|
  | KeyProvider (env, AWS/GCP/Azure KMS, Vault)   Evidence vault (hash chain, export, SIEM, access reviews)     |
  | Screens: Studio (+Lab, docs), /coreedge board, Operations (+Containment), Control Tower (+Parity)          |
  +--------------------------------------------------------------------------------------------------------------+
  DURABLE RUNTIME (jobs port, P2.0: Vercel Queues/Workflows hosted, graphile-worker self-hosted): outbox, async writes,
  DLQ, webhooks, flows, bulk, monitors
  ============================================ customer network ===============================================
  CoreEdge Connector (one container, HA pair): enrolment, customer-held access list, local vault or HSM,
  RFC plugin (Java sidecar on customer-supplied JCo), IDoc and SFTP, event subscriber, local hash-chained log
```

### 7.2 How it fits today's code

| Component | Builds on | First change |
|---|---|---|
| Pipeline | `src/lib/governed/pipeline.ts` (P0.14): named steps and one refusal table, which the read, write, broker-run and preview routes run on; since P0.14b every Workbench console route too, as the `console` principal (`src/lib/governed/console.ts`) | The seven probe routes on A.3 #9's exemption list move by P3 or with P4.1 |
| Service registry | `interface-service.ts`, `service-path.ts`, the verify-service route (P1.1, merged in #307) | P1.2 adds discovery from the tenant's catalogue |
| Transports | The minimal `Transport` and `SapConnection.transport` (DIRECT, TWIN) from P0.14 (`src/lib/governed/transport.ts`) over the executors' `fetchImpl`; `sapFetch` (`tdd-connector.ts`) and `ariba-connector.ts` bypass it | P1.6 registers the twin engine; P4.1 adds the dispatcher, the connector and the console paths |
| Grants | `ApiAccessGrant` (`prisma/schema.prisma`), bound to `interfaceId` and `sapProduct` since P0.1 | Adds `fieldScope`, `manifestVersionId`, `direction` |
| Keys | `src/lib/sap-public/connection-crypto.ts`, and since P0.10 `secret-envelope.ts` and the `KeyProvider` (`src/lib/sap-public/keys/`), whose only provider is `env` | A cloud KMS provider; `sign` and JWKS for P2.5 and P3.10 (P1.4's paging cursors are sealed (AES-256-GCM) under the token ring, `COREEDGE_TOKEN_KEYS`, and do not wait for it) |
| Policy | `src/lib/security/rate-limit.ts`, `src/lib/studio/data-class.ts`, `src/lib/northbound/access.ts` | P3.5 TypeScript evaluator; Cedar only after a latency benchmark |
| Lab | `TestCase`, `MockFixture`, `broker-run/route.ts`, `src/lib/ops/lane-check-sweep.ts` | P2.1 |
| Modules built before they were used | `circuit-breaker.ts`, `src/lib/sap-public/rotation.ts`, `src/lib/coreedge/correlation-lookup.ts`, `src/lib/coreedge/service-health.ts`: none was imported outside its tests | P0.14 wired them: the pipeline's `contain` step, the connection save path, Operations' correlation-id search, the SAP system screen |

### 7.3 Design principles

1. **One governed pipeline, no side doors.** Every entry point runs the same ordered steps and writes the same evidence. An entry point that cannot use the pipeline does not ship. Until P0.7 the Workbench write-back wrote no audit row (`src/app/api/sap/tdd/write/route.ts`); it now writes one before SAP is called. Since P0.14b every Workbench console route that reaches SAP runs on the pipeline as the `console` principal and leaves a platform-scope row (`src/lib/governed/console.ts`); `/api/sap/tdd/catalog`, `hub-content/seed` and `/api/sap/ariba/catalog` make no live call, which the A.3 #9 test checks. Seven routes that probe a system or a definition (connection Test, probe-before-swap, service verification, lane checks, connection probes) still reach SAP outside it, on that test's reviewed exemption list (P0.7, P0.14b).
2. **Free to play, governed to ship.** The twin needs no grant. DEV, TEST and PROD keep the two-person rule. Twin results are labelled TWIN and never count as evidence.
3. **One contract, many projections.** SAP's service description is compiled once. OpenAPI, SDKs, twin, docs, assertions, field policy, MCP tools and upgrade diffs are generated from it.
4. **Declare, then enforce only what was declared.** CI, the CLI and AI may request and attach evidence; only people decide.
5. **Shadow before enforce.** Every new rule first replays against past traffic.
6. **Honest status.** Only a live 200 counts as proven (`src/lib/sap-public/hub-content.ts`). The parity scorecard is generated from tests.
7. **One call, one record, one unit.** Replays, dry runs and console traffic are labelled and never billed.
8. **Dial out; the customer's keys stay the customer's.**
9. **Respect SAP's rules** (section 6).
10. **Pair, don't clone,** where Integration Suite has a ten-year lead.
11. **Boring infrastructure and open standards:** Postgres queue, OpenTelemetry, OAuth RFCs, Standard Webhooks, CloudEvents, MCP, OpenAPI, abapGit. Everything exports.

### 7.4 Choices made between competing proposals

| Question | Choice | Why |
|---|---|---|
| Mock lanes or a twin? | One stateful Tenant Twin, used as a transport and as a public OData endpoint | ABAP, Postman, low-code and agents can all reach it |
| Scripts in the Lab? | Server-side declarative assertions only. Postman `pm.*` scripts are kept as comments; arbitrary scripts run only locally in the CLI | No user JavaScript runs on a multi-tenant host |
| SDKs | Thin hand-written runtime per language plus generated types | Fits serverless; idiomatic; OpenAPI exports remain for anyone else |
| Policy engine | TypeScript evaluator first; Cedar only if p95 latency stays under 10 ms | Every call pays the cost |
| Order of phases | Governance as code (P3) before network reach (P4) and protocols (P5) | Every later adapter inherits identity, policy, containment and evidence |

### 7.5 Innovations beyond Integration Suite

| Innovation | What it is | Why it goes beyond Integration Suite | Phase |
|---|---|---|---|
| Tenant Twin | A stateful OData V2/V4 emulator compiled from the customer's own `$metadata`, including `Z*` services. It supports writes, ETags, CSRF and SAP error shapes, with fault injection | IS simulation: 10 steps, under 100 KB input, mocked calls only, no writes, no Aggregator [E4]. Hub "Try Out" runs against SAP's sandbox or a configured own tenant, for SAP-published APIs only, with no assertions or saved collections [E61, E69] | P1.6 |
| Contract plus SDKs for every language, including ABAP | One contract per app, in three OpenAPI dialects; TS, Python, Java and .NET runtimes; ABAP Cloud and classic classes via abapGit | IS ships no consumer SDKs | P1.3, P2.6, P2.7 |
| can-i-deploy for SAP | Manifest, CLI and CI actions with OIDC identity; evidence attached to grants | IS Git sync covers iFlows only, GitHub cloud only, with a PAT per operation [E6, E2]; the CI/CD service's documented flow still uses zip exports [E7] | P3.1-P3.4 |
| Policy shadow replay | A new rule replays 30 days of traffic ("would have blocked 412 calls") before it can be enforced; every response carries a decision id | API Management has 31 policy types [E8] but no replay or decision log | P3.5 |
| Field grants from SAP's annotations | SAP's PersonalData vocabulary tags fields; grants carry the field list; the CIO passport shows which fields leave SAP | Masking in IS needs custom JavaScript or XSLT | P1.5 |
| Business-scoped stop switches | FREEZE, READ_ONLY or THROTTLE for a deployment, organisation, connection, app, key or agent, with auto-expiry and dual control | IS stops per artifact (undeploy) or per key | P3.6 |
| Upgrade radar with a TEST rehearsal | Nightly contract diffs; suites rerun on the TEST tenant right after SAP upgrades it, ahead of PROD [E57] | IS checks only its own scripts | P3.8 |
| Governed outbound routes | SAP or ABAP calls an external API through an expiring egress grant, with a typed ABAP method and a twin of the external API | In IS this needs an iFlow | P3.9 |
| Change-feed synthesiser | Events for ECC and `Z` services that publish none | Event Mesh carries only events SAP emits | P5.7 |
| Governed agent access | Agents as principals with budgets; tools generated from grants; writes confirmed by a person. For SAP targets, agents reach SAP through the endorsed MCP Gateway while CoreEdge governs the agent | SAP calls the IS MCP Gateway the endorsed pathway for agents [E2]; a CoreEdge runtime MCP straight to SAP is the restricted route under SAP API Policy §2.2.2 [E17] until D2 says otherwise | P5.10; P6.1 blocked on D2 |
| Parity scorecard generated from tests | The simulation recomputed from code flags; a cell turns full only after a passing run within 7 days | No iPaaS vendor publishes a self-verifying matrix | P0.15, P1.9 |
| Approvals decided on evidence | "Save as interface and request grant" attaches Lab runs and CI results; the SAP admin checklist is generated from the 496 scenarios mapped to 1,832 APIs (`SapCommScenario`, `prisma/schema.prisma:6502`) | IS keeps approval, testing and SAP-side setup in separate tools | P2.2, P2.10 |
| Customer-held connector with a zero-knowledge vault | One container; the access list is owned by the customer; the SAP secret can stay on site | Cloud Connector serves BTP only [E12]; Edge Integration Cell needs Kubernetes [E11] | P4.2 |
| Digital Access estimator; one call = one unit | Licence-relevant document counts per SAP system | IS meters per 250 KB block, counts each splitter output, and bills an API proxy call plus its iFlow as two messages [E3, E2] | P6.6 |
| Monitoring layer for customer-built APIs | Per-call trace and audit for `Z` services | Cloud ALM's AIF message monitoring for S/4HANA Cloud does not currently show OData/API messages from Z-interfaces [E19]; broader Cloud ALM coverage [unverified] | P1.1 + P3.7 |

---

## 8. Roadmap

### 8.1 Summary

**Size key** [estimate, defined for this document]:
- S: up to 1 engineer-week
- M: 2-3 engineer-weeks
- L: 4-6 engineer-weeks
- XL: 8 or more engineer-weeks

**Total effort.** The per-phase durations add up to about 79-96 calendar weeks at 3-4 engineers, roughly 55-90 engineer-months [estimate]. P0 and P1 were re-estimated in this revision. By the size key, P0's original 16 items sum to about 28-44 engineer-weeks, which 3-4 engineers cannot do in 5-6 weeks (15-24 engineer-weeks available). P1's dependency chain (P1.1 -> P1.3 -> P1.4 -> P1.6 -> P1.7) ran 18.5-28 weeks before P1.3 was started early and P1.6 was split. P2 is also tight: about 38-56 engineer-weeks of items against 30-48 available, which is one reason P2.6 is split. Before these changes the longest chain in the roadmap (P0.1 -> P1.1 -> P1.3 -> P1.4 -> P1.6 -> P4.1 -> P4.2 -> P5.4 -> P5.5) was 42-63 weeks [estimate]. An earlier figure of 20-28 engineer-months understates this. Plan with the higher figure, and use the ranked blockers (P0.15) and the time-to-first-call funnel (P2.12) to decide what to cut.

**Coverage after each phase** **[simulated]**. Each phase applies its `cellUpgrades` from `docs/coreedge/gap-matrix.json` on top of today's cells and all earlier phases. Each upgrade names the items that deliver it and the reason for its level. Re-run with `node scripts/coreedge/simulate-gap-matrix.mjs`; the table is rewritten by `pnpm coreedge:figures`, and its "Biggest movers" column is computed: the dimension values whose partial and full coverage rose most, and the lifecycle stages that became full. Lifecycle counts are out of 18.

<!-- figures:begin phases -->
| After | Full | Partial | Lifecycle stages full (of 18) | Biggest movers [computed] |
|---|---|---|---|---|
| Today | 0 (0.0%) | 1,512 (0.3%) | 1 |  |
| P0 | 0 (0.0%) | 1,512 (0.3%) | 2 | Stages now full: SECRETS_KEYS |
| P1 | 36 (0.0%) | 1,512 (0.3%) | 3 | Full: JS_TS 0.0% to 0.1%. Stages now full: DISCOVER |
| P2 | 432 (0.1%) | 6,384 (1.3%) | 4 | Partial: ODATA_V2 1.2% to 5.0%, ODATA_V4 1.2% to 5.0%, SYNC_UPDATE_DELETE_ACTION 0.0% to 3.0%, PUBLIC_INTERNET 0.8% to 3.5%. Full: S4_PUBLIC 0.0% to 0.6%, SUCCESSFACTORS 0.0% to 0.5%, ODATA_V2 0.0% to 0.4%. Stages now full: MOCK_TEST_BEFORE_CODE |
| P3 | 648 (0.1%) | 7,980 (1.6%) | 12 | Partial: SAP_CALLS_OUT 0.0% to 1.9%, ODATA_V2 5.0% to 6.2%, ODATA_V4 5.0% to 6.2%, PUBLIC_INTERNET 3.5% to 4.3%. Full: S4_PUBLIC 0.6% to 0.9%, ODATA_V2 0.4% to 0.7%, DOTNET 0.0% to 0.2%. Stages now full: DEVELOP_SDK_CODEGEN, CI_PRECOMMIT_GOVERNANCE, DEPLOY_PROMOTE_ENVIRONMENTS, RUN_MONITOR_ALERT, GOVERN_AUDIT_COMPLY, SAP_UPGRADE_IMPACT, ONBOARDING_TIME_TO_FIRST_CALL, PROVIDER_BUILD_TRANSPORT |
| P4 | 7,560 (1.5%) | 28,500 (5.7%) | 13 | Partial: ODATA_V2 6.2% to 22.2%, ODATA_V4 6.2% to 22.2%, SYNC_CREATE 3.0% to 10.8%, SYNC_READ 3.0% to 10.8%. Full: ODATA_V2 0.7% to 6.2%, ODATA_V4 0.3% to 5.6%, SYNC_CREATE 0.4% to 4.8%. Stages now full: SELF_HOST_SETUP |
| P5 | 24,288 (4.9%) | 164,331 (33.0%) | 14 | Partial: FILE_SFTP 0.0% to 43.0%, REST 0.0% to 43.0%, B2B_EDI 0.0% to 40.3%, HUMAN_TESTER 8.1% to 47.0%. Full: RFC_BAPI 0.0% to 7.0%, EVENTS 0.0% to 6.1%, CONCUR 0.0% to 5.6%. Stages now full: DESIGN_MAP |
| P6 | 30,360 (6.1%) | 265,599 (53.4%) | 15 | Partial: ECC 39.5% to 70.2%, S4_ONPREM 39.5% to 70.2%, S4_PRIVATE_RISE 39.5% to 70.2%, FILE_SFTP 43.0% to 67.2%. Full: AI_AGENT 0.0% to 7.3%, HUMAN_TESTER 3.7% to 7.3%, ODATA_V2 10.4% to 13.0%. Stages now full: AI_ASSIST |
| IS (for reference) | 133,875 (26.9%) | 466,725 (93.8%) | 5 |  |
<!-- figures:end phases -->

**Why "full" stays low.** A scenario turns full only when six cells are full at once. After P6, many of those cells are still below full (section 3.9):
- SAML bearer and principal propagation toward RISE, on-premise S/4 and ECC (partial);
- consumer mTLS, which no phase credits (none for every consumer type; caveat 9b);
- user-delegated login, partial for every consumer type except testers and agents;
- the static key for ABAP and agents, and OAuth for low-code and testers (partial);
- IDoc and file adapters (partial wherever SAP offers them, so 0% full on both technologies), SOAP calls out and B2B (partial).

That one partial cell holds the whole scenario at partial. The roadmap's per-item acceptance criteria are therefore the better measure of progress within a phase. The scorecard (P1.9) should show both.

### 8.2 Phase 0: Harden what exists

**Goal:** make today's broker, explorer and governance screens trustworthy before anything is built on them. The phase:
- lands `custom-service-path` first (P1.1, scheduled here);
- closes the 33 audit findings still open after batches 1 and 2 (Appendix D) and their residuals;
- adds KMS, credential hygiene, MFA step-up and onboarding;
- closes the write-back audit gap;
- fixes catalogue addresses;
- extracts the pipeline;
- drives the committed simulator from a code-generated capability registry and adds the governance property test;
- adds a release protocol, cron job leases and a database budget (P0.17-P0.19);
- takes the licence decision (P4.8) and starts measuring time to first call (P2.12).

**Estimate:** about 28-44 engineer-weeks by the size key for the original items, more with the items added in this revision, so 9-12 weeks at 3-4 engineers [estimate]. Run it in two parts:
- **P0a, the credential gate (3-4 weeks):** land `custom-service-path` (P1.1), P0.7, P0.9, P0.10 (env provider plus one KMS), P0.12, job leases (P0.18), the licence decision (P4.8) and journey events (P2.12).
- **P0b:** everything else. P0.3, P0.6, P0.8 and P0.16 may slip into the start of P1.

With P0.15 no longer waiting on P0.14, the longest P0 chain is P0.1 -> P0.14 (6-9 weeks).

**Definition of done for every item from here on:** new tenant models are added to `TENANT_ANCHORED_MODELS` (`src/lib/db/tenant-guard.ts:37-50`), and each new lookup by credential (P0.11 overlap hash, P1.7 test keys, P1.6 twin endpoint, P2.5 `client_id`, P2.11a and P3.2 personal tokens, P3.3 CI issuer, P4.6 SCIM bearer, P5.7 subscriptions) gets a narrow `isUnscopedByDesign` entry (model, operation and exact where-shape) with a unit test. Today the only such entry is `SolutionClient.findUnique` by `tokenHash` (`tenant-guard.ts:121-129`), so without this step every one of those features fails in production once the guard throws.

**P0.1 Close the remaining governance-gate holes (A46, A47, A52, A69, batch-1 residual races).** Size M. Depends on: P1.1 (landed first).
- Problem:
  - A47: one grant extends to new interfaces on other SAP systems.
  - A46: a sequence of PATCHes reaches ACTIVE without the gates.
  - A52: "Activate" on a twin environment returns an empty 500.
  - A69: departed owners still count as owners.
  - The owner check and the owner reclaim are not serialised.
  - The claim-link close can throw after a key write, losing the new token.
- Solution:
  - Add `ApiAccessGrant.interfaceId` and `sapProduct`, with a backfill; unmatched rows are flagged for re-approval.
  - Re-run the gates on any contract change to an ACTIVE interface, audited as PROMOTE.
  - Apply the twin-environment refusal to PATCH.
  - Owner liveness: an app with no live owner drops to RESTRICTED in the nightly sweep.
  - `SELECT ... FOR UPDATE` on the solution row; key write and link close in one transaction.
- Value: one approval authorises exactly one interface, on one product, in one environment.
- Code: `prisma/schema.prisma` (ApiAccessGrant), `src/lib/northbound/access.ts`, `src/lib/studio/grants.ts`, `src/app/api/studio/interfaces/route.ts`, `src/app/api/studio/solutions/route.ts`, `src/app/api/coreedge/requests/[id]/decide/route.ts`, `src/lib/northbound/issue.ts`, `src/lib/northbound/claim-link.ts`.
- Acceptance:
  - A grant for interface X never authorises Y on another product.
  - No PATCH order reaches ACTIVE without the gates and a PROMOTE row.
  - Twin-environment Activate returns a typed 409.
  - A deactivated owner moves the app to RESTRICTED within one sweep.
  - A two-process race test never ends with an owner-approved grant.
- Status: shipped in Phase 0b (PR #310). `ApiAccessGrant` carries `interfaceId` and `sapProduct`, backfilled; a grant that matched no interface or several is flagged for re-approval. `COREEDGE_GRANT_BINDING` defaults to `legacy` (an unbound grant keeps its old matching on the interfaces that existed at the deploy); switch to `strict` once `pnpm grants:binding --check` exits 0. Contract changes to an ACTIVE interface re-run the gates and are audited as PROMOTE; twin Activate is a typed 409; a nightly sweep moves an app with no live owner to RESTRICTED. Operator steps: `docs/runbooks/coreedge-grant-binding.md`.

**P0.2 One authorisation predicate for lanes and broker (A14-A19, A50, A60, A70).** Size M. Depends on: P0.1, P1.1.
- Problem: the lane board can say "Live" while the broker refuses every call.
  - The access hop ignores SANDBOX_ONLY, READ_ONLY and DEPRECATED.
  - Binding ignores product and SAP client.
  - Unknown lanes are drawn as passed.
  - Ledger statuses are dropped.
  - Evidence is not tied to the connection that produced it.
  - "Never checked" is shown wrongly.
  - Health never decays.
  - Stale reads are counted.
  - Retired apps are re-checked.
- Solution: shared `authorisesHere()` and `bindingFor()` used by access, lanes, queries and the sweep; evidence keyed by connection, entity set and interface version; a TTL on evidence; unproven hops drawn as unproven.
- Value: the board becomes a true preview of the broker, which monitors, promotion gates and the scorecard depend on.
- Code: `src/lib/coreedge/lanes.ts:340-441`, `src/lib/coreedge/queries.ts:136-293`, `src/lib/ops/lane-check-sweep.ts:139-258`, `src/lib/northbound/access.ts`, `src/lib/studio/connection-health.ts`.
- Acceptance:
  - Property test: "live" implies "the broker would serve" in 100% of generated cases.
  - Replacing a connection demotes the lane.
- Status: shipped in Phase 0b wave 2. `authorisesHere`, `bindingFor` and the write route's gates live in `src/lib/northbound/authorisation.ts`; the read and write routes, discovery's `callable`, the lane board (`src/lib/coreedge/lane-authorisation.ts`, `queries.ts`) and the lane sweep and Re-check (`planLaneCheck`) all answer from them, wave 1a's grant binding and key state included. Evidence is keyed by connection, entity set and interface version (`LaneCheck.entitySet`, `interfaceVersion`; a re-saved connection drops its checks), unproven hops are drawn "not checked", and connection health decays after 48 hours (`connectionHealthVerdict`). The governance property test draws the lane for every case and asserts Live implies served and served implies not refused at a gate. The connection's transport is part of the predicate too (integration review round 3, `transportRefusal` and `reachedDirectly` in `src/lib/governed/transport.ts`, a factor in the property test): a lane on a `TWIN` connection with no twin engine is drawn refused at binding and discovery reports `callable: false` for it, as the broker answers `503 TRANSPORT_UNAVAILABLE`, and the lane sweep, the connection probe, Test, Probe now, the rotation probe and the console never send a `TWIN` connection's credentials to its base URL. No call-path behaviour changed and no setting was added. Operator notes: `docs/runbooks/coreedge-lane-truth.md`.

**P0.3 Truthful registers and screens (A29, A30, A45, A51, A58, A59, A61, A62, A63).** Size M. Depends on: P0.2.
- Problem: screens tell operators untrue things, for example Catalogue Health saying CURRENT after any probe, the passport listing expired access as current, and the jobs strip omitting two crons. Creates cannot be switched on from any screen either: no UI calls `/api/studio/clients/write-credential`, the connection form has no write-secret field, a re-save resets `writeEnabled` to false (`src/app/api/studio/connections/route.ts:559,587`) and PATCH refuses to enable writes (`:627-632`), while `src/components/studio/InterfacesClient.tsx:232` tells users to issue the write credential "under API Access".
- Solution: fix each at source. Separate `importedAt`; per-service metadata probe; masked key tail; all crons registered; the expiry and environment predicates from P0.2; corrected copy; an empty-board state for apps with no feeds. Add a write-credential action under API Access (non-owner, with step-up) and a write-secret field on the connection form that keeps `writeEnabled` on re-save.
- Value: operators can act on what the screens say.
- Code: `src/lib/sap-public/catalogue-health.ts`, `hub-content.ts`, `src/app/(coreedge)/coreedge/passport`, portfolio and Ops tokens routes, the claim page, `src/app/(coreedge)/coreedge/apps/[app]`.
- Acceptance: one regression test per finding; a recorded manual pass on a seeded org; a create interface reaches its first audited 201 using screens only.
- Status: shipped in Phase 0b wave 2. Catalogue Health judges freshness from `SapHubContent.importedAt`, which only imports write (A29). The lane check asks each lane's own service for its `$metadata`, once per service per sweep, and records a 403 there as `FORBIDDEN`, drawn "SAP refused" (A30). `SolutionClient.tokenTail` holds each key's own last four, so the claim page and every console show one reference; keys minted before it read "ending not recorded" (A45). `src/lib/ops/scheduled-jobs.ts` lists every cron, checked against vercel.json and the cron routes (A51). The passport and the SAP systems list count only grants in force by the broker's clock, never SANDBOX (A58). Both connection registers report `brokerReachable` and `deploymentTenant` (console reads only, never the broker) instead of a "fallback" (A59). Operations > Tokens and Control Tower's credential register count write keys on live credentials only (A62); the portfolio and throttle views were already fixed by P0.11 and are pinned by a test (A61). An app with no feeds shows its board with the empty state (A63). Studio API Access has an "Issue write key" action (non-owner, `write_key.issue` step-up) and the Connections form has "Allow writes", ticked by default when re-saving a writing connection (a "write secret" field first added beside it was sealed and never read by anything, so integration review round 3 removed it and the API's requirement for it); a save that turns writes on, or keeps them on while pointing the row at another system (environment, SAP host or base path, SAP client), is the step-up action `connection.enable_writes`, and the save writes only while the row is still the one it was judged on. `tests/integration/create-from-screens.test.ts` takes a create interface to its first audited 201 through the routes the screens call. No setting was added and no call path changed. Operator notes: `docs/runbooks/coreedge-truthful-screens.md`.

**P0.4 Contract and fixture hygiene (A38, A42, A56, A57, residuals).** Size S. Depends on: none.
- Problem:
  - A changed entity set keeps the stale schema and fixtures (A38).
  - Discovery says `callable: true` for refused feeds (A42).
  - Dry-run rows lose `failureReason` (A56).
  - A NOT_FOUND run is captured as a 502 fixture (A57).
  - The generated `client.ts` fails `tsc --strict`.
- Solution: clear or re-stamp on version bump; make discovery use the data route's resolver; carry `failureReason`; capture 404 fixtures; type the client; filter deferred navigations.
- Value: developers can trust the contract and mock. This is a precondition for the compiler and the twin.
- Code: `src/lib/studio/schema-capture.ts`, `src/lib/studio/fixtures.ts`, `src/lib/studio/scaffold.ts`, `src/app/api/northbound/interfaces/route.ts`, `src/app/api/studio/test/broker-run/route.ts`.
- Acceptance:
  - The schema endpoint never serves an older version.
  - Mock and broker statuses match for every failure reason.
  - The generated client compiles under `strict` in CI.
- Status: delivered in Phase 0b, with no new setting. Captures are stamped with the contract they were read under and cleared on a contract change; the migration stamps existing ones from the audit trail and withholds those whose contract cannot be established. Discovery runs the data route's own chain (`src/lib/northbound/read-verdict.ts`) and names the refusal. Fixtures have one scenario per broker outcome (`not_found` and `timeout` added). CI compiles the generated client (`pnpm check:scaffold-client`). Operator notes are in `docs/runbooks/coreedge-contract-hygiene.md`.

**P0.5 Rate-limit attribution and error-classification residuals (A43, A44, batch-2 follow-ups).** Size M. Depends on: none.
- Problem:
  - One runaway key throttles others behind the same IP (A43).
  - A limiter outage is reported as throttling (A44).
  - Token-endpoint failures are misclassified.
  - Replays inflate traffic counts.
  - Console 429s raise the throttled incident.
- Solution:
  - A per-credential IP backstop bucket; 503 `LIMITER_UNAVAILABLE` on limiter outage.
  - One `credentialFailure` classifier: configuration errors map to NEEDS_SETUP; token 429/5xx/timeout map to retryable 502/504 with `TOKEN_*`.
  - Exclude replays from traffic counts; record console 429 as 502 `HTTP_429`.
  - Authenticated machine routes (`/api/northbound`, `/api/twin`, `/api/events/ingest`, `/api/mgmt`, `/api/outbound`, `/api/mcp`) are limited per credential, subscription or route, with only a high per-IP ceiling as a backstop. Today edge middleware limits every `/api/*` call by client IP before the route runs (120 non-GET and 300 GET a minute, `src/middleware.ts:243-280`, `src/lib/security/rate-limit.ts:212-214`), which would throttle event senders, shared CI runners and SDK suites.
- Value: one meaning per status code, which the SDK retry logic depends on.
- Code: `src/lib/security/rate-limit.ts`, `src/lib/northbound/read.ts`, `write.ts`, `failure-reason.ts`, `src/lib/sap-public/connection-resolver.ts:660-673`, `oauth-saml-bearer.ts`, `src/lib/ops/topology.ts`, `src/lib/coreedge/queries.ts`.
- Acceptance:
  - A table-driven test of token-endpoint answer × auth type × path checks status, reason and retry advice against the developer guide's retry table.
  - A flooding key cannot throttle another key.
- Decision: machine routes are keyed at the edge by a hash of the presented bearer (600 a minute) and then a per-IP backstop (6,000 a minute) that only a key its own bucket admitted can spend; an address whose presented keys fail to authenticate more than 60 times a minute is refused at the edge before any lookup (`machine-authfail:<ip>`), so made-up keys cannot buy more database lookups than the old per-IP bucket allowed; refusals by the address say `429 RATE_LIMITED_ADDRESS`, distinct from a credential's `429 RATE_LIMITED`; a call with no bearer, and every browser route, keep the old per-IP buckets. `COREEDGE_MACHINE_RATE_LIMIT=ip` restores the old keying as a rollback. A limiter outage still fails closed on every route class, as today, but answers `503 LIMITER_UNAVAILABLE` with `Retry-After` instead of 429, and is audited 503 with that reason, which the throttle view and both incident rules leave out. Token-endpoint reasons are now one `TOKEN_*` vocabulary for both auth types; rows written before keep their old codes (`docs/runbooks/coreedge-rate-limits.md`).
- Status: shipped in Phase 0b (PR #310), as the decision above. `COREEDGE_MACHINE_RATE_LIMIT` defaults to `credential` (`ip` is the rollback); a limiter outage answers `503 LIMITER_UNAVAILABLE`; token-endpoint failures share one `TOKEN_*` vocabulary (`src/lib/sap-public/upstream-failure.ts`). Operator steps: `docs/runbooks/coreedge-rate-limits.md`.

**P0.6 Make Ariba truthful (A71-A75).** Size S. Depends on: none.
- Problem:
  - v2 paths are shown but calls go to v1.
  - A malformed realm config reads as "no realms".
  - An unknown endpoint key returns 502.
  - A token outage is reported as a parse error.
  - `$top=NaN` is sent.
- Solution: fix each at source, as a holding fix until P5.3 moves Ariba onto the REST adapter.
- Value: nothing reports a call that never happened.
- Code: `src/lib/sap-public/ariba*`, `src/app/api/sap/ariba*`.
- Acceptance: one test per finding; no outbound request is made when the configuration is bad.
- Status: shipped in Phase 0b. The catalogue lists the paths the call sends to, and marks a v1 path pinned by `ARIBA_SOURCING_V1` with its own description. A malformed `ARIBA_REALMS_JSON`, an empty list included, is `realmsError` with `configured: false`, and the call route refuses it. An `ARIBA_BASE_URL` or `ARIBA_OAUTH_TOKEN_URL` that is not an absolute http(s) URL is `configError`, refused the same way, not a 502. An unknown endpoint key, a realm the deployment does not configure, and a `limit` that is not a positive integer are each `400 VALIDATION_ERROR`. All of these are refused before any token exchange. A token-endpoint failure is reported as `stage: "token"` with a `TOKEN_*` reason and the endpoint's status. One setting was added: `ARIBA_REALM_ALLOWLIST`, which defaults to `enforce`; `off` is the rollback. Tests: `tests/unit/api/sap-ariba-truthful.test.ts`. Operator steps: `docs/runbooks/sap-ariba-explorer.md`.

**P0.7 Close the Workbench write-back audit gap.** Size M. Depends on: none.
- Problem:
  - `POST /api/sap/tdd/write` creates records in a live SAP tenant with no audit row (`src/app/api/sap/tdd/write/route.ts:15-136`).
  - The route is already fail-closed: platform admin only (`:96`), `{PREFIX}_WRITE_ENABLED` must be exactly `true` (`src/lib/sap-public/tdd-connector.ts:601-603`, checked at `write/route.ts:62,87`), a write secret that fails closed when unset (`:36`), and a confirmation phrase (`:99`). It is live only because `S4_TDD_WRITE_ENABLED` is set in production [R3; not re-checked for this revision]. A second flag would add nothing.
  - A second route also writes: `POST /api/sap/tdd/hub-content/write-test` creates and then deletes a record, with only a best-effort `logDecision` (`write-test/route.ts:124-137`).
  - Neither audit table can hold these rows as it stands: `NorthboundAuditEvent.organizationId` and `ConfigAudit.organizationId` are required (`prisma/schema.prisma:1252`, `:1096`), and the platform admins who make these writes may have no organisation (the first user becomes `platform_admin` without one, `src/lib/auth/auth-options.ts:24-26`).
- Solution:
  - Now, with no code change: unset `S4_TDD_WRITE_ENABLED` in the Vercel production environment.
  - A platform-scope audit row (a nullable `organizationId` plus `scope = PLATFORM`, or a sentinel platform organisation), written fail-closed **before** SAP is called and naming the person, on both routes.
  - A static test, keyed on imports of `createSapEntitySetRecord` and `runCapabilityWriteTest`, that every such route writes that row.
- Value: the last side doors that change SAP data are closed.
- Code: both routes, `src/lib/sap-public/tdd-connector.ts:1236-1268`, `src/lib/northbound/audit.ts`, Prisma, a new static test.
- Acceptance: every write-back and write-test is audited before the SAP call; the static test fails for an unaudited new route; production shows the route disabled unless `S4_TDD_WRITE_ENABLED` is deliberately set.
- Status: shipped in Phase 0a (#308). Both routes write a `PlatformAuditEvent` naming the person before SAP is called, and refuse the write when it cannot be recorded; a static test covers every route that imports the SAP write helpers. No setting was added: `{PREFIX}_WRITE_ENABLED` stays the one switch. Whether `S4_TDD_WRITE_ENABLED` is unset in production is an operator check (`docs/runbooks/sap-workbench-write-back.md`).

**P0.8 Fix catalogue addresses and lifecycle data.** Size M. Depends on: none.
- Problem:
  - 148 `sap-s4-*` wrapper rows are probeable with malformed addresses.
  - All V4 addresses are guessed; the one checked was wrong.
  - `hubState` is null on all 954 production rows, so 61 deprecated APIs look normal [R3].
  - SuccessFactors resolves only 3 literal ids.
- Solution:
  - Exclude wrapper rows.
  - Label derived V4 addresses "unverified" until a live 200.
  - Import Hub lifecycle data on deploy.
  - Resolve SuccessFactors from Hub ids.
- Value: Discover shows what really works, and deprecated APIs show their successor.
- Code: `src/lib/sap-public/hub-content.ts:390-582`, `dynamic-catalog.ts`, `hub-successors.ts`, `resolve-hub-service.ts`, `scripts/import-sap-hub-content.ts`.
- Acceptance: 0 wrapper rows probeable; 61 DEPRECATED rows each show a successor; V4 rows show "verified" only after a recorded 200.
- Acceptance as delivered (amended): the second criterion is met only in part. Every DEPRECATED row shows a successor line, but that line names an SAP successor for 6 of the 61; for the other 55 it says none is recorded. Naming the rest is an open decision (runbook, "Open decisions"), not done.
- Status: partially delivered in Phase 0b. The first and third criteria are met; the second is met for 6 of 61 rows. Wrapper rows have no address (one derivation, `catalogueAddress`), so they are never probed, resolved or counted callable. Each V4 address reads "unverified" until a probe of exactly it answers 200 on the system on screen, recorded per organization, tenant, connection and host (`CatalogueAddressVerification`, migration `20261023020000`). SAP's lifecycle is stamped on deploy from the committed `api-hub-catalog.json` snapshot (`scripts/apply-hub-lifecycle.ts`, `HUB_LIFECYCLE_ON_DEPLOY`, default `apply`; existing rows and lifecycle columns only, idempotent, no network), and the two deployed import paths that dropped it are fixed. Every DEPRECATED row shows its successor line in the row: 6 of the 61 have an SAP-named successor; the other 55 say none is recorded, because the Hub's `Successors` field is behind its login — an open decision. SuccessFactors Hub ids resolve to the `/odata/v2` root. Operator notes: `docs/runbooks/coreedge-catalogue-addresses.md`.

**P0.9 Admit the SuccessFactors API hosts and prove SAML bearer live before 20 November 2026.** Size S. Depends on: none.
- Problem: `sapsf.com`, `sapsf.eu` and `sapsf.cn` are missing from the allow-list (`src/lib/studio/sap-host-allowlist.ts:41-53`). SAP retires Basic login for SuccessFactors APIs on 20 November 2026, one month after this document [R1 §3; confirm with SAP]; CoreEdge's SAML-bearer path is unit-tested only.
- Solution: add them, checked against SAP's list of SuccessFactors API servers [unverified]. Document `SAP_HOST_ALLOWLIST_EXTRA`.
- Value: real SuccessFactors tenants can connect.
- Code: the allow-list and its tests.
- Acceptance: `api17.sapsf.com` is admitted; `evil-sapsf.com` is refused; a live SAML-bearer read against a SuccessFactors tenant has a correlation id, or, until then, the Studio form warns, with a dated message, before a new SuccessFactors Basic connection is saved (existing connections untouched).
- Decision: warn, do not refuse. Basic still authenticates after 20 November 2026 until SAP deletes it on a tentative 12 November 2027 (`SF_BASIC_AUTH_DELETION_DATE`), so refusing would block working setups. The save succeeds and `POST /api/studio/connections` returns the notice as `warning` (`src/lib/sap-public/sf-basic-auth-sunset.ts`; `docs/runbooks/successfactors-saml-signing.md`).
- Status: partly shipped in Phase 0a (#308). The SuccessFactors API hosts are on the allow-list and a new SuccessFactors connection saved with Basic gets the dated warning. The live SAML bearer run against a tenant is still owed (`docs/runbooks/successfactors-saml-signing.md`).

**P0.10 KMS envelope encryption for SAP secrets.** Size L. Depends on: none.
- Problem: one raw environment key with no key id, version, rotation or reseal (`src/lib/sap-public/connection-crypto.ts:93-103`). The keystone runbook requires this before real client credentials are stored (`docs/coreedge/SAP-CONNECTION-KEYSTONE-RUNBOOK.md:110-131`).
- Solution:
  - A `KeyProvider` with the env provider plus one cloud KMS (the one hosted production uses). GCP KMS, Azure Key Vault and Vault Transit move to P4.5.
  - `encrypt`/`decrypt` plus `sign`/`verify` and JWKS publication, which P2.5 JWTs, P3.10 anchors, P4.2 connector certificates and P5.7 webhook secrets need. (P1.4's cursors are sealed (AES-256-GCM) under the token ring, `COREEDGE_TOKEN_KEYS`, instead: decision D6 of its spec.)
  - One data key per organisation, wrapped and stored once in an `OrgDataKey` table, with a per-instance data-key cache.
  - New blob format `ce2:<keyVersion>:<iv>:<ct>`, keeping today's per-row binding (`connectionAad`, `src/lib/sap-public/connection-crypto.ts:117`).
  - `ce keys rotate`, `reseal` and `verify`, plus a restore drill.
- Value: a clear answer to "who can decrypt the customer's SAP password"; the prerequisite for bring-your-own-key and self-host.
- Code: `connection-crypto.ts` and every sealing call site; scripts; the runbook.
- Acceptance:
  - Every blob carries a key version; reseal migrates 100% of rows.
  - Every connection opens after a rotation; the restore drill passes.
  - With no KMS configured, the env provider behaves as today.
- Status: shipped in Phase 0a (#308), without a cloud KMS. Per-organisation data keys in `OrgDataKey`, the `ce2` format, a master-key ring (`SAP_CONNECTION_ENCRYPTION_KEYS`, off until `SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY` is set), `pnpm keys:rotate`, `reseal`, `verify` and `retire`, and a restore drill (`docs/coreedge/SAP-KEY-RESTORE-DRILL.md`). The `KeyProvider` declares `sign`, `verify` and JWKS, but the only provider built in is `env`, which refuses them; which cloud KMS to plug in is open. P1.4's paging cursors do not use it: they are sealed (AES-256-GCM) under the token ring (`COREEDGE_TOKEN_KEYS`).

**P0.11 Credential hygiene.** Size M. Depends on: none.
- Problem: runtime keys, including those holding a write key, may never expire (`src/app/api/studio/clients/route.ts:66,196`; `src/lib/northbound/issue.ts:229,238`; the write key is sealed on the same `SolutionClient` row); rotation cuts over at once; one prefix covers test and live.
- Solution:
  - Mandatory expiry for TEST and PROD keys (default 90 days or less).
  - Previous hash valid for an overlap window (default 24 hours).
  - `ce_test_` and `ce_live_` prefixes.
  - Published secret-scanning regexes.
- Value: rotation stops being an outage.
- Code: `src/lib/northbound/auth.ts:25-37`, `issue.ts`, `claim-link.ts`, `SolutionClient`, the Studio clients UI.
- Acceptance:
  - PROD without an expiry returns 400.
  - Zero failed calls across a rotation inside the overlap.
  - Expired keys never show as live.
- Status: shipped in Phase 0b. The settings are `COREEDGE_KEY_EXPIRY` (default `enforce`, applied only when a key is minted), `COREEDGE_KEY_MAX_TTL_DAYS` and `COREEDGE_KEY_DEFAULT_TTL_DAYS` (both default 90) and `COREEDGE_KEY_ROTATION_OVERLAP_HOURS` (default 24). Existing keys keep working, and those with no expiry are flagged "no expiry - set one". Operator steps are in `docs/runbooks/coreedge-credential-hygiene.md` and the scanning patterns in `docs/coreedge/secret-scanning.md`. Registration with GitHub's partner programme [E56] is still open.

**P0.12 MFA step-up on governance routes; tenant guard in throw mode.** Size M. Depends on: none.
- Problem: the `/coreedge` layout (`src/app/(coreedge)/layout.tsx:43-46`) and the CoreEdge API routes (decide, issue, rotate, revoke, claim link, write enable, secret save) do not check MFA. The tenant guard defaults to log in production unless `TENANT_SCOPE_GUARD` is set (`src/lib/db/tenant-guard.ts:93-98`); the production value is [unverified]. MFA is passkey-only and optional: it is enforced only when the organisation's policy is `required` or the user opted in (`src/lib/auth/permissions.ts:355-374`), so most approvers have no passkey to step up with. The passkey relying-party ID comes from the host name (`src/lib/auth/webauthn.ts:33`), so moving to a custom domain would invalidate every enrolled passkey.
- Solution:
  - Require a passkey for anyone who decides, issues, rotates, revokes, enables writes or saves secrets; prompt enrolment at the first such action and in P0.13's onboarding.
  - `requireStepUp(user, 5 min)` in each of those routes. Personal and CI tokens (P2.11a, P3.2, P3.3) can never perform these actions.
  - Settle the production domain (`WEBAUTHN_RP_ID`) before this ships.
  - Record guard violations durably (an Upstash counter per model, operation and route, or a sampled `TenantGuardViolation` table the guard exempts), because Vercel keeps runtime logs for 1 day on Pro and 3 days on Enterprise [E73] and the production plan is [unverified]. Switch to throw only after 7 days with zero violations and after P0.11's overlap lookup is registered.
- Value: separation of duties holds even if a session is stolen.
- Code: `src/lib/auth/permissions.ts`, `src/app/api/coreedge/**`, the Studio clients, access-grants and connections routes.
- Acceptance:
  - An end-to-end test per route gets 403 without a fresh assertion.
  - 0 recorded guard violations in 7 days before throw mode.
- Status: shipped in Phase 0a (#308). Every governance route calls `requireStepUp` (`src/lib/auth/step-up.ts`). `COREEDGE_STEP_UP` defaults to `warn`: the action goes ahead and a `STEP_UP_MISSING` audit row records it; `enforce` refuses with `403 STEP_UP_REQUIRED`. Guard violations are counted in `TenantGuardViolation`; production stays in log mode until an operator switches it after seven clean days. Operator steps: `docs/runbooks/coreedge-step-up.md`.

**P0.13 Self-service developer onboarding on the shared host.** Size M. Depends on: P0.12.
- Problem:
  - A magic-link user gets no organisation.
  - `/signup` creates a role that cannot open Studio (`src/app/api/auth/signup/route.ts:109`).
  - The admin API cannot create organisations.
  - `WORKBENCH_ONLY` redirects the invite screens (`src/middleware.ts:113`).
  - The first person to sign in becomes platform admin.
  - SMTP over implicit TLS (port 465) fails.
- Solution:
  - A "developer workspace" sign-up with access to Discover, the catalogue and the SAP API Hub sandbox only. The twin does not exist yet; twin rights for a solo workspace arrive with P1.7.
  - `POST /api/admin/organizations`.
  - Invite and member screens reachable under `WORKBENCH_ONLY`.
  - A one-time bootstrap token for the first admin.
  - SMTP implicit TLS.
- Value: the first minute of time to first call.
- Code: `src/lib/auth/auth-options.ts`, `src/app/api/auth/signup/route.ts`, `src/app/api/admin/*`, `src/middleware.ts:70-141`, `src/lib/routing/workbench-paths.ts`, `src/lib/email/brevo.ts`.
- Acceptance: on production, a new email address reaches Discover and invites a colleague with no database access; a stranger cannot claim a fresh instance.
- Decision: open sign-up is a setting, `COREEDGE_DEVELOPER_SIGNUP=open` (default off: `/signup` and magic-link sign-in admit and create exactly what they did, and a typo reads as off), with an optional domain list (`COREEDGE_DEVELOPER_SIGNUP_DOMAINS`). Open, a new person's first clicked sign-in link (from `/signup/developer` or the sign-in page) creates their own organization and a new, narrowest role, `sandbox_developer`, in one transaction; nothing is written before the click. The role opens Studio to read (Discover, the catalogue) and live-reads SANDBOX tenants only, the deployment's own tenant included, so the API Hub sandbox is declared as a SANDBOX deployment tenant; it is false for every governance gate (decide or request access, issue/rotate/revoke a key, claim links, write keys, connections at any environment, apps, feeds, account and organization administration) and invites sandbox developers only, with pending invitations counted as seats. Sign-up is limited to 10 an hour per caller address and 5 an hour per email address. Members and invitations live at `/coreedge/members`, reachable under `WORKBENCH_ONLY`. `POST /api/admin/organizations` is platform-admin only with step-up `org.create` and a `PlatformGovernanceAudit` row. The first platform admin is claimed at `/coreedge/bootstrap` with `COREEDGE_BOOTSTRAP_TOKEN` (32+ characters, constant-time, single use by recorded hash, every attempt audited, step-up `platform.bootstrap`, refused whenever an active admin exists); nobody is made admin by signing in first. SMTP: 465 is implicit TLS, every other port must STARTTLS (`docs/runbooks/developer-onboarding.md`).
- Status: shipped in Phase 0b (PR #310), as the decision above. `COREEDGE_DEVELOPER_SIGNUP` defaults to `off`. Operator steps: `docs/runbooks/developer-onboarding.md`.

**P0.14 Extract the governed pipeline and wire the modules already built.** Size L. Depends on: P0.1, P0.5, P1.1.
- Problem: the check sequence is hand-copied across the read, write and broker-run routes and console reads. Four tested modules are not imported anywhere. Most Workbench console routes reach SAP outside it (P0.14b).
- Solution:
  - `src/lib/governed/pipeline.ts` with named steps and typed refusals.
  - Port the routes onto it with no behaviour change.
  - Wire the circuit breaker with shared Upstash state.
  - Probe a new secret before it replaces a working one.
  - A correlation-id search box in Operations.
  - A minimal `Transport` interface and `SapConnection.transport`, with direct and twin implementations (an extra S), so P1.6 plugs in as `transport: TWIN` without waiting for P4.1.
- Value: every later feature becomes a step or an adapter.
- Code: the data, write and broker-run routes, `src/app/api/sap/tdd/preview/route.ts`, `circuit-breaker.ts`, `rotation.ts`, `correlation-lookup.ts`, `service-health.ts`.
- Acceptance:
  - Golden audit rows match before and after with `id`, `createdAt`, `correlationId` and `durationMs` removed (each changes on every call, `prisma/schema.prisma:1250-1323`); a parity table of refusal reason by status code holds across all routes.
  - 5 failures open the breaker in both of two processes.
  - A mistyped rotated secret never replaces a working one.
- Status: built in Phase 0b wave 2 (branch `p0-14-governed-pipeline`). `src/lib/governed/pipeline.ts` holds the eight steps (authenticate, rate limit, resolve interface, authorise, bind connection, contain, call SAP, audit) and `REFUSAL_STATUS`, the one table of refusal reason to status; the read, write, broker-run and preview routes run on it, and golden rows recorded from the routes before the port match after it (`tests/fixtures/governed-pipeline/golden-audit-rows.json`). No step holds a transaction across SAP. The circuit breaker is the `contain` step, shared through Upstash when configured; `COREEDGE_CIRCUIT_BREAKER` defaults to `observe` (counts and logs, never refuses), and `enforce` answers `503 CIRCUIT_OPEN`; the Workbench preview counts into a console circuit of its own per organization, so a builder's query cannot refuse production calls or another organization's previews. A re-saved connection secret is sent to SAP once (the sign-in and the probe path's `$metadata`, at the probe path and timeout the save sends or the stored ones) before it replaces a working one (active, last Test or nightly probe OK or a lane read within 24 hours, changed sign-in credentials on the same system), under `COREEDGE_ROTATION_PROBE`: `observe` (the default) never refuses and says on the form when SAP refused the new secret or could not check it; `enforce` refuses only when SAP refused the sign-in (the tenant's 401, the token endpoint's 400, 401 or 403) while the stored secret is known to work, so no refusal is ever inferred without SAP's answer; `off` turns it off. Every save's audit row records `rotationProbe: { mode, ran, outcome, reason }` (wave 2 final review round 3: the earlier version refused correct rotations on inference, and its `rotationProbed` claimed probes that never reached SAP); a probe that reached SAP is audited even when the save then fails. The Connections form loads and sends back every stored non-secret setting (probe path, timeout, token URL and the rest), so a re-save from it no longer clears them. Operations has a correlation-id search and the SAP system screen shows each service's verdict and owner. `SapConnection.transport` (DIRECT default; TWIN refused until P1.6 registers its engine) is the minimal Transport. Operator steps: `docs/runbooks/coreedge-governed-pipeline.md`, `docs/runbooks/coreedge-circuit-breaker.md`.

**P0.14b Bring the Workbench console onto the pipeline.** Size M-L. Depends on: P0.14.
- Problem: about 13 `/api/sap/tdd/*` and `/api/sap/ariba/*` routes import the SAP connectors and call SAP through `sapFetch` (`src/lib/sap-public/tdd-connector.ts:614-628`) or `ariba-connector.ts`, not the pipeline. Preview, entities, operations, capabilities and the catalogue probes pass a role gate and an environment ceiling or grant check and write a console audit row (`src/lib/sap-public/console-read-guard.ts`). `/api/sap/tdd/catalog`, `hub-content/seed`, `hub-content/write-test`, `/api/sap/tdd/write`, `/api/sap/ariba/catalog` and `/api/sap/ariba/call` write none [whether each makes a live call was not checked]. Tenants configured through `S4_TDD_*` environment variables skip the host allow-list that stored connections pass [R2]. As things stand A.3 test 9 cannot pass.
- Solution: run console reads through the pipeline as a named "console" principal with a platform-scope audit row, labelled and not billed; put env-configured tenants under the same host allow-list. Where a route cannot move, it goes on an explicit exemption list that the A.3 #9 static test reads.
- Acceptance: the A.3 #9 static test passes with an empty or reviewed exemption list.
- Status: built in Phase 0b wave 2 (branch `p0-14b-console-pipeline`). The ten Workbench routes that reach SAP or Ariba (preview, entities, operations, capabilities, the catalogue overlay and detail probe, Probe all, the Ariba call, the write-back and the write-test) open a console call (`src/lib/governed/console.ts`) and run authorise (the sandbox developer's SANDBOX ceiling, now on every one of them, and the environment ceiling), bind (the host check), contain (the console's own circuit, reads only) and `callSap`, which refuses to run before those pass and audits every call and refusal. Each writes the organization's console row as before and a new platform-scope `PlatformConsoleRead` row (principal `console`), not billed and off the Workbench write tables, which the code before P0.14b reads as writes, so an Instant Rollback leaves the write ledger true (integration review round 4; an Ariba call, which has no organization row, is found by the correlation search through it); console reads stay best-effort, the write-back stays fail-closed and sends only through `callSapWrite` with its P0.7 handle. `/api/sap/tdd/catalog`, `hub-content/seed` and `/api/sap/ariba/catalog` make no live call. Deployment tenants (`{PREFIX}_*`, `ARIBA_*`) are checked against the stored-connection host allow-list under `COREEDGE_ENV_TENANT_HOSTS`, default `observe` (logged and recorded, never refused; `enforce` answers `403 HOST_NOT_ALLOWED`), because production's hosts are not in the repository and private or on-premise ones may not pass; `pnpm coreedge:env-tenant-hosts` lists what enforce would refuse. The environment ceiling counts only the grants the broker's rules still honour (not a `RETIRED` app's, nor an unbound one under strict grant binding) under `COREEDGE_CONSOLE_GRANTS=enforce`; the default, `observe`, allows such a read and logs and records it (`detail.ceilingWouldRefuse`), because counting fewer grants could stop a console read that works today (integration review round 3). Golden rows before and after (`tests/fixtures/console-pipeline/`) differ only by the platform row. The A.3 #9 test (`tests/unit/security/no-side-doors.test.ts`) passes with seven reviewed exemptions (connection Test, probe-before-swap, service verification, lane re-check and sweep, connection probes). The platform trail's console read rows expire with the organization's copy: the nightly `/api/cron/northbound-retention` run deletes them past `NORTHBOUND_AUDIT_RETENTION_DAYS` and records `consoleReadsDeleted`; the write-back's rows are kept at any age. Open: whether the platform trail should keep console reads longer than the organization's trail, retiring the `-deployment-` organization rows, a screen for the platform trail, when to enforce the host check and the console grants check. Operator steps: `docs/runbooks/coreedge-console-pipeline.md`.

**P0.15 Drive the committed simulator from a code-generated capability registry and add the governance property test.** Size M. Depends on: none.
- Problem: the matrix and simulator are committed (`docs/coreedge/gap-matrix.json`, `scripts/coreedge/simulate-gap-matrix.mjs`), but cells are rated by hand, not from code flags, and nothing regenerates sections 3 and 8.1 in CI; private-network and IP-allow-list reach are over-credited (caveat 4); five lifecycle stages and several dimension values are not modelled (section 2.5 caveat 8, section 3.8); the Integration Suite AI_AGENT row is understated (section 3.7).
- Solution:
  - extend `scripts/coreedge/simulate-gap-matrix.mjs` with a capability registry generated from code flags (`src/lib/coreedge/capability-registry.ts`), computing coverage and ranked blockers.
  - A decision-table property test over more than 10,000 combinations: credential, grant, expiry, revocation, environment, interface status, connection, containment, policy.
  - Both run in CI.
  - Model the additions in caveat 8 and the five stages in section 3.8, and re-score Integration Suite for AI agents.
- Value: gap claims become reproducible.
- Code: new script, registry and `tests/property`; CI workflow.
- Acceptance:
  - CI regenerates sections 3 and 8.1 from `docs/coreedge/gap-matrix.json` via the registry-driven simulator.
  - Output matches section 3 within 0.1 points, or the differences are explained. Expected differences: only the PRIVATE_NETWORK share of S4_ONPREM and S4_PRIVATE_RISE drops, and the SAP_SIDE_IP_ALLOWLIST credit drops until P4.4 (caveat 4); the Integration Suite AI_AGENT row rises (section 3.7).
- **Delivered (October 2026).**
  - `src/lib/coreedge/capability-registry.ts` scores every CoreEdge cell from the code (section 2.3) and writes `docs/coreedge/capability-registry.json`; `tests/unit/coreedge/capability-registry.test.ts` checks every fact it declares against the module that holds it. The matrix no longer carries a hand-rated `coreedgeToday`.
  - The simulator reads the registry, scores hosting modes (section 3.10) and the extended model (section 3.11), and is checked against a scenario-by-scenario reference (`tests/unit/coreedge/gap-simulator.test.ts`).
  - `tests/property/northbound-governance.property.test.ts` runs the real read and write routes over more than 46,000 generated combinations and checks each answer, status, refusal reason and bound connection against an oracle written from `docs/runbooks/coreedge-governance-decision-table.md`. The cases include another organisation's grants, connections and interface id beside the caller's, interfaces moved onto a legacy grant's tuple after its cut-off, and verifications made through another connection or host.
  - CI (Quality Gates) runs `pnpm coreedge:check` and `pnpm test:property`; `docs/runbooks/coreedge-capability-registry.md` says how to change a cell. The check also fails when the prose of sections 1 and 3 types a coverage figure outside a generated block (Appendix B).
  - The scenario figures differ from section 3's first version in three ways, and the lifecycle counts in three more, each explained in section 3.0: code landed since `33d0ef86` (P1.1), the caveat 4 correction, and the AI_AGENT re-score. The expected PRIVATE_NETWORK and IP allow-list drops are there; the P1.1 rise was not expected because P1.1 had not merged when the acceptance was written.

**P0.16 Make the documents match the code.** Size S. Depends on: P0.15.
- Problem:
  - `docs/coreedge/README.md:6` says "all BUILT".
  - Phase D §7 says custom services need "no new build".
  - `src/components/studio/DiscoverClient.tsx:15-17` is stale.
  - `CoreEdge-Security-Architecture.html` calls shipped features "planned".
  - `docs/coreedge-sap-target-expansion-spec.md:3` says "Nothing applied".
- Solution: correct each, plus a CI lint that refuses "planned" for a feature the registry marks shipped.
- Value: developers and auditors read documents that are true.
- Code: those files and the lint.
- Acceptance: the lint is green; the manual review is recorded.
- **Delivered (October 2026).**
  - Corrected: `docs/coreedge/README.md` (historical, not "all BUILT", with pointers to where today's state lives); Phase D §7 (a dated correction: customer-built services needed P1.1); the `DiscoverClient.tsx` header; `CoreEdge-Security-Architecture.html` (every control re-checked against the code at `f65730f1`, with a "built, lenient by default" status for step-up, grant binding, the tenant guard and envelope keys); `docs/coreedge-sap-target-expansion-spec.md` (a table of what was applied); the developer guide's "does not do" list and write-replay rule; the keystone runbook's status; this document's header, section 1.1's governance bullets, section 1.5's first steps (now the settings still to switch on), section 4 and 6 "today" columns, Appendix D, and a Status line on each delivered item.
  - The lint: `src/lib/coreedge/shipped-features.ts` names the features a document mentions, each tied to capability-registry cells and to the module that implements it; `pnpm coreedge:doc-claims` (CI, Quality Gates) refuses not-built wording within 12 words of a shipped feature in the CoreEdge documents and code comments. `tests/unit/coreedge/doc-claims.test.ts` runs it inside `pnpm test`. Operator notes: `docs/runbooks/coreedge-doc-claims.md`.
  - The manual review (which documents, what changed) is recorded in the pull request notes.

**P0.17 CoreEdge release protocol and recovery.** Size S. Depends on: none.
- Problem: the "protocol" that P1.1 and section 1.5 rely on exists only as one sentence. There is one production deployment and one shared database (`docs/deployment-urls.md:8,23`); a standby "would be a separate Vercel project" and backups come from the Postgres provider (`:43-45`). There is no release, rollback or restore runbook, no staging instance with its own data, and no RPO or RTO.
- Solution: `docs/runbooks/coreedge-release.md`: (1) PR with green `ci.yml` and `migration-integrity.yml`; (2) additive (expand/contract) migrations only, each with written backout SQL; (3) a Vercel Preview on its own synthetic database (per `docs/neutral-discovery/PREVIEW-DB-RUNBOOK.md`) runs a northbound smoke suite; (4) promote; (5) post-deploy check: one SAP-standard read, one `Z*` read, one refused call, audit rows present; (6) rollback = Vercel instant rollback plus backout SQL.
- Acceptance: a timed restore of the production backup into a scratch project meets an RPO and RTO set by the product owner; every production deploy records the checklist.
- Status: partially delivered in Phase 0b. `docs/runbooks/coreedge-release.md` sets out the six steps and makes them checkable. `pnpm migrations:check` is a new gate in `migration-integrity.yml`: no migration on `main` (or at `520ee318`) is modified, renamed or removed, except one recorded as backed out; every migration added after `520ee318` carries backout SQL (a `Backout:` header, or a `backout.sql` beside a migration that is already applied, added for the four Phase 0b migrations that had none); and every one is additive unless a `Contract:` line says why. A second gate rehearses every backout on the history-built database, checks zero drift against the migrations kept, rolls forward and checks zero drift against `schema.prisma`. `--database` compares a database's recorded checksums with the files, which is how a preview database that applied an edited migration is caught (`migrate deploy` itself passes it silently). `pnpm release:post-deploy-check` makes the step-5 calls with a release canary's key, finds each audit row by correlation id, prints a pass/fail checklist without secrets or SAP records, and writes the record posted on the merged pull request. Open: the RPO and RTO (product owner), the restore drill (a proposed procedure is in the runbook), the canary's owner and SAP system, a read-only audit login, and the decisions D5-D9 listed there. The acceptance criterion is not met until the first timed drill against set figures is recorded.

**P0.18 Job leases for crons.** Size S. Depends on: none.
- Problem: Vercel can invoke the same scheduled run more than once, and a long run can overlap the next [E74]. The six crons in `vercel.json:4-29` take no lock; `src/lib/ops/cron.ts` has only `authorizeCron` and `recordCronRun`.
- Solution: a `JobLease` row (job, holder, expiresAt) claimed with a conditional UPDATE, or `pg_try_advisory_xact_lock` inside the job's transaction (session-level advisory locks are unreliable behind a transaction-mode pooler). Every sweep is made safe to run twice. P3.7 and P4.5 reuse it.
- Acceptance: two concurrent invocations of each cron do the work once.
- Status: shipped in Phase 0a (#308). Every cron runs inside a `JobLease` row claimed with one conditional insert and released by its holder, with a 10-minute TTL; no advisory locks (`src/lib/ops/job-lease.ts`, `docs/runbooks/cron-job-leases.md`).

**P0.19 Database budget per governed call.** Size S-M. Depends on: none.
- Problem: the documented pool is `connection_limit=5` per instance (`.env.example:2-3`), and later items add database work to every call: decision-log rows (P3.5), manifest lookups (P3.1), the audit outbox and chain (P3.10) and twin queries (P1.6). The production Postgres provider and pooler are [unverified].
- Solution: a transaction-mode pooler; at most 4 database round trips per governed call; pipeline transactions kept short and never held open while calling SAP.
- Acceptance: a load test (for example 50 requests a second sustained against the twin [estimate]) passes before P3; the round-trip budget is asserted in CI.
- Status: delivered in Phase 0b wave 2, except the production-like load run. The budget is 4 statements for a read and 5 for a write (`src/lib/governed/db-budget.ts`; a write adds the Idempotency-Key claim before SAP and its outcome after, which cannot merge without a transaction across SAP). A served read now sends 3 (it sent 7) and a write 5 (it sent 11): the key, its previous and dropped forms and the solution's status are one statement, the interface, its grants and its connections another (`src/lib/governed/call-loads.ts`), `lastUsedAt` is stamped at most once a minute (on a write, inside the Idempotency-Key claim), the Idempotency-Key is claimed, or an expired one renewed, by one `INSERT ... ON CONFLICT` that raises no error on a replay, and the first-call milestone and an unbound legacy grant's use stamp run after the response. `tests/integration/governed-db-budget.test.ts` counts Prisma's query events on PostgreSQL for the read, the write, a grant refusal, four key-state refusals and a replay, and checks that no transaction is open at any SAP call; `tests/integration/governed-call-loads.test.ts` proves the two statements return what the replaced queries returned, another organisation's rows included. The pooler configuration and the check that nothing needs a database session are in `docs/runbooks/coreedge-db-budget.md` and `tests/unit/db/pooler-compatibility.test.ts`. `pnpm coreedge:load-test` drives the routes at a fixed rate with SAP mocked; locally, 50 a second for 20 seconds gave 0% errors, read p95 69.7 ms with SAP at 50 ms, 3.2 statements a call. Open: production's pooler setting [unverified], and the 50-a-second run against a production-like environment and the twin.

**P0 exit:** every P0 acceptance criterion is green in CI or recorded; Appendix D has no open finding; A.3 test 9 passes for the Workbench write-back; the product owner signs off.

<!-- figures:begin after-P0 -->
**After P0:** full 0.0% (0 scenarios), partial 0.3% (1,512); lifecycle stages full: 2 of 18 (SECRETS_KEYS added) [simulated].
<!-- figures:end after-P0 -->

### 8.3 Phase 1: Any SAP OData API, contract-first, with a Tenant Twin

**Goal:** remove the customer/partner-origin blocker (330,840 scenarios), make OData reads usable by real programs, and let a developer call any API, including a `Z*` one, before the SAP administrator (often called "Basis") has configured anything.

**Estimate:** 12-14 weeks [estimate]. P1.3 starts during P0 (it needs only P0.4 and P1.1), and the twin is split: a read-only P1.6a here and P1.6b in P2. Before these changes the chain P1.1 -> P1.3 -> P1.4 -> P1.6 -> P1.7 alone took 18.5-28 weeks.

**P1.1 Land interfaces that carry their own service path (branch `custom-service-path`).** Size M. Depends on: none. **Scheduled first, in P0a:** the branch fast-forwards onto `33d0ef86`, and P0.1, P0.2 and P0.14 rewrite the same files (`src/lib/northbound/access.ts`, `src/app/api/studio/interfaces/route.ts`, both northbound data routes, `broker-run/route.ts`, `lane-check-sweep.ts`, `coreedge/queries.ts`), so they depend on it.
- Problem: `Z*` RAP services, `YY1_*` key-user services, ECC Gateway and SuccessFactors MDF services are refused everywhere. RAP is SAP's current ABAP programming model; key-user extensibility lets business experts build simple APIs without ABAP.
- Solution: merge the branch at `bbc9b3c0` under the release protocol (P0.17). Its three commits (`a4dd83d9`, `9ed76ba4`, `bbc9b3c0`) add:
  - `Interface.servicePath` and `odataVersion`;
  - one resolver for read, write, broker-run, lanes and discovery;
  - a path guard on the connection's own host;
  - `custom:<path>` grant scoping;
  - `POST /api/studio/interfaces/[id]/verify-service` (fetches `$metadata`, checks EDMX, version and entity set);
  - verification recorded per environment and per binding (`Interface.serviceVerifications`, added by `bbc9b3c0`), so a DEV check cannot unlock PROD writes; writes refused until verified for the caller's own environment;
  - SAP routing parameters that would overrule the connection's environment binding (`;o=`, `;mo`, `;c=`, `sap-client=`) refused in the service path;
  - the "Register your own API" screen.

  Then verify live on X5M.
- Value: removes the largest blocker that can be closed in a single merge, and the one ABAP teams hit first. On the first version's matrix it lifted partial coverage from 0.2% to 0.8%, because the synchronous-only, OData-only and static-key blockers still apply; on the hosted instance, with its network scored as it is, the registry measures 0.3% with it (section 3.0). The customer's ABAP team can expose a service and have an app call it, under governance, the same day.
- Code: the branch's `src/lib/sap-public/interface-service.ts`, `service-path.ts`, migration, verify-service route, the data and write routes, the Studio interfaces and discover screens.
- Acceptance:
  - A `Z*` V2 and a `YY1_*` V4 service are verified, read through the northbound API with an audit row, and labelled customer-built.
  - Non-EDMX responses are refused.
  - Catalogue interfaces resolve unchanged.
  - The Workbench explorer (`/sap-explorer`, `/api/sap/tdd/entities`, `/api/sap/tdd/preview`, which on the branch still call the catalogue-only `resolveHubService` at `entities/route.ts:90` and `preview/route.ts:76`) lists and previews a registered `Z*`/`YY1_*` service through the same resolver as the broker, or says "registered in Studio: open it there" instead of "not found".
  - Released under `docs/runbooks/coreedge-release.md` (P0.17); backout SQL for both migrations tested on the preview database; post-deploy checklist recorded.
- Status: shipped in #307 and in production. No `Z*` or `YY1_*` call has been recorded against a live tenant yet, so the live verification on X5M is still owed.

**P1.2 Tenant service discovery and registration from EDMX.** Size M. Depends on: P1.1.
- Problem: Discover knows only SAP's catalogue, and nothing works until the SAP communication arrangement exists. A communication arrangement is the SAP-side switch that enables a bundle of APIs, called a communication scenario (`SAP_COM_xxxx`), for one external system and login.
- Solution:
  - List the tenant's services from the Gateway catalogue (V2 `CATALOGSERVICE`, V4 service groups) [unverified: paths and whether an S/4 Cloud Public communication user can read them].
  - Register a service from an uploaded EDMX.
  - Record an SAP API Policy §1.2 sign-off for custom services on S/4 Public.
  - Show "ask Basis for SAP_COM_xxxx" from `SapCommScenario`.
- Value: a "what can I call here" view per tenant, with no wait on Basis.
- Code: `src/lib/sap-public/dynamic-catalog.ts`, new `tenant-discovery.ts`, `DiscoverClient.tsx`, the `SapCommScenario` join (logic in `src/lib/tobe/inputs.ts:200`).
- Acceptance:
  - Lab `Z` services appear as customer-built.
  - An EDMX upload creates a draft with a contract and no tenant call.
  - At least 80% of curated interfaces show their scenario where the table knows it.

**P1.3 Contract Compiler and ContractSnapshot.** Size L. Depends on: P0.4, P1.1. Starts during P0.
- Problem:
  - The OpenAPI is a hand template with one GET path (`src/lib/studio/scaffold.ts:62-198`).
  - Schemas come from sampled rows.
  - `requestSchema` is never written.
  - `$metadata` is parsed with regexes (`tdd-connector.ts:950-1010`).
- Solution:
  - `src/lib/contracts/` parses CSDL into a Contract IR: types, keys, labels, navigations, capabilities, actions, PersonalData annotations. It uses the OASIS converter where it fits [E45].
  - A `ContractSnapshot` model.
  - Per-solution OpenAPI in 3.1 and 3.0.3 covering every operation, header and error shape. The OASIS converter emits only OpenAPI 3.0.x and 3.1.0 [E45], so the Swagger 2.0 projection (under 1 MB) moves to P2.8.
  - JSON Schemas; semver.
- Value: the single source for SDKs, twin, assertions, field policy, docs, MCP tools and upgrade diffs.
- Code: new `src/lib/contracts/`, Prisma, `scaffold.ts`, `schema-capture.ts` (becomes the fallback), the schema endpoint.
- Acceptance:
  - Golden tests on EDMX files written for the repository plus 3 `Z*` files. A separate CI job fetches 20 or more real S/4 EDMX files from api.sap.com at test time using a secret and stores none (section 9.1 #17).
  - PersonalData annotation coverage is measured on that set (input to P1.5).
  - 3.0.3 generates with abap-openapi [E21] [to verify].
  - Write contracts describe the body.
- Status: delivered, with no new setting. `src/lib/contracts/` compiles V2 EDMX, V4 CSDL XML and V4 CSDL JSON on saxes (no regexes; DOCTYPE, size, depth and floods refused) into the IR; a verify records a `ContractSnapshot` (content hash, semver from the structural diff) and, for a write interface, writes `Interface.requestSchemaStamp` (migration 20261026050000, with a backout.sql); `Interface.requestSchema` stays NULL, and /schema serves the stamped snapshot's stored body as `requestSchema`; a schema capture records the sampled fallback. The kit ships `openapi.json` (3.1) and `openapi-3.0.json` (3.0.3), and `GET /api/studio/solutions/{id}/openapi` serves the solution's document; both validate against their specifications in the golden tests (six repository-written descriptions, three of them `Z*`/`YY1_*`). The OASIS converter is not used: it describes SAP's service, not the northbound API, and pulls `colors`. The corpus job (`.github/workflows/contract-corpus.yml`, secret `SAP_API_HUB_SANDBOX_API_KEY`) is unrun until the secret is set; abap-openapi is not on npm and stays an open item. Operator notes: `docs/runbooks/coreedge-contract-compiler.md`.

**P1.4 Governed OData query surface.** Size L. Depends on: P1.3, P0.14, P0.10.
- Problem: reads send only `$top` and `$format`, 100 rows or fewer (`src/lib/northbound/read.ts:56,149,177`).
- Solution:
  - `Interface.queryPolicy` names the filterable fields and operators, selectable fields, `$expand` depth (2 or less), page size and row caps.
  - Structured parameters are parsed into an AST and checked; CoreEdge builds the OData query itself.
  - Key lookup, `$count`, and an opaque cursor sealed (AES-256-GCM) under the token ring (`COREEDGE_TOKEN_KEYS`), bound to the client, interface version, query hash, grant id and an expiry, that never shows SAP's host.
  - A per-page byte cap of 4 MB or less in `queryPolicy`, because Vercel limits response bodies to 4.5 MB [E72]; a cursor is returned when the cap is reached.
  - Each audit row records a hash of the query tree and the requested fields (the input P3.5 replays).
- Value: real programs (fetch order X, my open items) become possible.
- Code: `read.ts`, new `src/lib/odata/operation-compiler.ts`, the data route, the Studio interface form.
- Acceptance:
  - A non-granted filter field returns 400 `POLICY_FIELD_NOT_GRANTED`.
  - Fuzzing finds no OData injection.
  - Paging 10,000 rows completes at the interface's page size without exceeding the key's 60-a-minute limit, in under 5 minutes at page size 100 against a 1.5 s-per-page stub, and no response body, header or cursor contains the SAP host.
  - A conformance suite passes on V2 and V4.
- Status: P1.4a delivered behind `COREEDGE_QUERY_SURFACE` (default off), on the defaults of the final spec's product-owner decisions; P1.4b (`$expand`, and following SAP's next link) pending decision D21. Served on `/data` and its `/v1` alias: a request carrying a reserved name (`select`, `filter.<Field>.<op>`, `orderby`, `key.<Field>`, `count`, `pageSize`, `cursor`, and `expand`, `filter` and `key` themselves) is parsed before any statement, refused while the switch is off (never ignored), and checked after the grant against the interface's compiled query policy, which rides in the access-load statement, so a query page costs the legacy read's 3 statements. CoreEdge builds the OData query from the checked AST through `buildSapUrl` (`src/lib/odata/`), reads it with redirects refused (`readQuery`, reached only through the pipeline's `callSapQuery`), counts only an absent or proxied answer against the circuit, and pages with a sealed cursor (`src/lib/northbound/query/`) within a byte cap; a refusal carries `error.query`, and the audit row eleven query columns written in its one insert (migration `20261027000000_query_surface`, with `backout.sql`). Three codes join the northbound table: `POLICY_FIELD_NOT_GRANTED`, `CURSOR_STALE` and `RECORD_NOT_FOUND`. A verify writes the query basis and recompiles the policy in its own transaction, narrowing what the contract no longer allows, and says so in its answer, its config audit and the Verify panel; a contract change clears both. A builder edits the policy in Studio's Query policy card (`/api/studio/interfaces/[id]/query-policy`: compiled against the basis under the row lock, compare-and-set on the revision and the basis, `PROMOTE` in the config audit when it widens bulk reading); the Test Console runs the query the app would send; the per-solution OpenAPI and the starter kit list each interface's query parameters by name; the kit's mock refuses them (`NOT_ENABLED`) and its client gains `query()` and `pages()`. A `?limit` read is answered as before, byte for byte, except that one past 4.5 MiB is refused 413 `VALIDATION_ERROR` in CoreEdge's envelope and audited 413, and OData 4.01 control information is stripped like `@odata.*`. Operator steps: `docs/runbooks/coreedge-query-surface.md`. Acceptance: A1 (400 `POLICY_FIELD_NOT_GRANTED`, end to end with its audit row), A2 (the injection fuzz with its independent oracle), A3 (10,000 rows paged under the key's 60 a minute in under 5 virtual minutes at page size 100 against a service taking 1.5 s a page, with no host in any body, header, cursor or audit row: `tests/integration/northbound-query-paging-10k.test.ts`) and A4's tier 1 (V2 and V4 conformance against a strict-replay SAP: `tests/conformance/odata-query/`) are tested; A4 is met once a tier-2 run (`scripts/odata-conformance-live.ts`, manual dispatch) or a tier-3 lab run agrees, and neither has run yet; nor has `scripts/measure-response-limit.ts`, which sets the legacy cap. The e2e accessibility scan of the Query policy card (`tests/e2e/query-policy-card.auth.spec.ts`) is written and has not been run. Where the implementation departs from the spec's letter: the cursor carries a 72-bit digest of each authorising grant id rather than the id, so its length does not depend on the id's format; the cursor also carries the chain's first row's tag (`fk`, under the kid it was tagged with), and a later page holding that row is refused like one holding the previous page's last row, since adaptive `$top` can ask for fewer rows than the page before served and a service that ignores `$skip` then answers short of that last row; the compiled policy's `rev` also covers its state and stale reason; a verify that finds a key change keeps the policy stale until a builder saves it; a compiled policy over 64 KiB at a verify goes stale as `BASIS_TOO_LARGE`; the access load hands back the compiled policy beside the interface row, with whether a source exists (which tells `NO_CONTRACT` from `NO_POLICY`), so the row's own columns are unchanged; the cursor's bindings are checked before the re-sent query is (3.9.4's order); an audit row of a refused cursor names the check that failed while the caller is told only `CURSOR_INVALID`, `EXPIRED` or `CHANGED`; a `?limit` answer refused by the guard is audited with no rows and the refused size in `responseBytes`; the query surface's audit rows are asserted in `tests/integration/northbound-query-surface.test.ts` rather than in a recorded golden file, since a chain id is random and the query hash keyed; the narrowing confirmation is the route's (a save that narrows an ACTIVE interface is answered with what it takes away and written only when sent again with `confirmNarrowing`), and a removal is a compare-and-set on the revision; the policy route asks for no step-up, the spec naming none (a policy narrows an approved grant and reaches no SAP system); the console's query run shows the policy's default page within its own 50 rows, refuses a larger `pageSize` (once the app's own checks have passed, so a page over the policy's maximum gets the app's `POLICY_FIELD_NOT_GRANTED`) and any `cursor` as `QUERY_INVALID`, saying these are the console's limits and not the app's, issues no cursor, and saved console cases record and replay the query; every read's OpenAPI documents the legacy 413 and `error.query`, a policy-less interface's says its query parameters are refused, and its key lookup is described as the policy's choice rather than a roadmap item; the tier-2 workflow runs on manual dispatch only, not nightly; and A3's network-real variant (the same chain over real `fetch` against the tier-1 stub, nightly and on PRs touching `src/lib/odata/**` or `src/lib/northbound/query/**`) is not built: A3 runs in-process through the stub's `fetch`, whose answers carry the canary host in every link spec 3.21 item 8 names (`__metadata`, `__deferred`, `__next`, `@odata.context`, `@odata.id`, 4.01's `@id`, `@navigationLink` and `@odata.nextLink`), and the test asserts it met them.

**P1.5 Field-level grants and PII tagging.** Size M. Depends on: P1.3, P1.4.
- Problem: whole rows are returned; the passport fields column is blank (`src/app/(coreedge)/coreedge/passport/page.tsx:14`); fixtures hold real tenant rows.
- Solution:
  - Tag fields from SAP's PersonalData vocabulary [E46]. Whether SAP's published metadata carries these annotations is [unverified]; measure coverage on the P1.3 golden set first. If it is low, add name and type heuristics (for example `*Name`, `*Email`, `*Phone`, `BusinessPartner*`), require review only for fields the heuristics flag, and let each organisation configure the gate.
  - `ApiAccessGrant.fieldScope` drives `$select`, and the response guard strips extras.
  - Masking applies to fixtures, schemas and idempotency replay bodies.
- Value: data minimisation the CIO can see.
- Code: Prisma, `src/lib/contracts`, `src/lib/studio/fixtures.ts:121-135`, `src/lib/northbound/idempotency.ts:218`, the passport and add-feed pages.
- Acceptance: no response contains an ungranted field (property test); new fixtures contain no unmasked tagged field.

**P1.6 Tenant Twin v1: P1.6a read-only twin (L, in P1) and P1.6b writes and fidelity (L, in P2).** Depends on: P1.3, P1.4, P0.14.
- Problem: developers wait days or weeks for SAP set-up, and the only mock is a local Node script serving real rows.
- Solution:
  - **P1.6a (L):** `src/lib/twin/`, an OData V2/V4 read engine generated from the contract that does not care where data is stored. It evaluates the P1.4 query tree in memory over at most 2,000 rows per entity set, behind a `TwinStore` port (Postgres JSONB `TwinDataset`/`TwinRecord` when hosted; SQLite or in-memory in the CLI for P3.2's offline twin), with an in-instance cache keyed by dataset version. Synthetic seeded data; read, query and key lookup; V2 and V4 envelopes.
  - Reachable as `transport: TWIN` (P0.14) and as a public endpoint `/api/twin/<ws>/<connKey>/sap/opu/odata/...` and `/odata4/...`, which accepts Basic auth (client id plus test key) as well as Bearer, because ABAP SM59 stores Basic credentials natively.
  - **P1.6b (L, in P2 next to P2.4):** create, update and delete; ETag and the CSRF handshake; SAP error JSON; `X-CoreEdge-Twin-Fault` for every failure reason; the X5M conformance set.
  - Consider `@sap/cds` mocking as the engine [licence unverified].
- Value: the core of the 30-minute first call and of testing before code.
- Code: new `src/lib/twin/`, `src/app/api/twin/[...path]/route.ts`, Prisma, the `fetchImpl` seam.
- Acceptance:
  - The pipeline runs unchanged against the twin, with audit rows marked TWIN.
  - Postman, curl and SAP Cloud SDK reach it.
  - (P1.6b) Statuses and envelopes match the X5M lab in at least 95% of the conformance set, with differences documented.
  - Twin rows never change lane evidence.

**P1.7 Test keys and self-service twin access.** Size S. Depends on: P0.11, P1.6a.
- Problem: a solo developer cannot start without a second person.
- Solution: `ce_test_` keys reach only (a) the TWIN transport and (b) connections whose host is `sandbox.api.sap.com` using API-key auth; they are issued at once with no second person. A customer connection labelled SANDBOX keeps the full grant chain, because SANDBOX is a label the user picks when saving a connection (`src/app/api/studio/connections/route.ts:141`) and grants treat it as one more environment value (`src/lib/studio/grants.ts:26`); nothing checks that the system behind it is not production. If a lighter path is wanted, a second person approves a connection's SANDBOX classification once, and again whenever its base URL changes. A solo workspace gets twin rights here until a second member joins. DEV and above need the full grant chain.
- Value: free to play, governed to ship.
- Code: `src/lib/northbound/auth.ts`, `issue.ts`, `src/lib/studio/grants.ts`, the Studio clients UI.
- Acceptance:
  - A test key on DEV, or on a customer connection labelled SANDBOX, returns 403 `TEST_KEY_ON_LIVE`.
  - A new solution reaches a twin read alone.
  - DEV still needs an approved grant.

**P1.8 Live verification of V2 and V4 writes and draft-enabled RAP POST.** Size S. Depends on: P0.9, P1.1.
- Problem: no create, V2 or V4, has been verified live through the northbound API [R1 §7]; V4 create and draft-enabled RAP POST are covered by unit tests only. SuccessFactors SAML bearer moved to P0.9 because of SAP's 20 November 2026 date.
- Solution: one live lab run each, recorded as evidence; an "untested" badge elsewhere, read by the simulator.
- Value: honest "full" claims.
- Code: `src/lib/sap-public/oauth-saml-bearer.ts`, `src/lib/northbound/write.ts`, the capability registry.
- Acceptance: each path (V2 create, V4 create, draft-enabled RAP POST) has a live 2xx with a correlation id. Where no lab tenant exists, the badge is shown, the simulator scores the cell partial, and a dated follow-up item names the tenant needed; each phase's exit review lists every badge still open.

**P1.9 Parity scorecard v1 in Control Tower.** Size S. Depends on: P0.15.
- Problem: the product owner cannot see the gap inside the product.
- Solution: render the simulator output (IS and CoreEdge side by side, ranked blockers), regenerated on every deploy.
- Value: "simulate every permutation" becomes a living page.
- Code: new `src/app/(control-tower)/control-tower/parity`.
- Acceptance: the page shows the build SHA and matches the CI JSON.

**P1.10 Northbound API versioning and consumer changelog.** Size S. Depends on: none.
- Problem: today's routes are unversioned (`src/app/api/northbound/interfaces/route.ts`, `interfaces/[id]/data/route.ts`, `.../data/write/route.ts`, `.../schema/route.ts`), while P0.11 (key prefixes), P1.4 (cursor paging) and P2.5 (OAuth) change what callers send or receive. CoreEdge has no deprecation policy or changelog of its own.
- Solution: serve today's routes unchanged as version `2026-10` and alias them under `/api/northbound/v1/*`. Ship breaking changes only behind a dated version header, with an overlap of at least 6 months [estimate], `Deprecation` and `Sunset` headers, and a public changelog. Existing `ce_` keys keep working after P0.11 until they expire.
- Acceptance: the current starter kit and the ABAP lab-guide samples run unchanged against every release in CI.
- Status: shipped. Today's routes are version `2026-10`, served at `/api/northbound/*` and, by the same handlers, `/api/northbound/v1/*` (`src/lib/northbound/versioned-route.ts`). Every response carries `CoreEdge-Version`; a request may pin one, and an unknown or retired version is `400 UNSUPPORTED_VERSION` naming the supported ones. An unpinned request is served the oldest supported version. The registry and its 6-month rule are in `src/lib/northbound/version-policy.ts`, the changelog in `docs/coreedge/api-changelog.md` and at `GET /api/northbound/versions`, the policy in the developer guide. Audit rows record `apiVersion` and `apiBasePath`. The acceptance test is `tests/integration/northbound-consumer-replay.test.ts`.
- Open decision: CI checks the recorded dates of a deprecation (`announcedOn`, `deprecatedOn`, `sunsetOn`) but cannot see when the change actually deployed: the checkout is shallow and there is no deploy record. Until someone decides on a mechanical check (a deploy-time record of first announcement, or full history in CI comparing `announcedOn` with the commit that set it, for example as part of the release protocol, P0.17), the announcement date is checked in review.

**P1 exit:** every P1 acceptance criterion is green in CI or recorded; A.3 tests 3 and 10 pass; every open "untested" badge is listed; the product owner signs off.

<!-- figures:begin after-P1 -->
**After P1:** full 0.0% (36 scenarios), partial 0.3% (1,512); lifecycle stages full: 3 of 18 (DISCOVER added) [simulated].
<!-- figures:end after-P1 -->

### 8.4 Phase 2: Postman before code, full OData writes, every language

**Goal:** give every developer type a governed path, and open update, delete, actions and `$batch`. Time to first call against the twin becomes 30 minutes or less.

**Estimate:** 10-12 weeks; can overlap P1 once P1.3 lands.

**P2.0 Jobs port.** Size M. Depends on: P0.18.
- Problem: graphile-worker and pg-boss need a long-running process, and Vercel functions stop at 300 s by default and 800 s at most on Pro [E72]. Items before Phase 5 already need background work: multi-step P2.1 collections, P3.7 monitors every 5 minutes, P3.8 nightly snapshots and the P3.10 outbox. (P1.4's paging through 10,000 rows is not among them: it is client-driven, each page is its own call, and it needs no job runtime.) Today's sweeps already squeeze into a 240 s budget (`src/lib/northbound/retention.ts:69-76`), and one 10-step Lab run at up to 30 s per read (`read.ts:55`) or 45 s per write (`write.ts:79-80`) can pass 300 s.
- Solution: a jobs port with two adapters. Hosted: Vercel Queues or Workflows, or graphile-worker in a Vercel Daemon (public beta, production-only, no inbound traffic) [fit unverified]. Self-host: graphile-worker in the container's jobs entrypoint.
- Acceptance: a 10-step Lab collection runs as one job per step and survives a function timeout; the same job code runs on both adapters.

**P2.1 API Lab data model and assertion engine.** Size L. Depends on: P1.3, P1.6a, P0.14, P2.0.
- Problem: test cases never assert anything; the console is read-only, 50 rows or fewer, and needs a grant.
- Solution:
  - New models: `LabCollection`, `LabEnvironment` (secret references, never raw tokens), `LabRun`, `LabResult`.
  - Server-side assertions: status, row range, schema, JSONPath, latency, header, failure reason.
  - Chaining between steps; each step runs as one job on the jobs port (P2.0).
  - Steps run through the pipeline as audited dry runs.
- Value: Postman-grade testing that is still governed.
- Code: Prisma (`TestCase` plus the new models), new `src/lib/lab/`, the test-cases and broker-run routes.
- Acceptance: every assertion type is unit-tested; TEST/PROD steps are audited as dry runs; twin steps are labelled TWIN.

**P2.2 Lab user interface (`/studio/lab`).** Size L. Depends on: P2.1, P1.4.
- Problem: there is no screen to explore and test before coding.
- Solution:
  - A request builder with three panes: the northbound request, the SAP request (host hidden) and the response.
  - Environments TWIN, SANDBOX, DEV, TEST, PROD, with TWIN needing no grant.
  - Snippets in 9 forms.
  - "Save as interface and request DEV grant".
- Value: directly answers "like Postman before the program is developed".
- Code: new `src/app/(studio)/studio/lab`, `TestConsoleClient.tsx` (folded in), routing.
- Acceptance: a new user with twin-only rights builds, asserts and saves a 3-step collection in under 10 minutes.

**P2.3 Import and export: Postman v2.1, Bruno, `.http`.** Size M. Depends on: P2.1.
- Problem: a closed Lab would lock teams in.
- Solution: round-trip import and export; `pm.*` scripts kept as comments; environments exported with placeholders.
- Value: meets developers in their own tools.
- Code: new `src/lib/lab/exchange/`.
- Acceptance: a round-trip keeps requests and assertions; Newman runs an export green against the twin in CI.

**P2.4 Full OData write surface, twin first.** Size XL. Depends on: P1.4, P1.6b, P0.1.
- Problem: create only; UPDATE can never be activated (`src/app/api/studio/interfaces/route.ts:259-261`).
- Solution:
  - PATCH and MERGE with ETag pass-through (412 maps to CONFLICT).
  - DELETE as a separately granted, stronger approval class.
  - Actions and function imports; deep insert.
  - `$batch`: each sub-request is authorised through pipeline steps 0-7, and the whole batch is refused if any is refused. The changeset is then sent to SAP as one `$batch`, so SAP's all-or-nothing changeset behaviour holds; splitting it into separate calls would leave some records written and others not, and each V2 write fetches its own CSRF token (`write.ts:267-304`). One audit row per sub-operation with a shared `batchId`, settled from the batch response. Batch size and operation count are capped below Vercel's 4.5 MB body limit in `queryPolicy` [E72].
  - Draft handling [verify on the lab].
  - Every operation enabled on the twin first.
- Value: business programs that change data.
- Code: `src/lib/northbound/write.ts`, the operation compiler, `src/lib/studio/write-readiness.ts`, the grant vocabulary, the data routes, the twin.
- Acceptance:
  - A stale ETag returns 412; DELETE without a grant returns 403.
  - The twin round-trips create, update, delete and read.
  - A live DEV run with a correlation id exists for V2 and V4 update and for one action. Where no lab tenant exists, the badge is shown, the simulator scores the cell partial, and a dated follow-up item names the tenant needed; each phase's exit review lists every badge still open.

**P2.5 Consumer OAuth 2.0 token endpoint.** Size L. Depends on: P0.11, P0.10.
- Problem: a static header is the only consumer credential, and SAP credential stores cannot hold it.
- Solution: `/api/northbound/oauth/token` for client credentials with `client_secret_basic` or `private_key_jwt` [E53]; 10-minute JWTs scoped per interface, signed through the P0.10 KeyProvider with a published, rotating JWKS. Build on a maintained OAuth server library (for example node-oidc-provider with a Prisma adapter [fit unverified]) rather than from scratch. Optional DPoP-bound access tokens [E54] for hosted consumers, so a stolen token cannot be replayed from another client; policy can require DPoP per interface.
- Value: every enterprise platform, ABAP included, can store the credential natively.
- Code: new token route, `auth.ts`, an `OAuthClient` model, the ABAP lab guide.
- Acceptance:
  - RFC 6749 §4.4 conformance.
  - A Node client and at least one ABAP flavour call in the lab. The other flavour has a live call with a correlation id. Where no lab tenant exists, the badge is shown, the simulator scores the cell partial, and a dated follow-up item names the tenant needed; each phase's exit review lists every badge still open.
  - A DPoP-bound token presented without its proof returns 401.

**P2.6 SDK runtimes and generated types: P2.6a TS and Python (L, in P2); P2.6b Java and .NET (L, in P3, built on demand).** Depends on: P1.3, P1.4, P2.5, P0.5, P4.8.
- Problem: one read-only TypeScript kit per interface.
- Solution:
  - A runtime of 300-600 lines per language: tokens, Idempotency-Key, `traceparent`, retry only on 429/503 honouring Retry-After, typed errors, cursor iterators, twin/live switch.
  - Generated per-solution types and methods.
  - Published to npm and PyPI (P2.6a), Maven and NuGet (P2.6b), gated on the licence decision (P4.8, taken in Phase 0).
  - Packages build in a separate CI job, outside the Next build, which already peaks near Vercel's 8 GB build memory (`next.config.ts:5-30`).
- Value: a typed, governed client in one command.
- Code: new `packages/sdk-*` (the repo becomes a pnpm workspace with the root app unchanged; `pnpm-workspace.yaml` has no `packages:` entry today), new `src/lib/codegen/`, `/api/mgmt/v1/solutions/{id}/sdk/{lang}`.
- Acceptance: one shared conformance script (list, filter, get, create, update, 429 retry, idempotent replay) passes for each shipped language against the twin in CI (TS and Python in P2; Java and .NET when P2.6b ships).

**P2.7 ABAP SDK (Cloud and classic) via abapGit.** Size L. Depends on: P1.3, P4.8; the OAuth flavour follows P2.5.
- Problem: ABAP teams hand-write HTTP calls, JSON casing and date handling.
- Solution:
  - `ZCL_CE_CLIENT_CLOUD` (communication arrangement plus `cl_web_http_client_manager` [E20]) and `ZCL_CE_CLIENT_CLASSIC` (SM59 plus `cl_http_client`).
  - Generated structures with name mapping; V2 date and decimal converters; Idempotency-Key helper.
  - An ABAP Unit double; a correlation-id logging helper.
  - abaplint in CI with the Cloud and 7.50 rule sets.
  - Ship the SAP-documented "Unauthenticated" flavour with the header set in code first [E20]; add the OAuth flavour once P2.5 lands. Run the ABAP TLS-trust spike in the first week of P2.
- Value: ABAP developers, whom the product owner named first, build with their own tools.
- Code: new `src/lib/codegen/abap`, `packages/abap-runtime`, a CI job.
- Acceptance:
  - abaplint green on both rule sets.
  - A manual lab run on a BTP ABAP trial or S/4 DEV reaches the hosted twin [verify TLS trust].
  - ABAP Unit passes using the double.

**P2.8 Low-code connector (Power Platform, UiPath).** Size M. Depends on: P1.3.
- Problem: makers cannot use CoreEdge.
- Solution: one generic Swagger 2.0 connector (the Swagger 2.0 projection of the P1.3 contract is built here) with dynamic values and dynamic schema [E59]; API-key-style security, because the Power Platform OAuth definition does not support client credentials [E23]; a UiPath import.
- Value: governed SAP access for makers through the same grants.
- Code: new `src/lib/codegen/powerplatform`, docs.
- Acceptance: a maker gets typed fields in a flow; the 2.0 output passes the Power Platform validator; UiPath has a live import and call with a correlation id. Where no lab tenant exists, the badge is shown, the simulator scores the cell partial, and a dated follow-up item names the tenant needed; each phase's exit review lists every badge still open.

**P2.9 Personas, roles and sign-in options.** Size M. Depends on: P0.13.
- Problem: there is no tester or external-developer role; developers cannot see their own incidents; staff sign-in is a magic link with an optional passkey (`src/app/api/auth/webauthn/authenticate/verify/route.ts`), with no OIDC or SAML SSO.
- Solution: `tester` and `external_developer` roles, plus a read-and-acknowledge role for SAP administrators (section 5.5); developers see their own app's log and incidents; a single generic OIDC provider (GitHub, Google, Entra) through the custom-session bridge (NextAuth handles only the magic link and user creation, `src/lib/auth/auth-options.ts:36-42`), linking to an existing account only after a magic-link check of the same email, with the registration policy applied. P4.6 keeps only SAML, SCIM and group mapping.
- Value: partner developers and QA staff can be onboarded safely.
- Code: `src/lib/studio/rbac.ts`, `src/lib/auth/auth-options.ts`, `src/middleware.ts`.
- Acceptance: role-matrix tests pass; OIDC sign-in works on production.

**P2.10 Live docs portal and SAP admin checklist.** Size M. Depends on: P1.3, P1.2, P2.2.
- Problem: the only documentation is one markdown guide.
- Solution:
  - `/docs/<org>/<solution>`: per-operation pages with fields (SAP label, type, PII tag), errors with retry advice, limits, snippets, and "Run in Lab".
  - A "What your SAP admin must switch on" panel.
  - Backstage `catalog-info.yaml` export.
- Value: shorter time to first real call.
- Code: new `src/app/(docs)`, contract projections, the `SapCommScenario` join, and `/docs` (and any other new page prefix) added to `WORKBENCH_PATHS` (`src/lib/routing/workbench-paths.ts:26-105`) with a routing test; otherwise production redirects it to `/workbench` (`src/middleware.ts:113-139`).
- Acceptance: a lint fails the build unless each operation page lists every field (SAP label, type, PII tag), every error code with retry advice, the limits and a working "Run in Lab" link; "Run in Lab" works for a twin-only user; `/docs` pages are served on production under `WORKBENCH_ONLY`.

**P2.11a Personal tokens for tools.** Size S-M. Depends on: P0.12.
- Problem: Studio APIs accept only the browser session (`src/lib/auth/session.ts`), so a coding agent cannot sign in to the Studio MCP server; personal tokens otherwise arrive only in P3.2.
- Solution: scoped, expiring, hashed personal tokens with read and draft rights only, refused on decide, issue, rotate and revoke, with a narrow tenant-guard exemption for the lookup. P3.2 extends them.
- Acceptance: a personal token reads and drafts but gets 403 on every governance action.

**P2.11 Studio MCP for coding agents and a grounded failure explainer.** Size M. Depends on: P1.3, P1.6a, P2.1, P2.11a.
- Problem: AI_ASSIST scores 0.
- Solution:
  - A read-and-draft MCP server: search the catalogue and scenarios, read contracts, generate snippets, run the Lab on the twin, draft interfaces and grant requests. It can never approve or issue. It ships over stdio through the CLI, or over HTTP with a personal-token header (P2.11a).
  - A failure explainer grounded in `src/lib/northbound/failure-reason.ts`, using the customer's own model via `src/lib/intelligence/ai-orchestrator.ts`.
- Value: AI help whose claims are proved.
- Code: new `src/app/api/mcp/studio`, those two modules.
- Acceptance: an agent in Claude Code drafts an interface, collection and SDK call; tests prove it cannot decide or issue; every "works" links a run id.

**P2.12 Measure time to first call.** Size S. Depends on: P0.13. **Delivered in Phase 0 (P0a), straight after P0.13,** so P0 and P1 have a baseline.
- Problem: "seamless" is not measured.
- Solution: a `DeveloperJourneyEvent` table and funnel tiles for time to first call (TTFC) and time to first real call (TTFRC), showing median and p90; TTFRC is split into approver wait, SAP-admin set-up wait and developer time (A.3 #2).
- Value: makes the north star visible.
- Code: Prisma, new `src/lib/coreedge/journey.ts`, the board and Control Tower.
- Acceptance: events fire in end-to-end tests; the tiles show the thresholds.
- Status: delivered in Phase 0b. `DeveloperJourneyEvent` (migration `20261023030000`, tenant-anchored) keeps the first occurrence of eight milestones, written where each happens: workspace sign-up, first interface, grant requested and decided (all three decision doors), first key per lane (issue and claim link), connection saved, first good probe (Studio test, Probe now, the nightly sweep), and the first successful call per app and environment (broker read and write, Test Console run, and a sandbox console read). The broker records its first call through a per-process guard, so no call after an instance's first adds a database round trip. Tiles on the Operations board (`/coreedge/operations`, the organization's own) and in Control Tower (`/control-tower/journey`, every organization for a platform admin) show median and p90 against A.3 #1 and #2, judge only from 10 journeys, mark a median that open journeys could still raise as "at least", and split TTFRC (business time, weekends excluded) into approver wait, SAP set-up wait and developer time. No backfill: the baseline starts at the deploy. `COREEDGE_JOURNEY_EVENTS=off` stops recording. Open decisions (business-day calendar, consumer type, the DEV-only reading of A.3 #2, retention) and operator notes: `docs/runbooks/coreedge-time-to-first-call.md`.

**P2.13 Approver inbox, notifications and approver eligibility.** Size M. Depends on: P0.12.
- Problem: nothing tells an approver that a request is waiting. There is no notify call in `src/app/api/studio/access-grants/route.ts`, `src/app/api/coreedge/requests/[id]/decide/route.ts` or `src/lib/studio/grants.ts`; the notification dispatcher is used only by assessments and conflict detection, and its email and push channels are no-ops (`src/lib/notifications/dispatcher.ts:27-29`). Any second builder or platform admin may approve (`src/lib/studio/rbac.ts:102`, `canMutateControlTower` at `:145`).
- Solution: new requests notify every eligible approver (email plus a Teams or Slack webhook) within 1 minute; reminders after 4 and 24 business hours; delegation when an approver is away; WRITE and PERSONAL_DATA grants need an approver recorded as data owner for that SAP product.
- Acceptance: notification within 1 minute in an end-to-end test; the median approval wait is shown on the TTFRC tile.

**P2.14 Starter solutions from a communication scenario.** Size M. Depends on: P1.3, P2.1, P2.10.
- Problem: Integration Suite ships prebuilt content; CoreEdge lists 1,366 Integration rows and runs none [R3].
- Solution: from one communication scenario (`SapCommScenario`, 496 scenarios mapped to 1,832 APIs), generate a manifest, interfaces, a Lab collection and the SAP-admin checklist.
- Acceptance: a starter for one S/4 Public scenario reaches a passing twin collection with no hand edits.

**P2.15 One CoreEdge shell.** Size M. Depends on: P2.9.
- Problem: to the product owner it is one product; to a developer it is six entry points with different access rules (`/sap-explorer`, `/studio`, `/api/northbound`, `/operations`, `/control-tower`, `/coreedge`). Developers cannot open the Operations screen that shows their own failures (`canAccessOperations`, `src/lib/studio/rbac.ts:114`), and `WORKBENCH_ONLY` redirects the portal's invite screens (P0.13).
- Solution: one navigation and one sign-in across Discover (today's `/sap-explorer` and Studio Discover merged), Build (Studio and Lab), Run (the `/coreedge` board plus the developer's own Operations view) and Govern (Control Tower). Each role sees the same shell with its own sections unlocked.
- Acceptance: a developer moves from discovering an API to reading their own failed call without changing site or seeing a 403.

**P2 exit:** every P2 acceptance criterion is green in CI or recorded; A.3 tests 1, 2, 4, 5 and 7 (TS, Python, ABAP, Power Platform) pass; every open badge is listed; the product owner signs off.

<!-- figures:begin after-P2 -->
**After P2:** full 0.1% (432 scenarios), partial 1.3% (6,384); lifecycle stages full: 4 of 18 (MOCK_TEST_BEFORE_CODE added) [simulated].
<!-- figures:end after-P2 -->

### 8.5 Phase 3: Govern every connected program as code

**Goal:** a program declares itself, is checked before commit and in CI, is promoted on evidence, is held to policies and budgets, can be stopped in one click, and is watched by monitors and the upgrade radar. SAP-to-external calls are governed too.

**Estimate:** 10-12 weeks.

**P3.1 App manifest (`coreedge.yaml`) and manifest versions.** Size L. Depends on: P0.1, P0.14, P1.5.
- Problem: CoreEdge cannot tell drift from intent.
- Solution:
  - The manifest declares solution, consumer type, owners, purpose, data class, per-environment interfaces (fields, filter shape, version range), budgets, egress CIDRs, an `aiAgent` flag, end-user propagation, where SAP data is stored and for how long, the hosting region, and any onward transfer to third parties.
  - `AppManifestVersion` storage.
  - `plan` and `request`, which never approve.
  - Each call is checked on the server against the solution's active `AppManifestVersion`, so static `ce_` keys (opaque strings with no claims, `src/lib/northbound/auth.ts:25-37`) need carry no digest. An optional `X-CoreEdge-Manifest` header is accepted and recorded, and the version id goes on every audit row. Out-of-manifest calls are refused with `NOT_IN_MANIFEST`.
- Value: every program is known by its declared intent.
- Code: new `src/lib/manifest/`, Prisma, pipeline step 2, the Studio solution page.
- Acceptance: `plan` lists exactly the needed grants; out-of-manifest calls return 403 and are audited.

**P3.2 Management API, personal tokens and the CLI.** Size L. Depends on: P3.1, P1.6a, P2.1, P2.6a, P2.11a, P4.8.
- Problem: Studio APIs are cookie-only; the CLI copy is blocked.
- Solution:
  - `/api/mgmt/v1`, accepting a session, a personal token (scoped, expiring, hashed) or a workload token.
  - `@coreedge/cli` with `login`, `init`, `pull`, `twin up`, `lab run`, `verify`, `diff`, `plan`, `request`, `can-i-deploy`.
- Value: governance inside the developer's own loop.
- Code: new `src/app/api/mgmt/v1`, `packages/cli`, the twin packaged for offline use on the P1.6a `TwinStore` port (SQLite or in-memory).
- Acceptance:
  - An offline twin matches the hosted conformance results.
  - `verify` runs four checks and fails on any of them: (a) the SDK is generated from the manifest and exposes only declared operations; (b) a lint flags raw HTTP calls to the CoreEdge URL in TS and Python; (c) a scan finds no token literal; (d) the contract and suite checks pass, and no grant is missing or expiring. Proving statically that arbitrary code in five languages calls only approved APIs is not attempted; the runtime `NOT_IN_MANIFEST` refusal (P3.1) is the enforcement.

**P3.3 CI workload identity and pipeline integrations.** Size M. Depends on: P3.2, P2.5, P0.5, P4.8.
- Problem: CI can only use a long-lived key.
- Solution:
  - RFC 8693 token exchange of the CI's OIDC token [E52, E55].
  - `CiTrustPolicy` with issuer, subject pattern and scopes.
  - CI tokens can never call data routes.
  - A GitHub Action, a GitLab template, an Azure DevOps task and a documented Piper step.
- Value: no secret stored in CI, and no PROD power on a branch.
- Code: the token route, Prisma, new `packages/github-action`.
- Acceptance: a sample PR gets a "CoreEdge check" with no stored secret; a CI token calling DEV data gets 403.

**P3.4 Releases and promotion gates.** Size L. Depends on: P3.1, P3.2, P0.12, P3.7.
- Problem: PROD is not gated on TEST evidence (`src/lib/studio/grants.ts:288-296`).
- Solution:
  - An immutable release promoted DEV to TEST to PROD.
  - Configurable gates: TEST lane green for N days, suites passed, no unacknowledged breaking diff, a non-owner approver, step-up, live owners, write checklist; for custom services, "service verified on the target environment"; for PROD, a dependency scan (SBOM) of the program's release attached by CI with no critical findings.
  - Named, expiring overrides; a signed promotion record.
- Value: PROD decided on proof, and auditable.
- Code: Prisma (`Release`, `PromotionGate`), `grants.ts`, `src/lib/auth/permissions.ts:355-375`.
- Acceptance: a PROD promotion without a recent green TEST suite is refused with the rule named; PROD promotion of a PERSONAL_DATA interface is refused unless retention and region are declared and recertified within the last quarter.

**P3.5 Policy engine with shadow replay and decision receipts.** Size L for v1, plus L for v2. Depends on: P0.14, P1.4, P1.5, P3.1, P3.10.
- Problem: the only policy is a fixed 60 calls a minute (`src/lib/security/rate-limit.ts:224-234`); `dataClass` controls nothing (`src/lib/studio/data-class.ts:13-17`). Most packs cannot be replayed today, because an audit row holds no query shape, field list, source IP or payload (`prisma/schema.prisma:1250-1323`; section 9.1 #11 rules out payload capture), and default retention is exactly 30 days (`retention.ts:57`).
- Solution:
  - Versioned org policy sets, approved by two people. **v1:** the engine plus the quota and budget, time-window, network and write-safety packs. **v2:** the field allow-list, PII masking, residency, SAP API Controls and AI agent packs. The full list:
    - Baseline
    - Field allow-list
    - PII masking
    - Quotas and budgets
    - Time windows
    - Network
    - Residency
    - Write safety
    - SAP API Controls
    - AI agent
  - Replay over recorded inputs (the P1.4 query-tree hash and fields; the P3.10 source IP and decision id), then shadow mode. Packs whose inputs were never recorded start in shadow mode and gather evidence going forward. Retention is raised to cover the replay window (D9).
  - A decision log and an `X-CoreEdge-Decision` header.
- Value: the program is controlled by explicit, testable rules without surprise outages.
- Code: new `src/lib/policy/`, Prisma, `rate-limit.ts`, `data-class.ts`, `access.ts`, a Control Tower screen.
- Acceptance:
  - No enforcement without a replay report.
  - A synthetic full-table pager trips the bulk hold.
  - SAP 429s are never retried before Retry-After.

**P3.6 Containment switches and break-glass.** Size M. Depends on: P0.14.
- Problem: stops exist only per object.
- Solution:
  - `ContainmentSwitch` covering six scopes and three modes, stored in Postgres as the source of truth and published to Redis. It is checked at pipeline step 0 in the same pipelined Redis call as the rate bucket and the breaker, with a per-instance cache of 2 seconds or less. During a Redis outage, writes fail closed and reads fail open with an alert (rate limiting already fails closed in production, `src/lib/security/rate-limit.ts:135-140`). Pipeline overhead target: p95 25 ms or less [estimate], measured in CI.
  - Auto-expiry; lifting needs a different person.
  - Break-glass grants of 4 hours or less.
  - A new Operations screen.
- Value: any program contained in seconds without deleting anything.
- Code: Prisma, the pipeline, new `src/app/(operations)/operations/containment`.
- Acceptance: a FREEZE stops 100% of matching calls within 5 seconds across instances; a person cannot lift their own switch.

**P3.7 Monitors, OpenTelemetry, stored incidents and owner alerts.** Size L. Depends on: P2.1, P0.14, P0.2, P2.0, P0.18.
- Problem: checks run daily; the only alert goes to platform admins; incidents are not stored; there is no OpenTelemetry (`src/instrumentation.ts:9-24`).
- Solution:
  - Collections run as monitors every 5 minutes or less, from a once-a-minute dispatcher cron that queues one job per due monitor (P2.0). This needs a paid Vercel plan (Hobby crons run at most once a day [E75]; the production plan is [unverified], see D11). Monitors get their own rate bucket and per-organisation quotas, so they do not spend the application's 60-a-minute budget (`src/lib/security/rate-limit.ts:234`).
  - OpenTelemetry spans per step; W3C `traceparent` [E39].
  - Stored incidents with acknowledge and assign.
  - Alerts to the app's three owners by email, Teams, Slack, PagerDuty or webhook.
  - A per-developer request log.
  - Decide on Sentry: `@sentry/nextjs` is a dependency and is called from `src/lib/ops/connection-probe-sweep.ts:22`, but `src/instrumentation.ts` never loads `sentry.server.config.ts` and `next.config.ts` has no `withSentryConfig` [inferred: server events may never be sent]. Initialise it from `src/instrumentation.ts` or remove the dependency; the error rate per route feeds the reliability objective (A.3 #14).
- Value: problems reach the owner.
- Code: `src/lib/ops/lane-check-sweep.ts`, `incidents.ts`, `connection-probe-sweep.ts`, `src/instrumentation.ts`, `src/lib/northbound/respond.ts`, `vercel.json`.
- Acceptance: a failing PROD monitor alerts all owners within one interval; twin monitors never change lane evidence; caller traces join CoreEdge spans.

**P3.8 Upgrade radar.** Size L. Depends on: P1.3, P3.7, P3.2, P2.0.
- Problem: SAP upgrades surface only after something fails.
- Solution:
  - Nightly snapshots and a diff classified as BREAKING, ADDITIVE or ANNOTATION, mapped to apps and owners.
  - A rehearsal on the TEST tenant after its upgrade (S/4 Cloud Public upgrades TEST before PROD [E57]).
  - A deprecation countdown following SAP's deprecation policy [E58].
  - `can-i-deploy` fails on an unacknowledged breaking change.
- Value: no surprise breakage from SAP releases.
- Code: `src/lib/contracts` (diff), `hub-successors.ts`, `catalogue-health.ts`, `lane-check-sweep.ts`, `incidents.ts`.
- Acceptance: a removed property raises a BREAKING incident naming the apps within 24 hours of the TEST snapshot.

**P3.9 Governed outbound routes (SAP or ABAP calling an external program).** Size L (without the external-API twin, which moves to P5.3). Depends on: P2.5, P2.7, P3.5, P0.10, P0.5, P4.1 (P4.1 is pulled forward to run before this item).
- Problem: SAP_CALLS_OUT is at 0% (85,104 scenarios). External endpoints are not SAP hosts, so the SAP suffix allow-list (`src/lib/studio/sap-host-allowlist.ts:41-53`) cannot apply, and the other guard checks the host name only when it is saved and never resolves DNS (`src/lib/studio/connection-url-guard.ts:15-33`), so a name could later point at a private address (server-side request forgery). This matters most when P4.5 runs CoreEdge inside a customer network. Today's per-IP limit (120 non-GET a minute) would also squeeze every outbound route of one SAP system into one budget.
- Solution:
  - `/api/outbound/{routeId}`.
  - An `ExternalEndpoint` registry: URL, OpenAPI, credentials held by CoreEdge.
  - Egress grants (`direction=OUT`) with budgets.
  - A typed ABAP method.
  - The P4.1 dispatcher resolves the host, refuses private, link-local and metadata address ranges, and pins the IP for the request; limits are keyed by credential (P0.5).
- Value: governance in both directions.
- Code: new `src/app/api/outbound`, Prisma, an egress adapter, an OpenAPI-based twin, ABAP codegen.
- Acceptance: one audit row per call; revoking the grant stops it at once; unregistered hosts are refused; a registered name re-pointed at a private address is refused.

**P3.10 Audit integrity v2.** Size L. Depends on: P0.14, P0.10, P2.0.
- Problem:
  - Append-only is enforced only by a test regex (`tests/unit/northbound/dod-gaps.test.ts:170-221`).
  - Audit writes are best-effort on every path (`src/lib/northbound/audit.ts:136-144`): a failed insert is logged and swallowed, including after a successful SAP create (`src/app/api/northbound/interfaces/[id]/data/write/route.ts:342-394`).
  - There is no export.
- Solution:
  - A hash chain sealed asynchronously, not on the request path; a per-organisation lock on every call would contend on a 5-connection pool (`.env.example:2-3`). A sealing job on the jobs port (P2.0) assigns a per-organisation sequence number and a Merkle root to each one-minute batch, and stores anchors, signed through the P0.10 `sign` API, in a separately retained `AuditAnchor` table. Retention deletes only whole sealed batches and keeps the boundary hash; today it deletes the oldest rows nightly in batches of 5,000 (`retention.ts:57-76`).
  - Fail closed on writes by inserting the audit row in the same transaction as the idempotency claim, before SAP is called, rather than by locking a chain head; an outbox for the rest.
  - Source IP, user-agent hash and decision id on every row.
  - NDJSON and CSV export; a verifier CLI. Retention is already configurable for the deployment (7-3,650 days through `NORTHBOUND_AUDIT_RETENTION_DAYS`, `retention.ts:18,57-66,92`); add a per-organisation setting and make the screens query the full window (they clamp to 30 days).
- Value: every control decision is provable.
- Code: `audit.ts`, `retention.ts`, Prisma, `src/app/api/control-tower/audit/route.ts`, the CLI.
- Acceptance: tampering breaks verification at that row; no SAP write happens without an audit row under database failure.

**P3.11 Per-solution SAP identity and a tenant ceiling.** Size M. Depends on: P0.1, P0.14.
- Problem: the partial unique index `SapConnection_active_binding_tuple` on (organizationId, product, environment, client) WHERE isActive (`prisma/schema.prisma:744-753`) allows one active connection per tenant and client per organisation. Every app therefore reaches SAP as the same communication user, with the union of all apps' authorisations, and SAP's logs cannot tell apps apart [R1 §3 Point 4]. Limits are per key (`src/lib/security/rate-limit.ts:234`), so N keys can send N × 60 calls a minute to one tenant.
- Solution: allow several active connections per tenant and client, each bound to named solutions, so each app can use its own communication user with only its scenarios. Add an aggregate rate and concurrency ceiling per connection that protects the SAP tenant whatever the number of keys.
- Acceptance: two apps on one tenant reach SAP as different communication users; under a multi-key load test, calls to one connection never exceed its ceiling.

**P3 exit:** every P3 acceptance criterion is green in CI or recorded; A.3 tests 6, 7 (Java and .NET), 8, 9 (all routes), 12, 13 and 14 pass; every open badge is listed; the product owner signs off.

<!-- figures:begin after-P3 -->
**After P3:** full 0.1% (648 scenarios), partial 1.6% (7,980); lifecycle stages full: 12 of 18 (DEVELOP_SDK_CODEGEN, CI_PRECOMMIT_GOVERNANCE, DEPLOY_PROMOTE_ENVIRONMENTS, RUN_MONITOR_ALERT, GOVERN_AUDIT_COMPLY, SAP_UPGRADE_IMPACT, ONBOARDING_TIME_TO_FIRST_CALL, PROVIDER_BUILD_TRANSPORT added) [simulated].
<!-- figures:end after-P3 -->

### 8.6 Phase 4: Reach any SAP landscape, run anywhere

**Goal:** make RISE, on-premise S/4 and ECC reachable (228,420 valid scenarios), and make CoreEdge easy to install.

**Estimate:** 12-14 weeks.

**P4.1 Transport dispatcher (pulled forward to Phase 3, before P3.9).** Size M. Depends on: P0.14.
- Problem: plain `fetch` with no proxy, custom CA or client certificate. The console and Ariba paths sit outside the `fetchImpl` seam: `sapFetch` (`src/lib/sap-public/tdd-connector.ts:614-628`, 9 call sites serving inspect, probe, preview and the write-back) and `ariba-connector.ts` call global `fetch` directly, so through a connector they would bypass the transport, and "existing suites pass unchanged" would not catch it.
- Solution: on the minimal `Transport` from P0.14, add the undici dispatcher (proxy, custom CA [E51], client certificate, resolved-IP checks that refuse private, link-local and metadata ranges), the connector and integration-suite implementations, and new connection fields. Move `sapFetch` and the Ariba connector onto it.
- Value: every adapter reaches every network the same way.
- Code: `read.ts:143-145`, `write.ts:220-222`, `connection-health.ts:215`, `connection-resolver.ts:660,747`, `tdd-connector.ts:614-628`, `ariba-connector.ts`, `SapConnection`.
- Acceptance: `HTTPS_PROXY` and a custom CA work in a container test; existing suites pass unchanged; a stub transport sees every console preview, inspect, probe and write-back call.

**P4.2 CoreEdge Connector and Relay.** Size 2-3 XL (v1, then v2). Depends on: P4.1, P0.10, P4.8, D12.
- Problem: private systems can be configured but not reached.
- Solution:
  - **v1:** a signed TypeScript/Node connector that reuses `connection-resolver.ts` and `oauth-saml-bearer.ts` (a Go agent would have to re-implement the SAP login code), or an existing outbound tunnel such as Cloudflare Tunnel [E35] [fit unverified], shipped as one container, VM or Windows service; no vault mode.
  - **v2:** vault mode and the HA pair.
  - One-time enrolment, short-lived mTLS certificates, outbound 443 only through proxies.
  - An access list held by the customer that CoreEdge cannot widen.
  - HA pair; optional vault mode; a local hash-chained log; signed updates.
  - A long-lived Relay off Vercel, because Vercel WebSockets are in beta and limited in duration [E49]; where it is hosted and who is on call is decision D12.
- Value: private SAP landscapes reachable with no inbound port and no Cloud Connector.
- Code: new `connector/`, `relay/`, `src/lib/transports/connector.ts`, Studio site enrolment.
- Acceptance:
  - A NATed lab VM is read and written.
  - Losing one connector loses no requests.
  - Unlisted hosts are unreachable.
  - Vault mode keeps the credential out of the cloud database.
  - Relay overhead at p95 is 50 ms or less [estimate target].
  - (GA gate, outside this item's size) an external penetration test completes before GA.

**P4.3 SAP-side login breadth: X.509 and IAS.** Size L. Depends on: P4.1, P4.2.
- Problem: no certificates and no per-person identity toward SAP.
- Solution: X.509 with CSR generation and expiry alerts; extend the SAML bearer signer to S/4 [unverified on S/4 Cloud Public inbound]; OIDC/IAS client credentials for BTP. Principal propagation (short-lived user certificates behind the connector) moves to P6.5, because it needs the end user on every call, which only P6.5 provides.
- Value: certificate and IAS logins replace passwords; per-person identity toward SAP follows in P6.5.
- Code: `connection-resolver.ts:39-62`, `oauth-saml-bearer.ts`, `connection-crypto.ts`, the connector certificate module.
- Acceptance: certificate login against a lab S/4 with a correlation id; alerts at 30, 7 and 1 days; IAS client credentials verified live per product. Where no lab tenant exists, the badge is shown, the simulator scores the cell partial, and a dated follow-up item names the tenant needed; each phase's exit review lists every badge still open.

**P4.4 Connectivity Doctor and fixed egress.** Size M. Depends on: P4.1.
- Problem: all connection failures look the same; there is no fixed-IP story.
- Solution: DNS, TCP, TLS, auth and `$metadata` checks reported separately, with fixes; an egress-IP echo; documented options [E47, E48].
- Value: diagnoses in minutes the set-up failures that take most of TTFRC.
- Code: `connection-health.ts`, the Studio Connections screen.
- Acceptance: each failure class gets a distinct status; the echo matches the observed source IP.

**P4.5 Self-host package.** Size L, plus M for P4.5a. Depends on: P0.10, P0.13, P0.18, P4.8.
- Problem:
  - No Dockerfile.
  - Build steps exist only in `vercel-build` (`package.json:22-23`).
  - Crons can run twice (fixed for the hosted instance by P0.18).
  - An admin import fetches the harvested catalogue from GitHub at request time, pinned to the deployed commit (`src/lib/sap-public/hub-harvest-remote.ts:20-37,86-89`; importers `src/app/api/sap/tdd/hub-content/harvest-import/route.ts` and `api-reference-import/route.ts`). A self-host needs GitHub egress and `HUB_HARVEST_REPO` plus a ref, or the signed offline bundle below.
  - The repository holds client-identifying fixtures and SAP-partner-restricted material, for example `tests/fixtures/classification/sap-2602/cases.json`, `Conversion/partneredge_index.json`, `logs/partneredge-ingest-summary.json`, `sap-references/2608` and client scripts `scripts/_skm-*.ts`; the confidentiality guard misses them and does not run in CI [R2].
  - Bulk results (P5.9) and files (P5.5) need storage, and `@vercel/blob` works only on Vercel.
- Solution:
  - `output: 'standalone'` behind `BUILD_STANDALONE=1` [E50].
  - One image with web, migrate and jobs entrypoints.
  - Compose with Postgres 16, Redis plus an Upstash-compatible proxy, Mailpit and an OpenTelemetry collector.
  - Helm with `concurrencyPolicy: Forbid`; Terraform for AWS, Azure and GCP.
  - A `/setup` wizard with the bootstrap token; `ce doctor`.
  - The P0.18 job leases.
  - A `StoragePort`: Vercel Blob when hosted, S3 or MinIO in compose (added to the compose stack); bulk jobs return signed URLs.
  - GCP KMS, Azure Key Vault and Vault Transit `KeyProvider` implementations (moved from P0.10).
  - **P4.5a scrubbed distribution (M):** the image and packages are built from an allow-listed path set that excludes `sap-references`, `Conversion`, `logs`, fixtures and specs; the confidentiality guard runs on every PR with an extended denylist; handovers are a history-free export; redistribution rights for SAP-derived content are confirmed (D1) before any copy leaves the team.
  - A signed offline catalogue bundle.
- Value: any team can run its own instance.
- Code: `next.config.ts`, `package.json`, new `Dockerfile`, `compose.yaml`, `deploy/`, `vercel.json`, `src/lib/ops/cron.ts`.
- Acceptance:
  - `docker compose up` reaches a governed SANDBOX call in 15 minutes or less.
  - A Helm install passes the smoke suite.
  - Two schedulers never run the same job.
  - The image and every package contain none of the excluded paths; the guard runs in CI.

**P4.6 Staff SSO and SCIM.** Size M. Depends on: P2.9.
- Problem: SSO settings are stored but unused (`src/app/api/organizations/[orgId]/sso/route.ts:14-24`).
- Solution: SAML via Ory Polis 26.2.0 or later [E62]; OIDC providers (Entra, Okta, SAP IAS) reuse the single generic OIDC provider from P2.9; IdP groups mapped to roles; SCIM de-provisioning; magic link kept for emergencies.
- Value: enterprise fit, and the A69 class of problem closed for good.
- Code: `auth-options.ts`, the SSO route, new SCIM routes, `rbac.ts`.
- Acceptance: SCIM de-provisioning makes an app RESTRICTED within one minute.

**P4.7 ECC, RISE and on-premise lanes end to end.** Size M. Depends on: P4.2, P1.1, P1.2.
- Problem: ECC resolves zero services by design (`tdd-connector.ts:503-527`).
- Solution: ECC Gateway services through custom paths and discovery, reached over the connector; the same Lab collections run green on these lanes.
- Value: serves the customers who need it most.
- Code: `tdd-connector.ts:474-527`, `dynamic-catalog.ts`, Lab environments.
- Acceptance: ECC read and create, and on-premise S/4 V4 read, update and delete, verified behind the connector.

**P4.8 Licence decision for distributed artefacts (decision gate D1, taken in Phase 0).** Size S. Depends on: none. Every item that publishes (P2.6, P2.7, P3.2, P3.3, P4.2, P4.5) depends on it.
- Problem: the licence is proprietary (`LICENSE:8-14`), and there may be employer interest in the IP [R2].
- Solution: a recorded product-owner decision, for example Apache-2.0 for client artefacts with the platform kept proprietary, in `docs/coreedge/COMMERCIAL-DECISIONS.md`.
- Value: unblocks P2.6, P2.7, P3.2, P3.3, P4.2 and P4.5.
- Acceptance: the decision is recorded and each package carries its licence.

**P4 exit:** every P4 acceptance criterion is green in CI or recorded; A.3 test 11 passes; every open badge is listed; the product owner signs off.

<!-- figures:begin after-P4 -->
**After P4:** full 1.5% (7,560 scenarios), partial 5.7% (28,500); lifecycle stages full: 13 of 18 (SELF_HOST_SETUP added) [simulated].
<!-- figures:end after-P4 -->

### 8.7 Phase 5: Every protocol and pattern on one pipeline

**Goal:** remove the non-OData (74.2%) and non-synchronous (68.2%) blockers. Every adapter inherits grants, policy, containment, audit, twin and Lab.

**Estimate:** 16-20 weeks; build in order of demand.

**P5.1 Adapter SDK.** Size M. Depends on: P0.14, P4.1.
- Problem: without a common contract, each protocol would rebuild governance its own way.
- Solution: an `Adapter` interface (`describe`, `plan`, `dispatch`, `normalizeError`, `meter`) with mandatory declarations. OData is ported onto it first.
- Code: new `src/lib/adapters/`, pipeline step 8, `failure-reason.ts`.
- Acceptance: OData passes on the SDK; an adapter missing a declaration fails CI.

**P5.2 SOAP adapter and SOAP twin.** Size L. Depends on: P5.1, P1.3.
- Problem: S/4's 212 SOAP APIs are unreachable.
- Solution: WSDL into the Contract IR, exposed through a JSON facade; WS-Security; a WSDL-based twin (Microcks pattern [E30]).
- Acceptance: 3 S/4 and 1 SuccessFactors SOAP API verified live with correlation ids; the SOAP twin passes the conformance set for 5 named APIs.

**P5.3 REST adapter (Ariba, Concur, SuccessFactors REST, BTP, SaaS).** Size M. Depends on: P5.1.
- Problem: Ariba is env-only; Concur, BTP and SaaS have no connector.
- Solution: OpenAPI import; stored connections; managed OAuth refresh; an OpenAPI-based twin of external APIs (moved from P3.9).
- Acceptance: one live call each with a correlation id; an SDK and twin per target. Where no lab tenant exists, the badge is shown, the simulator scores the cell partial, and a dated follow-up item names the tenant needed; each phase's exit review lists every badge still open.

**P5.4 RFC/BAPI through the connector.** Size XL. Depends on: P4.2, P5.1.
- Problem: on-premise and ECC logic is often available only as BAPIs.
- Solution: SAP's Go and Node RFC libraries (SAP/gorfc, SAP/node-rfc) are reported archived and no longer maintained [E76] [archive status not re-checked for this revision], so a Go or Node connector has no supported RFC binding. Build the RFC plugin as a Java sidecar on JCo inside the connector, with JCo supplied by the customer [unverified terms], or start with SOAP-RFC or WebSocket RFC over HTTP through the existing transport [availability per release unverified]. RFC metadata compiled into a contract; explicit commit and rollback.
- Acceptance: `BAPI_PO_CREATE1` plus a commit in one session, audited; the plugin refuses to start without an SDK.

**P5.5 IDoc and file/SFTP.** Size L. Depends on: P5.4, P5.6.
- Solution: IDoc inbound via SOAP or RFC; outbound via an XML-HTTP port into event ingress; governed SFTP push and pull with checksums.
- Acceptance: an `ORDERS05` IDoc is posted and its status read back; SFTP transfers are audited.

**P5.6 Durable runtime: dead-letter queue, replay and ordering.** Size M. Depends on: P2.0.
- Solution: on the P2.0 jobs port: retry classes from `failure-reason.ts`; ordering per business key; async writes; signed status callbacks; a DLQ with a replay screen. The queue and outbox themselves arrive with P2.0 and P3.10.
- Acceptance: `kill -9` mid-job loses nothing and duplicates nothing.

**P5.7 Events in, governed webhooks out, change-feed synthesiser.** Size L. Depends on: P5.6, P4.2, P3.1, P0.5.
- Solution:
  - Ingest Event Mesh, Advanced Event Mesh and IDoc. Ingest is limited per subscription (P0.5), replies 202 and hands work to the queue (P2.0).
  - Synthetic `*.Changed` events by polling on change dates.
  - Standard Webhooks signing [E36] with CloudEvents.
  - Retries, DLQ and replay; SUBSCRIBE grants.
  - `coreedge listen` and `trigger`.
- Acceptance: a real `SalesOrder.Created` event arrives with a valid signature; an ECC change appears within one polling interval; no delivery without a grant.

**P5.8 Mapping Studio (P5.8a, L) and code-first flows (P5.8b, XL).** Depends on: P5.6, P1.3, P2.1.
- Solution:
  - (P5.8a) Versioned JSONata in a worker with resource limits and a hard timeout that terminates it, with no custom functions that do I/O. A Node worker thread is not a sandbox (it has the full Node API, `fetch` included); JSONata's real risk is runaway CPU or memory. Value maps; tests.
  - (P5.8b) Declarative or TypeScript flow steps on the jobs port (P2.0) or Vercel Workflows, with per-step grants, idempotency and saga compensation.
  - A read-only canvas.
- Acceptance: create PO, then goods receipt, compensates under fault injection at every step with no duplicates; the Mapping card is live.

**P5.9 Bulk and batch jobs under policy budgets.** Size M. Depends on: P5.6, P3.5, P4.5.
- Solution: paged extract to NDJSON or CSV, written through the P4.5 `StoragePort` and returned as signed URLs (Vercel limits bodies to 4.5 MB [E72]); chunked batch create with per-record results; checkpoints; capped and held per SAP API Policy §2.1 and §2.2.2.
- Acceptance: over-limit runs are refused; killed jobs resume; results account for 100% of records.

**P5.10 Integration Suite as a governed backend; non-SAP SaaS.** Size M. Depends on: P5.3.
- Solution: an iFlow, API Management endpoint or MCP Gateway endpoint becomes a CoreEdge interface, so apps and agents reach SAP through SAP's endorsed paths under CoreEdge governance; read the IS package inventory; managed OAuth for five named SaaS products (named before the item starts; Salesforce first).
- Acceptance: one iFlow called with audit; one live call with a correlation id for each of the five named SaaS products; an agent call through the MCP Gateway is governed and audited.

**P5.11 Inventory import from SAP PO and Cloud Integration.** Size M. Depends on: P5.10.
- Problem: customers leaving SAP Process Orchestration need to know what moves where; Integration Suite offers a Migration Assessment [E70], and PO 7.5's mainstream maintenance ends on 31 December 2027 per a 2020 SAP post [E71] [verify on SAP's current calendar].
- Solution: read a PO or Integration Suite inventory and classify each interface as CoreEdge-native, CoreEdge front door plus Integration Suite backend, or stay on Integration Suite.
- Acceptance: a sample PO inventory is classified, with the rule behind each classification shown.

**P5 exit:** every P5 acceptance criterion is green in CI or recorded; every open badge is listed; the product owner signs off.

<!-- figures:begin after-P5 -->
**After P5:** full 4.9% (24,288 scenarios), partial 33.0% (164,331); lifecycle stages full: 14 of 18 (DESIGN_MAP added) [simulated].
<!-- figures:end after-P5 -->

### 8.8 Phase 6: AI-native and provable

**Goal:** govern AI agents under the same controls as programs, and turn governance into continuous, exportable proof. CoreEdge does not lead Integration Suite on agents: SAP names the MCP Gateway as the endorsed pathway (section 3.7). P6.1 is blocked until SAP endorses it or the D2 legal reading permits it; until then agents reach SAP through the MCP Gateway as a governed backend (P5.10).

**Estimate:** 10-12 weeks.

**P6.0 OAuth authorization server for interactive and agent clients.** Size M-L. Depends on: P2.5, P0.10.
- Problem: the MCP 2025-11-25 authorization spec requires an OAuth 2.1 authorization server with authorization code plus PKCE (S256), RFC 9728 protected-resource metadata, RFC 8414 or OIDC discovery, RFC 8707 audience binding, and client registration through Client ID Metadata Documents or dynamic registration [E40]. P2.5 provides machine-to-machine (client credentials) tokens only.
- Solution: an authorization endpoint with PKCE, a consent screen on the existing session, RFC 8414 and 9728 metadata, resource-bound tokens, Client ID Metadata Document support and refresh-token rotation for public clients, on the same library as P2.5. The alternative is to federate to the customer's identity provider through P4.6.
- Acceptance: the MCP inspector completes the authorization flow against a test resource.

**P6.1 Runtime MCP gateway for AI agents.** Size L. Depends on: P6.0, P2.5, P3.5, P3.6, D2. **Blocked until SAP endorsement or the D2 legal reading.**
- Solution:
  - An OAuth 2.1 resource server [E40]; tools only from live grants, with pinned descriptions (OWASP MCP03 [E41]).
  - Agents as principals with their own budgets; write intents confirmed by a person.
  - SAP text marked as data; deny-by-default until a legal attestation.
- Acceptance: MCP inspector connects; tools vanish when grants expire; an unconfirmed write returns 403; the OWASP MCP Top 10 red-team suite passes.

**P6.2 Studio copilot, grounded and verified.** Size L. Depends on: P2.11, P5.8.
- Solution: BYOAI copilot in Studio and the Lab with catalogue, contract and twin tools; "works" only with a passing run id.
- Acceptance: on a 30-question evaluation set, every "works" links a run, unknowns are labelled, and at least 90% of answers match the evaluation key [target to set].

**P6.3 Behavioural anomaly detection with graded auto-containment.** Size L. Depends on: P3.6, P3.7.
- Solution: per-key baselines; first-seen events; a bulk-extraction signature. Responses step up: alert, then THROTTLE, then READ_ONLY. FREEZE is set only by a person. A 30-day shadow false-positive report comes first.
- Acceptance: replayed attack traffic is throttled within 2 minutes; false positives are below X% [to set] in the 30-day shadow report before auto-throttle is enabled.

**P6.4 Evidence vault: SIEM streaming, access reviews, evidence packs.** Size L. Depends on: P3.10, P3.4.
- Solution: OCSF events to SIEM; quarterly recertification; one-click SOC 2, ISO 27001:2022 and GDPR Art. 30/33 packs; continuous control checks.
- Acceptance: SIEM receives every decision within 60 seconds; unrecertified grants expire.

**P6.5 End-user acting-for, consent ledger and principal propagation to SAP.** Size L. Depends on: P2.5, P3.5, P4.2, P4.3.
- Solution: RFC 8693 `sub`/`act` tokens [E52]; principal propagation to SAP (short-lived user certificates behind the connector, moved from P4.3) as the SAP-side half; policy can require `sub`; consent records per ISO/IEC TS 27560; withdrawing consent triggers containment.
- Acceptance: PERSONAL_DATA interfaces refuse calls without `sub`; withdrawal stops calls within 1 minute.

**P6.6 Digital Access estimator and chargeback.** Size M. Depends on: P2.4.
- Solution: map create interfaces to SAP's nine document types and count line items [E18]; monthly estimates; cost-centre export.
- Acceptance: estimates reconcile with audit rows and, where the customer provides it, with SAP's own Digital Access measurement for the same period [source to identify].

**P6.7 Governed OData facade per solution.** Size L. Depends on: P1.4, P1.5.
- Solution: an OData V4 facade exposing only granted sets and fields, through the pipeline, with the SAP host hidden.
- Acceptance: Excel and Power BI open it; field scope is enforced.

**P6 exit:** every P6 acceptance criterion is green in CI or recorded; every open badge is listed; the product owner signs off.

<!-- figures:begin after-P6 -->
**After P6:** full 6.1% (30,360 scenarios), partial 53.4% (265,599); lifecycle stages full: 15 of 18 (AI_ASSIST added) [simulated].
<!-- figures:end after-P6 -->

---

## 9. What not to build, risks, open decisions

### 9.1 What not to build

1. **A graphical iFlow or BPMN designer.** Flows stay code and JSON, with a read-only canvas.
2. **Groovy or JavaScript steps in the runtime, or server-side `pm.*` scripts.** Arbitrary scripts run only locally in the CLI.
3. **Chasing 250 adapters.** Build generic OData, SOAP and REST plus the top-5 SaaS; pair with Integration Suite for the rest (P5.10).
4. **Native B2B/EDI** (Trading Partner Management, Integration Advisor, AS2, AS4, OFTP2).
5. **A message broker.** Consume Event Mesh, Advanced Event Mesh or Kafka.
6. **A twin that claims business-logic fidelity** (pricing, availability checks, postings).
7. **AI that approves, promotes, issues or lifts switches.**
8. **Our own staff identity provider, KMS, HSM or SIEM.** Federate with existing ones. CoreEdge is an OAuth authorization server only for machine and agent clients (P2.5, P6.0), built on a maintained library.
9. **A Kubernetes-only runtime.** Single container; Helm optional.
10. **A Cloud Connector look-alike that claims BTP compatibility.**
11. **Payload capture by default.** Calls are metadata-only; payload capture is opt-in, masked and short-lived.
12. **API monetisation and a marketplace** in this roadmap.
13. **A general-purpose SDK generator or our own API client tool.**
14. **GraphQL.** The OData facade (P6.7) covers the need.
15. **Self-hosted LLMs or a model gateway.**
16. **A second enforcement path for any entry point.**
17. **Bundling SAP `$metadata` files in the repository** [redistribution rights unverified].

### 9.2 Risks

| Risk | Effect | Mitigation |
|---|---|---|
| SAP API Policy and licensing: §1.2 published APIs, §2.2.2 agents and bulk, §3 no circumvention [E17]; middleware does not change Digital Access exposure [E18] | Customer contract breach; reputational | SAP API Controls pack on by default; sign-off for custom services on Public Cloud; deny-by-default for agents and bulk; legal reading before P1.1 is marketed for S/4 Public and before P6.1 (D2) |
| Capacity: about 55-90 engineer-months [estimate] | Late or partial delivery | Each phase ships value on its own; cut by ranked blockers and the TTFC funnel; Phase 5 built by demand |
| Twin fidelity | Green on the twin, red on the tenant | TWIN label everywhere; conformance measured against X5M; DEV/TEST monitors; twin runs never satisfy gates |
| ABAP unknowns: OAuth client credentials on ABAP Cloud and OA2C_CONFIG; TLS trust; Gateway catalogue access [unverified] | ABAP cells stay partial | SAP-documented "Unauthenticated" fallback [E20]; an early ABAP spike in Phase 2 |
| Vercel limits: function duration, WebSockets in beta, inbound mTLS unknown, static IP cost | Connector and runtime cannot live on Vercel | Relay, jobs and connector run off Vercel by design; consumer mTLS full only when self-hosted |
| Connector supply chain | Foothold in customer networks | Signed builds, SBOM, customer-controlled updates and access list, short-lived certificates, local log, penetration test |
| RFC SDK and JCo licensing [unverified]; SAP's Go and Node RFC libraries reported archived [E76] | RFC adapter cannot ship bundled, and a Go or Node connector has no supported RFC binding | Customer supplies JCo to a Java sidecar; prefer OData and SOAP |
| Pressure to self-approve DEV | Governance diluted | Twin is free; DEV and above keep two people; shorten TTFRC with checklists instead |
| Auto-containment false positives | Business outage | Graded response; FREEZE set only by a person; 30-day shadow report |
| Policy latency on serverless | Slower calls | TypeScript evaluator first; Cedar only under 10 ms p95 |
| Multi-tenant blast radius | Data leak across organisations | Throw-mode guard (P0.12), then row-level security, then regional cells |
| PII in fixtures and idempotency rows (`src/lib/northbound/idempotency.ts:33,218`) | Personal data spreads | Masking (P1.5); untagged fields treated as "review required" |
| Licence and IP ownership (`LICENSE:8-14`) | Cannot distribute SDKs, CLI or connector | Decision D1 before the first publish |
| Verification debt | "Full" claims not true | "Untested" badges scored partial (P1.8) |
| Merging `custom-service-path` (41 files on top of `33d0ef86`, two additive migrations, fast-forward; an earlier "204 files" compared against a stale local `main` at `7f4f1da7`) | Low today; rises once P0.1 and P0.14 move route code | Merge it first, before P0.1 (P1.1 is scheduled in P0a) |
| Projections mistaken for results | Over-promising | Only simulator output is quoted (section 8.1); the 30-45% hand estimate is withdrawn |
| Shared production host holds third-party client data [R1 §1] | Exposure if real SAP credentials are stored | No real SAP credentials on the shared host until P0.10 and P0.12; customers run their own copy |

### 9.3 Open decisions for the product owner

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Licence for distributed parts (SDKs, CLI, Action, connector, self-host), and redistribution rights for SAP-derived content | Proprietary; open-source client parts only; all source-available | Apache-2.0 for client artefacts; platform proprietary. Confirm employer IP position first. Decide in Phase 0 (P4.8) |
| D2 | Legal reading of SAP API Policy §1.2 (custom APIs on S/4 Public) and §2.2.2 (agents, bulk), and whether SAP would endorse CoreEdge as an agent pathway | Proceed; proceed with sign-off; restrict | Get a reading before marketing P1.1 for S/4 Public; P6.1 stays blocked until it permits a CoreEdge agent path |
| D3 | Breadth strategy | Clone Integration Suite breadth; pair with it | Pair: CoreEdge as the governed developer front door, IS as backend for B2B and long tail |
| D4 | First target landscape | S/4 Cloud Public first; RISE/on-premise first | Decides whether P4 moves ahead of P3. Default keeps P3 first |
| D5 | Hosting model | Shared SaaS only; dedicated cells; self-host; hybrid | All four on one codebase (P4.5); no real SAP credentials on the shared host until P0 is done |
| D6 | How to measure success | Uniform scenario coverage; demand-weighted coverage; TTFC/TTFRC funnel | Weight the matrix by observed demand and report it beside the uniform figure; treat TTFC and TTFRC as the north-star metrics |
| D7 | Can the two-person rule ever be relaxed? | Never; DEV only; org presets | Never at DEV and above; the twin removes the need |
| D8 | Commercial model (`docs/coreedge/COMMERCIAL-DECISIONS.md`) | Per call; per app; per tenant | Decide before P6.6; publish "one call = one unit" |
| D9 | Data residency and audit retention defaults (retention is already configurable per deployment, 7-3,650 days, default 30) | 30 days; 13 months; per organisation | 13 months for governance rows, set per organisation and long enough for the P3.5 replay window; region field per organisation |
| D10 | Whether runtime AI agents ship at all | Ship (P6.1); Studio MCP only | Studio MCP in P2; runtime MCP only after D2 |
| D11 | Vercel plan and features (Static IPs, Secure Compute; the plan also sets cron frequency, function duration and log retention) | Buy; self-host NAT; connector only | Record the production plan first (a prerequisite for P0.12 and P3.7); connector for private systems; Static IPs only if an S/4 customer requires IP allow-listing |
| D12 | Where the connector Relay is hosted, and who is on call | A small VM or container service; a managed tunnel; the customer's own | Decide before P4.2 starts |
| D13 | Fold the extended model (six more targets, data products and binary media, five more consumer types; section 3.11) into the headline figures | Keep it separate; fold it in once its feasibility rules are checked against SAP's documentation; fold it in now | Keep it separate until each new target's feasibility row cites a primary source, then fold it in. Every headline figure will change when it does |
| D14 | Three lifecycle stages no roadmap item takes to full: PERFORMANCE_TEST (the A.3 #14 load test), SUPPORT_INCIDENT (a public status page and consumer ticket intake) and RETIRE (deleting fixtures and twin data at retirement) | Add an item for each; accept partial; drop the stage | Add an S-sized item for each to P3, beside P3.7, so the phase-exit reviews can hold them; until then the simulator reports 15 of 18 after P6 |
| D15 | What "full" requires of a CoreEdge cell | Tests and a document (today, section 2.3); also a live run within N days (section 7.5, P1.9) | Require a recorded live run for cells that touch SAP once P1.9 can show when each was last proved; set N with P1.8 |

### 9.4 Cost to run

- **Known:** Vercel Static IPs, $100 a month per project plus data transfer; Secure Compute at a custom Enterprise price [R1 §5].
- **To price before D8:** the Vercel plan, the Postgres provider, Upstash, the Relay host (P4.2), connector support, SIEM and log storage, and penetration tests.
- **Integration Suite:** list prices could not be read (Appendix C); ask SAP to quote the same scenarios.
- **Owner:** the product owner.

---

## 10. Appendix

### A.1 Dimension definitions

**Target (the SAP system or service being integrated)**
- **S4_PUBLIC:** S/4HANA Cloud Public Edition, SAP's ERP rented as shared SaaS and run by SAP. A **tenant** is one customer's instance, for example DEV, TEST or PROD.
- **S4_PRIVATE_RISE:** S/4HANA Cloud Private Edition, usually delivered under a **RISE with SAP** contract and run by SAP for one customer on a private network.
- **S4_ONPREM:** S/4HANA in the customer's own data centre or cloud account.
- **ECC:** ERP Central Component, SAP's older ERP.
- **SUCCESSFACTORS:** SAP's HR SaaS.
- **ARIBA:** SAP's procurement SaaS.
- **CONCUR:** SAP's travel and expense SaaS.
- **BTP_SERVICE:** a service on SAP Business Technology Platform, SAP's own cloud platform.
- **NON_SAP_SAAS:** for example Salesforce or ServiceNow.

**Technology**
- **ODATA_V2 / ODATA_V4:** SAP's main web API over HTTPS. GET reads, POST creates, PATCH updates, DELETE deletes. An **entity set** is a table of records. `$metadata` (an EDMX/CSDL document) describes the service.
- **SOAP:** XML web services.
- **REST:** plain HTTPS and JSON.
- **RFC_BAPI:** SAP's remote function call; a BAPI is a business function exposed this way.
- **IDOC:** SAP's asynchronous business-document message.
- **EVENTS:** "something happened" notices, for example through SAP Event Mesh.
- **FILE_SFTP:** file transfer.

**Pattern**
- **SYNC_READ / SYNC_CREATE / SYNC_UPDATE_DELETE_ACTION:** a program calls SAP and waits for the answer.
- **SAP_CALLS_OUT:** SAP calls an external program.
- **A2A_FLOW_WITH_MAPPING:** a multi-step application-to-application flow with data mapping.
- **BULK_BATCH:** large extracts or batches.
- **EVENT_TO_APP:** SAP events delivered to a program.
- **B2B_EDI:** documents exchanged with trading partners in EDI standards.

**Origin**
- **SAP_STANDARD:** published by SAP on the Business Accelerator Hub.
- **CUSTOMER_CUSTOM:** built by the customer. `Z*` objects are ABAP developments, for example RAP services; `YY1_*` objects are key-user extensions in S/4HANA Cloud.
- **PARTNER:** built by an SAP partner.

**Network**
- **PUBLIC_INTERNET:** reachable over the internet with valid credentials.
- **SAP_SIDE_IP_ALLOWLIST:** reachable only from known source IP addresses.
- **PRIVATE_NETWORK:** reachable only inside a private network, through a VPN, an agent or SAP Cloud Connector.

**SAP login (`sapAuth`)**
- **BASIC:** user and password of a communication user.
- **OAUTH_CLIENT_CREDENTIALS:** an application token.
- **OAUTH_SAML_BEARER:** a token exchanged for a signed assertion, often naming a person.
- **X509_MTLS:** a client certificate.
- **PRINCIPAL_PROPAGATION:** the end user's identity carried through to SAP.
- **API_KEY:** a static API key in a header, for example for the api.sap.com sandbox or Ariba.

**Consumer** (who writes the program that calls CoreEdge)
- **JS_TS, PYTHON, JAVA, DOTNET:** application developers in those languages.
- **ABAP_ONPREM:** classic ABAP on an on-premise or private system, using SM59 destinations and STRUST certificates.
- **ABAP_CLOUD:** ABAP in S/4HANA Cloud or the BTP ABAP environment, using communication arrangements.
- **LOW_CODE:** Power Automate, UiPath.
- **AI_AGENT:** an AI agent calling tools, for example through the Model Context Protocol (MCP).
- **HUMAN_TESTER:** a person testing interfaces.

**Consumer login (`consumerAuth`)**
- **STATIC_BEARER:** a long-lived key in a header.
- **OAUTH_CLIENT_CREDENTIALS:** short-lived tokens.
- **MTLS:** a client certificate.
- **USER_DELEGATED_OIDC:** a token acting for a signed-in person.

### A.2 Glossary of other terms

- **Communication scenario / arrangement / user:** in S/4HANA Cloud, a scenario (`SAP_COM_xxxx`) is an SAP-defined bundle of APIs. An arrangement switches it on for one external system. A communication user is the technical login.
- **Basis:** the SAP technical administration team.
- **SM59 / STRUST / OA2C_CONFIG:** classic ABAP transactions for destinations, certificates and OAuth client profiles.
- **ADT / abapGit / abaplint / ATC / ABAP Unit:**
  - ADT: the ABAP development tools in Eclipse or VS Code.
  - abapGit: Git for ABAP code.
  - abaplint: an ABAP linter that runs outside SAP.
  - ATC: SAP's ABAP Test Cockpit.
  - ABAP Unit: SAP's unit test framework for ABAP.
- **RAP, CDS:** the ABAP RESTful Application Programming model, and Core Data Services, SAP's data models.
- **Cloud Connector:** SAP's on-premise agent that connects private systems to BTP.
- **Edge Integration Cell:** Integration Suite's runtime on customer-run Kubernetes.
- **iFlow:** an Integration Suite integration flow.
- **Cloud ALM:** SAP's application lifecycle and monitoring service.
- **Digital Access:** SAP's licensing model for documents created in SAP by external systems.
- **Tenant Twin:** CoreEdge's planned simulated copy of a tenant's APIs (P1.6).
- **Lane:** in CoreEdge, one app × feed × environment path, judged over six hops (`src/lib/coreedge/lanes.ts:1-24`).
- **Grant:** CoreEdge's approval for one app to perform one operation on one API in one environment, with an expiry.

### A.3 The full definition of "seamless"

Each line is an acceptance test. They are restated from the roadmap synthesis. Each ends with the phase by which it must pass.

1. **Time to first call:** 30 minutes or less from sign-up to a passing twin call with no admin involved, for JS/TS, Python, Java, .NET, ABAP Cloud, Power Automate, an MCP-capable coding agent and a human tester in the Lab; 60 minutes for ABAP on-premise. Any other language counts when a client generated from the OpenAPI 3.0.3 output with openapi-generator compiles and passes the shared conformance script; CI proves this for Go and PHP. Measured by `DeveloperJourneyEvent`: median across at least 10 observed users per consumer type. *Must pass by: P2 (Java and .NET: P3).*
2. **Time to first real call:** 1 business day or less, median, from the moment a DEV grant request is submitted to the first audited 200 on a real DEV tenant. It is reported in three parts: approver wait, SAP-admin set-up wait and developer time. Unfinished SAP set-up is reported, not excluded. *Must pass by: P2.*
3. **Customer-built APIs:** a `Z*` or `YY1_*` OData V2/V4 service on an internet-reachable tenant can be registered, verified live, tested, called and audited with no code change and no catalogue import. *Must pass by: P1.*
4. **Real programs:** key lookup, allow-listed `$filter`/`$select`/`$orderby`/`$expand`, opaque paging, PATCH with ETag, DELETE, actions and `$batch`, each granted separately; a conformance suite passes on V2 and V4 against the X5M lab and its twin. *Must pass by: P2.*
5. **Postman before code:** build, assert, chain, save, export (Postman, Bruno, `.http`) and run in CI; a newcomer does it in under 10 minutes. *Must pass by: P2.*
6. **Governed before commit:** `verify` and `can-i-deploy` exit non-zero on an undeclared operation in the generated client, a raw call to the CoreEdge URL (TS and Python lint), a missing or expiring grant, a breaking contract change, a failing suite or a token literal; the runtime refuses any call outside the manifest. They run through OIDC with no stored secret. *Must pass by: P3.*
7. **Every language:** TS, Python, Java, .NET and ABAP (Cloud and classic, abaplint-clean) SDKs pass one shared conformance script; the Power Platform connector gives typed fields. *Must pass by: P2 for TS, Python, ABAP and Power Platform; P3 for Java and .NET.*
8. **Containment:** a switch at any scope stops 100% of matching calls within 5 seconds; every refusal carries a named reason and a decision id. *Must pass by: P3.*
9. **No side doors:** a static test proves every route reaching SAP uses the pipeline and writes an audit row, or is on a reviewed exemption list (P0.14b). *Must pass by: P0 for the Workbench write-back; P3 for all routes.* The test exists since P0.14b (`tests/unit/security/no-side-doors.test.ts`, in CI) and passes, the write-back included, with seven reviewed exemptions, none of them a Workbench console or broker route; P3 empties the list.
10. **Every permutation simulated:** the checked-in simulator recomputes all 1,119,744 permutations from code; a governance property test runs more than 10,000 combinations on every PR; Control Tower shows a parity scorecard with last-proved times. *Must pass by: P1.* The first two parts pass since P0.15; the scorecard is P1.9.
11. **Easy set-up:** `docker compose up` reaches a governed SANDBOX call in 15 minutes or less. A connector reaches on-premise or RISE with no inbound firewall port. SAP-side work is limited to what any caller needs: a technical user, the activated services and, for RISE, a network path from the connector's site agreed with SAP ECS [R1 §2, §3]. CoreEdge generates that checklist (P2.10). *Must pass by: P4.*
12. **No upgrade surprises:** a breaking change on TEST raises an incident naming the apps and owners before PROD is upgraded; `can-i-deploy` fails until it is acknowledged. *Must pass by: P3.*
13. **Trustworthy evidence:** tampering breaks the hash chain at that row; audit writes fail closed on the write path; export reaches a SIEM within 60 seconds. *Must pass by: P3 (SIEM: P6).*
14. **Reliable:** the northbound API meets a published objective of 99.9% monthly availability and no more than 150 ms of CoreEdge-added latency at p95 over the direct SAP call [both targets to be set by the product owner]. A twin-backed load test at 10 times the largest grant's quota runs before each phase exit. Every northbound route declares `maxDuration` above its upstream timeout plus token time: today no northbound route exports one and `vercel.json:30-35` sets one only for `presales/sign-pdf`, while a write may take 10 s for the token (`src/lib/sap-public/connection-resolver.ts:738`) plus up to 45 s for the POST (`src/lib/northbound/write.ts:79-80`); the platform default is [unverified]. A public status page shows incidents. *Must pass by: P3.*

### B. How to re-run the simulation

**Files.**
- `docs/coreedge/gap-matrix.json` is the matrix. It contains:
  - `dimensions`: the eight scenario dimensions, the 18 lifecycle stages and what each stage means (`lifecycleMeaning`);
  - `sapFeasibility`: the five validity tables `avail`, `authAvail`, `techPattern`, `originAvail` and `netApplicable` (section 2.2);
  - `integrationSuite`: the cell tables `targetTech`, `techPattern`, `network`, `origin`, `sapAuth`, `consumerAuth` and `lifecycle`, each cell with a status and a note, plus `sources`;
  - `roadmapPhases[]`: P0-P6, each with `cellUpgrades` entries (`table`, `row`, `col`, `status`, `items`, `reason`);
  - `extendedModel`: the caveat 8 values, with their feasibility rules and Integration Suite cells (section 3.11).
- `src/lib/coreedge/capability-registry.ts` scores CoreEdge's cells from the code (section 2.3). `pnpm coreedge:registry` writes them to `docs/coreedge/capability-registry.json`: `coreedgeToday` (the same seven tables, the network for the headline hosting mode), `networkByHosting`, `extended`, and the `facts` read from the code. Each cell has a status, a note and its `basis`.
- `scripts/coreedge/simulate-gap-matrix.mjs` is the simulator. Its header comment states the model.
- `scripts/coreedge/render-roadmap-figures.mjs` writes every table between `<!-- figures:begin ID -->` and `<!-- figures:end ID -->` in this document from the simulator's output.

**Commands** (from the repository root, after `pnpm install`):
- `node scripts/coreedge/simulate-gap-matrix.mjs` prints a summary: the permutation and valid counts; full %, partial % and lifecycle stages full for Integration Suite, CoreEdge today and CoreEdge after each phase; CoreEdge today by hosting mode; the extended model; today's top 15 blockers; any problems.
- `node scripts/coreedge/simulate-gap-matrix.mjs --json` prints the full results: `totalPermutations`, `lifecycleStages`, `headlineHosting`; `integrationSuite`, `coreedgeToday` and `phases[]`, each with `validScenarios`, `fullySupported`, `atLeastPartial`, `fullPct`, `partialPct`, `lifecycleFull`, `lifecycle` and `by.{target,tech,pattern,origin,network,consumer}`; `coreedgeToday` and each phase also have `topBlockers` (the top 30, each with `cell`, `level`, `leverage`, `leveragePct` and `soleBlocker`); `coreedgeTodayByHosting`; `extended`; and `problems`, which must be empty.
- `pnpm coreedge:registry` regenerates the registry JSON after a code change; `pnpm coreedge:figures` rewrites this document's figures; `pnpm coreedge:check` is what CI runs.

**The algorithm** (as implemented):

```
levels: none = 0, partial = 1, full = 2 (feasibility: no = 0, partial = 1, yes = 2)
for each target, tech, pattern, origin, network, sapAuth:
    if any of avail[target][tech], techPattern[tech][pattern], originAvail[target][origin],
       netApplicable[target][network], authAvail[target][sapAuth] is "no":
        continue                                   # SAP itself cannot do this
    for each consumer, consumerAuth:               # consumer side never affects validity
        valid += 1
        cells = [ targetTech[target][tech],
                  techPattern[tech][pattern],
                  network[network],
                  origin[origin],
                  sapAuth[target][sapAuth],        # per-target rating, else the all-targets rating
                  consumerAuth[consumer][consumerAuth] ]
        level = min(cells)                         # the min rule
        if level == 2: full += 1
        if level >= 1: atLeastPartial += 1
        tally the same per dimension value (by.target, by.tech, ...)
        if level < 2:                              # blocker leverage
            weak = cells below 2
            for c in weak: leverage[c] += 1 / len(weak)
            if len(weak) == 1: sole[weak[0]] += 1
fullPct = full / valid; partialPct = atLeastPartial / valid; leveragePct = leverage / valid
lifecycle stages are scored separately (0, 1, 2); lifecycleFull counts the 2s
```

The implementation counts every consumer of an SAP-side tuple at once, since the consumer side never affects validity; `tests/unit/coreedge/gap-simulator.test.ts` checks that it gives exactly the counts of the scenario-by-scenario loop above.

**To model a phase:** the script starts from the registry's CoreEdge today and applies each phase's `cellUpgrades` in order, cumulatively. An upgrade raises a cell to its status and never lowers it. A `sapAuth` upgrade with an empty `col` applies to every target. To add a roadmap item's effect, add or edit an upgrade in the phase where the item lands, with `items` and `reason`, then run `pnpm coreedge:figures` and explain the change in the text around the tables.

**To change what CoreEdge scores today:** change the code, then run `pnpm coreedge:registry` and `pnpm coreedge:figures`. A cell rises only when the code does, or when tests and a document are recorded for it in the registry's `EVIDENCE`; `docs/runbooks/coreedge-capability-registry.md` has the steps.

**To rank blockers:** read `topBlockers`. A cell's `soleBlocker` count is exactly the gain in fully supported scenarios from making that cell alone full. Leverage shows how widely a cell holds scenarios back when it is one of several gaps.

**To test a "what if":** `simulateAll({ matrix, registry })` is exported, so a short script can load both JSON files, edit a copy and print the result without touching the repository. The figures in this document were made this way:
- Section 3.0's bridge runs the first version's hand-rated cells, then each change on its own.
- Section 1.1's native-B2B trade-off adds a phase after P6 that makes `techPattern` X|B2B_EDI full for every tech. A second variant also makes `targetTech` IDOC and FILE_SFTP full on every target. `pnpm coreedge:figures` runs both and writes their figures into section 1.1.

**Checks after any change:**
- The total must be 1,119,744, and the valid count 497,340, unless the feasibility rule changed.
- Each consumer type must have exactly valid / 9 scenarios.
- `problems` must be empty.
- `pnpm coreedge:check` must pass. It also fails when the prose of sections 1 and 3 types a coverage figure (a percentage, a count such as 1,512, or "N of M") outside a generated block: quote it through a block (a `value-*` block inside a sentence, for example `value-full-P5` or `value-partial-Today-target-ECC`; `render-roadmap-figures.mjs` lists the family), or, when it is not simulator output or records a past result, wrap it in `<!-- figures:not-simulated begin/end -->` or `<!-- figures:historical begin/end -->`. The words around a figure are still a person's to keep true. Figures in other sections are still re-quoted by hand. Never mix the new output with older figures.

### C. Sources

**Internal research** (in the session scratchpad at `/tmp/claude-0/-home-user-aptus/c1cf7191-6502-561d-af92-682ad71ec6da/scratchpad/`, not in the repository):
- [R1] `assessment.md`: end-to-end assessment of CoreEdge versus SAP tenants and Integration Suite.
- [R2] `dossier-summary.txt`: readiness, self-hosting, connectivity, consumption, ABAP fit.
- [R3] `workbench-summary.txt`: Workbench explorer, catalogue counts, verification verdicts.
- [R4] `docs/coreedge-abap-lab-guide.md` (in the repository): fact-checked ABAP lab guide.
- [R5] `audit-confirmed.txt`: 76 confirmed audit findings A00-A75.
- "R-coreedge-today" means the code inventory carried out for this study on `main` at `33d0ef86` (findings cited inline by path).

**External sources:**
- [E1] SAP Integration Suite Feature Scope Description, 22 Sep 2026. https://help.sap.com/doc/e50e61e7b66c4b60ae5e88c00c01486a/CLOUD/en-US/FSD_IntegrationSuite.pdf
- [E2] Integration Suite monthly update, July 2026. https://assets.dm.ux.sap.com/sap-user-groups/pdfs/260728_sap_integration_suite_monthly_update.pdf
- [E3] Integration Suite strategy deck, February 2026 (some slides labelled internal; roadmap non-binding). https://assets.dm.ux.sap.com/sap-user-groups/260203_architect_the_future_sap_integration_suite_2026.pdf
- [E4] Integration flow simulation limits. https://help.sap.com/docs/SAP_INTEGRATION_SUITE/9519789d5664487f8b9cd89eba514477/45a71f8ffd74436aaf02a3536f3c6992.html
- [E5] Message processing log levels and trace. https://help.sap.com/docs/SAP_INTEGRATION_SUITE/9519789d5664487f8b9cd89eba514477/4e6d3fc3f34544f6ac5289268b653ad1.html
- [E6] Git integration for integration flows. https://help.sap.com/docs/SAP_INTEGRATION_SUITE/9519789d5664487f8b9cd89eba514477/162c3c7d61d7437b8cdad6c2b3e14c65.html
- [E7] SAP Continuous Integration and Delivery, Integration Suite artifacts pipeline. https://help.sap.com/docs/CONTINUOUS_DELIVERY/99c72101f7ee40d0b2deb4df72ba1ad3/3d5573fab2ea432cb2cab8639395e51e.html
- [E8] API Management policy types. https://help.sap.com/docs/SAP_INTEGRATION_SUITE/9519789d5664487f8b9cd89eba514477/c918e2803dfd4fc487e86d0875e8462c.html
- [E9] MCP Gateway. https://help.sap.com/docs/SAP_INTEGRATION_SUITE/9519789d5664487f8b9cd89eba514477/9eb9239c1b4c458198ca5234d191f8bd.html
- [E10] AI features and editions. https://help.sap.com/docs/SAP_INTEGRATION_SUITE/51ab953548be4459bfe8539ecaeee98d/6a6727ca4f9140b7891e1e8e01714c16.html
- [E11] Edge Integration Cell. https://help.sap.com/docs/SAP_INTEGRATION_SUITE/caeaa5e76f8c486ebea167938fa1f40b/aee74bb3ccd943a0837087d705e1ebc9.html
- [E12] SAP Cloud Connector. https://help.sap.com/docs/CP_CONNECTIVITY/cca91383641e40ffbe03bdc78f00f681/e6c7616abb5710148cfcf3e75d96d596.html
- [E13] Event Mesh capability limits. https://help.sap.com/docs/SAP_INTEGRATION_SUITE/a01a83f4826d486b9fc66d1df0de9da4/4a89370af1184bb4b712103eb09435b8.html
- [E14] External logging (Splunk, OTLP). https://help.sap.com/docs/SAP_INTEGRATION_SUITE/9519789d5664487f8b9cd89eba514477/ad719c1c2ecb48b6ba275d2b0ee2ba7a.html
- [E15] JMS queues and reliability. https://help.sap.com/docs/SAP_INTEGRATION_SUITE/9519789d5664487f8b9cd89eba514477/4857054e3f194ae6a7ed93a52002d556.html
- [E16] Developer Hub external approval. https://help.sap.com/docs/SAP_INTEGRATION_SUITE/9519789d5664487f8b9cd89eba514477/8b4f848e39d344bcb31c15441919985a.html
- [E17] SAP API Policy v.4.2026a. https://help.sap.com/doc/sap-api-policy/latest/en-US/API_Policy_latest.pdf
- [E18] SAP Pricing for the Digital Age (Digital Access), 2018. https://news.sap.com/wp-content/blogs.dir/1/files/Pricing_for_Digital_Age_Overview.pdf
- [E19] SAP Cloud ALM integration monitoring for S/4HANA Cloud. https://support.sap.com/en/alm/sap-cloud-alm/operations/expert-portal/integration-monitoring/calm-s4cloud.html
- [E20] ABAP Cloud: call an external API. https://developers.sap.com/tutorials/abap-environment-external-api.html
- [E21] abap-openapi. https://github.com/abap-openapi/abap-openapi
- [E22] Project Piper abapEnvironmentRunAUnitTest. https://www.project-piper.io/steps/abapEnvironmentRunAUnitTest/
- [E23] Power Platform custom connector OpenAPI requirements. https://learn.microsoft.com/en-us/connectors/custom-connectors/define-openapi-definition
- [E24] Postman elements. https://learning.postman.com/docs/getting-started/basics/postman-elements
- [E25] Bruno. https://github.com/usebruno/bruno
- [E26] Stripe API keys. https://docs.stripe.com/api/authentication
- [E27] Stripe idempotent requests. https://docs.stripe.com/api/idempotent_requests
- [E28] Pact can-i-deploy. https://docs.pact.io/can_i_deploy
- [E29] Schemathesis. https://pypi.org/project/schemathesis/
- [E30] Microcks (CNCF). https://www.cncf.io/blog/2026/05/07/microcks-becomes-a-cncf-incubating-project/
- [E31] Kong Dev Portal self-service. https://developer.konghq.com/dev-portal/self-service/
- [E32] Apigee Quota vs SpikeArrest. https://docs.cloud.google.com/apigee/docs/api-platform/develop/comparing-quota-and-spike-arrest-policies
- [E33] Azure APIM validate-content. https://learn.microsoft.com/azure/api-management/validate-content-policy
- [E34] Workato on-prem agent. https://docs.workato.com/on-prem.html
- [E35] Cloudflare Tunnel. https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/
- [E36] Standard Webhooks. https://www.standardwebhooks.com/
- [E37] Svix retries. https://docs.svix.com/retries
- [E38] Temporal error handling. https://docs.temporal.io/best-practices/error-handling
- [E39] W3C Trace Context. https://www.w3.org/TR/trace-context/
- [E40] MCP authorization specification, 2025-11-25. https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- [E41] OWASP MCP Top 10. https://owasp.org/www-project-mcp-top-10/
- [E42] MuleSoft API governance. https://docs.mulesoft.com/api-governance
- [E43] MuleSoft Agent Fabric. https://docs.mulesoft.com/general/agent-fabric-overview
- [E44] Azure APIM MCP server. https://learn.microsoft.com/en-us/azure/api-management/mcp-server-overview
- [E45] OASIS odata-openapi converter. https://cdn.jsdelivr.net/npm/odata-openapi@0.29.0/lib/README.md
- [E46] SAP PersonalData vocabulary. https://github.com/SAP/odata-vocabularies/blob/main/vocabularies/PersonalData.md
- [E47] Vercel Static IPs. https://vercel.com/docs/networking/static-ips
- [E48] Vercel Secure Compute. https://vercel.com/docs/networking/secure-compute
- [E49] Vercel WebSocket support. https://vercel.com/support/articles/do-vercel-serverless-functions-support-websocket-connections
- [E50] Next.js standalone output. https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- [E51] Node.js enterprise network configuration. https://nodejs.org/en/learn/http/enterprise-network-configuration
- [E52] RFC 8693 OAuth 2.0 Token Exchange. https://www.rfc-editor.org/rfc/rfc8693
- [E53] RFC 7523 JWT client authentication. https://www.rfc-editor.org/rfc/rfc7523
- [E54] RFC 9449 DPoP. https://www.rfc-editor.org/rfc/rfc9449
- [E55] GitHub Actions OIDC. https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect
- [E56] GitHub secret scanning partner program. https://docs.github.com/en/code-security/tutorials/secret-scanning-partner-program
- [E57] S/4HANA Cloud Public release upgrades. https://learning.sap.com/courses/implementing-sap-s-4hana-cloud-public-edition/navigating-release-upgrades_ef2ce865-cbc2-4132-8f9a-4a0ad567e6fc (the earlier URL returns HTTP 404)
- [E58] SAP API deprecation policy. https://help.sap.com/docs/r/162e64b61a054534978db8d3aa1a41da/Cloud/en-US/5cbfda5a9efe4e97a3e24ddaf7ec5c16.html (summarised via search; page body not fetched [unverified])
- [E59] Power Platform OpenAPI extensions. https://learn.microsoft.com/en-us/connectors/custom-connectors/openapi-extensions
- [E60] openapi-generator README (OpenAPI 3.1 "beta support"). https://raw.githubusercontent.com/OpenAPITools/openapi-generator/master/README.md
- [E61] Business Accelerator Hub Try Out. https://developers.sap.com/tutorials/hcp-abh-test-locally.html
- [E62] Ory Polis. https://github.com/ory/polis
- [E63] SAP CAP consuming services. https://cap.cloud.sap/docs/guides/services/consuming-services
- [E64] Stripe Workbench. https://docs.stripe.com/workbench/overview
- [E65] JMS sender adapter (dead-letter handling after two out-of-memory retries). https://help.sap.com/docs/SAP_INTEGRATION_SUITE/9519789d5664487f8b9cd89eba514477/161791b8cb98485ba00d81efa4197a49.html
- [E66] API Management Developer Hub. https://help.sap.com/docs/SAP_INTEGRATION_SUITE/9519789d5664487f8b9cd89eba514477/41f7c452d04443c9b7ab18765a3aa48a.html
- [E67] Integration Suite monthly update, April 2026 ("Multi-AZ Architecture SLA for SAP Integration Suite - 99.95%"; non-binding). https://assets.dm.ux.sap.com/sap-user-groups/pdfs/260428_sap_integration_suite_monthly_update.pdf
- [E68] Integration Suite monthly update, March 2026 (AI Unit charges "anticipated to take effect in late Q2 2026"; metering "by the end of Q3 2026 at the latest"). https://assets.dm.ux.sap.com/sap-user-groups/pdfs/260331_sap_integration_suite_monthly_update.pdf
- [E69] SAP blog, "Key options for testing APIs – SAP S/4HANA Cloud" (Try Out with "Configure Environment" against your own tenant) [not re-read for this revision]. https://blogs.sap.com/2020/05/02/key-options-for-testing-apis-sap-s-4hana-cloud/
- [E70] SAP Process Orchestration to Integration Suite: Migration Assessment [not re-read for this revision]. https://developers.sap.com/tutorials/migration-assessment and https://learning.sap.com/courses/sap-process-orchestration-to-sap-integration-suite-migration/using-migration-assessment-tools
- [E71] SAP blog, "SAP Process Orchestration: what options do I have when upgrading" (2020; PO 7.5 mainstream maintenance to 2027, extended to 2030) [check SAP's current maintenance calendar]. https://blogs.sap.com/t5/technology-blogs-by-sap/sap-process-orchestration-what-options-do-i-have-when-upgrading-or/ba-p/13405194
- [E72] Vercel Functions limitations (duration, 4.5 MB request and response bodies). https://vercel.com/docs/functions/limitations
- [E73] Vercel runtime logs retention. https://vercel.com/docs/logs/runtime
- [E74] Vercel cron jobs: managing (duplicate and overlapping invocations). https://vercel.com/docs/cron-jobs/manage-cron-jobs
- [E75] Vercel cron jobs: usage and pricing (Hobby once a day). https://vercel.com/docs/cron-jobs/usage-and-pricing
- [E76] SAP/gorfc and SAP/node-rfc repositories (reported archived 28 May 2026, "no longer maintained") [not re-checked for this revision]. https://github.com/SAP/gorfc, https://github.com/SAP/node-rfc

**Not verified:**
- Integration Suite list prices: sap.com pricing pages returned HTTP 403, so only conflicting search snippets were seen. They are not used in this document.
- G2, TrustRadius and Gartner review claims: snippets only.
- SAP Note 2903776 (features per edition): needs an SAP login.

### D. Audit findings: status and roadmap item

**Fixed** in batches 1 and 2 (commits `c31a385c` and `33d0ef86`): A00-A13, A20-A28, A31-A37, A39-A41, A48, A49, A53-A55, A64-A68.

**Fixed in P0.1** (Phase 0b): A46, A47, A52, A69, with the batch-1 residual races (owner lock on every key change and claim link; key write and link close in one transaction). Operator steps: `docs/runbooks/coreedge-grant-binding.md`.

**Fixed in P0.5** (Phase 0b): A43 and A44. Operator steps: `docs/runbooks/coreedge-rate-limits.md`.

**Fixed in P0.6** (Phase 0b): A71, A72, A73, A74 and A75. Operator steps: `docs/runbooks/sap-ariba-explorer.md`.

**Fixed in P0.2** (Phase 0b wave 2): A14, A15, A16, A17, A18, A19, A50, A60 and A70. Operator notes: `docs/runbooks/coreedge-lane-truth.md`.

**Fixed in P0.3** (Phase 0b wave 2): A29, A30, A45, A51, A58, A59, A61, A62 and A63. Operator notes: `docs/runbooks/coreedge-truthful-screens.md`.

**Open after batches 1 and 2 (33)**, each assigned to a roadmap item; P0.1, P0.2, P0.3, P0.4, P0.5 and P0.6 have since fixed all thirty-three:

| Findings | Subject | Item |
|---|---|---|
| A46, A47, A52, A69 | Activation gates, grant binding, twin activate 500, departed owners | P0.1 (fixed) |
| A14, A15, A16, A17, A18, A19, A50, A60, A70 | Lane evidence and broker disagreement | P0.2 (fixed) |
| A29, A30, A45, A51, A58, A59, A61, A62, A63 | Untruthful registers and screens | P0.3 (fixed) |
| A38, A42, A56, A57 | Stale contracts and fixtures, discovery `callable`, dry-run reason | P0.4 (fixed) |
| A43, A44 | Rate-limit attribution | P0.5 (fixed) |
| A71, A72, A73, A74, A75 | Ariba configuration and errors | P0.6 (fixed) |

**Not in the original 76, found during this study:**
- No MFA check on the `/coreedge` layout or the CoreEdge API routes (inferred from code, not run). **Fixed in P0.12:** every governance route calls `requireStepUp`; `COREEDGE_STEP_UP` defaults to `warn`.
- The tenant-scope guard defaults to log in production unless `TENANT_SCOPE_GUARD` is set (`src/lib/db/tenant-guard.ts:93-98`); the production value is [unverified]. **Still the default.** P0.12 records each violation in `TenantGuardViolation`; switching to throw after seven clean days is an operator step.
- Audit writes are swallowed on every path, including after a successful SAP create (`src/lib/northbound/audit.ts:136-144`; `src/app/api/northbound/interfaces/[id]/data/write/route.ts:342-394`). **Still open** (P3.10).
- The Workbench `hub-content/write-test` route creates and deletes SAP records with only a best-effort `logDecision` (`src/app/api/sap/tdd/hub-content/write-test/route.ts:124-137`). **Fixed in P0.7:** both write-back routes write a `PlatformAuditEvent` before SAP is called.

The first two are covered by P0.12, the third by P3.10, and the fourth by P0.7.
