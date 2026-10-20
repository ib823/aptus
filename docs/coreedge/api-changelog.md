# CoreEdge northbound API changelog

What changes for an application that calls the CoreEdge northbound API
(`/api/northbound/v1/*`, or the original `/api/northbound/*`), newest version
first. The policy behind it is in the developer guide
(`docs/coreedge-developer-guide.md`, *API versions and deprecation*).

The same changelog is served as JSON, with no credential, at
`GET /api/northbound/versions` (also `/api/northbound/v1/versions`). Both are
built from `src/lib/northbound/version-policy.ts`;
`tests/unit/northbound/version-policy.test.ts` fails if this file and the
registry disagree on a version or a date.

## How to read a version

- **Version** is a month, `YYYY-MM`. Send it as `CoreEdge-Version: 2026-10` to
  pin it. Every response names the version that served it in the same header.
- **Released** is the day it became available.
- **Deprecated** is the day its deprecation takes effect. From the day it is
  announced, every response it serves carries `Deprecation` (RFC 9745).
- **Sunset** is the day it stops being served. Every response it serves
  carries `Sunset` (RFC 8594) from the day that date is announced. From that
  day a request pinned to it gets `400 UNSUPPORTED_VERSION`, and an unpinned
  request is served the next supported version.
- `—` means not set.

Additive changes (a new route, a new optional request header or parameter, a
new response field or header) ship into the current version and are listed
under it with their date. Breaking changes ship only as a new version.

## 2026-10

- Released: 2026-10-24
- Deprecated: —
- Sunset: —
- Status: supported, and the default for requests that do not pin a version.

The northbound API as it was served before versioning, named. Nothing a caller
sends or receives changed, except the additions marked *Added*.

- Routes: `GET /interfaces`, `GET /interfaces/{id}/schema`,
  `GET /interfaces/{id}/data?limit=N` (1 to 100, default 10) and
  `POST /interfaces/{id}/data/write` (needs `X-CoreEdge-Write-Key` and
  `Idempotency-Key`).
- Served at `/api/northbound/v1/*` and, unchanged, at `/api/northbound/*`.
  Both paths are one implementation.
- *Added:* every response carries `CoreEdge-Version`. A request may pin a
  version with the same header; an unknown or retired version is refused with
  `400 UNSUPPORTED_VERSION`, naming the supported versions.
- *Added:* `GET /versions`, this changelog as JSON. No credential needed.
- Credentials: keys minted from P0.11 start `ce_live_` (PROD) or `ce_test_`;
  keys minted before start `ce_` and keep working until they expire. The
  prefix is never read to authenticate.
- Rate limits are per credential (60 reads and 60 writes a minute) with an
  address backstop: `429 RATE_LIMITED` or `429 RATE_LIMITED_ADDRESS`, and
  `503 LIMITER_UNAVAILABLE` when the limiter cannot be asked.
- A grant authorises the one interface it was approved for (P0.1).
