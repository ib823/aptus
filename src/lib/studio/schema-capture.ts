/**
 * Inferring a response schema from rows we have actually seen.
 *
 * v1's generated OpenAPI declared `additionalProperties: true` and said so
 * plainly, because nothing had inspected the tenant's real field shapes and
 * "asserting fields we have not inspected would be a confident lie inside a
 * contract file". This module removes that limitation the honest way: by
 * observing a real response rather than guessing at one.
 *
 * WHAT IT WILL AND WILL NOT CLAIM:
 *
 *  - A field is only described if it appeared in at least one sampled row.
 *  - A field is only `required` if it appeared in EVERY sampled row. SAP omits
 *    nulls in OData v2 rather than sending them, so a field missing from one row
 *    of ten is genuinely optional in this tenant, whatever the metadata says.
 *  - Conflicting types collapse to no declared type rather than to a guess. A
 *    column that arrived as a number once and a string once is not "number" —
 *    saying so would make a consumer's generated code fail on the second row.
 *  - `additionalProperties` stays TRUE. Ten rows are a sample, not a census: a
 *    field that only appears on unusual records must not make the document
 *    invalid for them.
 *
 * The result is a description of what this tenant returned, which is a much more
 * useful thing than a description of what SAP documents.
 */

export interface CapturedSchema {
  type: "object";
  properties: Record<string, { type?: string; format?: string; nullable?: boolean }>;
  required: string[];
  additionalProperties: true;
  /** Provenance, so a reader knows how much to trust it. */
  "x-captured": {
    sampleSize: number;
    capturedAt: string;
    note: string;
  };
}

/** OData v2 wraps metadata in `__metadata`; it describes the envelope, not the entity. */
const ODATA_NOISE = new Set(["__metadata", "__deferred", "@odata.etag", "@odata.context"]);

function jsonTypeOf(value: unknown): { type?: string; format?: string } | null {
  if (value === null) return null; // null tells us nothing about the type
  if (typeof value === "string") {
    // OData v2 serialises dates as /Date(…)/ and decimals as strings. Recording
    // the format helps a consumer; claiming a non-string TYPE would be wrong,
    // because the wire value really is a string.
    if (/^\/Date\(\d+/.test(value)) return { type: "string", format: "date-time" };
    return { type: "string" };
  }
  if (typeof value === "number") return { type: Number.isInteger(value) ? "integer" : "number" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (Array.isArray(value)) return { type: "array" };
  if (typeof value === "object") return { type: "object" };
  return null;
}

/**
 * Build a schema from sampled rows. Returns null when there is nothing to learn
 * from — the caller then keeps the honest open shape rather than inventing one.
 */
export function inferResponseSchema(
  rows: readonly Record<string, unknown>[],
  capturedAt: Date = new Date(),
): CapturedSchema | null {
  if (rows.length === 0) return null;

  const seenIn = new Map<string, number>();
  const types = new Map<string, Set<string>>();
  const formats = new Map<string, string>();
  const sawNull = new Set<string>();

  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (ODATA_NOISE.has(key)) continue;
      seenIn.set(key, (seenIn.get(key) ?? 0) + 1);
      if (value === null) {
        sawNull.add(key);
        continue;
      }
      const t = jsonTypeOf(value);
      if (!t?.type) continue;
      const set = types.get(key) ?? new Set<string>();
      set.add(t.type);
      types.set(key, set);
      if (t.format) formats.set(key, t.format);
    }
  }

  if (seenIn.size === 0) return null;

  const properties: CapturedSchema["properties"] = {};
  const required: string[] = [];

  for (const [key, count] of [...seenIn.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const observed = types.get(key);
    const prop: CapturedSchema["properties"][string] = {};

    // One consistent type → declare it. Several → declare none, because a wrong
    // type in a contract breaks the consumer's generated code on the row that
    // disagrees, which is worse than saying nothing.
    if (observed && observed.size === 1) {
      const only = [...observed][0];
      if (only) prop.type = only;
      const format = formats.get(key);
      if (format) prop.format = format;
    }
    if (sawNull.has(key)) prop.nullable = true;

    properties[key] = prop;
    // Present in EVERY sampled row → required. See the header on v2 null-omission.
    if (count === rows.length) required.push(key);
  }

  return {
    type: "object",
    properties,
    required,
    // A sample is not a census.
    additionalProperties: true,
    "x-captured": {
      sampleSize: rows.length,
      capturedAt: capturedAt.toISOString(),
      note:
        `Inferred from ${rows.length} live row${rows.length === 1 ? "" : "s"} returned by this tenant. ` +
        "Fields absent from the sample are not described, and additionalProperties stays true.",
    },
  };
}

/** Is a stored value shaped like a schema this module produced? */
export function isCapturedSchema(value: unknown): value is CapturedSchema {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.type === "object" && typeof v.properties === "object" && v.properties !== null;
}
