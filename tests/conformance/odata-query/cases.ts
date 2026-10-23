/**
 * The tier-1 conformance cases (P1.4, spec 3.21 item 7), V2 and V4.
 *
 * Each case is what a caller sends to /data, the exact requests CoreEdge must
 * make of SAP for it (the golden SAP URL, decoded, in order, with its
 * headers), SAP's recorded answer, and what the caller must be told.
 *
 * PROVENANCE (roadmap §9.1 #17, D17). Every answer here is written for this
 * repository from the OData V2 and V4 JSON formats and the SAP behaviours the
 * spec names, over the invented conformance service
 * (fixtures/conformance.v2.xml and .v4.xml). None is a recording of a real
 * SAP system, and each says so: `provenance: "spec-derived"`. A case a tier-2
 * or tier-3 run confirms is marked `live-verdict:<date>` instead.
 *
 * This file imports nothing from src/.
 */

import type { Exchange, RecordedAnswer, RecordedRequest } from "./replay";

export type Version = "V2" | "V4";

export const SERVICE: Record<Version, string> = {
  V2: "/sap/opu/odata/sap/ZCONF_SRV",
  V4: "/sap/opu/odata4/sap/zconf/srvd_a2x/sap/zconf/0001",
};
export const SAP_CLIENT = "100";
/** The host SAP writes into every envelope link: it must never reach the caller. */
export const CANARY = "https://sap-host-canary-7f3a.example.invalid:44300";

/* ── the policies the cases run under ─────────────────────────────────── */

export interface PolicySource {
  v: 1;
  select: "*" | string[];
  filter: { field: string; ops: string[] }[];
  sort: string[];
  requireFilterOn: string[];
  keyLookup: boolean;
  count: boolean;
  page: { defaultSize: number; maxSize: number; rowCap: number; byteCap: number };
}

const PAGE = { defaultSize: 100, maxSize: 500, rowCap: 10_000, byteCap: 4_000_000 };

function policy(over: Partial<PolicySource>): PolicySource {
  return { v: 1, select: "*", filter: [], sort: [], requireFilterOn: [], keyLookup: true, count: false, page: PAGE, ...over };
}

const ITEMS_FILTER = (v: Version) => [
  { field: "ItemId", ops: ["eq", "in"] },
  { field: "Name", ops: ["eq", "in"] },
  { field: "Guid", ops: ["eq"] },
  { field: "Count64", ops: ["eq", "ge", "le"] },
  { field: "Amount", ops: ["gt", "ge", "lt", "le"] },
  { field: "Qty", ops: ["eq", "in"] },
  { field: "Flag", ops: ["eq"] },
  { field: "Posted", ops: ["gt", "ge", "lt", "le"] },
  ...(v === "V2" ? [{ field: "Changed", ops: ["gt", "lt"] }] : []),
  { field: "Stamp", ops: ["gt", "lt"] },
];

export const POLICIES = {
  items: (v: Version) => policy({ filter: ITEMS_FILTER(v), sort: ["ItemId", "Name", "Amount"], count: true }),
  itemsRequireName: (v: Version) => policy({ filter: ITEMS_FILTER(v), sort: ["ItemId"], requireFilterOn: ["Name"] }),
  itemsByteCap: (v: Version) => policy({ filter: ITEMS_FILTER(v), sort: ["ItemId"], page: { ...PAGE, byteCap: 262_144 } }),
  lines: () => policy({ filter: [{ field: "OrderId", ops: ["eq", "in"] }, { field: "LineNo", ops: ["eq"] }], sort: ["OrderId", "LineNo"] }),
  byGuid: () => policy({ filter: [{ field: "Id", ops: ["eq"] }], sort: ["Id"] }),
  byNumber: () => policy({ filter: [{ field: "Num", ops: ["eq"] }], sort: ["Num"] }),
  noPaging: () => policy({ filter: [{ field: "Id", ops: ["eq"] }], sort: ["Id"] }),
  effective: () => policy({ filter: [{ field: "externalCode", ops: ["eq"] }], sort: ["externalCode", "effectiveStartDate"] }),
  drafts: () => policy({ filter: [{ field: "Id", ops: ["eq"] }], sort: ["Id"] }),
} as const;
export type PolicyName = keyof typeof POLICIES;

/** The entity set each policy is for. */
export const POLICY_SET: Record<PolicyName, string> = {
  items: "Items",
  itemsRequireName: "Items",
  itemsByteCap: "Items",
  lines: "Lines",
  byGuid: "ByGuid",
  byNumber: "ByNumber",
  noPaging: "NoPaging",
  effective: "Effective",
  drafts: "Drafts",
};

/** The oracle's types of each set's fields, per version (what the URL's literals must parse as). */
export const ORACLE_TYPES = (v: Version): Record<string, Record<string, "S" | "G" | "B" | "I32" | "I64" | "D" | "DT" | "DTO" | "DA">> => ({
  Items: { ItemId: "S", Name: "S", Guid: "G", Count64: "I64", Amount: "D", Qty: "I32", Flag: "B", Posted: v === "V2" ? "DT" : "DA", Changed: "DT", Stamp: "DTO", Note: "S", value: "S" },
  Lines: { OrderId: "S", LineNo: "I32", Product: "S" },
  ByGuid: { Id: "G", Name: "S" },
  ByNumber: { Num: "I64", Name: "S" },
  NoPaging: { Id: "S", Name: "S" },
  Effective: { externalCode: "S", effectiveStartDate: "DT", name: "S" },
  Drafts: { Id: "S", IsActiveEntity: "B", Name: "S" },
});

/* ── requests and answers ─────────────────────────────────────────────── */

type Pair = readonly [string, string];

/** A query's options, then $format and sap-client: every request CoreEdge sends ends so. */
function request(v: Version, path: string, options: Pair[], legacy = false): RecordedRequest {
  return {
    method: "GET",
    path: `${SERVICE[v]}/${path}`,
    query: [...options, ["$format", "json"], ["sap-client", SAP_CLIENT]],
    accept: "application/json",
    // The legacy read is unchanged: it never sends OData-MaxVersion.
    maxVersion: v === "V4" && !legacy ? "4.0" : null,
  };
}

type Row = Record<string, unknown>;

/** A row as SAP sends it: its envelope, on SAP's own host. */
function enveloped(v: Version, set: string, key: string, fields: Row): Row {
  const self = `${CANARY}${SERVICE[v]}/${set}${key}`;
  return v === "V2"
    ? { __metadata: { id: self, uri: self, type: `ZCONF_SRV.${set}Type` }, ...fields }
    : { "@odata.id": self, "@odata.etag": 'W/"20260101"', ...fields };
}

/** What the caller must receive of a row: SAP's envelope gone, every key containing @ gone. */
export function stripped(row: Row): Row {
  const out: Row = {};
  for (const [k, value] of Object.entries(row)) {
    if (k === "__metadata" || k.includes("@")) continue;
    if (value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 1 && "__deferred" in value) continue;
    out[k] = value;
  }
  return out;
}

const v2Date = (day: string) => `/Date(${Date.parse(`${day}T00:00:00Z`)})/`;

/** An Items row, as each version writes its types. */
function item(v: Version, n: number, over: Row = {}): Row {
  const id = `I${n}`;
  const fields: Row =
    v === "V2"
      ? {
          ItemId: id,
          Name: `Item ${n}`,
          Guid: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
          Count64: String(4_000_000_000 + n),
          Amount: `${n}.50`,
          Qty: n,
          Flag: n % 2 === 0,
          Posted: v2Date("2026-01-01"),
          Changed: v2Date("2026-01-02"),
          Stamp: "/Date(1767254400000+0120)/",
          Note: `note ${n}`,
        }
      : {
          ItemId: id,
          Name: `Item ${n}`,
          Guid: "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
          Count64: 4_000_000_000 + n,
          Amount: n + 0.5,
          Qty: n,
          Flag: n % 2 === 0,
          Posted: "2026-01-01",
          Stamp: "2026-01-01T08:00:00+02:00",
          Note: `note ${n}`,
          value: `v${n}`,
        };
  return enveloped(v, "Items", `('${String(over.ItemId ?? id).replace(/'/g, "''")}')`, { ...fields, ...over });
}

function listAnswer(v: Version, set: string, rows: Row[], extra: { count?: number | string; next?: string } = {}): RecordedAnswer {
  if (v === "V2") {
    return {
      status: 200,
      body: { d: { ...(extra.count !== undefined ? { __count: String(extra.count) } : {}), results: rows, ...(extra.next ? { __next: extra.next } : {}) } },
    };
  }
  return {
    status: 200,
    body: {
      "@odata.context": `${CANARY}${SERVICE[v]}/$metadata#${set}`,
      ...(extra.count !== undefined ? { "@odata.count": extra.count } : {}),
      value: rows,
      ...(extra.next ? { "@odata.nextLink": extra.next } : {}),
    },
  };
}

function entityAnswer(v: Version, set: string, row: Row): RecordedAnswer {
  return v === "V2" ? { status: 200, body: { d: row } } : { status: 200, body: { "@odata.context": `${CANARY}${SERVICE[v]}/$metadata#${set}/$entity`, ...row } };
}

/** SAP's own error body: its text and its host, which the caller must never see. */
function sapError(status: number): RecordedAnswer {
  return { status, body: { error: { code: "/IWBEP/CM_MGW_RT/020", message: { lang: "en", value: `Resource not found for segment at ${CANARY}/secret-path` } } } };
}

/* ── the case shape ───────────────────────────────────────────────────── */

export interface Expectation {
  readonly status: number;
  readonly code?: string;
  readonly rule?: string;
  /** The records, exactly, in order. */
  readonly records?: Row[];
  /** A subset of `page`. */
  readonly page?: Record<string, unknown>;
  readonly totalCount?: number | null;
  readonly hasPage?: boolean;
  /** The audit row's queryFlags (null: none). */
  readonly flags?: string | null;
  /** Whether SAP's answer counted against the circuit. */
  readonly circuit?: "counted" | "not counted";
}

export interface Step {
  /** The caller's query string; the previous step's nextCursor is added when `next` is set. */
  readonly query: string;
  readonly next?: boolean;
  readonly exchanges: Exchange[];
  readonly expect: Expectation;
}

export interface ConformanceCase {
  readonly id: string;
  readonly odata: Version;
  readonly provenance: "spec-derived" | `live-verdict:${string}`;
  readonly policy: PolicyName;
  /** A legacy ?limit read rather than the query surface. */
  readonly legacy?: boolean;
  readonly steps: Step[];
}

const both = (f: (v: Version) => Omit<ConformanceCase, "odata" | "provenance">): ConformanceCase[] =>
  (["V2", "V4"] as const).map((v) => {
    const c = f(v);
    return { ...c, id: `${v}-${c.id}`, odata: v, provenance: "spec-derived" as const };
  });
const only = (v: Version, c: Omit<ConformanceCase, "odata" | "provenance">): ConformanceCase => ({ ...c, odata: v, provenance: "spec-derived" });

/** One step, one exchange, for the common case. */
function one(query: string, req: RecordedRequest, answer: RecordedAnswer, expect: Expectation): Step[] {
  return [{ query, exchanges: [{ request: req, answer }], expect }];
}

/** The default list options on Items: no $select (every column is readable), the key as tie-break, a 100-row page plus its look-ahead row. */
const itemsList = (v: Version, filter: string | null, extra: Pair[] = []) =>
  request(v, "Items", [...(filter === null ? [] : [["$filter", filter] as Pair]), ["$orderby", "ItemId asc"], ["$top", "101"], ...extra]);

/** A literal case: one filter value, sent through, answered with one row. */
function literal(id: string, v: Version, query: string, filter: string, row: Row = item(v, 1)): Omit<ConformanceCase, "odata" | "provenance"> {
  return { id, policy: "items", steps: one(query, itemsList(v, filter), listAnswer(v, "Items", [row]), { status: 200, records: [stripped(row)], page: { index: 0, complete: true, nextCursor: null } }) };
}

/* ── the cases ────────────────────────────────────────────────────────── */

const RESERVED = "& = + # ; ( ) / ,";
const UNICODE = "😀éx";
const GUID_UPPER = "6BA7B810-9DAD-11D1-80B4-00C04FD430C8";
const GUID = GUID_UPPER.toLowerCase();

export const CASES: ConformanceCase[] = [
  /* Literals */
  ...both((v) => literal("L-STRING-QUOTE", v, "filter.Name.eq=O%27Neil", "Name eq 'O''Neil'", item(v, 1, { Name: "O'Neil" }))),
  ...both((v) => literal("L-STRING-RESERVED", v, `filter.Name.eq=${encodeURIComponent(RESERVED)}`, `Name eq '${RESERVED}'`, item(v, 1, { Name: RESERVED }))),
  ...both((v) => literal("L-STRING-UNICODE", v, `filter.Name.eq=${encodeURIComponent(UNICODE)}`, `Name eq '${UNICODE}'`, item(v, 1, { Name: UNICODE }))),
  ...both((v) => literal("L-GUID", v, `filter.Guid.eq=${GUID_UPPER}`, v === "V2" ? `Guid eq guid'${GUID}'` : `Guid eq ${GUID}`)),
  ...both((v) => literal("L-INT64", v, "filter.Count64.eq=9007199254740993", v === "V2" ? "Count64 eq 9007199254740993L" : "Count64 eq 9007199254740993")),
  ...both((v) => literal("L-DECIMAL", v, "filter.Amount.ge=12.5", v === "V2" ? "Amount ge 12.5M" : "Amount ge 12.5")),
  only("V2", literal("V2-L-DECIMAL-NEG", "V2", "filter.Amount.gt=-2.5", "Amount gt -2.5M")),
  only("V2", literal("V2-L-DECIMAL-INT", "V2", "filter.Amount.ge=12", "Amount ge 12.0M")),
  only("V2", literal("V2-L-DATETIME", "V2", "filter.Changed.lt=2026-01-02T10:30", "Changed lt datetime'2026-01-02T10:30:00'")),
  only("V2", literal("V2-L-DATETIME-DATEONLY", "V2", "filter.Posted.ge=2026-01-01", "Posted ge datetime'2026-01-01T00:00:00'")),
  ...both((v) =>
    literal("L-DTO", v, "filter.Stamp.lt=2026-01-01T10:00:00%2B02:00", v === "V2" ? "Stamp lt datetimeoffset'2026-01-01T10:00:00+02:00'" : "Stamp lt 2026-01-01T10:00:00+02:00"),
  ),
  only("V4", literal("V4-L-DATE", "V4", "filter.Posted.ge=2026-01-01", "Posted ge 2026-01-01")),
  ...both((v) => literal("L-BOOL", v, "filter.Flag.eq=true", "Flag eq true", item(v, 2))),

  /* Filter */
  ...both((v) => literal("F-AND", v, "filter.Qty.eq=3&filter.Name.eq=A", "Name eq 'A' and Qty eq 3")),
  ...both((v) => literal("F-IN-OR-CHAIN", v, "filter.Qty.in=3&filter.Qty.in=1&filter.Qty.in=2", "(Qty eq 1 or Qty eq 2 or Qty eq 3)")),
  ...both((v) => literal("F-RANGE", v, "filter.Amount.gt=1&filter.Amount.le=9.99", v === "V2" ? "Amount gt 1.0M and Amount le 9.99M" : "Amount gt 1 and Amount le 9.99")),
  ...both(() => ({
    id: "F-REQUIRED-MISSING",
    policy: "itemsRequireName",
    steps: [{ query: "filter.Qty.eq=1", exchanges: [], expect: { status: 400, code: "POLICY_FIELD_NOT_GRANTED", rule: "FILTER_REQUIRED" } }],
  })),
  ...both((v) => ({
    id: "F-SAP-400",
    policy: "items",
    steps: one("filter.Name.eq=A", itemsList(v, "Name eq 'A'"), sapError(400), { status: 422, code: "VALIDATION_ERROR", rule: "SAP_REJECTED", circuit: "not counted" }),
  })),
  ...both((v) => ({
    id: "F-SAP-500",
    policy: "items",
    steps: one("filter.Name.eq=A", itemsList(v, "Name eq 'A'"), sapError(500), { status: 502, code: "UPSTREAM_ERROR", circuit: "not counted" }),
  })),
  ...both((v) => ({
    id: "F-SAP-503",
    policy: "items",
    steps: one("filter.Name.eq=A", itemsList(v, "Name eq 'A'"), { status: 503, body: "Service Unavailable" }, { status: 502, code: "UPSTREAM_ERROR", circuit: "counted" }),
  })),

  /* Select */
  ...both((v) => {
    const row = item(v, 1, {});
    const sent = { ItemId: row.ItemId, Name: row.Name, Amount: row.Amount };
    const answer = enveloped(v, "Items", "('I1')", sent);
    return {
      id: "S-SELECT",
      policy: "items",
      steps: one(
        "select=Name,Amount",
        request(v, "Items", [["$select", "ItemId,Name,Amount"], ["$orderby", "ItemId asc"], ["$top", "101"]]),
        listAnswer(v, "Items", [answer]),
        { status: 200, records: [{ Name: row.Name, Amount: row.Amount }], flags: null },
      ),
    };
  }),
  ...both((v) => {
    const row = item(v, 1);
    return {
      id: "S-SELECT-IGNORED",
      policy: "items",
      steps: one(
        "select=Name",
        request(v, "Items", [["$select", "ItemId,Name"], ["$orderby", "ItemId asc"], ["$top", "101"]]),
        listAnswer(v, "Items", [row]),
        { status: 200, records: [{ Name: row.Name }], flags: "PROJECTED" },
      ),
    };
  }),

  /* Order and paging */
  ...both((v) => ({
    id: "P-ORDERBY-TIEBREAK",
    policy: "items",
    steps: one(
      "orderby=-Amount,Name",
      request(v, "Items", [["$orderby", "Amount desc,Name asc,ItemId asc"], ["$top", "101"]]),
      listAnswer(v, "Items", [item(v, 2), item(v, 1)]),
      { status: 200, records: [stripped(item(v, 2)), stripped(item(v, 1))] },
    ),
  })),
  ...both((v) => ({
    id: "P-SKIP-TOP-PEEK",
    policy: "items",
    steps: [
      {
        query: "pageSize=2",
        exchanges: [{ request: request(v, "Items", [["$orderby", "ItemId asc"], ["$top", "3"]]), answer: listAnswer(v, "Items", [item(v, 1), item(v, 2), item(v, 3)]) }],
        expect: { status: 200, records: [stripped(item(v, 1)), stripped(item(v, 2))], page: { index: 0, size: 2, rowsServed: 2, complete: false, stopped: null } },
      },
      {
        query: "pageSize=2",
        next: true,
        exchanges: [{ request: request(v, "Items", [["$orderby", "ItemId asc"], ["$top", "3"], ["$skip", "2"]]), answer: listAnswer(v, "Items", [item(v, 3)]) }],
        expect: { status: 200, records: [stripped(item(v, 3))], page: { index: 1, rowsServed: 3, complete: true, nextCursor: null } },
      },
    ],
  })),
  ...both((v) => ({
    id: "P-LAST-PAGE-EXACT",
    policy: "items",
    steps: one(
      "pageSize=2",
      request(v, "Items", [["$orderby", "ItemId asc"], ["$top", "3"]]),
      listAnswer(v, "Items", [item(v, 1), item(v, 2)]),
      { status: 200, records: [stripped(item(v, 1)), stripped(item(v, 2))], page: { complete: true, nextCursor: null, stopped: null } },
    ),
  })),
  ...both((v) => ({
    id: "P-SERVER-CAP",
    policy: "items",
    steps: [
      {
        query: "pageSize=3",
        exchanges: [
          {
            request: request(v, "Items", [["$orderby", "ItemId asc"], ["$top", "4"]]),
            // V2: an absolute __next (SuccessFactors, KBA 2489065); V4: a relative nextLink (KBA 3786664).
            answer: listAnswer(v, "Items", [item(v, 1), item(v, 2)], { next: v === "V2" ? `${CANARY}${SERVICE.V2}/Items?$skiptoken=2` : "Items?$skiptoken=2" }),
          },
        ],
        expect: { status: 200, records: [stripped(item(v, 1)), stripped(item(v, 2))], page: { rowsServed: 2, complete: false } },
      },
      {
        query: "pageSize=3",
        next: true,
        exchanges: [{ request: request(v, "Items", [["$orderby", "ItemId asc"], ["$top", "4"], ["$skip", "2"]]), answer: listAnswer(v, "Items", [item(v, 3)]) }],
        expect: { status: 200, records: [stripped(item(v, 3))], page: { index: 1, rowsServed: 3, complete: true } },
      },
    ],
  })),
  ...both((v) => ({
    id: "P-TOP-IGNORED",
    policy: "items",
    steps: one(
      "pageSize=2",
      request(v, "Items", [["$orderby", "ItemId asc"], ["$top", "3"]]),
      listAnswer(v, "Items", [1, 2, 3, 4, 5].map((n) => item(v, n))),
      { status: 200, records: [stripped(item(v, 1)), stripped(item(v, 2))], page: { complete: false, nextCursor: null, stopped: "UPSTREAM_IGNORED_PAGING" }, flags: "TOP_NOT_HONOURED" },
    ),
  })),
  ...both((v) => ({
    id: "P-SKIP-IGNORED",
    policy: "items",
    steps: [
      {
        query: "pageSize=2",
        exchanges: [{ request: request(v, "Items", [["$orderby", "ItemId asc"], ["$top", "3"]]), answer: listAnswer(v, "Items", [item(v, 1), item(v, 2), item(v, 3)]) }],
        expect: { status: 200, page: { complete: false } },
      },
      {
        query: "pageSize=2",
        next: true,
        // SAP ignored $skip: the first page again.
        exchanges: [{ request: request(v, "Items", [["$orderby", "ItemId asc"], ["$top", "3"], ["$skip", "2"]]), answer: listAnswer(v, "Items", [item(v, 1), item(v, 2), item(v, 3)]) }],
        expect: { status: 502, code: "UPSTREAM_ERROR", rule: "UPSTREAM_IGNORED_PAGING", flags: "SKIP_NOT_HONOURED" },
      },
    ],
  })),
  ...both((v) => ({
    id: "P-SKIP-PAST-END",
    policy: "items",
    steps: [
      {
        query: "pageSize=2",
        exchanges: [{ request: request(v, "Items", [["$orderby", "ItemId asc"], ["$top", "3"]]), answer: listAnswer(v, "Items", [item(v, 1), item(v, 2), item(v, 3)]) }],
        expect: { status: 200, page: { complete: false } },
      },
      {
        query: "pageSize=2",
        next: true,
        // The rows were deleted meanwhile: an empty page, a successful read.
        exchanges: [{ request: request(v, "Items", [["$orderby", "ItemId asc"], ["$top", "3"], ["$skip", "2"]]), answer: listAnswer(v, "Items", []) }],
        expect: { status: 200, records: [], page: { index: 1, complete: true, nextCursor: null } },
      },
    ],
  })),
  only("V2", {
    id: "V2-P-NOT-PAGEABLE",
    policy: "noPaging",
    steps: one(
      "pageSize=2",
      // sap:pageable="false": no tie-break, no $skip ever; rows remain, but no cursor is issued.
      request("V2", "NoPaging", [["$top", "3"]]),
      listAnswer("V2", "NoPaging", ["N1", "N2", "N3"].map((id) => enveloped("V2", "NoPaging", `('${id}')`, { Id: id, Name: id }))),
      { status: 200, records: [{ Id: "N1", Name: "N1" }, { Id: "N2", Name: "N2" }], page: { complete: false, nextCursor: null, stopped: "NOT_PAGEABLE" } },
    ),
  }),

  /* Count */
  ...both((v) => ({
    id: "C-INLINE",
    policy: "items",
    steps: one(
      "count=true&pageSize=2",
      request(v, "Items", [["$orderby", "ItemId asc"], ["$top", "3"], v === "V2" ? ["$inlinecount", "allpages"] : ["$count", "true"]]),
      // V2 writes the count as a string, V4 as a number.
      listAnswer(v, "Items", [item(v, 1)], { count: v === "V2" ? "7" : 7 }),
      { status: 200, totalCount: 7 },
    ),
  })),
  only("V4", {
    id: "V4-C-INLINE-IEEE754",
    policy: "items",
    steps: one(
      "count=true&pageSize=2",
      request("V4", "Items", [["$orderby", "ItemId asc"], ["$top", "3"], ["$count", "true"]]),
      listAnswer("V4", "Items", [item("V4", 1)], { count: "7" }),
      { status: 200, totalCount: 7 },
    ),
  }),

  /* Keys */
  ...both((v) => ({
    id: "K-SINGLE",
    policy: "items",
    steps: one("key.ItemId=I1", request(v, "Items('I1')", []), entityAnswer(v, "Items", item(v, 1)), { status: 200, records: [stripped(item(v, 1))], hasPage: false }),
  })),
  ...both((v) => {
    const row = enveloped(v, "Lines", "(OrderId='O1',LineNo=2)", { OrderId: "O1", LineNo: 2, Product: "P" });
    return {
      id: "K-COMPOSITE",
      policy: "lines",
      steps: one("key.OrderId=O1&key.LineNo=2", request(v, "Lines(OrderId='O1',LineNo=2)", []), entityAnswer(v, "Lines", row), { status: 200, records: [stripped(row)] }),
    };
  }),
  ...both((v) => {
    const row = enveloped(v, "ByGuid", "", { Id: GUID, Name: "G" });
    return {
      id: "K-GUID",
      policy: "byGuid",
      steps: one(`key.Id=${GUID_UPPER}`, request(v, v === "V2" ? `ByGuid(guid'${GUID}')` : `ByGuid(${GUID})`, []), entityAnswer(v, "ByGuid", row), { status: 200, records: [stripped(row)] }),
    };
  }),
  ...both((v) => {
    // V4 under IEEE754Compatible writes an Int64 as a string, as V2 always does.
    const row = enveloped(v, "ByNumber", "", { Num: "9007199254740993", Name: "N" });
    return {
      id: "K-INT64",
      policy: "byNumber",
      steps: one("key.Num=9007199254740993", request(v, v === "V2" ? "ByNumber(9007199254740993L)" : "ByNumber(9007199254740993)", []), entityAnswer(v, "ByNumber", row), {
        status: 200,
        records: [stripped(row)],
      }),
    };
  }),
  only("V4", {
    id: "V4-K-ENTITY-WITH-VALUE-PROP",
    policy: "items",
    // A property named `value` on an entity: a key lookup reads the entity, never a collection.
    steps: one("key.ItemId=I1", request("V4", "Items('I1')", []), entityAnswer("V4", "Items", item("V4", 1, { value: "a value" })), {
      status: 200,
      records: [stripped(item("V4", 1, { value: "a value" }))],
    }),
  }),
  ...both((v) => ({
    id: "K-NOT-FOUND",
    policy: "items",
    steps: one("key.ItemId=NONE", request(v, "Items('NONE')", []), sapError(404), { status: 404, code: "RECORD_NOT_FOUND" }),
  })),
  ...both((v) =>
    // A slash is never put in a path segment: the key is read through $filter, $top=2.
    ({
      id: "K-SLASH-VIA-FILTER-0",
      policy: "items",
      steps: one("key.ItemId=A%2FB", request(v, "Items", [["$filter", "ItemId eq 'A/B'"], ["$top", "2"]]), listAnswer(v, "Items", []), { status: 404, code: "RECORD_NOT_FOUND", flags: "KEY_VIA_FILTER" }),
    }),
  ),
  ...both((v) => {
    const row = item(v, 1, { ItemId: "A/B" });
    return {
      id: "K-SLASH-VIA-FILTER-1",
      policy: "items",
      steps: one("key.ItemId=A%2FB", request(v, "Items", [["$filter", "ItemId eq 'A/B'"], ["$top", "2"]]), listAnswer(v, "Items", [row]), {
        status: 200,
        records: [stripped(row)],
        hasPage: false,
        flags: "KEY_VIA_FILTER",
      }),
    };
  }),
  ...both((v) => ({
    id: "K-SLASH-VIA-FILTER-2",
    policy: "items",
    steps: one(
      "key.ItemId=A%2FB",
      request(v, "Items", [["$filter", "ItemId eq 'A/B'"], ["$top", "2"]]),
      listAnswer(v, "Items", [item(v, 1, { ItemId: "A/B" }), item(v, 2, { ItemId: "A/B" })]),
      { status: 502, code: "UPSTREAM_ERROR", rule: "KEY_NOT_UNIQUE", flags: "KEY_VIA_FILTER" },
    ),
  })),
  only("V2", {
    id: "V2SF-K-EFFECTIVE-DATED",
    policy: "effective",
    steps: one(
      "key.externalCode=X1&key.effectiveStartDate=2026-01-01",
      request("V2", "Effective(externalCode='X1',effectiveStartDate=datetime'2026-01-01T00:00:00')", []),
      entityAnswer("V2", "Effective", enveloped("V2", "Effective", "", { externalCode: "X1", effectiveStartDate: v2Date("2026-01-01"), name: "Plan" })),
      { status: 200, records: [{ externalCode: "X1", effectiveStartDate: v2Date("2026-01-01"), name: "Plan" }] },
    ),
  }),
  only("V4", {
    id: "V4-K-DRAFT-PIN",
    policy: "drafts",
    // The active entity only (D20): IsActiveEntity=true in the key, never sent by the caller.
    steps: one(
      "key.Id=D1",
      request("V4", "Drafts(Id='D1',IsActiveEntity=true)", []),
      entityAnswer("V4", "Drafts", enveloped("V4", "Drafts", "", { Id: "D1", IsActiveEntity: true, Name: "Draftable" })),
      { status: 200, records: [{ Id: "D1", IsActiveEntity: true, Name: "Draftable" }], flags: "PINNED_ACTIVE" },
    ),
  }),
  only("V4", {
    id: "V4-L-DRAFT-PIN",
    policy: "drafts",
    steps: one(
      "filter.Id.eq=D1",
      request("V4", "Drafts", [["$filter", "Id eq 'D1' and IsActiveEntity eq true"], ["$orderby", "Id asc"], ["$top", "101"]]),
      listAnswer("V4", "Drafts", [enveloped("V4", "Drafts", "", { Id: "D1", IsActiveEntity: true, Name: "Draftable" })]),
      { status: 200, records: [{ Id: "D1", IsActiveEntity: true, Name: "Draftable" }], flags: "PINNED_ACTIVE" },
    ),
  }),

  /* Envelope */
  only("V2", {
    id: "E-V2-METADATA-STRIPPED",
    policy: "items",
    steps: one(
      "filter.Name.eq=A",
      itemsList("V2", "Name eq 'A'"),
      listAnswer("V2", "Items", [item("V2", 1, { to_Lines: { __deferred: { uri: `${CANARY}${SERVICE.V2}/Items('I1')/to_Lines` } } })]),
      { status: 200, records: [stripped(item("V2", 1))] },
    ),
  }),
  only("V4", {
    id: "E-V4-CONTROL-STRIPPED",
    policy: "items",
    steps: one(
      "filter.Name.eq=A",
      itemsList("V4", "Name eq 'A'"),
      listAnswer("V4", "Items", [item("V4", 1, { "@odata.editLink": `${CANARY}/Items('I1')`, "to_Lines@odata.navigationLink": `${CANARY}/Items('I1')/to_Lines` })]),
      { status: 200, records: [stripped(item("V4", 1))] },
    ),
  }),
  only("V4", {
    id: "E-V401-CONTROL-STRIPPED",
    policy: "items",
    // OData 4.01 control information without the odata. prefix.
    steps: one(
      "filter.Name.eq=A",
      itemsList("V4", "Name eq 'A'"),
      listAnswer("V4", "Items", [item("V4", 1, { "@id": `${CANARY}/Items('I1')`, "@editLink": `${CANARY}/Items('I1')`, "to_Lines@navigationLink": `${CANARY}/x`, "Name@type": "String" })]),
      { status: 200, records: [stripped(item("V4", 1))] },
    ),
  }),
  only("V4", {
    id: "V4-E-MAXVERSION",
    policy: "items",
    // Every V4 recording requires OData-MaxVersion: 4.0; this one names it.
    steps: one("filter.Name.eq=A", itemsList("V4", "Name eq 'A'"), listAnswer("V4", "Items", [item("V4", 1)]), { status: 200 }),
  }),
  ...both((v) => ({
    id: "E-ERROR-BODY-NOT-FORWARDED",
    policy: "items",
    steps: one("filter.Name.eq=A", itemsList(v, "Name eq 'A'"), sapError(400), { status: 422, code: "VALIDATION_ERROR", rule: "SAP_REJECTED" }),
  })),
  ...both((v) => ({
    id: "E-SAP-CLIENT-PLACEMENT",
    policy: "items",
    // sap-client once, last, after every option (buildSapUrl).
    steps: one("filter.Name.eq=A&count=true", itemsList(v, "Name eq 'A'", [v === "V2" ? ["$inlinecount", "allpages"] : ["$count", "true"]]), listAnswer(v, "Items", [], { count: 0 }), {
      status: 200,
      records: [],
      totalCount: 0,
    }),
  })),
  ...both((v) => ({
    id: "E-REDIRECT-NOT-FOLLOWED",
    policy: "items",
    steps: one(
      "filter.Name.eq=A",
      itemsList(v, "Name eq 'A'"),
      { status: 302, headers: { location: "/sap/opu/odata/sap/ELSEWHERE/Items" }, body: "" },
      { status: 502, code: "UPSTREAM_ERROR", circuit: "not counted" },
    ),
  })),

  /* Size */
  ...both((v) => {
    const wide = (n: number) => item(v, n, { Note: `${"W".repeat(4000)}${n}` });
    return {
      id: "Z-BYTE-CUT",
      policy: "itemsByteCap",
      steps: [
        {
          query: "pageSize=200",
          exchanges: [
            { request: request(v, "Items", [["$orderby", "ItemId asc"], ["$top", "201"]]), answer: { ...listAnswer(v, "Items", Array.from({ length: 201 }, (_, i) => wide(i + 1))), gzip: true } },
          ],
          expect: { status: 200, page: { complete: false }, flags: "CUT_BY_BYTES" },
        },
        {
          query: "pageSize=200",
          next: true,
          // Resumed exactly where the cut page stopped, asking for about as many rows as fit (adaptive $top).
          exchanges: [
            {
              request: request(v, "Items", [["$orderby", "ItemId asc"], ["$top", "<adaptive>"], ["$skip", "<cut>"]]),
              answer: { ...listAnswer(v, "Items", [wide(9999)]), chunked: true },
            },
          ],
          expect: { status: 200, page: { index: 1, complete: true } },
        },
      ],
    };
  }),
  ...both((v) => ({
    id: "Z-ROW-TOO-LARGE",
    policy: "itemsByteCap",
    steps: one("pageSize=2", request(v, "Items", [["$orderby", "ItemId asc"], ["$top", "3"]]), listAnswer(v, "Items", [item(v, 1, { Note: "N".repeat(300_000) })]), {
      status: 422,
      code: "VALIDATION_ERROR",
      rule: "ROW_TOO_LARGE",
    }),
  })),
  ...both((v) => ({
    id: "Z-UPSTREAM-16MIB",
    policy: "items",
    steps: one(
      "filter.Name.eq=A",
      itemsList(v, "Name eq 'A'"),
      { status: 200, body: `{"d":{"results":[{"Note":"${"x".repeat(17 * 1024 * 1024)}"}]}}`, gzip: true },
      { status: 422, code: "VALIDATION_ERROR", rule: "UPSTREAM_PAGE_TOO_LARGE", circuit: "not counted" },
    ),
  })),
  ...both((v) => ({
    id: "Z-UPSTREAM-16MIB-LEGACY",
    policy: "items",
    legacy: true,
    // The legacy read keeps its 502 for the same answer.
    steps: one("limit=5", request(v, "Items", [["$top", "5"]], true), { status: 200, body: `{"d":{"results":[{"Note":"${"x".repeat(17 * 1024 * 1024)}"}]}}`, gzip: true }, {
      status: 502,
      code: "UPSTREAM_ERROR",
    }),
  })),
  ...both((v) => ({
    id: "Z-LEGACY-GUARD",
    policy: "items",
    legacy: true,
    steps: one(
      "limit=20",
      request(v, "Items", [["$top", "20"]], true),
      { ...listAnswer(v, "Items", Array.from({ length: 20 }, (_, i) => item(v, i + 1, { Note: "L".repeat(250_000) }))), gzip: true },
      { status: 413, code: "VALIDATION_ERROR", rule: "RESPONSE_TOO_LARGE" },
    ),
  })),
];

/** The ids the spec's table names (3.21 item 7), each of which must be here on every version it applies to. */
export const NAMED_IDS = [
  "L-STRING-QUOTE",
  "L-STRING-RESERVED",
  "L-STRING-UNICODE",
  "L-GUID",
  "L-INT64",
  "L-DECIMAL",
  "V2-L-DECIMAL-NEG",
  "V2-L-DECIMAL-INT",
  "V2-L-DATETIME",
  "V2-L-DATETIME-DATEONLY",
  "L-DTO",
  "V4-L-DATE",
  "L-BOOL",
  "F-AND",
  "F-IN-OR-CHAIN",
  "F-RANGE",
  "F-REQUIRED-MISSING",
  "F-SAP-400",
  "F-SAP-500",
  "F-SAP-503",
  "S-SELECT",
  "S-SELECT-IGNORED",
  "P-ORDERBY-TIEBREAK",
  "P-SKIP-TOP-PEEK",
  "P-LAST-PAGE-EXACT",
  "P-SERVER-CAP",
  "P-TOP-IGNORED",
  "P-SKIP-IGNORED",
  "P-SKIP-PAST-END",
  "V2-P-NOT-PAGEABLE",
  "C-INLINE",
  "V4-C-INLINE-IEEE754",
  "K-SINGLE",
  "K-COMPOSITE",
  "K-GUID",
  "K-INT64",
  "V4-K-ENTITY-WITH-VALUE-PROP",
  "K-NOT-FOUND",
  "K-SLASH-VIA-FILTER-0",
  "K-SLASH-VIA-FILTER-1",
  "K-SLASH-VIA-FILTER-2",
  "V2SF-K-EFFECTIVE-DATED",
  "V4-K-DRAFT-PIN",
  "E-V2-METADATA-STRIPPED",
  "E-V4-CONTROL-STRIPPED",
  "E-V401-CONTROL-STRIPPED",
  "V4-E-MAXVERSION",
  "E-ERROR-BODY-NOT-FORWARDED",
  "E-SAP-CLIENT-PLACEMENT",
  "E-REDIRECT-NOT-FOLLOWED",
  "Z-BYTE-CUT",
  "Z-ROW-TOO-LARGE",
  "Z-UPSTREAM-16MIB",
  "Z-LEGACY-GUARD",
] as const;
