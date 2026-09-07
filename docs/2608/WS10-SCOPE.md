# WS10 — Integration & external connectivity coverage

Status: **scope only**. Nothing in this document is built.
Written 2026-09-07 against `main` @ `d1ffa63` (WS9.1).

Origin: the To-Be Process Pack produced for the first bid engagement covers
scope items,
process steps and SSCUI configuration. It does not cover integration. This
document says exactly what is missing, what is already present and was
mis-reported as missing, and what it would take to close the gap.

---

## 0. Correction to the earlier assessment

An earlier note in this programme said, of the iFlows / Events / Data Products /
Integration Adapters counted by the Hub harvest:

> "None are in the repo as rows (`api-hub-catalog.json` stores APIs only)."

**That is wrong for five of them.** `api-hub-catalog.json` does store APIs only,
but it is not the only output of the harvest. `scripts/harvest-sap-api-hub.ts`
also writes `sap-references/hub-harvest/<TYPE>.json`, and those files are in the
repository today:

| File | Rows | In the 235 S/4-Public packages |
|---|---:|---:|
| `hub-harvest/BADI.json` | 3,214 | 1,715 |
| `hub-harvest/INTEGRATION.json` (iFlows) | 4,502 | 952 |
| `hub-harvest/SCENARIO.json` | 734 | 308 |
| `hub-harvest/BO_INTERFACE.json` | 478 | 221 |
| `hub-harvest/EVENT.json` | 496 | 147 |

`scripts/import-sap-hub-content.ts` already reads that directory
(`HARVEST_DIR`, resolved in `resolveSources`) and upserts into `SapHubContent`
keyed by `(contentType, externalId)`. The `SapHubContentType` enum already has
`EVENT`, `INTEGRATION`, `SCENARIO`, `BO_INTERFACE`, `BADI`.

So the integration surface is **harvested and importable**. What is true is that
none of it reaches the To-Be pack, and none of it is linked to a scope item.
WS10 is therefore materially smaller than the earlier note implied on the
harvest side, and materially harder on the linkage side.

---

## 1. What is genuinely absent

`_provenance.unmappedArtifactTypes` in `api-hub-catalog.json` is the harvest's
own record of what it counted and refused to carry, because `HUB_TYPE_MAP` has
five entries:

```
DataProduct 334 · ValueMapping 281 · MessageMapping 255 · BusinessObject 152
BRProject 100 · IntegrationAdapter 91 · VisibilityScenario 81 · ScriptCollection 62
ICD 62 · Process 59 · PolicyTemplate 25 · Solution 14 · BusinessRules 6
OData Service 2 · DataHub Solutions 1
```

1,525 artefacts across 15 types. For an integration deliverable the two that
matter are **DataProduct (334)** and **IntegrationAdapter (91)**; `Process`,
`BusinessObject` and the mapping types are secondary.

CDS views (19,122 hub-wide) and Builds (6,751) are deliberately counts-only —
`COUNT_ONLY_TYPES` in the harvest, with the reasoning recorded there and the
tallies in `hub-artifact-counts.json`. WS10 does not change that.

---

## 2. The linkage gap, measured — **CORRECTED 2026-09-07**

> **This section drew the wrong conclusion, and WS13 landed the evidence that
> shows it.** Every measurement below is accurate: those are the Business
> Accelerator Hub's rows and the Hub does not carry the mapping. What does not
> follow is "there is no evidence path". SAP publishes the mapping as an
> ordinary help.sap.com table — *Available Interfaces for Your Selected Scope*,
> 2608, eight columns including Communication Scenario ID, 5,658 rows over 354
> scope items — that aptus had never read. `sap-references/comm-scenarios/`
> holds it now: 1,149 scope-item ↔ scenario links, every one `PUBLISHED`.
>
> The error was of a familiar kind for this programme: measuring one source
> exhaustively and concluding about the product. WS9.1 was the same shape, and
> so was WS11's reading of the process-step master. Keep the measurements
> below; read them as a fact about the Hub, not about SAP.

This is the part that cannot be solved by harvesting more.

Measured on 2026-09-07 against the committed harvest and the 822-item 2608
scope catalogue:

| Question | Answer |
|---|---|
| Harvested API rows carrying `scopeItemCodes` | **0 of 5,419** |
| API rows carrying `communicationScenarios` | **0 of 5,419** |
| iFlow rows whose title/description/id contains any of the 822 scope codes | **0 of 4,502** |
| Event rows, same test | **0 of 496** |
| Scenario rows, same test | **0 of 734** |
| iFlow rows mentioning any `SAP_COM_*` scenario id | **6 of 4,502** |
| Fiori Apps Library data anywhere in the repo | **none** |

`SapApiReference.scopeItemCodes` and `SapHubContent.scopeItemCodes` exist as
columns and are read by the classifier (GIN-indexed) and by
`src/lib/sap-public/hub-dependencies.ts`. They are populated only from a
**human-downloaded** Hub export that carries a `Business Scenarios` /
`scopeItems` column (`src/lib/sap-public/api-reference-import.ts:184`). The
anonymous harvest carries no such field.

So "which APIs does J58 need?" has **no evidence path in the repository today**,
and no text-derivable one either. Any answer produced now is an assertion.

### The three candidate bridges, ranked

**(a) Communication scenarios — the only SAP-published bridge.**
Each scope item's setup instructions name its communication arrangements
(`SAP_COM_0008` and similar); each Hub API page names the communication
scenarios it belongs to. Joining the two gives a *published* scope-item ↔ API
mapping. Neither half is in the repo: the 2608 drop under `sap-references/2608/`
contains no communication-scenario file, and the anonymous catalogue route does
not expose the scenario association. **This needs a new source** — either a
logged-in Hub export or the scope-item setup instructions in machine-readable
form. This is the only route that yields links we may label PUBLISHED.

**(b) Fiori app → OData service.**
aptus holds 14,088 process-step rows carrying `fioriAppId`, and each scope item
owns its steps. The SAP Fiori Apps Library publishes, per app, the OData
services it consumes. That composes to scope item → app → service → API.
No Fiori Apps Library data exists in the repo (searched; zero files). **Also a
new source.** Weaker than (a) — an app's service is not the same claim as "this
scope item integrates via this API" — but it is evidence, not inference.

**(c) Line of business + package heuristic.**
Derivable from what we hold today. `lineOfBusiness` is populated on only 1,428
of 5,419 API rows (3,991 null), and it is a 54-value taxonomy against 822 scope
items. This produces broad buckets, not links. Usable as a **ranking** signal
inside a consultant UI; never as a stated mapping.

**Hard rule for WS10:** every link row carries a `linkSource` of
`PUBLISHED | DERIVED | CONSULTANT`, and nothing renders in a client-facing
artefact as an SAP-published fact unless it is `PUBLISHED`. This is the same
discipline as `Activated is what we observed, not what exists` and the harvest's
`completeness: "floor"`.

---

## 3. Connectivity design — what already exists

The earlier note said there is "no middleware topology, protocols,
authentication, error handling, volumetrics or interface inventory". The
*schema* for most of that exists. `model IntegrationPoint`
(`prisma/schema.prisma:2131`) already carries:

```
direction (INBOUND/OUTBOUND/BIDIRECTIONAL) · sourceSystem · targetSystem
interfaceType (API/IDOC/FILE/RFC/ODATA/EVENT) · frequency · middleware
(SAP_CPI/SAP_PO/MULESOFT/BOOMI/AZURE_INTEGRATION/OTHER) · dataVolume
complexity · priority · status · estimatedEffortDays · dataObjects
functionalArea · technicalNotes
```

Two things are missing, and they are the whole point:

1. **No binding to a published artefact.** An `IntegrationPoint` is free text.
   A consultant can name an API that does not exist, is deprecated, or is not
   available on Public Edition, and nothing objects. This is the same class of
   defect WS8 fixed for the APIs aptus itself calls.
2. **Nothing populates it from the catalogue.** It is assessment-scoped and
   entirely consultant-entered.

Authentication and error handling have no model at all. Those stay out of scope
(see §6).

---

## 4. Product-scoped figures for the bid

The hub-wide totals in §1 span Private Edition, Ariba, SuccessFactors and
partner content. For the engagement on **SAP Cloud ERP, Public Edition, content release
2608**, the relevant surface is smaller and is already pinned in
`HUB_FACTS_2608` (`scripts/recon-hub-2608.ts:35`):

| | Count |
|---|---:|
| APIs | 859 (803 ACTIVE · 56 DEPRECATED) |
| — by sub-type | ODataV4 365 · OData v2 205 · SOAP 289 |
| Events | 147 (139 ACTIVE · 8 DEPRECATED) |
| iFlows in the 235 S/4-Public packages | 952 |
| BO interfaces | 221 |
| BAdIs | 1,715 |
| CDS views | 9,288 (counts only) |

The SAP product page states "Integrations 158", which counts packages, not
artefacts; `recon-hub-2608.ts` already records that divergence as informational.
WS10 must not silently pick one.

---

## 5. WS10 work breakdown

Branch: `feat/integration-catalogue-2608`, from `main`.
Additive migrations only. RECON must be green before and after.

**WS10.0 — Design from the code map.** Confirm the §2 measurements against the
live database (`pnpm sap:hub:recon-2608 --db`), which this document could not do
— all §2 figures come from the committed harvest files, not from prod. Record
the actual `SapHubContent` row counts by `contentType` and by `releaseId`.

**WS10.1 — Harvest completeness.** Extend `HUB_TYPE_MAP` to carry
`DataProduct` and `IntegrationAdapter` (new `SapHubContentType` values,
additive enum migration), re-run `pnpm sap:hub:harvest`, commit the two new
`hub-harvest/*.json` files. For the other 13 unmapped types, record a one-line
decision each in this document — carried, counts-only, or refused with reason.
Zero silent omissions. Watch the bundling constraint the harvest header
records: `hub-content-bundled.ts` statically imports some of these files, so
new high-volume types must stay out of the static import set.

**WS10.2 — Import and release scoping.** `pnpm sap:hub:import` already reads
`hub-harvest/`. Verify every imported row lands with the right
`appliesToPublic/Private/OnPrem` flags and a `releaseId` pointing at the 2608
`SapContentRelease`. Today the harvest rows carry `catalogueRelease` from the
owning package version; confirm that reaches the row.

**WS10.3 — The linkage.** The substance of WS10.
- Land a communication-scenario source (route (a)) if one can be obtained;
  otherwise record the refusal in BUILD-LOG and ship WS10 without PUBLISHED
  links rather than manufacturing them.
- New model `ScopeIntegrationLink { scopeCode, releaseId, contentType,
  externalId, linkSource, evidence, createdBy }`, unique on
  `(scopeCode, releaseId, contentType, externalId)`, GIN index on `scopeCode`.
- `linkSource` enum `PUBLISHED | DERIVED | CONSULTANT`, never defaulted.
- `evidence` is a required non-empty string on every row: the scenario id, the
  Fiori app id, or the consultant's justification. A row with no evidence is
  rejected at write time, not at render time.

**WS10.4 — Bind `IntegrationPoint` to the catalogue.** Nullable
`hubContentId` / `hubExternalId` + the artefact's `hubState` captured at
citation time, so a point citing a DEPRECATED API says so on the page rather
than in someone's memory. Mirrors the WS8 wired-API registry pattern.

**WS10.5 — Surface it in the pack.** Extend `TobePackDoc`
(`src/lib/tobe/types.ts:164`) with an integration section per scope item —
APIs, events, iFlows, data products, each with its `linkSource` and `hubState`
— and render it in the L1/L2 SVG, PDF and PPTX exports. `CONSULTANT` and
`DERIVED` rows must be visually distinct from `PUBLISHED` in the client-facing
export. Zero links for a scope item renders as "no published integration
content", never as an empty table that reads like completeness.

**WS10.6 — RECON, gates, BUILD-LOG, PR.** New facts in `HUB_FACTS_2608`:
`dataProducts`, `integrationAdapters`, `scopeIntegrationLinks` (total and by
`linkSource`), `integrationPointsCitingDeprecated` (hard gate: must be 0 for a
client-facing export). Full gate set: typecheck · lint · unit ·
migration-integrity · product-agnostic grep · consultant wall · build ·
`pnpm sap:2608:recon` · `pnpm sap:hub:recon-2608 --db` ·
`pnpm sap:connectors:recon`.

---

## 6. Explicitly out of scope

These were named in the gap assessment and WS10 does **not** deliver them.
They are consulting deliverables, not catalogue content, and pretending
otherwise is how a bid gets found out:

- Middleware topology and landscape design (which tenant, which CPI, which
  network path).
- Authentication and credential design per interface.
- Error handling, retry, monitoring and alerting design.
- Volumetrics and sizing.
- Anything asserting what a **tenant** has provisioned. The harvest's own
  caveat holds unchanged: it is what SAP publishes, not what is active on any
  system. Only a probe against a real tenant can say more, and the engagement
  has no tenant yet.

## 7. What WS10 gives the bid

An integration section per scope item, sourced from the 2608 Hub catalogue,
where every line is either an SAP-published fact or is labelled as derived or
consultant-asserted — and where a deprecated artefact cannot be cited silently.
That is defensible under evaluator scrutiny. A complete-looking interface
inventory with no provenance is not.
