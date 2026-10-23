/**
 * The query basis: what one interface's current contract says a query may
 * do (P1.4).
 *
 * WHERE IT IS MADE. In the verify's record job, beside the contract's own
 * facts (contracts/jobs.ts recordableContract), so the tenant-derived parsing
 * stays where P1.3 put all of it: in the contained worker (envelope.ts). The
 * request thread only ever sees this result: CoreEdge-made, bounded, flat.
 *
 * WHAT IT KEEPS. Per property: its name, its EDM type and the literal type a
 * query would use for it, its facets (MaxLength, precision, scale, the V2
 * date-only display format), and what SAP says about filtering and sorting on
 * it, with V4's set-level restrictions already folded in by the slice
 * (slice.ts). Per set: the capability flags that decide key lookup, paging,
 * count and $select. Only what is false (or, for the requirements, true) is
 * written; absent means SAP said nothing, which is permission.
 *
 * WHAT IT REFUSES TO ADDRESS. A name that fails the identifier rule
 * (identifiers.ts) is kept, cut to 128 characters, and marked `bad: "NAME"`,
 * so Studio can show it as a field CoreEdge cannot address; a stream property
 * is `bad: "TYPE"`. Neither can ever be read, filtered, sorted or keyed.
 *
 * BOUNDED. At most 1,000 properties and 128 KiB of JSON, the snapshot
 * included. Over that, labels go first; if it is still over, the property
 * list is cut and `tooLarge` set, and the query surface is not offered on that
 * interface (the policy goes STALE, BASIS_TOO_LARGE): a basis that does not
 * describe the whole entity cannot say which fields a "*" policy reads.
 */

import { LIMITS } from "@/lib/contracts/budget";
import type { InterfaceContract, IrProperty } from "@/lib/contracts/ir";
import { isQueryIdentifier, MAX_IDENTIFIER_LENGTH } from "@/lib/odata/identifiers";
import type { EdmScalar } from "@/lib/odata/policy";

export interface BasisProperty {
  /** The name; cut to 128 characters when bad === "NAME". */
  readonly n: string;
  /** The original type, for display (at most 128 characters). */
  readonly edm: string;
  readonly t: EdmScalar;
  readonly nullable: boolean;
  /** Numeric MaxLength only. */
  readonly ml?: number;
  /** Decimal precision. */
  readonly p?: number;
  /** Decimal scale, when numeric. */
  readonly s?: number;
  /** V2 Edm.DateTime with sap:display-format="Date". */
  readonly dateOnly?: true;
  readonly filterable?: false;
  readonly sortable?: false;
  readonly requiredInFilter?: true;
  /** At most 80 characters; dropped first when the basis is over its bound. */
  readonly label?: string;
  /** NAME: fails the identifier rule or is __proto__. TYPE: a type a row cannot carry. Never addressable. */
  readonly bad?: "NAME" | "TYPE";
}

export interface QueryBasisSet {
  readonly addressable?: false;
  readonly pageable?: false;
  readonly topSupported?: false;
  readonly skipSupported?: false;
  readonly countable?: false;
  readonly filterable?: false;
  readonly requiresFilter?: true;
  readonly sortable?: false;
  readonly selectSupported?: false;
  readonly singleton?: true;
}

export interface QueryBasisV1 {
  readonly v: 1;
  /** Filled in by the verify from the current snapshot. */
  readonly snapshot: { readonly id: string; readonly semver: string; readonly contentHash: string };
  readonly entitySet: string;
  readonly odata: "V2" | "V4";
  readonly source: "METADATA" | "SAMPLED";
  readonly set: QueryBasisSet;
  /** Key order. */
  readonly keys: readonly string[];
  /** At most 1,000, in declaration order. */
  readonly properties: readonly BasisProperty[];
  /** Set when the bound forced truncation; the query surface is not available then. */
  readonly tooLarge?: true;
}

/** The basis before the verify knows which snapshot it describes. */
export type QueryBasisV1Draft = Omit<QueryBasisV1, "snapshot">;

export const QUERY_BASIS_MAX_BYTES = LIMITS.queryBasis.bytes;
export const MAX_BASIS_PROPERTIES = 1000;
const MAX_LABEL = 80;
const MAX_EDM = 128;
/** What the snapshot adds when the verify fills it in: ids, a semver and a 64-hex hash, generously. */
const SNAPSHOT_ALLOWANCE = 512;

const SCALARS: Record<string, EdmScalar> = {
  "Edm.String": "S",
  "Edm.Guid": "G",
  "Edm.Boolean": "B",
  "Edm.Byte": "U8",
  "Edm.SByte": "I8",
  "Edm.Int16": "I16",
  "Edm.Int32": "I32",
  "Edm.Int64": "I64",
  "Edm.Decimal": "D",
  "Edm.DateTimeOffset": "DTO",
};

/**
 * The literal type a query uses for a property, or OTHER (readable only).
 * Edm.DateTime exists only in V2 and Edm.Date only in V4; met in the other
 * version, each is OTHER rather than a literal the version cannot write.
 */
export function edmScalarOf(type: string, odata: "V2" | "V4", collection = false): EdmScalar {
  if (collection) return "OTHER";
  if (type === "Edm.DateTime") return odata === "V2" ? "DT" : "OTHER";
  if (type === "Edm.Date") return odata === "V4" ? "DA" : "OTHER";
  return SCALARS[type] ?? "OTHER";
}

function basisProperty(p: IrProperty, odata: "V2" | "V4"): BasisProperty {
  const nameOk = isQueryIdentifier(p.name);
  const t = edmScalarOf(p.type, odata, p.collection === true);
  const out: { -readonly [K in keyof BasisProperty]: BasisProperty[K] } = {
    n: nameOk ? p.name : p.name.slice(0, MAX_IDENTIFIER_LENGTH),
    edm: (p.collection ? `Collection(${p.type})` : p.type).slice(0, MAX_EDM),
    t,
    nullable: p.nullable,
  };
  if (typeof p.maxLength === "number") out.ml = p.maxLength;
  if (t === "D") {
    if (typeof p.precision === "number") out.p = p.precision;
    if (typeof p.scale === "number") out.s = p.scale;
  }
  if (t === "DT" && p.displayFormat?.toLowerCase() === "date") out.dateOnly = true;
  if (p.capabilities?.filterable === false) out.filterable = false;
  if (p.capabilities?.sortable === false) out.sortable = false;
  if (p.capabilities?.requiredInFilter === true) out.requiredInFilter = true;
  if (p.label) out.label = p.label.slice(0, MAX_LABEL);
  if (!nameOk) out.bad = "NAME";
  // A stream's value is never in the row: V4 answers a selected stream with
  // media links (control information), which is all host.
  else if (p.type === "Edm.Stream") out.bad = "TYPE";
  return out;
}

const bytes = (v: unknown) => Buffer.byteLength(JSON.stringify(v), "utf8");

/** The basis of one interface's contract, without its snapshot (the verify adds it). */
export function queryBasisOf(contract: InterfaceContract): QueryBasisV1Draft {
  const caps = contract.entitySet.capabilities;
  const set: { -readonly [K in keyof QueryBasisSet]: QueryBasisSet[K] } = {};
  if (caps.addressable === false) set.addressable = false;
  if (caps.pageable === false) set.pageable = false;
  if (caps.topSupported === false) set.topSupported = false;
  if (caps.skipSupported === false) set.skipSupported = false;
  if (caps.countable === false) set.countable = false;
  if (caps.filterable === false) set.filterable = false;
  if (caps.requiresFilter === true) set.requiresFilter = true;
  if (caps.sortable === false) set.sortable = false;
  if (caps.selectSupported === false) set.selectSupported = false;
  if (contract.entitySet.singleton) set.singleton = true;

  const odata = contract.odataVersion;
  let tooLarge = contract.entityType.properties.length > MAX_BASIS_PROPERTIES;
  let properties = contract.entityType.properties.slice(0, MAX_BASIS_PROPERTIES).map((p) => basisProperty(p, odata));
  const head = {
    v: 1 as const,
    entitySet: contract.entitySet.name,
    odata,
    source: contract.source,
    set,
    keys: contract.entityType.key.map((k) => k.slice(0, MAX_IDENTIFIER_LENGTH)),
  };
  const budget = QUERY_BASIS_MAX_BYTES - SNAPSHOT_ALLOWANCE;
  const draft = (): QueryBasisV1Draft => (tooLarge ? { ...head, properties, tooLarge: true } : { ...head, properties });

  if (bytes(draft()) > budget) {
    properties = properties.map(({ label: _label, ...rest }) => rest);
  }
  if (bytes(draft()) > budget) {
    // Cut the list where it stops fitting, measuring each property once.
    tooLarge = true;
    let used = bytes({ ...head, properties: [], tooLarge: true });
    const kept: BasisProperty[] = [];
    for (const p of properties) {
      const b = bytes(p) + 1;
      if (used + b > budget) break;
      kept.push(p);
      used += b;
    }
    properties = kept;
  }
  return draft();
}

/** The basis the verify writes: the draft, with the snapshot it describes. */
export function withSnapshot(draft: QueryBasisV1Draft, snapshot: QueryBasisV1["snapshot"]): QueryBasisV1 {
  const { v, entitySet, odata, source, set, keys, properties, tooLarge } = draft;
  const basis = { v, snapshot: { id: snapshot.id, semver: snapshot.semver, contentHash: snapshot.contentHash }, entitySet, odata, source, set, keys, properties };
  return tooLarge ? { ...basis, tooLarge } : basis;
}

// ---------------------------------------------------------------- reading it back

class Unreadable extends Error {}

function need(cond: boolean): asserts cond {
  if (!cond) throw new Unreadable();
}

function isPlain(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

const EDM_SCALARS = new Set<string>(["S", "G", "B", "U8", "I8", "I16", "I32", "I64", "D", "DT", "DTO", "DA", "OTHER"]);
const SET_FALSE = ["addressable", "pageable", "topSupported", "skipSupported", "countable", "filterable", "sortable", "selectSupported"] as const;

function str(v: unknown, max: number): string {
  need(typeof v === "string" && v.length <= max);
  return v as string;
}

function nat(v: unknown): number {
  need(typeof v === "number" && Number.isInteger(v) && v >= 0);
  return v as number;
}

function readProperty(raw: unknown): BasisProperty {
  need(isPlain(raw) && typeof raw.t === "string" && EDM_SCALARS.has(raw.t) && typeof raw.nullable === "boolean");
  const out: { -readonly [K in keyof BasisProperty]: BasisProperty[K] } = {
    n: str(raw.n, MAX_IDENTIFIER_LENGTH),
    edm: str(raw.edm, MAX_EDM),
    t: raw.t as EdmScalar,
    nullable: raw.nullable,
  };
  if (raw.ml !== undefined) out.ml = nat(raw.ml);
  if (raw.p !== undefined) out.p = nat(raw.p);
  if (raw.s !== undefined) out.s = nat(raw.s);
  if (raw.dateOnly !== undefined) {
    need(raw.dateOnly === true);
    out.dateOnly = true;
  }
  for (const k of ["filterable", "sortable"] as const) {
    if (raw[k] !== undefined) {
      need(raw[k] === false);
      out[k] = false;
    }
  }
  if (raw.requiredInFilter !== undefined) {
    need(raw.requiredInFilter === true);
    out.requiredInFilter = true;
  }
  if (raw.label !== undefined) out.label = str(raw.label, MAX_LABEL);
  if (raw.bad !== undefined) {
    need(raw.bad === "NAME" || raw.bad === "TYPE");
    out.bad = raw.bad;
  }
  // A name that fails the rule is always marked: an unmarked one is not a basis the verify wrote.
  if (out.bad !== "NAME") need(isQueryIdentifier(out.n));
  return out;
}

/** The basis as read from its column, or null when it is not one the verify wrote. Never throws. */
export function parseQueryBasis(raw: unknown): QueryBasisV1 | null {
  try {
    let size: number;
    try {
      size = bytes(raw);
    } catch {
      return null;
    }
    if (size > QUERY_BASIS_MAX_BYTES) return null;
    need(isPlain(raw) && raw.v === 1);
    const snapshot = raw.snapshot;
    need(isPlain(snapshot));
    need(raw.odata === "V2" || raw.odata === "V4");
    need(raw.source === "METADATA" || raw.source === "SAMPLED");
    const setRaw = raw.set;
    need(isPlain(setRaw));
    const set: { -readonly [K in keyof QueryBasisSet]: QueryBasisSet[K] } = {};
    for (const k of SET_FALSE) {
      if (setRaw[k] !== undefined) {
        need(setRaw[k] === false);
        set[k] = false;
      }
    }
    if (setRaw.requiresFilter !== undefined) {
      need(setRaw.requiresFilter === true);
      set.requiresFilter = true;
    }
    if (setRaw.singleton !== undefined) {
      need(setRaw.singleton === true);
      set.singleton = true;
    }
    need(Array.isArray(raw.keys) && raw.keys.length <= 64);
    const keys = (raw.keys as unknown[]).map((k) => str(k, MAX_IDENTIFIER_LENGTH));
    need(Array.isArray(raw.properties) && raw.properties.length <= MAX_BASIS_PROPERTIES);
    const properties = (raw.properties as unknown[]).map(readProperty);
    const basis: QueryBasisV1 = {
      v: 1,
      snapshot: { id: str(snapshot.id, 64), semver: str(snapshot.semver, 64), contentHash: str(snapshot.contentHash, 128) },
      entitySet: str(raw.entitySet, 512),
      odata: raw.odata,
      source: raw.source,
      set,
      keys,
      properties,
    };
    if (raw.tooLarge !== undefined) {
      need(raw.tooLarge === true);
      return { ...basis, tooLarge: true };
    }
    return basis;
  } catch (err) {
    if (err instanceof Unreadable) return null;
    throw err;
  }
}
