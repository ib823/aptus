/**
 * Reading SAP's answer to a query CoreEdge built (P1.4, 3.8.3).
 *
 * BY KIND, NEVER BY GUESSING. The legacy read infers a single entity from a
 * body without `value` (read.ts extractRawRecords), which a V4 entity with a
 * property named `value` defeats. Here the kind is known from the request:
 *
 *   LIST rows      V2 `d.results[]`             V4 `value[]`        every element an object
 *   LIST "more"    V2 `d.__next` present        V4 `@odata.nextLink` present
 *   LIST count     V2 `d.__count`, 1-15 digits  V4 `@odata.count`, a safe integer or digit string
 *   KEY row        V2 `d`, unless it is a feed  V4 the top-level object, whatever properties it has
 *
 * A V2 FEED IS `results` AS AN ARRAY. A V2 entry sits directly under `d`, so
 * an entity with an ordinary property named `results` (a string, a number, a
 * complex value) is still the entity; V2 has no collection-valued properties,
 * so only an array there marks a feed, which a key lookup must not get. This
 * is the V2 counterpart of the V4 `value` property.
 *
 * SAP'S NEXT LINK IS A YES OR A NO. Its presence says SAP has more rows than
 * it sent (a server-side page cap); its text is never read, followed, stored
 * or echoed in P1.4a. So nothing CoreEdge fetches next is shaped by SAP's
 * answer, and no SAP-derived string reaches a cursor.
 *
 * THEN EVERY ROW IS STRIPPED AND PROJECTED. stripODataEnvelope removes SAP's
 * envelope (odata-envelope.ts). The projection then builds a fresh
 * null-prototype row by iterating the policy's fields — never SAP's keys —
 * and copying a value only when SAP's row has it as an own property. So a
 * service that ignores $select cannot leak a field the policy does not let
 * the caller read (threat N3), and a hostile key in SAP's row (`__proto__`
 * included) is never copied at all. Key parts sent only for the overlap check
 * are dropped here too.
 */

import { stripODataEnvelope } from "@/lib/sap-public/odata-envelope";
import type { SapQuery } from "@/lib/odata/operation-compiler";

export interface AnswerRow {
  /** Null-prototype; only the projected fields, in policy order. */
  readonly record: Record<string, unknown>;
  /** The row's key, canonical (JSON of the key parts' values in key order), for the overlap check. */
  readonly keyText: string;
}

export type ParsedAnswer =
  | {
      readonly ok: true;
      readonly rows: readonly AnswerRow[];
      /** SAP said it has more rows than it sent (a next link was present). */
      readonly more: boolean;
      /** SAP's total, when it was asked for and given; null otherwise. */
      readonly totalCount: number | null;
      /** SAP returned columns the query did not select (they were projected away). */
      readonly projected: boolean;
    }
  | { readonly ok: false; readonly reason: "INVALID_UPSTREAM_BODY" };

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

const COUNT_TEXT = /^[0-9]{1,15}$/;

function countOf(v: unknown, odata: "V2" | "V4"): number | null {
  if (typeof v === "string" && COUNT_TEXT.test(v)) return Number(v);
  // V4 may send the count as a number, or as a string under IEEE754Compatible.
  if (odata === "V4" && typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return v;
  return null;
}

/** The rows, the "more" signal and the count, by kind. Null when the body is not the shape the kind requires. */
function rowsOf(
  json: unknown,
  kind: SapQuery["kind"],
  odata: "V2" | "V4",
): { rows: Record<string, unknown>[]; more: boolean; count: unknown } | null {
  if (!isObject(json)) return null;
  if (kind === "KEY") {
    if (odata === "V4") return { rows: [json], more: false, count: undefined };
    const d = json.d;
    if (!isObject(d) || Array.isArray(d.results)) return null;
    return { rows: [d], more: false, count: undefined };
  }
  if (odata === "V2") {
    const d = json.d;
    if (!isObject(d) || !Array.isArray(d.results) || !d.results.every(isObject)) return null;
    return { rows: d.results, more: typeof d.__next === "string", count: d.__count };
  }
  const value = json.value;
  if (!Array.isArray(value) || !value.every(isObject)) return null;
  const more = typeof json["@odata.nextLink"] === "string" || typeof json["@nextLink"] === "string";
  return { rows: value, more, count: json["@odata.count"] ?? json["@count"] };
}

/**
 * SAP's 200 answer to `query`, parsed, stripped and projected.
 * `countAsked`: this page asked for a count (page 0 with count=true).
 */
export function readQueryAnswer(json: unknown, query: Pick<SapQuery, "kind" | "odata" | "project" | "selectSent" | "keyParts">, countAsked: boolean): ParsedAnswer {
  const raw = rowsOf(json, query.kind, query.odata);
  if (raw === null) return { ok: false, reason: "INVALID_UPSTREAM_BODY" };
  const expected = new Set(query.selectSent ?? query.project);
  let projected = false;
  const rows: AnswerRow[] = raw.rows.map((row) => {
    const stripped = stripODataEnvelope(row);
    for (const k of Object.keys(stripped)) {
      if (!expected.has(k)) {
        projected = true;
        break;
      }
    }
    const record = Object.create(null) as Record<string, unknown>;
    for (const f of query.project) {
      if (Object.hasOwn(stripped, f)) record[f] = stripped[f];
    }
    const keyText = JSON.stringify(query.keyParts.map((k) => (Object.hasOwn(stripped, k) ? (stripped[k] ?? null) : null)));
    return { record, keyText };
  });
  return {
    ok: true,
    rows,
    more: raw.more,
    totalCount: countAsked ? countOf(raw.count, query.odata) : null,
    projected,
  };
}
