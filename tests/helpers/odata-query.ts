/**
 * Builders for the query-surface tests (P1.4): a basis from one of P1.3's
 * repository-written service descriptions, or from a hand-written property
 * list, and a compiled, prepared policy over it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { compileContract } from "@/lib/contracts/compile";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import { queryBasisOf, withSnapshot, type BasisProperty, type QueryBasisSet, type QueryBasisV1 } from "@/lib/odata/basis";
import { compileQueryPolicy } from "@/lib/odata/policy-compiler";
import { DEFAULT_PAGE, preparedFrom, type CompiledQueryPolicyV1, type PreparedPolicy, type QueryPolicySourceV1 } from "@/lib/odata/policy";

export const EDMX_DIR = path.resolve(__dirname, "../fixtures/contracts/edmx");

export const SNAPSHOT = { id: "snap_1", semver: "1.0.0", contentHash: "a".repeat(64) } as const;

/** The basis the verify would write for one dataset of a description (a file name, or the XML itself). */
export function basisFromEdmx(fileOrXml: string, entitySet: string, snapshot: QueryBasisV1["snapshot"] = SNAPSHOT): QueryBasisV1 {
  const xml = fileOrXml.trimStart().startsWith("<") || fileOrXml.trimStart().startsWith("{") ? fileOrXml : readFileSync(path.join(EDMX_DIR, fileOrXml), "utf8");
  const compiled = compileContract(xml);
  if (!compiled.ok) throw new Error(`${entitySet}: ${compiled.reason} ${compiled.detail}`);
  const slice = sliceForEntitySet(compiled.ir, entitySet, xml.length);
  if (!slice.ok) throw new Error(slice.detail);
  return withSnapshot(queryBasisOf(slice.contract), snapshot);
}

/** A basis written by hand: properties default to nullable strings. */
export function basisOf(
  props: (Partial<BasisProperty> & { n: string })[],
  keys: string[],
  opts: { odata?: "V2" | "V4"; set?: QueryBasisSet; entitySet?: string; source?: "METADATA" | "SAMPLED" } = {},
): QueryBasisV1 {
  return {
    v: 1,
    snapshot: SNAPSHOT,
    entitySet: opts.entitySet ?? "Orders",
    odata: opts.odata ?? "V2",
    source: opts.source ?? "METADATA",
    set: opts.set ?? {},
    keys,
    properties: props.map((p) => ({ edm: p.t === undefined || p.t === "S" ? "Edm.String" : `Edm.${p.t}`, t: "S", nullable: true, ...p }) as BasisProperty),
  };
}

export function source(overrides: Partial<QueryPolicySourceV1> = {}): QueryPolicySourceV1 {
  return {
    v: 1,
    select: "*",
    filter: [],
    sort: [],
    requireFilterOn: [],
    keyLookup: true,
    count: false,
    page: { ...DEFAULT_PAGE },
    ...overrides,
  };
}

/** Compile a source against a basis as a Studio save would; throws on a refusal. */
export function compiled(basis: QueryBasisV1, src: QueryPolicySourceV1 = source(), revision = 1): CompiledQueryPolicyV1 {
  const r = compileQueryPolicy(src, basis, {
    mode: "save",
    interface: { entitySet: basis.entitySet, odataVersion: basis.odata },
    revision,
    now: new Date("2026-10-27T10:00:00.000Z"),
  });
  if (!r.ok) throw new Error(`policy refused: ${JSON.stringify(r.errors)}`);
  return r.compiled;
}

export function prepared(basis: QueryBasisV1, src: QueryPolicySourceV1 = source()): PreparedPolicy {
  return preparedFrom(compiled(basis, src));
}
