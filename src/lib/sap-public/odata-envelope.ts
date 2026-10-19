/**
 * Stripping SAP's OData envelope from a record before it leaves the product.
 *
 * WHY THIS EXISTS. Every OData V2 row SAP Gateway returns carries `__metadata`
 * (`uri`, `id`, and `media_src` / `edit_media` on media entities) and, for each
 * navigation property it did not expand, `{ "__deferred": { "uri": ... } }`. V4
 * carries `@odata.context`, `@odata.id`, `@odata.editLink`,
 * `<nav>@odata.navigationLink` and their relatives. Every one of those is an
 * ABSOLUTE URL on the connection's own host — for on-premise and RISE an
 * internal hostname and port. The broker exists so the developer's app never
 * learns that host: the connection is redacted before it reaches a client,
 * refusal messages never name a URL, and failure reasons collapse anything that
 * could carry one. The rows themselves went out verbatim, so every record said
 * what all of that was careful not to.
 *
 * None of it is data. It is SAP describing how to address SAP directly, which
 * is the one thing a caller of the broker must not do.
 *
 * ONE FUNCTION, SEVERAL SINKS. The broker's read and write, the env-tenant
 * preview, the captured schema and the recorded fixtures all receive the same
 * rows. Each used to decide for itself what counted as noise, and they decided
 * differently — schema capture dropped `__metadata` and kept the deferred
 * navigations, the preview dropped both top-level keys and nothing nested, and
 * fixture capture dropped nothing at all. One rule here means the contract
 * describes the rows that are served, and the mock serves the rows the contract
 * describes.
 *
 * WHAT IT DOES NOT DO is reshape the record. An expanded V2 navigation stays
 * `{ results: [...] }` — its rows are stripped and its `__next` link (another
 * absolute URL) is dropped, but turning it into a bare array would change the
 * shape a consumer already parses, and that is not needed to keep the host in.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/*
 * `__metadata` and `__deferred` are V2's envelope; `__next` is V2's paging link
 * on an expanded collection. `__count` is kept: it is a number the caller asked
 * for, not an address.
 */
const V2_ENVELOPE_KEYS = new Set(["__metadata", "__deferred", "__next"]);

/**
 * V4 control information is any key carrying `@odata.` — on the row itself
 * (`@odata.etag`, `@odata.id`) or attached to a property (`to_Item@odata.navigationLink`).
 * An OData property name cannot contain `@`, so this never matches a field.
 */
function isEnvelopeKey(key: string): boolean {
  return V2_ENVELOPE_KEYS.has(key) || key.includes("@odata.");
}

/** An unexpanded V2 navigation: `{ "__deferred": { "uri": "https://<host>/..." } }`. */
function isDeferredNavigation(value: unknown): boolean {
  return isPlainObject(value) && Object.keys(value).length === 1 && "__deferred" in value;
}

function stripValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripValue);
  if (isPlainObject(value)) return stripODataEnvelope(value);
  return value;
}

/**
 * The record without SAP's envelope, recursively. Returns a new object; the
 * input is not modified.
 */
export function stripODataEnvelope(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    // An unexpanded navigation is omitted rather than emptied: what remains of
    // it without the URI is nothing, and `{}` would read as an empty entity.
    if (isEnvelopeKey(key) || isDeferredNavigation(value)) continue;
    out[key] = stripValue(value);
  }
  return out;
}
