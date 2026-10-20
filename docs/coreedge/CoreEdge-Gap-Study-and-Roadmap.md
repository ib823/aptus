# CoreEdge Gap Study and Roadmap

| | |
|---|---|
| Date | 20 October 2026 |
| Code baseline | `main` at `33d0ef86`, which includes audit batch 2 (#306) and is deployed to production at https://ab-workbench.vercel.app |
| In-flight work | Branch `custom-service-path` (commits `a4dd83d9`, `9ed76ba4`). Customer-built `Z*`/`YY1_*` services are built there but **not merged or deployed**. |
| Companion data | `docs/coreedge/gap-matrix.json`, the permutation matrix and coverage results this document reports. See Appendix B. |
| Readers | The product owner (not from an SAP background) and the engineers who will build CoreEdge |
| Status | Research and plan. No code was changed to produce it. |

**How to read the evidence**
- `path:line` means code on `main` at `33d0ef86`.
- `[E#]` refers to an external source listed in Appendix C.
- `[R#]` refers to the earlier internal research files listed in Appendix C.
- **[unverified]** means the claim was not checked against a primary source or not run against a live system.
- **[estimate]** means engineering judgement, not measurement.
- **[inferred]** means derived from other numbers, not read directly.

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

We built every combination of eight dimensions: SAP system, technology, integration pattern, who built the API, network, SAP login method, consumer type and consumer login method. That gives 1,119,744 permutations. Of these, 497,340 are things SAP itself makes possible; these are the **valid scenarios**. We then scored each valid scenario for SAP Integration Suite and for CoreEdge (section 2 explains the method).

| Measure | SAP Integration Suite | CoreEdge today | CoreEdge after the whole roadmap (Phase 6) |
|---|---|---|---|
| Valid scenarios fully supported | 126,000 (25.3%) | 0 (0%) | about 16,400 (3.3%) [inferred from 3.3%] |
| Valid scenarios at least partly supported | 466,725 (93.8%) | 936 (0.2%) | about 73,600 (14.8%) [inferred] |
| AI-agent consumers, fully supported | 0% | 0% | 2.8% |
| Lifecycle stages rated "full", out of 13 | 4 | 1 | 13 |

**What the numbers mean**
- **Today CoreEdge handles one narrow shape of integration, and handles it well.** An approved program can read the first 100 rows or fewer of one SAP-published OData API on an SAP cloud system reachable over the internet, or create one record in it. Every other shape of integration is out of reach (section 3).
- **On governance it is already ahead of Integration Suite:**
  - a second person must approve every access grant;
  - every grant has a mandatory end date, checked on every call;
  - a key issued for one environment can never reach another;
  - creates are idempotent (a retried create cannot make a duplicate);
  - every call, including refusals, is audited.
- **On breadth, this roadmap does not reach Integration Suite, and it should not try.** Under the strict scoring rule (a scenario counts as "full" only if every part of it is full), the whole roadmap lifts CoreEdge to 3.3% full and 14.8% partial. Integration Suite has about 75 named adapters and ten years of B2B/EDI work. The earlier hand estimate of 30-45% full after Phase 5 is **not** supported by the simulation and should not be repeated.
- **On the developer and governance lifecycle, CoreEdge can lead.** After Phase 3, CoreEdge is rated full on 10 of 13 lifecycle stages, against Integration Suite's 4. That is where "the improved and innovative version of Integration Suite" is realistic: testing before code, contracts and SDKs in every language including ABAP, governance of the connected program before and after it ships, AI agents under the same controls, and continuous proof. For B2B/EDI and the long tail of adapters, CoreEdge should call Integration Suite as a governed backend (P5.10).

### 1.2 North star

Any developer can make a first working call within 30 minutes. That means ABAP (cloud or on-premise), JS/TS, Python, Java, .NET, low-code or an AI agent. The first call goes to a **Tenant Twin**, a simulated copy of the developer's own SAP system built from SAP's service description. The developer:
1. tests it like Postman before writing code;
2. ships through a CI gate that proves the code calls only what was approved;
3. from then on, sends every real call through one governed pipeline.

That pipeline gives every call a known owner and approver, declared limits, a one-click stop and an audit record, on any network and any protocol.

**Integration Suite moves messages. CoreEdge decides who may call what, contains it and proves it.**

### 1.3 "Seamless", measured

The product owner asked for CoreEdge to be seamless. This document makes that a set of tests that pass or fail (full list in Appendix A.3):

| Test | Target |
|---|---|
| Time to first call, against the twin, self-service | 30 minutes or less (60 for ABAP on-premise) |
| Time to first real call, against a DEV system, after the grant request | 1 business day or less |
| A customer-built `Z*`/`YY1_*` OData service | Registered, verified, tested, called and audited with no code change |
| "Postman before code" | A newcomer builds, asserts and saves a 3-step collection in under 10 minutes |
| Governed before commit | `coreedge verify` and `can-i-deploy` fail CI on an undeclared call, a missing grant or a token in code, with no secret stored in CI |
| Every language | TS, Python, Java, .NET and ABAP SDKs pass one shared conformance script |
| Containment | A stop switch halts 100% of matching calls within 5 seconds |
| No side doors | A static test proves every route that reaches SAP is governed and audited |
| Self-host | `docker compose up` reaches a first governed call in 15 minutes or less |
| SAP upgrades | A breaking change on the TEST system is flagged, naming the affected apps, before PROD is upgraded |

### 1.4 Phases at a glance

Durations are **[estimate]** and assume 3-4 engineers. Coverage numbers come from the simulation.

| Phase | Goal | Duration | Full / partial after | Lifecycle stages full | Headline outcome |
|---|---|---|---|---|---|
| Today | | | 0.0% / 0.2% | 1 | |
| P0 Harden | Make what exists trustworthy: close the 33 open audit findings, add KMS, MFA step-up and onboarding, extract the pipeline, check in the simulator | 5-6 weeks | 0.0% / 0.2% | 2 | Safe to hold real client credentials |
| P1 Any OData API | Customer-built APIs, contracts compiled from SAP's service description, filter/key/paging, Tenant Twin | 8-10 weeks | 0.0% / 0.8% | 3 | `Z*` APIs callable; build before SAP is configured |
| P2 Every developer | API Lab ("Postman for SAP"), full OData writes, SDKs (TS, Python, Java, .NET, ABAP), low-code connector, Studio MCP | 10-12 weeks | 0.0% / 2.8% | 6 | 30-minute first call |
| P3 Govern as code | App manifest, CLI, CI identity, promotion gates, policy engine, stop switches, monitors, upgrade radar, outbound routes, tamper-evident audit | 10-12 weeks | 0.0% / 3.2% | 10 | The connected program is governed before and after it ships |
| P4 Any landscape | Transport layer, outbound-only connector for RISE/on-premise/ECC, X.509, self-host package, staff SSO | 12-14 weeks | 0.3% / 3.9% | 11 | Private SAP systems reachable |
| P5 Every protocol | Adapter SDK, SOAP, REST, RFC/BAPI, IDoc, files, events/webhooks, durable runtime, mapping, flows, bulk, Integration Suite as backend | 16-20 weeks | 2.0% / 11.6% | 12 | Beyond OData |
| P6 AI-native and provable | Runtime MCP for agents, copilot, anomaly detection, evidence vault, acting-for and consent, Digital Access estimator | 10-12 weeks | 3.3% / 14.8% | 13 | Agents governed; continuous evidence |

### 1.5 What to do first

1. **Merge and deploy `custom-service-path` per protocol** (P1.1): PR, green CI, deploy, then verify live on the X5M lab with one `YY1_*` and one `Z*` service. It removes the single largest blocker (66.5% of valid scenarios are held at zero because the API was built by the customer or a partner). It scopes grants per path (`custom:<path>`), so it does not widen access while P0.1 is pending.
2. **Before any real client credential is stored:**
   - KMS envelope encryption (P0.10);
   - MFA step-up on approve, issue and revoke (P0.12);
   - an audit row for the Workbench write-back (P0.7).

   Until then, the shared production host must not hold real SAP credentials. It also holds third-party client data [R1 §1].
3. **Close the governance holes:** grants not bound to an interface (A47), activation gates that can be bypassed (A46), departed owners still counting as owners (A69), and lanes that disagree with the broker (P0.1, P0.2).
4. **Extract the governed pipeline and check the simulator into the repo** (P0.14, P0.15). Every later number in this document then becomes reproducible from code.
5. **Product owner decisions** (section 9.3):
   - the licence for distributed SDKs, CLI and connector;
   - a legal reading of SAP API Policy §1.2 and §2.2.2;
   - "pair with Integration Suite" as the breadth strategy;
   - the first customer landscape, which sets Phase 4's priority.

---

## 2. How the gap was measured

### 2.1 The eight dimensions

A **scenario** is one value from each of the eight dimensions below (definitions in Appendix A.1).

| # | Dimension | Values | Count |
|---|---|---|---|
| 1 | Target SAP system (`target`) | S4_PUBLIC, S4_PRIVATE_RISE, S4_ONPREM, ECC, SUCCESSFACTORS, ARIBA, CONCUR, BTP_SERVICE, NON_SAP_SAAS | 9 |
| 2 | Technology (`tech`) | ODATA_V2, ODATA_V4, SOAP, REST, RFC_BAPI, IDOC, EVENTS, FILE_SFTP | 8 |
| 3 | Integration pattern (`pattern`) | SYNC_READ, SYNC_CREATE, SYNC_UPDATE_DELETE_ACTION, SAP_CALLS_OUT, A2A_FLOW_WITH_MAPPING, BULK_BATCH, EVENT_TO_APP, B2B_EDI | 8 |
| 4 | Who built the API (`origin`) | SAP_STANDARD, CUSTOMER_CUSTOM, PARTNER | 3 |
| 5 | Network position (`network`) | PUBLIC_INTERNET, SAP_SIDE_IP_ALLOWLIST, PRIVATE_NETWORK | 3 |
| 6 | Login method to SAP (`sapAuth`) | BASIC, OAUTH_CLIENT_CREDENTIALS, OAUTH_SAML_BEARER, X509_MTLS, PRINCIPAL_PROPAGATION, plus a sixth (API_KEY [inferred]) | 6 [inferred from arithmetic] |
| 7 | Consumer type (`consumer`) | JS_TS, PYTHON, JAVA, DOTNET, ABAP_ONPREM, ABAP_CLOUD, LOW_CODE, AI_AGENT, HUMAN_TESTER | 9 |
| 8 | Consumer login method to CoreEdge (`consumerAuth`) | STATIC_BEARER, OAUTH_CLIENT_CREDENTIALS, MTLS, USER_DELEGATED_OIDC | 4 |

9 × 8 × 8 × 3 × 3 × 6 × 9 × 4 = **1,119,744 permutations**. The count of 6 for `sapAuth` follows from that total; the name of the sixth value is inferred. `gap-matrix.json` is authoritative.

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

By origin: SAP_STANDARD 166,500; CUSTOMER_CUSTOM 164,340; PARTNER 166,500. By network: PUBLIC_INTERNET 184,032; SAP_SIDE_IP_ALLOWLIST 184,032; PRIVATE_NETWORK 129,276. The exact rule is stored in `gap-matrix.json`.

### 2.3 Cells and the min rule

Each platform is described by **cells**. A cell is the support level for a pair of values, rated none, partial or full. There are six tables of cells:
- target × tech
- tech × pattern
- target × sapAuth
- consumer × consumerAuth
- origin
- network

**Min rule.** A scenario is **fully supported** only if every cell it touches is full. It is **at least partly supported** only if every cell it touches is at least partial. One "none" anywhere makes the scenario unsupported.

The 13 **lifecycle stages** (Discover through Onboarding, section 3.8) are scored separately on 0 (none), 1 (partial) and 2 (full). They do not take part in the per-scenario min rule [inferred: Integration Suite scores 25.3% full while rating several stages 1].

### 2.4 Totals

| | Integration Suite | CoreEdge today |
|---|---|---|
| Total permutations | 1,119,744 | 1,119,744 |
| Valid scenarios | 497,340 | 497,340 |
| Fully supported | 126,000 (25.3%) | 0 (0.0%) |
| At least partly supported | 466,725 (93.8%) | 936 (0.2%) |

### 2.5 Caveats

1. **Cells were judged from code and documentation, not from live runs.** For CoreEdge, "full" means built, switched on in production code and not contradicted by any known limit. For Integration Suite, the judgement relies on SAP's Feature Scope Description and 2026 decks [E1, E2, E3]. Some Integration Suite features depend on the edition (Standard, Premium, Enhanced), and the SAP note listing features per edition (2903776) was not read [unverified].
2. **"Partial" covers a wide range.** It means the capability exists but has a material limit: CoreEdge reads only the first 100 rows or fewer; a path is proven by unit tests only; or a workaround is needed (for example an ABAP Bearer header set in code). The simulation does not separate "almost full" from "barely works".
3. **Every scenario counts equally.** Real demand is concentrated in S/4HANA plus OData plus synchronous patterns, so the headline percentages understate how much of *actual* demand CoreEdge can serve. A demand-weighted view is open decision D6.
4. **One known over-credit.** Today's matrix gives CoreEdge 0.4% partial on S4_ONPREM and S4_PRIVATE_RISE, but the hosted instance cannot reach private networks: IP literals and `.local`/`.internal` hosts are refused (`src/lib/studio/connection-url-guard.ts:15-33`), and SAP calls use plain `fetch` with no tunnel (`src/lib/sap-public/tdd-connector.ts:614-627`). This only holds for a self-hosted copy inside the customer network. P0.15 recomputes it.
5. **Phase figures are projections**, and they assume every item ships as specified. Items without live evidence will carry an "untested" badge and be scored partial (P1.8).
6. **`topBlockers` came back empty** from the simulation run. The blockers in section 3.9 are derived by hand from the per-dimension tables. P0.15 makes the ranking automatic.
7. **The simulator script is not yet in the repository.** P0.15 adds it as `scripts/simulate-matrix.ts`. Until then, `gap-matrix.json` is the record.

---

## 3. Results today

### 3.1 Overall

| | Integration Suite full | Integration Suite partial | CoreEdge full | CoreEdge partial |
|---|---|---|---|---|
| All valid scenarios (497,340) | 25.3% | 93.8% | 0.0% | 0.2% |

The 936 scenarios CoreEdge partly supports today are all SAP_STANDARD, OData V2 or V4, SYNC_READ or SYNC_CREATE, on S/4HANA or SuccessFactors targets, with STATIC_BEARER consumer login [inferred from the dimension tables].

### 3.2 By target

| Target | Valid | IS full | IS partial | CoreEdge full | CoreEdge partial |
|---|---|---|---|---|---|
| S4_PUBLIC | 50,760 | 22.7% | 82.7% | 0 | 0.4% |
| S4_PRIVATE_RISE | 76,140 | 34.0% | 97.2% | 0 | 0.4% (see caveat 4) |
| S4_ONPREM | 76,140 | 34.0% | 97.2% | 0 | 0.4% (see caveat 4) |
| ECC | 76,140 | 21.7% | 97.2% | 0 | 0 |
| SUCCESSFACTORS | 30,240 | 21.6% | 97.2% | 0 | 0.2% |
| ARIBA | 24,192 | 17.5% | 97.2% | 0 | 0 |
| CONCUR | 4,320 | 17.8% | 97.2% | 0 | 0 |
| BTP_SERVICE | 91,368 | 18.0% | 86.9% | 0 | 0 |
| NON_SAP_SAAS | 68,040 | 26.7% | 97.2% | 0 | 0 |

### 3.3 By technology

| Technology | Valid | IS full | IS partial | CoreEdge full | CoreEdge partial |
|---|---|---|---|---|---|
| ODATA_V2 | 64,152 | 36.4% | 97.2% | 0 | 0.8% |
| ODATA_V4 | 64,152 | 22.7% | 97.2% | 0 | 0.7% |
| SOAP | 92,448 | 23.1% | 97.2% | 0 | 0 |
| REST | 94,752 | 28.8% | 97.2% | 0 | 0 |
| RFC_BAPI | 55,188 | 15.7% | 83.9% | 0 | 0 |
| IDOC | 43,740 | 24.7% | 75.6% | 0 | 0 |
| EVENTS | 35,532 | 30.8% | 97.2% | 0 | 0 |
| FILE_SFTP | 47,376 | 19.1% | 97.2% | 0 | 0 |

### 3.4 By pattern

| Pattern | Valid | IS full | IS partial | CoreEdge full | CoreEdge partial |
|---|---|---|---|---|---|
| SYNC_READ | 52,668 | 35.1% | 95.2% | 0 | 0.9% |
| SYNC_CREATE | 52,668 | 35.1% | 95.2% | 0 | 0.9% |
| SYNC_UPDATE_DELETE_ACTION | 52,668 | 35.1% | 95.2% | 0 | 0 |
| SAP_CALLS_OUT | 85,104 | 21.8% | 93.8% | 0 | 0 |
| A2A_FLOW_WITH_MAPPING | 85,104 | 32.1% | 93.8% | 0 | 0 |
| BULK_BATCH | 73,260 | 12.4% | 93.2% | 0 | 0 |
| EVENT_TO_APP | 51,876 | 20.0% | 91.6% | 0 | 0 |
| B2B_EDI | 43,992 | 11.8% | 92.9% | 0 | 0 |

### 3.5 By origin of the API

| Origin | Valid | IS full | IS partial | CoreEdge full | CoreEdge partial |
|---|---|---|---|---|---|
| SAP_STANDARD | 166,500 | 25.3% | 93.9% | 0 | 0.6% |
| CUSTOMER_CUSTOM | 164,340 | 25.4% | 93.8% | 0 | 0 |
| PARTNER | 166,500 | 25.3% | 93.9% | 0 | 0 |

### 3.6 By network position

| Network | Valid | IS full | IS partial | CoreEdge full | CoreEdge partial |
|---|---|---|---|---|---|
| PUBLIC_INTERNET | 184,032 | 24.9% | 93.5% | 0 | 0.2% |
| SAP_SIDE_IP_ALLOWLIST | 184,032 | 24.9% | 93.5% | 0 | 0.2% |
| PRIVATE_NETWORK | 129,276 | 26.5% | 94.8% | 0 | 0.2% (over-credited, caveat 4) |

### 3.7 By consumer type

| Consumer | Valid | IS full | IS partial | CoreEdge full | CoreEdge partial |
|---|---|---|---|---|---|
| JS_TS | 55,260 | 28.5% | 96.5% | 0 | 0.2% |
| PYTHON | 55,260 | 28.5% | 96.5% | 0 | 0.2% |
| JAVA | 55,260 | 42.8% | 96.5% | 0 | 0.2% |
| DOTNET | 55,260 | 28.5% | 96.5% | 0 | 0.2% |
| ABAP_ONPREM | 55,260 | 28.5% | 96.5% | 0 | 0.2% |
| ABAP_CLOUD | 55,260 | 28.5% | 96.5% | 0 | 0.2% |
| LOW_CODE | 55,260 | 28.5% | 96.5% | 0 | 0.2% |
| AI_AGENT | 55,260 | **0.0%** | 96.5% | 0 | 0.2% |
| HUMAN_TESTER | 55,260 | 14.3% | 72.4% | 0 | 0.2% |

Integration Suite scores 0% full for AI agents. Its MCP Gateway needs the new Integration Cell runtime and a Premium or Enhanced edition, and principal propagation for agents is still on SAP's roadmap [E9, E2]. This is the one consumer type where CoreEdge can lead on the simulation's own terms (Phase 6: 2.8% full).

### 3.8 Lifecycle stages

Scores: 0 = none, 1 = partial, 2 = full.

| Stage | What it means | IS | CoreEdge today | CoreEdge reaches full in |
|---|---|---|---|---|
| DISCOVER | Find which APIs exist and which work on *this* system | 2 | 1 | P1 |
| DESIGN_MAP | Define the contract, the fields and the mapping | 2 | 1 | P5 |
| MOCK_TEST_BEFORE_CODE | Try and test an API before writing a program | 1 | 1 | P2 |
| DEVELOP_SDK_CODEGEN | Typed client in the developer's language | 1 | 1 | P2 |
| CI_PRECOMMIT_GOVERNANCE | Checks in the developer's commit and CI pipeline | 1 | **0** | P3 |
| DEPLOY_PROMOTE_ENVIRONMENTS | Move DEV to TEST to PROD with evidence | 1 | 1 | P3 |
| RUN_MONITOR_ALERT | Watch, trace and alert the right people | 2 | 1 | P3 |
| GOVERN_AUDIT_COMPLY | Approvals, separation of duties, audit | 1 | **2** | today |
| SECRETS_KEYS | Custody and rotation of credentials | 2 | 1 | P0 |
| SAP_UPGRADE_IMPACT | Know what an SAP release breaks before it breaks | 1 | 1 | P3 |
| SELF_HOST_SETUP | Install and run it yourself | 1 | 1 | P4 |
| AI_ASSIST | AI help that is checked against real runs | 1 | **0** | P6 |
| ONBOARDING_TIME_TO_FIRST_CALL | From sign-up to first call | 1 | 1 | P2 |

**Why CoreEdge scores what it does today:**
- **GOVERN = 2:** two-person rule and mandatory grant expiry (`src/lib/studio/grants.ts:166-286`); environment binding (`src/app/api/northbound/interfaces/[id]/data/route.ts:120-159`); a per-call audit row including refusals (`src/lib/northbound/audit.ts:1-145`).
- **CI = 0:** Studio APIs accept browser cookies only, and the CLI copy is held back (`src/lib/coreedge/copy.ts:788-808`).
- **AI = 0:** no AI is used anywhere in CoreEdge. The BYOAI orchestrator (`src/lib/intelligence/ai-orchestrator.ts`) serves only the portal's settings screens.

### 3.9 The blocking gaps, in plain words

These blockers overlap, so their shares do not add up. Each row counts the valid scenarios that this gap alone holds at zero.

| # | Blocker | Valid scenarios held at zero | Plain explanation | Fixed in |
|---|---|---|---|---|
| 1 | Only synchronous read and create | 392,004 (78.8%) | CoreEdge can read a page of rows or create a record. It cannot update, delete, run an action, send a batch, receive an event, run a multi-step flow, let SAP call out, or exchange EDI documents. | P2 (update/delete/batch), P3.9 (SAP calls out), P5 (flows, events, bulk) |
| 2 | Only OData | 369,036 (74.2%) | OData is SAP's main web API, but S/4HANA also publishes 212 SOAP APIs [R1 §5]. Older systems run on RFC/BAPI (remote function calls into SAP) and IDoc (SAP's business-document messages). CoreEdge speaks none of these. | P5.2-P5.5 |
| 3 | Customer- and partner-built APIs refused | 330,840 (66.5%) | CoreEdge finds services through SAP's published catalogue (`src/lib/sap-public/resolve-hub-service.ts:15-40`). APIs a customer builds (names starting `Z` or `YY1_`) are not in it, so every call to them is refused. | P1.1 (built on a branch), P1.2 |
| 4 | Consumer can only log in with a static key | about 373,000 (75%) [inferred: assumes consumer login does not affect validity] | A program proves who it is only with a long-lived `ce_` string (`src/lib/northbound/auth.ts:25`). There is no OAuth, no mTLS and no user-delegated login. ABAP credential stores cannot hold such a header natively. | P2.5, P4 (mTLS), P6.5 |
| 5 | Systems CoreEdge has no connector for | 264,060 (53.1%) | ECC resolves no services by design. Ariba is environment-variable only. Concur, BTP services and non-SAP SaaS have no connector. | P1.1 and P4.7 (ECC), P5.3 (Ariba, Concur, BTP), P5.10 (SaaS) |
| 6 | No private-network reach | 129,276 (26.0%) for the hosted instance | RISE, on-premise and ECC usually sit on private networks. CoreEdge has no agent, no tunnel and no fixed outbound IP. | P4.1-P4.4 |
| 7 | No X.509 or principal propagation to SAP | about 2 of 6 SAP login methods [inferred] | SAP recommends certificates or OAuth over passwords [R1 §3]. CoreEdge has neither certificates nor per-person identity toward SAP (`src/lib/sap-public/connection-resolver.ts:39-62`). | P4.3 |
| 8 | Nothing is "full" | All 936 supported scenarios | Even the supported shape is limited. Reads send only `$top` and `$format` and return 100 rows or fewer (`src/lib/northbound/read.ts:56`). There is no filter, key lookup or paging, and V4 create is unit-tested only. | P1.4, P1.8 |
| 9 | No CI or AI at all (lifecycle) | not a scenario count | Nothing checks a developer's code before commit, and no AI help exists. | P2.11, P3.2, P3.3, P6.2 |

---

## 4. Capability gap analysis

Each table compares Integration Suite (IS), the best-of-breed tools, CoreEdge today, and the target with the roadmap item that delivers it. External sources are listed in Appendix C.

### 4.1 Connectivity

| Capability | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| SAP cloud systems on the internet | Yes, through receiver adapters [E1] | Yes | Yes, for S/4HANA Cloud Public and SuccessFactors. `sapsf.*` API hosts are missing from the allow-list (`src/lib/studio/sap-host-allowlist.ts:41-53`) | P0.9 adds `sapsf.*` |
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
| RFC / BAPI | RFC receiver via Cloud Connector; RFC sender on Edge Integration Cell only [E1] | None | P5.4 through the connector, with a customer-supplied SAP RFC SDK [unverified licence terms] |
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
| Create | Yes | Stripe-style idempotency [E27] | Yes: write key plus mandatory Idempotency-Key, 24-hour replay (`src/lib/northbound/idempotency.ts:33`). V4 create unit-tested only | P1.8 live verification |
| Update and delete with ETag | Yes | Standard | Refused; UPDATE can never be activated (`src/app/api/studio/interfaces/route.ts:259-261`) | P2.4 |
| Actions, function imports, deep insert, `$batch` | Yes | n/a | None | P2.4 |
| Customer-built `Z*`/`YY1_*` services | Any endpoint | n/a | Refused (`resolve-hub-service.ts:15-40`); built on branch `custom-service-path` | P1.1 |
| Bulk extraction and batch create | Splitter, Aggregator, JMS | n/a | None | P5.9, with budgets under SAP API Policy §2.1 [E17] |

### 4.4 Mapping and flows

| Capability | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| Mapping | Graphical message mapping, XSLT 3.0, Groovy/JS scripts, value maps [E1] | DataWeave Playground (MuleSoft) | None. The Mapping card is greyed out and `mappingVersion` is always null (`src/components/studio/InterfacesClient.tsx:273-279`) | P5.8: versioned JSONata in a sandbox, unit-tested against fixtures |
| Multi-step orchestration | Router, Multicast, 7 splitter types, Join, Aggregator, process calls [E1] | Temporal durable workflows [E38] | One call to one entity set | P5.8: code-first flows with saga compensation |
| Queues, retries, dead-letter queue | JMS with a DLQ after two retries; retry tab on HTTP/OData receivers [E15, E65] | Temporal, Svix | No queue. Circuit breaker built but not imported anywhere (`src/lib/northbound/circuit-breaker.ts`) | P0.14 wires the breaker; P5.6 durable runtime |
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
| Discover what works on *this* system | Business Accelerator Hub lists SAP's menu, not what is active on the tenant | Backstage catalogue | Catalogue with live probes; ACTIVATED only on a real 200. 148 wrapper rows have malformed addresses; V4 addresses are guessed [R3] | P0.8 fixes; P1.2 tenant discovery plus the SAP admin checklist |
| Try before code | Hub "Try Out" (SAP sandbox only) [E61]; iFlow simulation: 10 steps, under 100 KB input, no real calls, no Aggregator [E4] | Postman collections and mock servers [E24] | Test Console: read-only, 50 rows or fewer, needs a key and an approved grant first (`src/app/api/studio/test/broker-run/route.ts:62`) | P1.6 Tenant Twin; P2.1-P2.2 API Lab |
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
| Grant scope | Product and app | MuleSoft contracts | Not bound to an interface or SAP product (A47, open) | P0.1 |
| Program identity | API key, OAuth, client certificate service keys | Stripe test/live and restricted keys [E26]; OIDC workload identity [E55] | Static `ce_` key, hashed, shown once; optional expiry (`src/lib/northbound/issue.ts:229`); rotation has no overlap | P0.11; P2.5 OAuth; P3.3 workload identity; P4 mTLS |
| Policies | 31 prebuilt: quota, spike arrest, IP access control, threat protection, schema validation [E8] | Apigee [E32], Azure APIM [E33] | Fixed 60 calls a minute per key (`src/lib/security/rate-limit.ts:234`) | P3.5 policy packs with shadow replay |
| Stop switch | Undeploy or revoke per artifact | Per-app kill switch | Per object only: revoke key, revoke grant, retire app, deactivate connection | P3.6 scoped FREEZE, READ_ONLY, THROTTLE |
| Before-commit governance | Git for iFlows only, github.com only, personal token per operation [E6]; CI/CD needs manual zip commits [E7] | Pact can-i-deploy [E28]; Spectral lint | None | P3.1-P3.3 manifest, CLI, CI identity |
| Promotion gates | Transport via CTS+ or Cloud TMS | Pact record-deployment | Report only; PROD not gated on TEST (`src/lib/studio/grants.ts:288-296`) | P3.4 |
| Audit | Message logs 30 days; access logs [E5] | n/a | Per-call row including refusals; retention 7-3,650 days (`src/lib/northbound/retention.ts:57-66`); append-only enforced by a test only; read-path write failure swallowed (`audit.ts:136-144`); no export | P3.10 hash chain, export; P6.4 SIEM |
| Self-service developer portal | Developer Hub: products, subscriptions, monetization [E67] | Kong Dev Portal [E31] | Onboarding needs API calls or database edits [R2] | P0.13; P2.9; P2.10 |
| SAP licensing (Digital Access) | No insight | n/a | Usage counts calls, rows and writes, not document types | P6.6 estimator |
| SAP API Policy guardrails | n/a | n/a | Catalogue-only resolution matches §1.2 by accident | P3.5 SAP API Controls pack [E17] |
| Per-person identity and consent | Principal propagation via Cloud Connector | RFC 8693 acting-for [E52] | One communication user per connection for every app | P4.3; P6.5 |

### 4.8 Operations and monitoring

| Capability | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| Message log and trace | Trace switches off after 10 minutes, payload kept 1 hour, logs 30 days [E5] | OpenTelemetry | One audit row per call, metadata only, with correlation id (`src/lib/northbound/respond.ts:44-84`); no OpenTelemetry | P3.7: OpenTelemetry spans per pipeline step; W3C `traceparent` [E39] |
| External export | Splunk, JSON or OTLP, one target at a time, set up via API call [E14] | Vercel drains | None | P3.10 export; P6.4 SIEM streaming |
| Alerts | Cloud ALM routes to email, Teams, ServiceNow | PagerDuty | One nightly drift email to platform admins (`src/lib/ops/connection-probe-sweep.ts:47-86`) | P3.7: stored incidents, alerts to app owners |
| Synthetic checks | Cloud ALM health, every 5 minutes | Postman monitors | Nightly connection probe and lane check (`vercel.json:4-29`) | P3.7: monitors every 5 minutes or less |
| Custom (`Z`) interfaces | Cloud ALM: "ODATA/API messages coming from Z-interfaces are, currently, not visualized" [E19] | n/a | Not callable yet | P1.1 then P3.7: CoreEdge becomes the monitoring layer for customer-built APIs |
| SAP upgrade impact | Upgrade checks for its own Groovy scripts | Stripe API versioning | None. Production shows no deprecation flags: `hubState` is null on all 954 rows [R3] | P0.8; P3.8 upgrade radar |

### 4.9 Deployment and security

| Capability | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| Hosting | SaaS on BTP Cloud Foundry only [E1] | Container or Helm | Vercel only: build steps exist only in `vercel-build` (`package.json:22-23`); no Dockerfile; no `output: 'standalone'` (`next.config.ts`) | P4.5 container image, compose, Helm, Terraform |
| Secret custody | Keystore with SAP key renewal, 8 credential types [E1] | KMS envelope encryption | AES-256-GCM with per-row binding, but the key is one raw environment variable with no version (`src/lib/sap-public/connection-crypto.ts:93-103`) | P0.10 KMS |
| Staff sign-in | SAP IAS, BTP roles | OIDC, SAML, SCIM | Magic link only; the first user to sign in becomes platform admin (`src/lib/auth/auth-options.ts:24-25`) | P0.13; P2.9; P4.6 |
| MFA on governance actions | BTP | Step-up | Not checked on the `/coreedge` layout or the CoreEdge API routes; the Studio and Control Tower layouts do check it [R-coreedge-today, from reading the code, not run] | P0.12 |
| Tenant isolation | Separate tenants | Postgres row-level security | Guard defaults to "log" in production (`src/lib/db/tenant-guard.ts:93-98`) | P0.12 throw mode |
| HA and DR | Multi-AZ, SLA 99.95% [E2] | n/a | Breaker and token caches are per instance; crons have no lease | P4.5 |
| Licence for other teams | n/a | n/a | Proprietary, all rights reserved (`LICENSE:8-14`) | P4.8 decision |

### 4.10 AI

| Capability | Integration Suite | Best of breed | CoreEdge today | Target |
|---|---|---|---|---|
| AI agents as governed consumers | MCP Gateway on the Integration Cell; Premium or Enhanced edition; principal propagation on roadmap [E9] | Azure APIM [E44]; MuleSoft Agent Fabric [E43] | None | P6.1 runtime MCP; writes confirmed by a person |
| AI for developers | Flow generation, error resolution, script optimisation, OpenAPI generation; Premium or Enhanced only; free until January 2027 per help.sap.com, a date that conflicts with SAP's March deck [E10] | Postbot | None | P2.11 Studio MCP and failed-call explainer; P6.2 copilot |
| Anomaly detection | API Management anomaly detection | Apigee per-app analytics | 10 fixed rules, computed when a page loads (`src/lib/ops/incidents.ts:404-458`) | P6.3 |
| Rule for AI claims | n/a | n/a | n/a | A "works" answer must carry a passing run id (P2.11, P6.2) |

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
| Client | Generic generator; SAP Cloud SDK does not apply (the northbound API is REST/JSON, not OData) | Java and .NET SDKs (P2.6); optional OData facade so SAP Cloud SDK and CAP can be used natively (P6.7) |
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
| Runtime agents | No path | `/api/mcp/{solution}`: OAuth 2.1 resource server [E40]; tools generated only from live grants; writes confirmed by a person; each agent is its own principal (P6.1) |
| SAP rules | Not addressed | SAP API Policy §2.2.2 restricts agents; deny-by-default until the organisation records a legal attestation [E17] |

**Human testers**

| Step | Today | Target |
|---|---|---|
| Role | None; only consultants (full builders) can use Studio (`src/lib/studio/rbac.ts:82-104`) | `tester` role: Lab and collection runs only (P2.9) |
| Tools | Postman by hand with a once-shown key | Lab, collections, exports, nightly suites, monitors (P2.1-P2.3, P3.7) |
| Evidence | None | Suite results attached to promotions (P3.4) |

---

## 6. Governing external programs

The product owner asked that "the external program connected is also being controlled and governed". Governance here means five things, done for every program, in both directions: a program calling SAP, and SAP calling a program.

| Verb | What it means | Today (evidence) | Gap | Target |
|---|---|---|---|---|
| **Identify** | Know which program is calling, which build it is, and on whose behalf | One static `ce_` key per solution per environment (`src/lib/northbound/auth.ts:25-37`; unique per org, solution and environment in `prisma/schema.prisma:1128-1160`) | No proof of possession; no build identity; no end user; no source IP in audit | Manifest (P3.1); OAuth with `private_key_jwt` (P2.5); CI workload identity (P3.3); build header (P3.1); acting-for `sub`/`act` (P6.5); source IP in audit (P3.10) |
| **Approve** | A second person decides on evidence, for a limited time | Two-person rule, mandatory expiry, write checklist, owners cannot issue their own keys (`src/lib/studio/grants.ts:166-286`; `src/app/api/studio/clients/route.ts:156-176`) | Not bound to interface or product (A47); departed owners count (A69); no MFA step-up; PROD not gated on TEST | P0.1, P0.12; promotion gates on evidence (P3.4); quarterly recertification (P6.4) |
| **Contain** | Limit what the program can do and stop it at once | 60 calls a minute per key; revoke key or grant; retire app (`src/lib/security/rate-limit.ts:234`) | No quotas, budgets, field scope, IP ranges or time windows; no scoped stop switch; breaker not wired | Field grants (P1.5); policy packs (P3.5); FREEZE, READ_ONLY and THROTTLE by scope with dual control (P3.6); graded automatic response (P6.3) |
| **Monitor** | See behaviour and tell the owners | Audit row per call; 10 incident rules computed when a page loads; nightly lane checks | No stored incidents; alerts go only to platform admins; no traces | Monitors, OpenTelemetry, owner alerts (P3.7); behavioural baselines (P6.3) |
| **Prove** | Show an auditor what was allowed, by whom, and what happened | ConfigAudit and NorthboundAuditEvent; retention configurable | Append-only by test only; no hash chain, export or SIEM; failed audit writes swallowed on reads | Hash chain plus daily anchors, export, fail-closed writes (P3.10); SIEM, evidence packs, access reviews (P6.4) |

**A program's life under governance (target).**
1. The team commits `coreedge.yaml`. It declares the interfaces, fields, operations, budgets, networks and whether the program is an AI agent.
2. CI proves the code calls only what is declared.
3. A manifest change raises grant requests. Only people approve them.
4. Each call carries the manifest version and a decision id.
5. Policy runs in shadow mode before it is enforced.
6. A stop switch contains the program by scope.
7. Owners recertify every quarter; anything not recertified expires.
8. Retiring the app stops every key.

**SAP's own rules are part of governance.** SAP API Policy v.4.2026a [E17]:
- §1.2: only Published APIs; custom ABAP interfaces are explicitly allowed only in private cloud and on-premise.
- §2.1: SAP-published rate and extraction limits apply.
- §2.2.2: AI agents and bulk extraction are prohibited outside SAP-endorsed paths.
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
     TRANSPORTS (the existing fetchImpl seam: read.ts:143-145, write.ts:222, connection-health.ts:215,
                 connection-resolver.ts:747)
       +- direct     undici dispatcher: proxy, custom CA, X.509    -> S/4 Public, SuccessFactors, Ariba, BTP, SaaS
       +- twin       Tenant Twin engine (Postgres)                 -> no network, synthetic or masked data
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
  DURABLE RUNTIME (jobs entrypoint, Postgres queue): outbox, async writes, DLQ, webhooks, flows, bulk, monitors
  ============================================ customer network ===============================================
  CoreEdge Connector (one container, HA pair): enrolment, customer-held access list, local vault or HSM,
  RFC plugin (customer-supplied SAP NW RFC SDK or JCo), IDoc and SFTP, event subscriber, local hash-chained log
```

### 7.2 How it fits today's code

| Component | Builds on | First change |
|---|---|---|
| Pipeline | The inline sequence in `src/app/api/northbound/interfaces/[id]/data/route.ts:52-227`, repeated in `data/write/route.ts` and `src/app/api/studio/test/broker-run/route.ts` | P0.14 extracts it with no behaviour change |
| Service registry | Branch `custom-service-path`: `interface-service.ts`, `service-path.ts`, the verify-service route | P1.1 |
| Transports | The `fetchImpl` parameter that already exists | P4.1 adds `SapConnection.transport` |
| Grants | `ApiAccessGrant` (`prisma/schema.prisma:1012-1047`) | Adds `interfaceId`, `sapProduct` (P0.1), then `fieldScope`, `manifestVersionId`, `direction` |
| Keys | `src/lib/sap-public/connection-crypto.ts:93-103` | P0.10 KeyProvider |
| Policy | `src/lib/security/rate-limit.ts`, `src/lib/studio/data-class.ts`, `src/lib/northbound/access.ts` | P3.5 TypeScript evaluator; Cedar only after a latency benchmark |
| Lab | `TestCase`, `MockFixture`, `broker-run/route.ts`, `src/lib/ops/lane-check-sweep.ts` | P2.1 |
| Unused modules already built | `circuit-breaker.ts`, `src/lib/sap-public/rotation.ts`, `src/lib/coreedge/correlation-lookup.ts`, `src/lib/coreedge/service-health.ts`: none is imported outside its tests | P0.14 wires them |

### 7.3 Design principles

1. **One governed pipeline, no side doors.** Every entry point runs the same ordered steps and writes the same evidence. An entry point that cannot use the pipeline does not ship. Today the Workbench write-back writes no audit row (`src/app/api/sap/tdd/write/route.ts`; fixed by P0.7).
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
| Tenant Twin | A stateful OData V2/V4 emulator compiled from the customer's own `$metadata`, including `Z*` services. It supports writes, ETags, CSRF and SAP error shapes, with fault injection | IS simulation: 10 steps, under 100 KB input, mocked calls only, no writes, no Aggregator [E4]. Hub "Try Out" covers SAP's sandbox only [E61] | P1.6 |
| Contract plus SDKs for every language, including ABAP | One contract per app, in three OpenAPI dialects; TS, Python, Java and .NET runtimes; ABAP Cloud and classic classes via abapGit | IS ships no consumer SDKs | P1.3, P2.6, P2.7 |
| can-i-deploy for SAP | Manifest, CLI and CI actions with OIDC identity; evidence attached to grants | IS Git covers iFlows only, on github.com only, with a personal token per operation [E6]; its CI/CD relies on manual zip downloads [E7] | P3.1-P3.4 |
| Policy shadow replay | A new rule replays 30 days of traffic ("would have blocked 412 calls") before it can be enforced; every response carries a decision id | API Management has 31 policy types [E8] but no replay or decision log | P3.5 |
| Field grants from SAP's annotations | SAP's PersonalData vocabulary tags fields; grants carry the field list; the CIO passport shows which fields leave SAP | Masking in IS needs custom JavaScript or XSLT | P1.5 |
| Business-scoped stop switches | FREEZE, READ_ONLY or THROTTLE for a deployment, organisation, connection, app, key or agent, with auto-expiry and dual control | IS stops per artifact (undeploy) or per key | P3.6 |
| Upgrade radar with a TEST rehearsal | Nightly contract diffs; suites rerun on the TEST tenant right after SAP upgrades it, ahead of PROD [E57] | IS checks only its own scripts | P3.8 |
| Governed outbound routes | SAP or ABAP calls an external API through an expiring egress grant, with a typed ABAP method and a twin of the external API | In IS this needs an iFlow | P3.9 |
| Change-feed synthesiser | Events for ECC and `Z` services that publish none | Event Mesh carries only events SAP emits | P5.7 |
| Governed MCP not tied to BTP | Agents as principals; tools generated from grants; writes confirmed by a person | IS MCP Gateway needs Integration Cell and a premium edition [E9]; simulated at 0% full for agents | P6.1 |
| Parity scorecard generated from tests | The simulation recomputed from code flags; a cell turns full only after a passing run within 7 days | No iPaaS vendor publishes a self-verifying matrix | P0.15, P1.9 |
| Approvals decided on evidence | "Save as interface and request grant" attaches Lab runs and CI results; the SAP admin checklist is generated from the 496 scenarios mapped to 1,832 APIs (`SapCommScenario`, `prisma/schema.prisma:6502`) | IS keeps approval, testing and SAP-side setup in separate tools | P2.2, P2.10 |
| Customer-held connector with a zero-knowledge vault | One container; the access list is owned by the customer; the SAP secret can stay on site | Cloud Connector serves BTP only [E12]; Edge Integration Cell needs Kubernetes [E11] | P4.2 |
| Digital Access estimator; one call = one unit | Licence-relevant document counts per SAP system | IS meters per 250 KB block, counts each splitter output, and bills an API proxy call plus its iFlow as two messages [E3, E2] | P6.6 |
| Monitoring layer for customer-built APIs | Per-call trace and audit for `Z` services | Cloud ALM does not currently visualize Z-interface OData messages [E19] | P1.1 + P3.7 |

---

## 8. Roadmap

### 8.1 Summary

**Size key** [estimate, defined for this document]:
- S: up to 1 engineer-week
- M: 2-3 engineer-weeks
- L: 4-6 engineer-weeks
- XL: 8 or more engineer-weeks

**Total effort.** The per-phase durations add up to about 71-86 calendar weeks at 3-4 engineers, roughly 50-80 engineer-months [estimate]. An earlier figure of 20-28 engineer-months understates this. Plan with the higher figure, and use the ranked blockers (P0.15) and the time-to-first-call funnel (P2.12) to decide what to cut.

**Coverage after each phase** (from the simulation):

| After | Full | Partial | Lifecycle stages full | Biggest movers |
|---|---|---|---|---|
| Today | 0.0% | 0.2% | 1 (GOVERN) | |
| P0 | 0.0% | 0.2% | 2 | SECRETS_KEYS 1 to 2. No scenario change: P0 makes existing coverage trustworthy, not wider |
| P1 | 0.0% | 0.8% | 3 | SYNC_READ and SYNC_CREATE partial 0.9% to 3.7%; S/4 targets 0.4% to 1.3%; ECC 0 to 0.6%; BTP 0 to 0.7%; DISCOVER to full |
| P2 | 0.0% (S4_PUBLIC 0.3%) | 2.8% | 6 | SYNC_UPDATE_DELETE_ACTION 0 to 6.7%; BULK_BATCH 0 to 4.8%; S/4 targets to 4.5%; every consumer to 3.2% (agents and testers 1.6%); MOCK, DEVELOP, ONBOARDING to full; CI and AI 0 to 1 |
| P3 | 0.0% (S4_PUBLIC 0.3%) | 3.2% | 10 | Synchronous patterns to 7.5%; JS/TS and Python to 4.8%; CI, DEPLOY, RUN, UPGRADE to full |
| P4 | 0.3% | 3.9% | 11 | First full scenarios: S/4 targets 0.7% full, 6.2% partial; synchronous patterns 1.1% full, 9.1% partial; SELF_HOST to full |
| P5 | 2.0% | 11.6% | 12 | Ariba 0 to 2.3%/19.6%; Concur 3.2%/14.3%; SAP_CALLS_OUT 0.4%/6.5%; A2A flows 1.9%/9.6%; B2B 0/8.0%; non-SAP SaaS 0/8.1%; JS/TS 2.6%/19.0%; DESIGN_MAP to full |
| P6 | 3.3% | 14.8% | 13 | AI_AGENT 0 to 2.8% full, 14.3% partial; non-SAP SaaS 1.9% full; synchronous patterns 6.9%/25.1%; AI_ASSIST to full |
| IS (for reference) | 25.3% | 93.8% | 4 | |

**Why "full" stays low.** A scenario turns full only when six cells are full at once. After P6, many of those cells are still partial by design:
- principal propagation (unverified on S/4 Public);
- consumer mTLS on Vercel;
- low-code OAuth;
- IDoc, SOAP calls out, B2B.

That one partial cell holds the whole scenario at partial. The roadmap's per-item acceptance criteria are therefore the better measure of progress within a phase. The scorecard (P1.9) should show both.

### 8.2 Phase 0: Harden what exists

**Goal:** make today's broker, explorer and governance screens trustworthy before anything is built on them. The phase:
- closes the 33 audit findings still open after batches 1 and 2 (Appendix D) and their residuals;
- adds KMS, credential hygiene, MFA step-up and onboarding;
- closes the write-back audit gap;
- fixes catalogue addresses;
- extracts the pipeline;
- checks the simulator into the repo.

**Estimate:** 5-6 weeks, 3-4 engineers.

**P0.1 Close the remaining governance-gate holes (A46, A47, A52, A69, batch-1 residual races).** Size M. Depends on: none.
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

**P0.2 One authorisation predicate for lanes and broker (A14-A19, A50, A60, A70).** Size M. Depends on: P0.1.
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

**P0.3 Truthful registers and screens (A29, A30, A45, A51, A58, A59, A61, A62, A63).** Size M. Depends on: P0.2.
- Problem: screens tell operators untrue things, for example Catalogue Health saying CURRENT after any probe, the passport listing expired access as current, and the jobs strip omitting two crons.
- Solution: fix each at source. Separate `importedAt`; per-service metadata probe; masked key tail; all crons registered; the expiry and environment predicates from P0.2; corrected copy; an empty-board state for apps with no feeds.
- Value: operators can act on what the screens say.
- Code: `src/lib/sap-public/catalogue-health.ts`, `hub-content.ts`, `src/app/(coreedge)/coreedge/passport`, portfolio and Ops tokens routes, the claim page, `src/app/(coreedge)/coreedge/apps/[app]`.
- Acceptance: one regression test per finding; a recorded manual pass on a seeded org.

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
- Value: one meaning per status code, which the SDK retry logic depends on.
- Code: `src/lib/security/rate-limit.ts`, `src/lib/northbound/read.ts`, `write.ts`, `failure-reason.ts`, `src/lib/sap-public/connection-resolver.ts:660-673`, `oauth-saml-bearer.ts`, `src/lib/ops/topology.ts`, `src/lib/coreedge/queries.ts`.
- Acceptance:
  - A table-driven test of token-endpoint answer × auth type × path checks status, reason and retry advice against the developer guide's retry table.
  - A flooding key cannot throttle another key.

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

**P0.7 Close the Workbench write-back audit gap.** Size S. Depends on: none.
- Problem: `POST /api/sap/tdd/write` creates records in a live SAP tenant with no audit row, and it is enabled on production for S/4 (`src/app/api/sap/tdd/write/route.ts:15-136`).
- Solution:
  - Write a `NorthboundAuditEvent` naming the person.
  - Gate the route behind `WORKBENCH_WRITE_ENABLED`, off by default in production.
  - Add a static test that every route importing the SAP write helpers also calls the audit recorder.
- Value: the last side door that changes SAP data is closed.
- Code: that route, `src/lib/sap-public/tdd-connector.ts:1236-1268`, `src/lib/northbound/audit.ts`, a new static test.
- Acceptance: every write-back is audited; the static test fails for an unaudited new route; production shows disabled unless the flag is set.

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

**P0.9 Admit the SuccessFactors API hosts (`sapsf.*`).** Size S. Depends on: none.
- Problem: `sapsf.com`, `sapsf.eu` and `sapsf.cn` are missing from the allow-list (`src/lib/studio/sap-host-allowlist.ts:41-53`).
- Solution: add them, checked against SAP's list of SuccessFactors API servers [unverified]. Document `SAP_HOST_ALLOWLIST_EXTRA`.
- Value: real SuccessFactors tenants can connect.
- Code: the allow-list and its tests.
- Acceptance: `api17.sapsf.com` is admitted; `evil-sapsf.com` is refused.

**P0.10 KMS envelope encryption for SAP secrets.** Size L. Depends on: none.
- Problem: one raw environment key with no key id, version, rotation or reseal (`src/lib/sap-public/connection-crypto.ts:93-103`). The keystone runbook requires this before real client credentials are stored (`docs/coreedge/SAP-CONNECTION-KEYSTONE-RUNBOOK.md:110-131`).
- Solution:
  - A `KeyProvider` with env, AWS KMS, GCP KMS, Azure Key Vault and Vault Transit implementations.
  - One data key per organisation.
  - New blob format `ce2:<keyId>:<wrappedDek>:<iv>:<ct>`.
  - `ce keys rotate`, `reseal` and `verify`, plus a restore drill.
- Value: a clear answer to "who can decrypt the customer's SAP password"; the prerequisite for bring-your-own-key and self-host.
- Code: `connection-crypto.ts` and every sealing call site; scripts; the runbook.
- Acceptance:
  - Every blob carries a key version; reseal migrates 100% of rows.
  - Every connection opens after a rotation; the restore drill passes.
  - With no KMS configured, the env provider behaves as today.

**P0.11 Credential hygiene.** Size M. Depends on: none.
- Problem: read keys may never expire (`src/lib/northbound/issue.ts:229`); rotation cuts over at once; one prefix covers test and live.
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

**P0.12 MFA step-up on governance routes; tenant guard in throw mode.** Size M. Depends on: none.
- Problem: the `/coreedge` layout (`src/app/(coreedge)/layout.tsx:43-46`) and the CoreEdge API routes (decide, issue, rotate, revoke, claim link, write enable, secret save) do not check MFA. The tenant guard only logs (`src/lib/db/tenant-guard.ts:93-98`).
- Solution:
  - `requireStepUp(user, 5 min)` in each route.
  - Review guard logs for 7-14 days, then switch to throw.
- Value: separation of duties holds even if a session is stolen.
- Code: `src/lib/auth/permissions.ts`, `src/app/api/coreedge/**`, the Studio clients, access-grants and connections routes.
- Acceptance:
  - An end-to-end test per route gets 403 without a fresh assertion.
  - 7 days of zero unscoped-query log lines before throw mode.

**P0.13 Self-service developer onboarding on the shared host.** Size M. Depends on: P0.12.
- Problem:
  - A magic-link user gets no organisation.
  - `/signup` creates a role that cannot open Studio (`src/app/api/auth/signup/route.ts:109`).
  - The admin API cannot create organisations.
  - `WORKBENCH_ONLY` redirects the invite screens (`src/middleware.ts:113`).
  - The first person to sign in becomes platform admin.
  - SMTP over implicit TLS (port 465) fails.
- Solution:
  - A "developer workspace" sign-up with twin-only rights until a second member joins.
  - `POST /api/admin/organizations`.
  - Invite and member screens reachable under `WORKBENCH_ONLY`.
  - A one-time bootstrap token for the first admin.
  - SMTP implicit TLS.
- Value: the first minute of time to first call.
- Code: `src/lib/auth/auth-options.ts`, `src/app/api/auth/signup/route.ts`, `src/app/api/admin/*`, `src/middleware.ts:70-141`, `src/lib/routing/workbench-paths.ts`, `src/lib/email/brevo.ts`.
- Acceptance: on production, a new email address reaches Discover and invites a colleague with no database access; a stranger cannot claim a fresh instance.

**P0.14 Extract the governed pipeline and wire the modules already built.** Size L. Depends on: P0.1, P0.5.
- Problem: the check sequence is hand-copied across the read, write and broker-run routes and console reads. Four tested modules are not imported anywhere.
- Solution:
  - `src/lib/governed/pipeline.ts` with named steps and typed refusals.
  - Port the routes onto it with no behaviour change.
  - Wire the circuit breaker with shared Upstash state.
  - Probe a new secret before it replaces a working one.
  - A correlation-id search box in Operations.
- Value: every later feature becomes a step or an adapter.
- Code: the data, write and broker-run routes, `src/app/api/sap/tdd/preview/route.ts`, `circuit-breaker.ts`, `rotation.ts`, `correlation-lookup.ts`, `service-health.ts`.
- Acceptance:
  - Audit rows are byte-identical before and after.
  - 5 failures open the breaker in both of two processes.
  - A mistyped rotated secret never replaces a working one.

**P0.15 Check the permutation simulator and the governance property test into the repo.** Size M. Depends on: P0.14.
- Problem: the simulation is a one-off; `topBlockers` came back empty; on-premise is over-credited.
- Solution:
  - `scripts/simulate-matrix.ts` with a capability registry generated from code flags (`src/lib/coreedge/capability-registry.ts`), computing coverage and ranked blockers.
  - A decision-table property test over more than 10,000 combinations: credential, grant, expiry, revocation, environment, interface status, connection, containment, policy.
  - Both run in CI.
- Value: gap claims become reproducible.
- Code: new script, registry and `tests/property`; CI workflow.
- Acceptance:
  - Output matches section 3 within 0.1 points, or the differences are explained (S4_ONPREM is expected to drop to 0).
  - `topBlockers` is non-empty and ranked.

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

**After P0:** full 0.0%, partial 0.2%; lifecycle stages full: 2 (SECRETS_KEYS added).

### 8.3 Phase 1: Any SAP OData API, contract-first, with a Tenant Twin

**Goal:** remove the customer/partner-origin blocker (330,840 scenarios), make OData reads usable by real programs, and let a developer call any API, including a `Z*` one, before the SAP administrator (often called "Basis") has configured anything.

**Estimate:** 8-10 weeks.

**P1.1 Land interfaces that carry their own service path (branch `custom-service-path`).** Size M. Depends on: P0.1 (rebase, or land first; see section 9.2).
- Problem: `Z*` RAP services, `YY1_*` key-user services, ECC Gateway and SuccessFactors MDF services are refused everywhere. RAP is SAP's current ABAP programming model; key-user extensibility lets business experts build simple APIs without ABAP.
- Solution: merge `a4dd83d9` and `9ed76ba4` per protocol. They add:
  - `Interface.servicePath` and `odataVersion`;
  - one resolver for read, write, broker-run, lanes and discovery;
  - a path guard on the connection's own host;
  - `custom:<path>` grant scoping;
  - `POST /api/studio/interfaces/[id]/verify-service` (fetches `$metadata`, checks EDMX, version and entity set);
  - writes refused until verified;
  - the "Register your own API" screen.

  Then verify live on X5M.
- Value: the biggest single unlock. The customer's ABAP team can expose a service and have an app call it, under governance, the same day.
- Code: the branch's `src/lib/sap-public/interface-service.ts`, `service-path.ts`, migration, verify-service route, the data and write routes, the Studio interfaces and discover screens.
- Acceptance:
  - A `Z*` V2 and a `YY1_*` V4 service are verified, read through the northbound API with an audit row, and labelled customer-built.
  - Non-EDMX responses are refused.
  - Catalogue interfaces resolve unchanged.
  - Production deploy verified.

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

**P1.3 Contract Compiler and ContractSnapshot.** Size L. Depends on: P0.4, P1.1.
- Problem:
  - The OpenAPI is a hand template with one GET path (`src/lib/studio/scaffold.ts:62-198`).
  - Schemas come from sampled rows.
  - `requestSchema` is never written.
  - `$metadata` is parsed with regexes (`tdd-connector.ts:950-1010`).
- Solution:
  - `src/lib/contracts/` parses CSDL into a Contract IR: types, keys, labels, navigations, capabilities, actions, PersonalData annotations. It uses the OASIS converter where it fits [E45].
  - A `ContractSnapshot` model.
  - Per-solution OpenAPI in 3.1, 3.0.3 and Swagger 2.0 (under 1 MB) covering every operation, header and error shape.
  - JSON Schemas; semver.
- Value: the single source for SDKs, twin, assertions, field policy, docs, MCP tools and upgrade diffs.
- Code: new `src/lib/contracts/`, Prisma, `scaffold.ts`, `schema-capture.ts` (becomes the fallback), the schema endpoint.
- Acceptance:
  - Golden tests on 20 or more real S/4 EDMX files plus 3 `Z*` files.
  - 2.0 output passes the Power Platform validator.
  - 3.0.3 generates with abap-openapi [E21] [to verify].
  - Write contracts describe the body.

**P1.4 Governed OData query surface.** Size L. Depends on: P1.3, P0.14.
- Problem: reads send only `$top` and `$format`, 100 rows or fewer (`src/lib/northbound/read.ts:56,149,177`).
- Solution:
  - `Interface.queryPolicy` names the filterable fields and operators, selectable fields, `$expand` depth (2 or less), page size and row caps.
  - Structured parameters are parsed into an AST and checked; CoreEdge builds the OData query itself.
  - Key lookup, `$count`, and an opaque signed cursor that never shows SAP's host.
- Value: real programs (fetch order X, my open items) become possible.
- Code: `read.ts`, new `src/lib/odata/operation-compiler.ts`, the data route, the Studio interface form.
- Acceptance:
  - A non-granted filter field returns 400 `POLICY_FIELD_NOT_GRANTED`.
  - Fuzzing finds no OData injection.
  - Paging 10,000 rows stays within budget with no SAP host leaked.
  - A conformance suite passes on V2 and V4.

**P1.5 Field-level grants and PII tagging.** Size M. Depends on: P1.3, P1.4.
- Problem: whole rows are returned; the passport fields column is blank (`src/app/(coreedge)/coreedge/passport/page.tsx:14`); fixtures hold real tenant rows.
- Solution:
  - Tag fields from SAP's PersonalData vocabulary [E46]; untagged fields need review before ACTIVE.
  - `ApiAccessGrant.fieldScope` drives `$select`, and the response guard strips extras.
  - Masking applies to fixtures, schemas and idempotency replay bodies.
- Value: data minimisation the CIO can see.
- Code: Prisma, `src/lib/contracts`, `src/lib/studio/fixtures.ts:121-135`, `src/lib/northbound/idempotency.ts:218`, the passport and add-feed pages.
- Acceptance: no response contains an ungranted field (property test); new fixtures contain no unmasked tagged field.

**P1.6 Tenant Twin v1.** Size XL. Depends on: P1.3, P1.4, P0.14.
- Problem: developers wait days or weeks for SAP set-up, and the only mock is a local Node script serving real rows.
- Solution:
  - `src/lib/twin/`: a stateful OData V2/V4 emulator generated from the contract, stored in Postgres (`TwinDataset`, `TwinRecord`).
  - Synthetic seeded data; read, query, key lookup, create.
  - CSRF handshake, V2 and V4 envelopes, SAP error JSON.
  - `X-CoreEdge-Twin-Fault` for every failure reason.
  - Reachable as `transport: TWIN` and as a public endpoint `/api/twin/<ws>/<connKey>/sap/opu/odata/...` and `/odata4/...`.
  - About 10,000 records per twin.
- Value: the core of the 30-minute first call and of testing before code.
- Code: new `src/lib/twin/`, `src/app/api/twin/[...path]/route.ts`, Prisma, the `fetchImpl` seam.
- Acceptance:
  - The pipeline runs unchanged against the twin, with audit rows marked TWIN.
  - Postman, curl and SAP Cloud SDK reach it.
  - Statuses and envelopes match the X5M lab in at least 95% of the conformance set, with differences documented.
  - Twin rows never change lane evidence.

**P1.7 Test keys and self-service twin access.** Size S. Depends on: P0.11, P1.6.
- Problem: a solo developer cannot start without a second person.
- Solution: `ce_test_` keys reach only TWIN and SANDBOX connections; they are issued at once with no second person. DEV and above need the full grant chain.
- Value: free to play, governed to ship.
- Code: `src/lib/northbound/auth.ts`, `issue.ts`, `src/lib/studio/grants.ts`, the Studio clients UI.
- Acceptance:
  - A test key on DEV returns 403 `TEST_KEY_ON_LIVE`.
  - A new solution reaches a twin read alone.
  - DEV still needs an approved grant.

**P1.8 Live verification of SuccessFactors and V4 writes.** Size S. Depends on: P0.9, P1.1.
- Problem: SuccessFactors SAML bearer, V4 create and draft-enabled RAP POST are covered by unit tests only.
- Solution: one live lab run each, recorded as evidence; an "untested" badge elsewhere, read by the simulator.
- Value: honest "full" claims.
- Code: `src/lib/sap-public/oauth-saml-bearer.ts`, `src/lib/northbound/write.ts`, the capability registry.
- Acceptance: each path has either a live 2xx with a correlation id or a visible badge.

**P1.9 Parity scorecard v1 in Control Tower.** Size S. Depends on: P0.15.
- Problem: the product owner cannot see the gap inside the product.
- Solution: render the simulator output (IS and CoreEdge side by side, ranked blockers), regenerated on every deploy.
- Value: "simulate every permutation" becomes a living page.
- Code: new `src/app/(control-tower)/control-tower/parity`.
- Acceptance: the page shows the build SHA and matches the CI JSON.

**After P1:** full 0.0%, partial 0.8%; lifecycle stages full: 3 (DISCOVER added).

### 8.4 Phase 2: Postman before code, full OData writes, every language

**Goal:** give every developer type a governed path, and open update, delete, actions and `$batch`. Time to first call against the twin becomes 30 minutes or less.

**Estimate:** 10-12 weeks; can overlap P1 once P1.3 lands.

**P2.1 API Lab data model and assertion engine.** Size L. Depends on: P1.3, P1.6, P0.14.
- Problem: test cases never assert anything; the console is read-only, 50 rows or fewer, and needs a grant.
- Solution:
  - New models: `LabCollection`, `LabEnvironment` (secret references, never raw tokens), `LabRun`, `LabResult`.
  - Server-side assertions: status, row range, schema, JSONPath, latency, header, failure reason.
  - Chaining between steps.
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
  - Not hidden by `WORKBENCH_ONLY`.
- Value: directly answers "like Postman before the program is developed".
- Code: new `src/app/(studio)/studio/lab`, `TestConsoleClient.tsx` (folded in), routing.
- Acceptance: a new user with twin-only rights builds, asserts and saves a 3-step collection in under 10 minutes.

**P2.3 Import and export: Postman v2.1, Bruno, `.http`.** Size M. Depends on: P2.1.
- Problem: a closed Lab would lock teams in.
- Solution: round-trip import and export; `pm.*` scripts kept as comments; environments exported with placeholders.
- Value: meets developers in their own tools.
- Code: new `src/lib/lab/exchange/`.
- Acceptance: a round-trip keeps requests and assertions; Newman runs an export green against the twin in CI.

**P2.4 Full OData write surface, twin first.** Size XL. Depends on: P1.4, P1.6, P0.1.
- Problem: create only; UPDATE can never be activated (`src/app/api/studio/interfaces/route.ts:259-261`).
- Solution:
  - PATCH and MERGE with ETag pass-through (412 maps to CONFLICT).
  - DELETE as a separately granted, stronger approval class.
  - Actions and function imports; deep insert.
  - `$batch` decomposed through the pipeline, with one audit row per sub-operation.
  - Draft handling [verify on the lab].
  - Every operation enabled on the twin first.
- Value: business programs that change data.
- Code: `src/lib/northbound/write.ts`, the operation compiler, `src/lib/studio/write-readiness.ts`, the grant vocabulary, the data routes, the twin.
- Acceptance:
  - A stale ETag returns 412; DELETE without a grant returns 403.
  - The twin round-trips create, update, delete and read.
  - A live DEV run (or an "untested" badge) exists for V2 and V4 update and for one action.

**P2.5 Consumer OAuth 2.0 token endpoint.** Size L. Depends on: P0.11.
- Problem: a static header is the only consumer credential, and SAP credential stores cannot hold it.
- Solution: `/api/northbound/oauth/token` for client credentials with `client_secret_basic` or `private_key_jwt` [E53]; 10-minute JWTs scoped per interface.
- Value: every enterprise platform, ABAP included, can store the credential natively.
- Code: new token route, `auth.ts`, an `OAuthClient` model, the ABAP lab guide.
- Acceptance:
  - RFC 6749 §4.4 conformance.
  - A Node client and at least one ABAP flavour call in the lab; the other flavour is proven or marked unverified.

**P2.6 SDK runtimes and generated types for TS, Python, Java and .NET.** Size L. Depends on: P1.3, P1.4, P2.5, P0.5.
- Problem: one read-only TypeScript kit per interface.
- Solution:
  - A runtime of 300-600 lines per language: tokens, Idempotency-Key, `traceparent`, retry only on 429/503 honouring Retry-After, typed errors, cursor iterators, twin/live switch.
  - Generated per-solution types and methods.
  - Published to npm, PyPI, Maven and NuGet, subject to decision D1.
- Value: a typed, governed client in one command.
- Code: new `packages/sdk-*` (the repo becomes a pnpm workspace with the root app unchanged), new `src/lib/codegen/`, `/api/mgmt/v1/solutions/{id}/sdk/{lang}`.
- Acceptance: one shared conformance script (list, filter, get, create, update, 429 retry, idempotent replay) passes for all four languages against the twin in CI.

**P2.7 ABAP SDK (Cloud and classic) via abapGit.** Size L. Depends on: P2.6, P2.5.
- Problem: ABAP teams hand-write HTTP calls, JSON casing and date handling.
- Solution:
  - `ZCL_CE_CLIENT_CLOUD` (communication arrangement plus `cl_web_http_client_manager` [E20]) and `ZCL_CE_CLIENT_CLASSIC` (SM59 plus `cl_http_client`).
  - Generated structures with name mapping; V2 date and decimal converters; Idempotency-Key helper.
  - An ABAP Unit double; a correlation-id logging helper.
  - abaplint in CI with the Cloud and 7.50 rule sets.
- Value: ABAP developers, whom the product owner named first, build with their own tools.
- Code: new `src/lib/codegen/abap`, `packages/abap-runtime`, a CI job.
- Acceptance:
  - abaplint green on both rule sets.
  - A manual lab run on a BTP ABAP trial or S/4 DEV reaches the hosted twin [verify TLS trust].
  - ABAP Unit passes using the double.

**P2.8 Low-code connector (Power Platform, UiPath).** Size M. Depends on: P1.3.
- Problem: makers cannot use CoreEdge.
- Solution: one generic Swagger 2.0 connector with dynamic values and dynamic schema [E59]; API-key-style security, because the Power Platform OAuth definition does not support client credentials [E23]; a UiPath import.
- Value: governed SAP access for makers through the same grants.
- Code: new `src/lib/codegen/powerplatform`, docs.
- Acceptance: a maker gets typed fields in a flow; UiPath verified or marked partial.

**P2.9 Personas, roles and sign-in options.** Size M. Depends on: P0.13.
- Problem: there is no tester or external-developer role; developers cannot see their own incidents; sign-in is magic link only.
- Solution: `tester` and `external_developer` roles; developers see their own app's log and incidents; GitHub, Google and Entra OIDC sign-in.
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
- Code: new `src/app/(docs)`, contract projections, the `SapCommScenario` join.
- Acceptance: each interface page is complete, and "Run in Lab" works for a twin-only user.

**P2.11 Studio MCP for coding agents and a grounded failure explainer.** Size M. Depends on: P1.3, P1.6, P2.1.
- Problem: AI_ASSIST scores 0.
- Solution:
  - A read-and-draft MCP server: search the catalogue and scenarios, read contracts, generate snippets, run the Lab on the twin, draft interfaces and grant requests. It can never approve or issue.
  - A failure explainer grounded in `src/lib/northbound/failure-reason.ts`, using the customer's own model via `src/lib/intelligence/ai-orchestrator.ts`.
- Value: AI help whose claims are proved.
- Code: new `src/app/api/mcp/studio`, those two modules.
- Acceptance: an agent in Claude Code drafts an interface, collection and SDK call; tests prove it cannot decide or issue; every "works" links a run id.

**P2.12 Measure time to first call.** Size S. Depends on: P0.13.
- Problem: "seamless" is not measured.
- Solution: a `DeveloperJourneyEvent` table and funnel tiles for time to first call (TTFC) and time to first real call (TTFRC), showing median and p90.
- Value: makes the north star visible.
- Code: Prisma, new `src/lib/coreedge/journey.ts`, the board and Control Tower.
- Acceptance: events fire in end-to-end tests; the tiles show the thresholds.

**After P2:** full 0.0% (S4_PUBLIC 0.3%), partial 2.8%; lifecycle stages full: 6.

### 8.5 Phase 3: Govern every connected program as code

**Goal:** a program declares itself, is checked before commit and in CI, is promoted on evidence, is held to policies and budgets, can be stopped in one click, and is watched by monitors and the upgrade radar. SAP-to-external calls are governed too.

**Estimate:** 10-12 weeks.

**P3.1 App manifest (`coreedge.yaml`) and manifest versions.** Size L. Depends on: P0.1, P0.14, P1.5.
- Problem: CoreEdge cannot tell drift from intent.
- Solution:
  - The manifest declares solution, consumer type, owners, purpose, data class, per-environment interfaces (fields, filter shape, version range), budgets, egress CIDRs, an `aiAgent` flag and end-user propagation.
  - `AppManifestVersion` storage.
  - `plan` and `request`, which never approve.
  - The digest travels in tokens and audit rows; out-of-manifest calls are refused with `NOT_IN_MANIFEST`.
- Value: every program is known by its declared intent.
- Code: new `src/lib/manifest/`, Prisma, pipeline step 2, the Studio solution page.
- Acceptance: `plan` lists exactly the needed grants; out-of-manifest calls return 403 and are audited.

**P3.2 Management API, personal tokens and the CLI.** Size L. Depends on: P3.1, P1.6, P2.1, P2.6.
- Problem: Studio APIs are cookie-only; the CLI copy is blocked.
- Solution:
  - `/api/mgmt/v1`, accepting a session, a personal token (scoped, expiring, hashed) or a workload token.
  - `@coreedge/cli` with `login`, `init`, `pull`, `twin up`, `lab run`, `verify`, `diff`, `plan`, `request`, `can-i-deploy`.
- Value: governance inside the developer's own loop.
- Code: new `src/app/api/mgmt/v1`, `packages/cli`, the twin packaged for offline use.
- Acceptance:
  - An offline twin matches the hosted conformance results.
  - `verify` fails on an undeclared call, an expiring grant or a token literal.

**P3.3 CI workload identity and pipeline integrations.** Size M. Depends on: P3.2, P2.5.
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
  - Configurable gates: TEST lane green for N days, suites passed, no unacknowledged breaking diff, a non-owner approver, step-up, live owners, write checklist.
  - Named, expiring overrides; a signed promotion record.
- Value: PROD decided on proof, and auditable.
- Code: Prisma (`Release`, `PromotionGate`), `grants.ts`, `src/lib/auth/permissions.ts:355-375`.
- Acceptance: a PROD promotion without a recent green TEST suite is refused with the rule named.

**P3.5 Policy engine v1 with shadow replay and decision receipts.** Size L. Depends on: P0.14, P1.5, P3.1.
- Problem: the only policy is a fixed 60 calls a minute (`src/lib/security/rate-limit.ts:224-234`); `dataClass` controls nothing (`src/lib/studio/data-class.ts:13-17`).
- Solution:
  - Versioned org policy sets, approved by two people, with these packs:
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
  - 30-day replay, then shadow mode.
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
  - `ContainmentSwitch` covering six scopes and three modes, checked at pipeline step 0 from Redis.
  - Auto-expiry; lifting needs a different person.
  - Break-glass grants of 4 hours or less.
  - A new Operations screen.
- Value: any program contained in seconds without deleting anything.
- Code: Prisma, the pipeline, new `src/app/(operations)/operations/containment`.
- Acceptance: a FREEZE stops 100% of matching calls within 5 seconds across instances; a person cannot lift their own switch.

**P3.7 Monitors, OpenTelemetry, stored incidents and owner alerts.** Size L. Depends on: P2.1, P0.14, P0.2.
- Problem: checks run daily; the only alert goes to platform admins; incidents are not stored; there is no OpenTelemetry (`src/instrumentation.ts:9-24`).
- Solution:
  - Collections run as monitors every 5 minutes or less.
  - OpenTelemetry spans per step; W3C `traceparent` [E39].
  - Stored incidents with acknowledge and assign.
  - Alerts to the app's three owners by email, Teams, Slack, PagerDuty or webhook.
  - A per-developer request log.
- Value: problems reach the owner.
- Code: `src/lib/ops/lane-check-sweep.ts`, `incidents.ts`, `connection-probe-sweep.ts`, `src/instrumentation.ts`, `src/lib/northbound/respond.ts`, `vercel.json`.
- Acceptance: a failing PROD monitor alerts all owners within one interval; twin monitors never change lane evidence; caller traces join CoreEdge spans.

**P3.8 Upgrade radar.** Size L. Depends on: P1.3, P3.7, P3.2.
- Problem: SAP upgrades surface only after something fails.
- Solution:
  - Nightly snapshots and a diff classified as BREAKING, ADDITIVE or ANNOTATION, mapped to apps and owners.
  - A rehearsal on the TEST tenant after its upgrade (S/4 Cloud Public upgrades TEST before PROD [E57]).
  - A deprecation countdown following SAP's deprecation policy [E58].
  - `can-i-deploy` fails on an unacknowledged breaking change.
- Value: no surprise breakage from SAP releases.
- Code: `src/lib/contracts` (diff), `hub-successors.ts`, `catalogue-health.ts`, `lane-check-sweep.ts`, `incidents.ts`.
- Acceptance: a removed property raises a BREAKING incident naming the apps within 24 hours of the TEST snapshot.

**P3.9 Governed outbound routes (SAP or ABAP calling an external program).** Size L. Depends on: P2.5, P2.7, P3.5, P0.10.
- Problem: SAP_CALLS_OUT is at 0% (85,104 scenarios).
- Solution:
  - `/api/outbound/{routeId}`.
  - An `ExternalEndpoint` registry: URL, OpenAPI, credentials held by CoreEdge.
  - Egress grants (`direction=OUT`) with budgets.
  - A typed ABAP method; a twin of the external API.
- Value: governance in both directions.
- Code: new `src/app/api/outbound`, Prisma, an egress adapter, an OpenAPI-based twin, ABAP codegen.
- Acceptance: one audit row per call; revoking the grant stops it at once; unregistered hosts are refused.

**P3.10 Audit integrity v2.** Size M. Depends on: P0.14.
- Problem:
  - Append-only is enforced only by a test regex (`tests/unit/northbound/dod-gaps.test.ts:170-221`).
  - Read-path audit failures are swallowed (`src/lib/northbound/audit.ts:136-144`).
  - There is no export.
- Solution:
  - A per-organisation hash chain with signed daily anchors.
  - An outbox; fail closed on writes.
  - Source IP, user-agent hash and decision id on every row.
  - NDJSON and CSV export; optional 13-month retention; a verifier CLI.
- Value: every control decision is provable.
- Code: `audit.ts`, `retention.ts`, Prisma, `src/app/api/control-tower/audit/route.ts`, the CLI.
- Acceptance: tampering breaks verification at that row; no SAP write happens without an audit row under database failure.

**After P3:** full 0.0% (S4_PUBLIC 0.3%), partial 3.2%; lifecycle stages full: 10.

### 8.6 Phase 4: Reach any SAP landscape, run anywhere

**Goal:** make RISE, on-premise S/4 and ECC reachable (228,420 valid scenarios), and make CoreEdge easy to install.

**Estimate:** 12-14 weeks.

**P4.1 Transport abstraction.** Size M. Depends on: P0.14, P1.6.
- Problem: plain `fetch` with no proxy, custom CA or client certificate.
- Solution: a `Transport` interface supplying `fetchImpl`, with direct (undici dispatcher), twin, connector and integration-suite implementations; new connection fields.
- Value: every adapter reaches every network the same way.
- Code: `read.ts:143-145`, `write.ts:222`, `connection-health.ts:215`, `connection-resolver.ts:660,747`, `SapConnection`.
- Acceptance: `HTTPS_PROXY` and a custom CA work in a container test; existing suites pass unchanged.

**P4.2 CoreEdge Connector v1 and Relay.** Size XL. Depends on: P4.1, P0.10.
- Problem: private systems can be configured but not reached.
- Solution:
  - A signed Go agent, shipped as one container, VM or Windows service.
  - One-time enrolment, short-lived mTLS certificates, outbound 443 only through proxies.
  - An access list held by the customer that CoreEdge cannot widen.
  - HA pair; optional vault mode; a local hash-chained log; signed updates.
  - A long-lived Relay off Vercel, because Vercel WebSockets are in beta and limited in duration [E49].
- Value: private SAP landscapes reachable with no inbound port and no Cloud Connector.
- Code: new `connector/`, `relay/`, `src/lib/transports/connector.ts`, Studio site enrolment.
- Acceptance:
  - A NATed lab VM is read and written.
  - Losing one connector loses no requests.
  - Unlisted hosts are unreachable.
  - Vault mode keeps the credential out of the cloud database.
  - Relay overhead at p95 is 50 ms or less [estimate target].
  - An external penetration test completes before GA.

**P4.3 SAP-side login breadth: X.509, principal propagation, IAS.** Size L. Depends on: P4.1, P4.2.
- Problem: no certificates and no per-person identity toward SAP.
- Solution: X.509 with CSR generation and expiry alerts; extend the SAML bearer signer to S/4 [unverified on S/4 Cloud Public inbound]; short-lived user certificates behind the connector; OIDC/IAS client credentials for BTP.
- Value: SAP's own authorisation checks and logs apply per person where supported.
- Code: `connection-resolver.ts:39-62`, `oauth-saml-bearer.ts`, `connection-crypto.ts`, the connector certificate module.
- Acceptance: certificate login against a lab S/4; alerts at 30, 7 and 1 days; principal propagation verified or badged per product.

**P4.4 Connectivity Doctor and fixed egress.** Size M. Depends on: P4.1.
- Problem: all connection failures look the same; there is no fixed-IP story.
- Solution: DNS, TCP, TLS, auth and `$metadata` checks reported separately, with fixes; an egress-IP echo; documented options [E47, E48].
- Value: diagnoses in minutes the set-up failures that take most of TTFRC.
- Code: `connection-health.ts`, the Studio Connections screen.
- Acceptance: each failure class gets a distinct status; the echo matches the observed source IP.

**P4.5 Self-host package.** Size L. Depends on: P0.10, P0.13.
- Problem:
  - No Dockerfile.
  - Build steps exist only in `vercel-build` (`package.json:22-23`).
  - Crons can run twice.
  - The catalogue is fetched from GitHub at build time (`src/lib/sap-public/hub-harvest-remote.ts:124`).
- Solution:
  - `output: 'standalone'` behind `BUILD_STANDALONE=1` [E50].
  - One image with web, migrate and jobs entrypoints.
  - Compose with Postgres 16, Redis plus an Upstash-compatible proxy, Mailpit and an OpenTelemetry collector.
  - Helm with `concurrencyPolicy: Forbid`; Terraform for AWS, Azure and GCP.
  - A `/setup` wizard with the bootstrap token; `ce doctor`.
  - Advisory-lock job leases.
  - A signed offline catalogue bundle.
- Value: any team can run its own instance.
- Code: `next.config.ts`, `package.json`, new `Dockerfile`, `compose.yaml`, `deploy/`, `vercel.json`, `src/lib/ops/cron.ts`.
- Acceptance:
  - `docker compose up` reaches a governed SANDBOX call in 15 minutes or less.
  - A Helm install passes the smoke suite.
  - Two schedulers never run the same job.

**P4.6 Staff SSO and SCIM.** Size L. Depends on: P2.9.
- Problem: SSO settings are stored but unused (`src/app/api/organizations/[orgId]/sso/route.ts:14-24`).
- Solution: OIDC (Entra, Okta, SAP IAS) and SAML via Ory Polis 26.2.0 or later [E62]; IdP groups mapped to roles; SCIM de-provisioning; magic link kept for emergencies.
- Value: enterprise fit, and the A69 class of problem closed for good.
- Code: `auth-options.ts`, the SSO route, new SCIM routes, `rbac.ts`.
- Acceptance: SCIM de-provisioning makes an app RESTRICTED within one minute.

**P4.7 ECC, RISE and on-premise lanes end to end.** Size M. Depends on: P4.2, P1.1, P1.2.
- Problem: ECC resolves zero services by design (`tdd-connector.ts:503-527`).
- Solution: ECC Gateway services through custom paths and discovery, reached over the connector; the same Lab collections run green on these lanes.
- Value: serves the customers who need it most.
- Code: `tdd-connector.ts:474-527`, `dynamic-catalog.ts`, Lab environments.
- Acceptance: ECC read and create, and on-premise S/4 V4 read, update and delete, verified behind the connector.

**P4.8 Licence decision for distributed artefacts.** Size S. Depends on: none, but needed before the first external publish in P2.
- Problem: the licence is proprietary (`LICENSE:8-14`), and there may be employer interest in the IP [R2].
- Solution: a recorded product-owner decision, for example Apache-2.0 for client artefacts with the platform kept proprietary, in `docs/coreedge/COMMERCIAL-DECISIONS.md`.
- Value: unblocks P2.6, P2.7, P3.2, P3.3, P4.2 and P4.5.
- Acceptance: the decision is recorded and each package carries its licence.

**After P4:** full 0.3%, partial 3.9%; lifecycle stages full: 11.

### 8.7 Phase 5: Every protocol and pattern on one pipeline

**Goal:** remove the non-OData (74.2%) and non-synchronous (78.8%) blockers. Every adapter inherits grants, policy, containment, audit, twin and Lab.

**Estimate:** 16-20 weeks; build in order of demand.

**P5.1 Adapter SDK.** Size M. Depends on: P0.14, P4.1.
- Problem: without a common contract, each protocol would rebuild governance its own way.
- Solution: an `Adapter` interface (`describe`, `plan`, `dispatch`, `normalizeError`, `meter`) with mandatory declarations. OData is ported onto it first.
- Code: new `src/lib/adapters/`, pipeline step 8, `failure-reason.ts`.
- Acceptance: OData passes on the SDK; an adapter missing a declaration fails CI.

**P5.2 SOAP adapter and SOAP twin.** Size L. Depends on: P5.1, P1.3.
- Problem: S/4's 212 SOAP APIs are unreachable.
- Solution: WSDL into the Contract IR, exposed through a JSON facade; WS-Security; a WSDL-based twin (Microcks pattern [E30]).
- Acceptance: 3 S/4 and 1 SuccessFactors SOAP API verified live; the twin passes for 5.

**P5.3 REST adapter (Ariba, Concur, SuccessFactors REST, BTP, SaaS).** Size M. Depends on: P5.1.
- Problem: Ariba is env-only; Concur, BTP and SaaS have no connector.
- Solution: OpenAPI import; stored connections; managed OAuth refresh.
- Acceptance: one verified call each, or a badge; an SDK and twin per target.

**P5.4 RFC/BAPI through the connector.** Size XL. Depends on: P4.2, P5.1.
- Problem: on-premise and ECC logic is often available only as BAPIs.
- Solution: a connector plugin that loads the customer-supplied SAP NW RFC SDK or JCo [unverified terms]; RFC metadata compiled into a contract; explicit commit and rollback; WebSocket RFC where allowed [unverified per edition].
- Acceptance: `BAPI_PO_CREATE1` plus a commit in one session, audited; the plugin refuses to start without an SDK.

**P5.5 IDoc and file/SFTP.** Size L. Depends on: P5.4, P5.6.
- Solution: IDoc inbound via SOAP or RFC; outbound via an XML-HTTP port into event ingress; governed SFTP push and pull with checksums.
- Acceptance: an `ORDERS05` IDoc is posted and its status read back; SFTP transfers are audited.

**P5.6 Durable runtime (queue, outbox, async writes, DLQ).** Size L. Depends on: P4.5.
- Solution: a Postgres queue (graphile-worker or pg-boss); an outbox; retry classes from `failure-reason.ts`; ordering per business key; signed status callbacks; a DLQ with a replay screen.
- Acceptance: `kill -9` mid-job loses nothing and duplicates nothing.

**P5.7 Events in, governed webhooks out, change-feed synthesiser.** Size L. Depends on: P5.6, P4.2, P3.1.
- Solution:
  - Ingest Event Mesh, Advanced Event Mesh and IDoc.
  - Synthetic `*.Changed` events by polling on change dates.
  - Standard Webhooks signing [E36] with CloudEvents.
  - Retries, DLQ and replay; SUBSCRIBE grants.
  - `coreedge listen` and `trigger`.
- Acceptance: a real `SalesOrder.Created` event arrives with a valid signature; an ECC change appears within one polling interval; no delivery without a grant.

**P5.8 Mapping Studio and code-first flows.** Size XL. Depends on: P5.6, P1.3, P2.1.
- Solution:
  - Versioned JSONata in a `worker_threads` sandbox with no network; value maps; tests.
  - Declarative or TypeScript flow steps with per-step grants, idempotency and saga compensation.
  - A read-only canvas.
- Acceptance: create PO, then goods receipt, compensates under fault injection at every step with no duplicates; the Mapping card is live.

**P5.9 Bulk and batch jobs under policy budgets.** Size M. Depends on: P5.6, P3.5.
- Solution: paged extract to NDJSON or CSV; chunked batch create with per-record results; checkpoints; capped and held per SAP API Policy §2.1 and §2.2.2.
- Acceptance: over-limit runs are refused; killed jobs resume; results account for 100% of records.

**P5.10 Integration Suite as a governed backend; non-SAP SaaS.** Size M. Depends on: P5.3.
- Solution: an iFlow or API Management endpoint becomes a CoreEdge interface; read the IS package inventory; managed OAuth for the top 5 SaaS.
- Acceptance: one iFlow called with audit; a Salesforce read passes the same pipeline.

**After P5:** full 2.0%, partial 11.6%; lifecycle stages full: 12.

### 8.8 Phase 6: AI-native and provable

**Goal:** lead where Integration Suite is weakest (AI agents at 0% full), and turn governance into continuous, exportable proof. P6.1 is gated by the legal reading in D2.

**Estimate:** 10-12 weeks.

**P6.1 Runtime MCP gateway for AI agents.** Size L. Depends on: P2.5, P3.5, P3.6.
- Solution:
  - An OAuth 2.1 resource server [E40]; tools only from live grants, with pinned descriptions (OWASP MCP03 [E41]).
  - Agents as principals with their own budgets; write intents confirmed by a person.
  - SAP text marked as data; deny-by-default until a legal attestation.
- Acceptance: MCP inspector connects; tools vanish when grants expire; an unconfirmed write returns 403; the OWASP MCP Top 10 red-team suite passes.

**P6.2 Studio copilot, grounded and verified.** Size L. Depends on: P2.11, P5.8.
- Solution: BYOAI copilot in Studio and the Lab with catalogue, contract and twin tools; "works" only with a passing run id.
- Acceptance: on a 30-question evaluation set, every "works" links a run, and unknowns are labelled.

**P6.3 Behavioural anomaly detection with graded auto-containment.** Size L. Depends on: P3.6, P3.7.
- Solution: per-key baselines; first-seen events; a bulk-extraction signature. Responses step up: alert, then THROTTLE, then READ_ONLY. FREEZE is set only by a person. A 30-day shadow false-positive report comes first.
- Acceptance: replayed attack traffic is throttled within 2 minutes.

**P6.4 Evidence vault: SIEM streaming, access reviews, evidence packs.** Size L. Depends on: P3.10, P3.4.
- Solution: OCSF events to SIEM; quarterly recertification; one-click SOC 2, ISO 27001:2022 and GDPR Art. 30/33 packs; continuous control checks.
- Acceptance: SIEM receives every decision within 60 seconds; unrecertified grants expire.

**P6.5 End-user acting-for and consent ledger.** Size L. Depends on: P2.5, P3.5, P4.3.
- Solution: RFC 8693 `sub`/`act` tokens [E52]; policy can require `sub`; consent records per ISO/IEC TS 27560; withdrawing consent triggers containment.
- Acceptance: PERSONAL_DATA interfaces refuse calls without `sub`; withdrawal stops calls within 1 minute.

**P6.6 Digital Access estimator and chargeback.** Size M. Depends on: P2.4.
- Solution: map create interfaces to SAP's nine document types and count line items [E18]; monthly estimates; cost-centre export.
- Acceptance: estimates reconcile with audit rows.

**P6.7 Governed OData facade per solution.** Size L. Depends on: P1.4, P1.5.
- Solution: an OData V4 facade exposing only granted sets and fields, through the pipeline, with the SAP host hidden.
- Acceptance: Excel and Power BI open it; field scope is enforced.

**After P6:** full 3.3%, partial 14.8%; lifecycle stages full: 13.

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
8. **Our own identity provider, KMS, HSM or SIEM.** Federate with existing ones.
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
| Capacity: about 50-80 engineer-months [estimate] | Late or partial delivery | Each phase ships value on its own; cut by ranked blockers and the TTFC funnel; Phase 5 built by demand |
| Twin fidelity | Green on the twin, red on the tenant | TWIN label everywhere; conformance measured against X5M; recorded mode; DEV/TEST monitors; twin runs never satisfy gates |
| ABAP unknowns: OAuth client credentials on ABAP Cloud and OA2C_CONFIG; TLS trust; Gateway catalogue access [unverified] | ABAP cells stay partial | SAP-documented "Unauthenticated" fallback [E20]; an early ABAP spike in Phase 2 |
| Vercel limits: function duration, WebSockets in beta, inbound mTLS unknown, static IP cost | Connector and runtime cannot live on Vercel | Relay, jobs and connector run off Vercel by design; consumer mTLS full only when self-hosted |
| Connector supply chain | Foothold in customer networks | Signed builds, SBOM, customer-controlled updates and access list, short-lived certificates, local log, penetration test |
| RFC SDK and JCo licensing [unverified] | RFC adapter cannot ship bundled | Customer supplies them; prefer OData and SOAP |
| Pressure to self-approve DEV | Governance diluted | Twin is free; DEV and above keep two people; shorten TTFRC with checklists instead |
| Auto-containment false positives | Business outage | Graded response; FREEZE set only by a person; 30-day shadow report |
| Policy latency on serverless | Slower calls | TypeScript evaluator first; Cedar only under 10 ms p95 |
| Multi-tenant blast radius | Data leak across organisations | Throw-mode guard (P0.12), then row-level security, then regional cells |
| PII in fixtures and idempotency rows (`src/lib/northbound/idempotency.ts:33,218`) | Personal data spreads | Masking (P1.5); untagged fields treated as "review required" |
| Licence and IP ownership (`LICENSE:8-14`) | Cannot distribute SDKs, CLI or connector | Decision D1 before the first publish |
| Verification debt | "Full" claims not true | "Untested" badges scored partial (P1.8) |
| Merging `custom-service-path` (204 files differ from local `main`) | Conflicts with P0.1 and P0.14 | Land P1.1 per protocol first, before P0.14 moves route code, or rebase with golden refusal tests |
| Projections mistaken for results | Over-promising | Only simulator output is quoted (section 8.1); the 30-45% hand estimate is withdrawn |
| Shared production host holds third-party client data [R1 §1] | Exposure if real SAP credentials are stored | No real SAP credentials on the shared host until P0.10 and P0.12; customers run their own copy |

### 9.3 Open decisions for the product owner

| # | Decision | Options | Recommendation |
|---|---|---|---|
| D1 | Licence for distributed parts (SDKs, CLI, Action, connector, self-host) | Proprietary; open-source client parts only; all source-available | Apache-2.0 for client artefacts; platform proprietary. Confirm employer IP position first |
| D2 | Legal reading of SAP API Policy §1.2 (custom APIs on S/4 Public) and §2.2.2 (agents, bulk) | Proceed; proceed with sign-off; restrict | Get a reading before marketing P1.1 for S/4 Public and before P6.1 |
| D3 | Breadth strategy | Clone Integration Suite breadth; pair with it | Pair: CoreEdge as the governed developer front door, IS as backend for B2B and long tail |
| D4 | First target landscape | S/4 Cloud Public first; RISE/on-premise first | Decides whether P4 moves ahead of P3. Default keeps P3 first |
| D5 | Hosting model | Shared SaaS only; dedicated cells; self-host; hybrid | All four on one codebase (P4.5); no real SAP credentials on the shared host until P0 is done |
| D6 | How to measure success | Uniform scenario coverage; demand-weighted coverage; TTFC/TTFRC funnel | Weight the matrix by observed demand and report it beside the uniform figure; treat TTFC and TTFRC as the north-star metrics |
| D7 | Can the two-person rule ever be relaxed? | Never; DEV only; org presets | Never at DEV and above; the twin removes the need |
| D8 | Commercial model (`docs/coreedge/COMMERCIAL-DECISIONS.md`) | Per call; per app; per tenant | Decide before P6.6; publish "one call = one unit" |
| D9 | Data residency and audit retention defaults | 30 days; 13 months | 13 months for governance rows; region field per organisation |
| D10 | Whether runtime AI agents ship at all | Ship (P6.1); Studio MCP only | Studio MCP in P2; runtime MCP only after D2 |
| D11 | Vercel plan features (Static IPs, Secure Compute) | Buy; self-host NAT; connector only | Connector for private systems; Static IPs only if an S/4 customer requires IP allow-listing |

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
- A sixth value [inferred: API_KEY].

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

Each line is an acceptance test. They are restated from the roadmap synthesis.

1. **Time to first call:** 30 minutes or less from sign-up to a passing twin call with no admin involved (JS/TS, Python, Java, .NET, ABAP Cloud; 60 minutes for ABAP on-premise). Measured by `DeveloperJourneyEvent`: median across at least 10 observed users.
2. **Time to first real call:** 1 business day or less from an approved DEV grant request to the first audited 200 on a real DEV tenant.
3. **Customer-built APIs:** a `Z*` or `YY1_*` OData V2/V4 service on an internet-reachable tenant can be registered, verified live, tested, called and audited with no code change and no catalogue import.
4. **Real programs:** key lookup, allow-listed `$filter`/`$select`/`$orderby`/`$expand`, opaque paging, PATCH with ETag, DELETE, actions and `$batch`, each granted separately; a conformance suite passes on V2 and V4 against the X5M lab and its twin.
5. **Postman before code:** build, assert, chain, save, export (Postman, Bruno, `.http`) and run in CI; a newcomer does it in under 10 minutes.
6. **Governed before commit:** `verify` and `can-i-deploy` exit non-zero on an undeclared interface, a missing or expiring grant, a breaking contract change, a failing suite or a token literal. They run through OIDC with no stored secret.
7. **Every language:** TS, Python, Java, .NET and ABAP (Cloud and classic, abaplint-clean) SDKs pass one shared conformance script; the Power Platform connector gives typed fields.
8. **Containment:** a switch at any scope stops 100% of matching calls within 5 seconds; every refusal carries a named reason and a decision id.
9. **No side doors:** a static test proves every route reaching SAP uses the pipeline and writes an audit row.
10. **Every permutation simulated:** the checked-in simulator recomputes all 1,119,744 permutations from code; a governance property test runs more than 10,000 combinations on every PR; Control Tower shows a parity scorecard with last-proved times.
11. **Easy set-up:** `docker compose up` reaches a governed SANDBOX call in 15 minutes or less; a connector reaches on-premise or RISE with no inbound port and no SAP-side change.
12. **No upgrade surprises:** a breaking change on TEST raises an incident naming the apps and owners before PROD is upgraded; `can-i-deploy` fails until it is acknowledged.
13. **Trustworthy evidence:** tampering breaks the hash chain at that row; audit writes fail closed on the write path; export reaches a SIEM within 60 seconds.

### B. How to re-run the simulation

The matrix, cell values, feasibility rule and results are saved alongside this document as **`docs/coreedge/gap-matrix.json`**. Where this appendix and that file disagree, the file is authoritative. The simulator becomes a script in the repository with P0.15 (`scripts/simulate-matrix.ts`, generated from `src/lib/coreedge/capability-registry.ts`). Until then, the algorithm is:

```
levels: none = 0, partial = 1, full = 2
for each target, tech, pattern, origin, network, sapAuth, consumer, consumerAuth:
    if not sapFeasible(target, tech, pattern, origin, network, sapAuth):
        continue                                   # SAP itself cannot do this
    valid += 1
    cells = [ targetTech[target][tech],
              techPattern[tech][pattern],
              sapAuthCells[target][sapAuth],
              consumerAuthCells[consumer][consumerAuth],
              originCells[origin],
              networkCells[network] ]
    level = min(cells)                             # the min rule
    if level == 2: full += 1
    if level >= 1: atLeastPartial += 1
    tally the same per dimension value (byTarget, byTech, ...)
fullPct = full / valid; partialPct = atLeastPartial / valid
lifecycle stages are scored separately (0, 1, 2) per platform and phase
```

**To model a phase:** start from today's CoreEdge cells, apply that phase's and all earlier phases' cell upgrades (stored per phase in the file), and recompute.

**To rank blockers:** for each cell, set it to full, recompute, and sort by the gain in valid scenarios. Repeat with "partial" for the partial ranking.

**Checks after any change:**
- The total must be 1,119,744, and the valid count 497,340, unless the feasibility rule changed.
- Each consumer type must have exactly valid / 9 scenarios.
- Section 3 must be reproduced within 0.1 points before new numbers are quoted.

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
- [E57] S/4HANA Cloud Public release upgrades. https://learning.sap.com/courses/implementing-sap-s-4hana-cloud-public-edition/navigating-release-upgrades
- [E58] SAP API deprecation policy. https://help.sap.com/docs/r/162e64b61a054534978db8d3aa1a41da/Cloud/en-US/5cbfda5a9efe4e97a3e24ddaf7ec5c16.html (summarised via search; page body not fetched [unverified])
- [E59] Power Platform OpenAPI extensions. https://learn.microsoft.com/en-us/connectors/custom-connectors/openapi-extensions
- [E60] openapi-generator README (OpenAPI 3.1 "beta support"). https://raw.githubusercontent.com/OpenAPITools/openapi-generator/master/README.md
- [E61] Business Accelerator Hub Try Out. https://developers.sap.com/tutorials/hcp-abh-test-locally.html
- [E62] Ory Polis. https://github.com/ory/polis
- [E63] SAP CAP consuming services. https://cap.cloud.sap/docs/guides/services/consuming-services
- [E64] Stripe Workbench. https://docs.stripe.com/workbench/overview
- [E65] Integration Suite retry and exception handling. https://help.sap.com/docs/SAP_INTEGRATION_SUITE/9519789d5664487f8b9cd89eba514477/445a0c67ec1441f7807feae2c85ccd2f.html
- [E67] API Management Developer Hub. https://help.sap.com/docs/SAP_INTEGRATION_SUITE/9519789d5664487f8b9cd89eba514477/41f7c452d04443c9b7ab18765a3aa48a.html

**Not verified:**
- Integration Suite list prices: sap.com pricing pages returned HTTP 403, so only conflicting search snippets were seen. They are not used in this document.
- G2, TrustRadius and Gartner review claims: snippets only.
- SAP Note 2903776 (features per edition): needs an SAP login.

### D. Audit findings: status and roadmap item

**Fixed** in batches 1 and 2 (commits `c31a385c` and `33d0ef86`): A00-A13, A20-A28, A31-A37, A39-A41, A48, A49, A53-A55, A64-A68.

**Open (33)**, each assigned to a roadmap item:

| Findings | Subject | Item |
|---|---|---|
| A46, A47, A52, A69 | Activation gates, grant binding, twin activate 500, departed owners | P0.1 |
| A14, A15, A16, A17, A18, A19, A50, A60, A70 | Lane evidence and broker disagreement | P0.2 |
| A29, A30, A45, A51, A58, A59, A61, A62, A63 | Untruthful registers and screens | P0.3 |
| A38, A42, A56, A57 | Stale contracts and fixtures, discovery `callable`, dry-run reason | P0.4 |
| A43, A44 | Rate-limit attribution | P0.5 |
| A71, A72, A73, A74, A75 | Ariba configuration and errors | P0.6 |

**Not in the original 76, found during this study:**
- No MFA check on the `/coreedge` layout or the CoreEdge API routes (inferred from code, not run).
- The tenant-scope guard only logs in production.

Both are covered by P0.12.
