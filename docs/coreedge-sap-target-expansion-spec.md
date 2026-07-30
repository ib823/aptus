# CoreEdge — SAP target expansion specification

**Status:** specification only. Nothing in this document has been applied.

## How to read this

Three evidence classes, kept apart on purpose. The product's own doctrine is that
an empty result, a missing arrangement and an error must never share a
presentation; the same discipline applies to a design document.

| Marker | Means |
|---|---|
| **VERIFIED** | Read out of this repository at commit `2724211`, or observed against the live deployment. Checkable. |
| **RESEARCH** | From SAP's published documentation. Not observed. Must be confirmed against a real system before anyone builds on it. |
| **UNKNOWN** | Neither. Named so it is not mistaken for either. |

No live SuccessFactors, Ariba, RISE, on-premise or ECC system was available. Every
statement about those systems' behaviour is RESEARCH.

---

# Part 1 — What already exists (VERIFIED)

## 1.1 Products

| Product | State | Protocol | Where |
|---|---|---|---|
| S/4HANA Cloud Public | Live, probed (139/488 on two real tenants) | OData V2 | `SAP_ODATA_PRODUCTS` |
| SuccessFactors | Modelled, unconfigured | OData | `SUCCESSFACTORS_SERVICES` — 3 services on `SF_ODATA_ROOT` |
| Ariba | **Implemented**, unconfigured | REST/JSON | `ariba-connector.ts` |

**Ariba is not a gap.** `ariba-connector.ts` is a complete parallel connector:
OAuth client-credentials (Basic-auth'd token request), `apiKey` header, realm
query parameter, JSON preview. Its header states plainly *"There is no
`$metadata`"* — the OData probe model was not forced onto it; a second mechanism
was built alongside.

`products.ts` carries `protocol: "odata" | "rest"` as a first-class field, so the
two-protocol shape is already load-bearing rather than aspirational.

## 1.2 The edition-aware catalogue already exists

`src/lib/sap-public/dynamic-catalog.ts`:

```ts
const EDITION_FIELD = {
  PUBLIC:  "appliesToPublic",
  PRIVATE: "appliesToPrivate",
  ON_PREM: "appliesToOnPrem",
} as const;
export type SapEdition = keyof typeof EDITION_FIELD;
```

Both catalogue models — `SapHubContent` and `SapApiReference` — carry all three
edition flags. `SapApiReference` additionally carries a protocol field with
`ODATAV4 | ODATAV2 | REST | SOAP | EVENT`, and `odataPath()` already derives the
stable V2 convention `/sap/opu/odata/sap/<apiId>` while marking V4 best-effort
and returning `null` for SOAP and events.

**The infrastructure is built. The data is not:** the bundled seed contains
**0** rows with `appliesToPrivate: true` and **0** with `appliesToOnPrem: true`.

This materially changes the cost of private/on-prem support. It is an import
problem, not an architecture problem.

## 1.3 The one structural gap

```ts
interface SapTenant { key; label; baseUrl; environment? }
```

`sap-client` appears **nowhere in the repository**. Verified by exhaustive grep.

Every tenant is addressed as a distinct `baseUrl`, and `serviceUrl()` is a flat
concatenation:

```ts
function serviceUrl(tenant, service) { return `${tenant.baseUrl}${service.path}`; }
```

## 1.4 Every surface that calls SAP

Four, and all four would need the client parameter:

| Surface | What it does |
|---|---|
| `tdd-connector.ts` → `serviceUrl()` | catalogue inspect, entity-set probe, preview |
| `connection-health.ts` | `GET {baseUrl}{path}/$metadata` — the connection test |
| `northbound/read.ts` | runtime read on behalf of a credential |
| `northbound/write.ts` | runtime write |

`SapConnection` already carries `apiPath` and `timeoutMs`, so per-connection path
customisation exists. It does not carry a client.

---

# Part 2 — The three unbuilt targets, code-side (VERIFIED derivation)

## 2.1 S/4HANA on-premise and RISE (S/4HANA Cloud Private)

These are one target for CoreEdge's purposes. RISE is on-premise hosted by SAP;
the protocol, addressing and catalogue problems are identical. Only the network
path and who holds the operations contract differ.

### Change 1 — client addressing

`SapTenant` and `SapConnection` gain an optional client:

```ts
interface SapTenant { key; label; baseUrl; client?: string; environment? }
```

`serviceUrl()` must append `sap-client` when present. It cannot be folded into
`baseUrl` as a query string, because `serviceUrl` concatenates a path after it —
`https://host?sap-client=100` + `/sap/opu/odata/...` is malformed.

All four calling surfaces in §1.4 must route through one URL builder rather than
four concatenations. That consolidation is worth doing on its own merits: four
places that build a SAP URL is four places to forget a parameter.

### Change 2 — the environment binding rule

`binding-refused` compares a credential's environment against the connection's.
On-premise, a landscape stage is **system + client**: `DEV/100` and `DEV/080` are
different data containers in one system. Either the environment string becomes
qualified, or two connections in one stage collide as `AMBIGUOUS` — which is
exactly what happened with X5M/100 and X5M/080 on the live deployment and forced
a `TEST`/`DEV` labelling that misdescribes the landscape.

**This is a real decision, not a detail.** The current model assumes one tenant
per landscape stage. SAP hands you several.

### Change 3 — catalogue source

`dynamic-catalog.ts` already accepts `edition: "ON_PREM"`. Two things are missing:

1. **Data.** No on-prem rows in the seed (§1.2).
2. **Customer-specific services.** An on-premise system exposes whatever the
   customer activated, including `Z*` services SAP's Hub has never published. The
   Hub catalogue is necessarily incomplete for these systems, and presenting it as
   the catalogue would assert coverage the product does not have.

The honest shape is a **third source**: services discovered from the tenant's own
Gateway catalogue, marked as such, rather than merged silently into Hub content.
The `source` distinction already exists for tenants (`connection` vs
`environment`) and the same discipline applies here.

### Change 4 — CSRF for writes

`extractCookies()` exists in `tdd-connector.ts`, so cookie handling is partly
present. It is not wired as a write precondition. On-premise Gateway requires a
fetch-then-use CSRF token for any modifying call.

### Change 5 — network reachability

Not code. SAP Cloud Connector, private link, or IP allowlisting. This is usually
the longest-lead item and it is a customer infrastructure decision.

## 2.2 ECC

**A prior decision is required before any specification is meaningful.**

If the customer has NetWeaver Gateway installed and services activated, ECC is
the on-premise target above with an older service catalogue — no additional work
beyond §2.1.

If they do not, ECC exposes no OData at all. Integration is RFC/BAPI, IDoc or
SOAP, none of which CoreEdge's model addresses: there is no `$metadata`, no
entity set, no `service.path`, and the honest-status vocabulary has nothing to
probe. Supporting it would mean a third connector alongside OData and REST, and
almost certainly a middleware dependency.

**Recommendation:** treat "does the customer have Gateway?" as a qualifying
question, and do not commit to Gateway-less ECC without deciding it is a
different product.

## 2.3 What "Activated" must mean

The word currently means one thing: a live probe returned 200 for `$metadata`.

| Target | Evidence available | Consequence |
|---|---|---|
| S/4 Public / RISE / on-prem | `$metadata` | unchanged |
| SuccessFactors | `$metadata` | unchanged |
| Ariba | none — REST, no metadata document | needs its own evidence basis |
| ECC without Gateway | none | not probeable in this model |

Ariba is already implemented and already exempt from the OData probe path, so the
question is live today, not hypothetical: **what earns the word "Activated" for a
REST product?** A successful catalogue call is the obvious candidate, but it is a
different assertion from "metadata reachable" and should not silently share the
badge.

The alternative — one word meaning different things per product — is precisely
the conflation the doctrine exists to prevent.

---

# Part 3 — SAP-side findings (RESEARCH — confirm before building)

## 3.1 On-premise service catalogue

The Gateway catalogue service is exposed at
`/sap/opu/odata/IWFND/CATALOGSERVICE`, and the ICF node
`sap-opu-iwfnd-catalogservice` must be active (`SICF`). This is the mechanism
that would answer "what does this system actually expose", including `Z*`
services.

**Confirm:** the exact path on the customer's release, whether V4 services appear
in the same catalogue or a separate one, and what authorisation the service user
needs to read it.

## 3.2 sap-client as a URL parameter

Confirmed in SAP documentation as a query parameter on OData URLs, e.g.
`/sap/api_digitalvehicle/srvd_a2x/sap/digitalvehicle/0001/?sap-client=900`.

**Confirm:** whether the customer's landscape mandates it or infers a default
client, and whether their reverse proxy strips or rewrites it.

## 3.3 SuccessFactors authentication — a dated deadline

SAP is **removing HTTP Basic authentication for SuccessFactors APIs on
20 November 2026.** The supported paths are OAuth 2.0 SAML Bearer Assertion,
X.509 mutual TLS, or OpenID Connect via SAP IAS.

CoreEdge's `SapAuthType` is `basic | bearer | oauth-client-credentials`. **None of
these is the SAML bearer assertion flow**, which requires an X.509 keypair, a
registered API key, and an assertion-for-token exchange.

So SuccessFactors is not merely unconfigured — it is configured for an auth
method with a published removal date roughly four months out. That makes it the
most time-sensitive item in this document, and it is not the one I would have
guessed.

**Confirm:** whether the intended SF tenant already uses OAuth, and whether the
assertion will come from a trusted IdP or be generated locally.

## 3.4 Cloud Connector

RISE and on-premise systems are typically not internet-reachable. SAP Cloud
Connector or a private link is the usual path.

**UNKNOWN:** whether CoreEdge's hosting (Vercel) can reach a Cloud Connector at
all without an intermediary. This is an architecture question with no code answer
and should be settled before any RISE commitment.

---

# Part 4 — Sequencing

Ordered by time-sensitivity and by what the evidence actually supports, not by
commercial appeal.

**1. SuccessFactors auth — dated.** Basic auth removal is 20 Nov 2026 and the
required flow is unimplemented. Smallest change of the three (still OData, still
host-addressed), and the only one with a deadline attached.

**2. Ariba's "Activated" definition.** Already shipped, already exempt from the
probe, and the vocabulary question is unresolved today. Cheap to settle, and it
is a doctrine question rather than a feature.

**3. On-premise / RISE.** The largest change and the most valuable. Blocked on two
decisions that are not mine: the environment-binding model for system+client, and
whether the hosting can reach a Cloud Connector.

**4. ECC.** Qualify first. Do not specify further until "is there a Gateway?" is
answered.

## What needs a live system

Everything in Part 3. Specifically: the Gateway catalogue path and its
authorisation model, whether `sap-client` survives the customer's proxy, and the
SF assertion flow end to end. The X5M experience is the argument — reading the
documentation would never have found that 139 services report metadata-reachable
while every data read returns 403.

---

## Sources

- [Catalog Service — SAP Help Portal](https://help.sap.com/docs/ABAP_PLATFORM_NEW/68bf513362174d54b58cddec28794093/7ca326519eff236ee10000000a445394.html)
- [Troubleshooting connectivity for OData V4 service on ABAP system — SAP Help Portal](https://help.sap.com/docs/SUPPORT_CONTENT/fioritech/5835468205.html)
- [Activate standard OData V2 API on S/4HANA — SAP Community](https://blogs.sap.com/2022/08/31/activate-standard-odata-v2-api-on-s-4hana-consume-test-using-gateway-client)
- [Authentication Using OAuth 2.0 — SAP SuccessFactors API Reference (OData V2)](https://help.sap.com/docs/successfactors-platform/sap-successfactors-api-reference-guide-odata-v2/authentication-using-oauth-2-0)
- [Deprecation of Basic Authentication for APIs — SAP Help Portal](https://help.sap.com/docs/successfactors-release-information/8e0d540f96474717bbf18df51e54e522/fcc05a902b4140e585d968c2fe4a96bc.html)
- [SuccessFactors API using OAuth via SAML Assertion — SAP Community](https://community.sap.com/t5/technology-blog-posts-by-members/successfactors-api-using-oauth-authentication-method-via-sap-offline-saml/ba-p/14217261)
