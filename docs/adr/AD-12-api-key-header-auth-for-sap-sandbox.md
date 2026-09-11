# AD-12: The connection auth vocabulary has no API-key header, so CoreEdge cannot reach SAP's own sandbox

**Status:** Proposed — owner decision required (raised 2026-09-11, findings register R22 / walkthrough F16)

## Context

A stored `SapConnection` authenticates as one of `basic`, `bearer`,
`oauth_client_credentials` or `oauth_saml_bearer`
(`src/lib/sap-public/connection-resolver.ts`, `SapAuthType`), and all four
produce an `Authorization:` header (`buildAuthHeaderFromConnection`).

SAP's Business Accelerator Hub **sandbox** — the first thing a developer
prototyping against SAP reaches for — requires an `apikey` request header and
ignores `Authorization` entirely.

Verified: a connection to the sandbox with `Authorization: Bearer dummy`
answers `"Failed to resolve API Key variable request.header.apikey"`.

Real tenants (S/4HANA Cloud, SuccessFactors) use basic or OAuth and work as
designed. This bites prototyping only — but prototyping is the on-ramp.

The Ariba connector already sends an `apiKey` header, but only from environment
variables, which a stored connection cannot use.

## Decision

_Not yet taken._ Two options, with a recommendation.

**Option A — declare the sandbox out of scope.** Say so on the Connections
form ("SAP's public sandbox is not supported; connect a real tenant or a
trial system") and in the developer guide. No code beyond copy.

**Option B — add an `api_key` auth type.** `SapAuthType` gains `"api_key"`;
its sealed secrets are `{ headerName, apiKey }` (header name defaulting to
`apikey`); the auth builder returns a header pair instead of assuming
`Authorization`. The SSRF guard, environment binding and audit are untouched —
this is a fifth way to say who you are, not a new path.

Recommendation: **Option B.** It is small (one enum member, one secrets shape,
one branch in the header builder, one form option) and it removes the one
place where the honest answer to "can I try this against SAP's sandbox?" is
currently "no, and nothing tells you until the first call fails".

## Consequences

**Option A**
- Positive: no change to the auth vocabulary or the sealed secret shapes.
- Negative: the obvious first experiment fails, after a real tenant URL has
  been typed into the form.

**Option B**
- Positive: sandbox prototyping works; the header name is configurable, so
  other API-key gateways work too.
- Negative: one more secrets shape to validate on the Connections form; the
  Connections test route must send the header pair the same way the broker
  does (one shared builder — `buildAuthHeaderFromConnection` becomes
  `buildAuthHeadersFromConnection`).
- Neutral: the sandbox returns SAP's demo data, which the Discover badges
  would then report as ACTIVATED for that connection — correct, and the
  connection's own label should say "sandbox".

## Alternatives considered

- **Piggyback on `bearer` and rewrite the header name for a known sandbox
  host**: rejected — a host-specific special case in the header builder is
  exactly the kind of hidden rule the resolver is designed not to have.
