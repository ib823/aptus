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

import { isEnvelopeKey, stripODataEnvelope } from "@/lib/sap-public/odata-envelope";

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
    /**
     * The fields present in EVERY sampled row — the observation `required` is
     * drawn from, kept even when the sample is too small for `required` to
     * assert it (see MIN_SAMPLE_FOR_REQUIRED). Absent on schemas captured
     * before this field existed.
     */
    alwaysPresent?: string[];
    /**
     * "stripped": the rows were put through the broker's envelope rule before
     * anything was inferred from them, so nothing here describes a key the
     * served rows do not carry. Absent on schemas captured before that, which
     * servedResponseSchema reconciles on the way out.
     */
    envelope?: "stripped";
  };
}

/**
 * HOW MANY ROWS BEFORE "PRESENT IN EVERY ROW" MAY BECOME `required`.
 *
 * The generated contract marked all 71 fields of a V4 service required from a
 * FIVE-row sample. The rule — required iff present in every sampled row — is
 * right for V2, where SAP omits nulls, and wrong in effect for a small sample:
 * five rows that all happen to carry a value prove nothing about the sixth,
 * and a consumer's generated validator then rejects the first real row that
 * omits an optional field. Below this floor nothing is asserted required; the
 * observation is still recorded in x-captured.alwaysPresent, and the note says
 * which case the reader is looking at.
 */
export const MIN_SAMPLE_FOR_REQUIRED = 20;

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
    /*
     * OData v2 wraps metadata in `__metadata`; it describes the envelope, not
     * the entity. Removed with the broker's own rule rather than a list kept
     * here: the rows the broker serves carry neither it, nor V2's unexpanded
     * `__deferred` navigations, nor any `@odata.*` key, and a contract that
     * described fields the served rows do not have would make a consumer's
     * validator reject every row. See odata-envelope.ts.
     */
    for (const [key, value] of Object.entries(stripODataEnvelope(row))) {
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
  const alwaysPresent: string[] = [];

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
    // Present in EVERY sampled row. See the header on v2 null-omission — and
    // MIN_SAMPLE_FOR_REQUIRED on when that observation may become `required`.
    if (count === rows.length) alwaysPresent.push(key);
  }

  const assertRequired = rows.length >= MIN_SAMPLE_FOR_REQUIRED;
  const required = assertRequired ? [...alwaysPresent] : [];

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
        "Fields absent from the sample are not described, and additionalProperties stays true. " +
        (assertRequired
          ? `${alwaysPresent.length} field${alwaysPresent.length === 1 ? " was" : "s were"} present in every sampled row and ${alwaysPresent.length === 1 ? "is" : "are"} marked required.`
          : `The sample is below ${MIN_SAMPLE_FOR_REQUIRED} rows, so no field is marked required — ` +
            `${alwaysPresent.length} ${alwaysPresent.length === 1 ? "was" : "were"} present in every sampled row (x-captured.alwaysPresent), which is an observation, not a guarantee.`),
      alwaysPresent,
      envelope: "stripped",
    },
  };
}

/**
 * A stored schema as the rows now served can satisfy it.
 *
 * Schemas captured before inference used the broker's envelope rule were built
 * with a list of four top-level keys instead. Two things got through that the
 * broker now removes from every row it serves: each V2 `to_X: { __deferred }`
 * navigation, recorded as `{ type: "object" }` and — present in every row —
 * put in `required`; and any `@odata.*` key beyond the two the list named.
 * Served as stored, such a contract makes a consumer's validator reject every
 * row, and the kit's own mock (whose fixtures ARE stripped) breaks it too.
 *
 * Applied where a stored schema leaves the product — the kit's openapi.json and
 * client.ts, and the northbound /schema route — the way stored fixtures are
 * cleaned on the way out (stripFixtureEnvelope), so the next download is right
 * without anyone re-capturing. For a schema without the `envelope` marker:
 *
 *  - an envelope key is not described at all: no served row carries one.
 *  - an object-typed field stops being `required` (and `alwaysPresent`) but is
 *    still described. A V2 broker read sends no $expand, so such a field is a
 *    deferred navigation — absent from every served row — or a complex type,
 *    and the stored schema cannot say which. Optional is true of both.
 *
 * A schema carrying the marker, and anything that is not a captured schema, is
 * returned as it is. The input is not modified.
 */
export function servedResponseSchema(schema: unknown): unknown {
  if (!isCapturedSchema(schema)) return schema;
  // The column is `Json?`: a stored schema may predate any part of x-captured.
  const captured = (schema as { "x-captured"?: Partial<CapturedSchema["x-captured"]> })["x-captured"];
  if (captured?.envelope === "stripped") return schema;

  const properties = Object.fromEntries(
    Object.entries(schema.properties).filter(([name]) => !isEnvelopeKey(name)),
  );
  const servable = (name: string) => name in properties && properties[name]?.type !== "object";
  const storedRequired = Array.isArray(schema.required) ? schema.required : [];
  const storedAlwaysPresent = Array.isArray(captured?.alwaysPresent) ? captured.alwaysPresent : [];
  const required = storedRequired.filter(servable);
  const alwaysPresent = storedAlwaysPresent.filter(servable);

  // Nothing either rule touches: what is stored is already what is served.
  if (
    Object.keys(properties).length === Object.keys(schema.properties).length &&
    required.length === storedRequired.length &&
    alwaysPresent.length === storedAlwaysPresent.length
  ) {
    return schema;
  }

  return {
    ...schema,
    properties,
    required,
    ...(captured
      ? {
          "x-captured": {
            ...captured,
            ...(captured.alwaysPresent ? { alwaysPresent } : {}),
            // The stored note counted what was marked required at capture; say
            // why the contract served now asserts less.
            note: [
              captured.note,
              "Captured before CoreEdge stopped serving OData envelope keys and V2's unexpanded navigations: " +
                "those are no longer described, and object-typed fields are no longer marked required. " +
                "Capture schema again to describe the rows exactly as they are served.",
            ]
              .filter(Boolean)
              .join(" "),
          },
        }
      : {}),
  };
}

/** Is a stored value shaped like a schema this module produced? */
export function isCapturedSchema(value: unknown): value is CapturedSchema {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.type === "object" && typeof v.properties === "object" && v.properties !== null;
}
