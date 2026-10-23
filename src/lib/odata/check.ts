/**
 * Checking a parsed request against the interface's compiled query policy,
 * and building the canonical AST from it (P1.4, 3.6).
 *
 * AFTER AUTHORISATION, ON PURPOSE. A caller without a grant learns nothing
 * about the policy: which fields exist, which may be filtered, how large a
 * page may be. Everything before the grant (params.ts) refuses the same way
 * whatever interface the path names.
 *
 * THE RULES RUN IN ONE ORDER, and the first failure answers. A refusal that
 * says a field is not allowed names the field (an identifier, so safe to
 * echo) and up to 20 names the policy does allow for that purpose; the same
 * caller can read the full list in its per-interface OpenAPI, so this is
 * convenience, not disclosure.
 *
 * WHAT IT RETURNS IS ALL THE COMPILER SEES. The AST carries the field names
 * the policy vouched for and typed values; the compiler emits `field.n` from
 * the returned map, never a string from the request.
 *
 * P1.5's HOOK. `allowed` (the grant's field scope) replaces "readable" in every
 * rule when given: readable ∩ allowed. Filtering and sorting stay subsets of
 * it, so a field outside the scope can be neither read nor used as an oracle.
 */

import { compareCodeUnits, type Bound, type KeyPart, type Lit, type LitType, type Predicate, type QueryAstV1 } from "@/lib/odata/ast";
import { parseLiteral, type LiteralFacets } from "@/lib/odata/literals";
import type { FilterOps, ParsedQueryOk } from "@/lib/odata/params";
import { parseCompiledPolicy, type CompiledField, type PreparedPolicy, type QueryFilterOp } from "@/lib/odata/policy";
import { queryRefusal, type QueryRefusal } from "@/lib/odata/rules";

/** The one message for every cursor that cannot be used (cursor.ts says the same). */
export const CURSOR_UNUSABLE_MESSAGE = "This cursor cannot be used. Start again from the first page without a cursor.";

/**
 * Rule 1: a compiled policy exists, can be read, is READY, and describes the
 * dataset the interface names. `sourcePresent` tells a policy whose compiled
 * form a contract change cleared (NO_CONTRACT: verify the service) from one
 * that never existed (NO_POLICY).
 */
export function checkPolicyAvailable(
  raw: unknown,
  ctx: { readonly entitySet: string | null; readonly sourcePresent?: boolean },
): { readonly ok: true; readonly policy: PreparedPolicy } | QueryRefusal {
  if (raw === null || raw === undefined) {
    return ctx.sourcePresent
      ? queryRefusal(
          "QUERY_NOT_AVAILABLE",
          "NO_CONTRACT",
          "This interface's contract changed and has not been verified since; its builder must verify the service before it serves queries again.",
        )
      : queryRefusal(
          "QUERY_NOT_AVAILABLE",
          "NO_POLICY",
          "This interface has no query policy, so it serves no query parameters. Its builder can enable queries in Studio.",
        );
  }
  const prepared = parseCompiledPolicy(raw);
  if ("unreadable" in prepared) {
    return queryRefusal("QUERY_NOT_AVAILABLE", "POLICY_UNREADABLE", "This interface's query policy cannot be read; its builder must save it again in Studio.");
  }
  if (prepared.compiled.state !== "READY" || prepared.compiled.entitySet !== ctx.entitySet) {
    return queryRefusal(
      "QUERY_NOT_AVAILABLE",
      "POLICY_STALE",
      "This interface's query policy no longer matches its contract; its builder must review it in Studio.",
    );
  }
  return { ok: true, policy: prepared };
}

export interface CheckedQuery {
  readonly ok: true;
  readonly ast: QueryAstV1;
  /** The effective select, in policy order: what every row is projected to. */
  readonly project: readonly string[];
  /** The fields the query may name, by name. */
  readonly fields: ReadonlyMap<string, CompiledField>;
}

const facetsOf = (f: CompiledField): LiteralFacets => {
  const out: { ml?: number; p?: number; s?: number; dateOnly?: true } = {};
  if (f.ml !== undefined) out.ml = f.ml;
  if (f.p !== undefined) out.p = f.p;
  if (f.s !== undefined) out.s = f.s;
  if (f.dateOnly) out.dateOnly = true;
  return out;
};

/** The operators a request uses on one field, a one-value `in` counted as eq. */
function opsSent(ops: FilterOps): QueryFilterOp[] {
  const out: QueryFilterOp[] = [];
  if (ops.eq !== undefined) out.push("eq");
  if (ops.in !== undefined) out.push(new Set(ops.in).size === 1 ? "eq" : "in");
  for (const op of ["gt", "ge", "lt", "le"] as const) if (ops[op] !== undefined) out.push(op);
  return out;
}

/** The parameter a field's predicate came in on, for the refusal. */
function parameterOf(field: string, ops: FilterOps): string {
  const op = (["eq", "in", "gt", "ge", "lt", "le"] as const).find((o) => ops[o] !== undefined) ?? "eq";
  return `filter.${field}.${op}`;
}

const uniqueSortedLits = (lits: Lit[]): Lit[] => {
  const byValue = new Map<string, Lit>();
  for (const l of lits) if (!byValue.has(l.v)) byValue.set(l.v, l);
  return [...byValue.values()].sort((a, b) => compareCodeUnits(a.v, b.v));
};

export function checkQuery(
  parsed: ParsedQueryOk,
  policy: PreparedPolicy,
  opts: { readonly allowed?: ReadonlySet<string> } = {},
): CheckedQuery | QueryRefusal {
  const c = policy.compiled;
  if (c.state !== "READY") {
    return queryRefusal("QUERY_NOT_AVAILABLE", "POLICY_STALE", "This interface's query policy no longer matches its contract; its builder must review it in Studio.");
  }
  const scope = opts.allowed;
  const inScope = (n: string) => policy.fields.has(n) && (scope === undefined || scope.has(n));
  const readable = policy.readable.filter(inScope);
  const filterable = policy.filterable.filter(inScope);
  const sortable = policy.sortable.filter(inScope);
  const field = (n: string): CompiledField | undefined => (inScope(n) ? policy.fields.get(n) : undefined);
  const notGranted = (rule: Parameters<typeof queryRefusal>[1], message: string, extras: Parameters<typeof queryRefusal>[3]) =>
    queryRefusal("POLICY_FIELD_NOT_GRANTED", rule, message, extras);

  let key: KeyPart[] | null = null;
  if (parsed.kind === "KEY") {
    const sent = parsed.key ?? new Map<string, string>();
    // 2 — key lookup is allowed at all, on fields within scope.
    if (c.key === null || !c.key.every(inScope)) {
      return notGranted("KEY_LOOKUP_NOT_ALLOWED", "This interface does not allow key lookup.", {});
    }
    // 3 — exactly the key parts, none missing and none extra.
    const extra = [...sent.keys()].find((k) => !c.key!.includes(k));
    const missing = c.key.find((k) => !sent.has(k));
    if (extra !== undefined || missing !== undefined) {
      return queryRefusal(
        "QUERY_INVALID",
        "KEY_INCOMPLETE",
        `A key lookup names every key field exactly once, and nothing else: ${c.key.map((k) => `key.${k}`).join(", ")}.`,
        { parameter: extra !== undefined ? `key.${extra}` : `key.${missing}`, allowed: c.key },
      );
    }
  }

  // 4 — every selected field is readable.
  if (parsed.select !== null) {
    for (const n of parsed.select) {
      if (field(n) === undefined) {
        return notGranted("FIELD_NOT_SELECTABLE", `select: this interface does not allow reading ${n}.`, { parameter: "select", field: n, allowed: readable });
      }
    }
  }

  const filterFields = [...parsed.filter.keys()].sort(compareCodeUnits);
  // 5 — every filtered field is readable and filterable.
  for (const n of filterFields) {
    const f = field(n);
    if (f === undefined || f.ops === undefined) {
      return notGranted("FIELD_NOT_FILTERABLE", `filter.${n}: this interface does not allow filtering on ${n}.`, {
        parameter: parameterOf(n, parsed.filter.get(n)!),
        field: n,
        allowed: filterable,
      });
    }
  }
  // 6 — every operator is allowed on its field.
  for (const n of filterFields) {
    const f = field(n)!;
    const ops = parsed.filter.get(n)!;
    for (const op of opsSent(ops)) {
      if (!f.ops!.includes(op)) {
        const sentAs = op === "eq" && ops.eq === undefined ? "in" : op;
        return notGranted("OPERATOR_NOT_ALLOWED", `filter.${n}.${sentAs}: this interface does not allow ${op} on ${n}.`, {
          parameter: `filter.${n}.${sentAs}`,
          field: n,
          allowed: f.ops,
        });
      }
    }
  }

  // 7 — every value parses for its type and facets.
  const predicates: Predicate[] = [];
  const valueRefusal = (parameter: string, r: { rule: "VALUE_INVALID" | "VALUE_TOO_LONG"; expected: string }) =>
    queryRefusal("QUERY_INVALID", r.rule, `${parameter} must be ${r.expected}.`, { parameter });
  for (const n of filterFields) {
    const f = field(n)!;
    const t = f.t as LitType;
    const facets = facetsOf(f);
    const ops = parsed.filter.get(n)!;
    if (ops.eq !== undefined || ops.in !== undefined) {
      const texts = ops.eq !== undefined ? [ops.eq] : ops.in!;
      const lits: Lit[] = [];
      for (const text of texts) {
        const r = parseLiteral(t, text, facets, { allowEmpty: true });
        if (!r.ok) return valueRefusal(`filter.${n}.${ops.eq !== undefined ? "eq" : "in"}`, r);
        lits.push(r.lit);
      }
      const vs = uniqueSortedLits(lits);
      predicates.push(vs.length === 1 ? { f: n, op: "eq", v: vs[0]! } : { f: n, op: "in", vs });
      continue;
    }
    let lo: Bound | undefined;
    let hi: Bound | undefined;
    for (const op of ["gt", "ge", "lt", "le"] as const) {
      const text = ops[op];
      if (text === undefined) continue;
      const r = parseLiteral(t, text, facets);
      if (!r.ok) return valueRefusal(`filter.${n}.${op}`, r);
      const b: Bound = { incl: op === "ge" || op === "le", v: r.lit };
      if (op === "gt" || op === "ge") lo = b;
      else hi = b;
    }
    predicates.push(lo && hi ? { f: n, op: "range", lo, hi } : lo ? { f: n, op: "range", lo } : { f: n, op: "range", hi: hi! });
  }
  if (parsed.kind === "KEY") {
    key = [];
    for (const k of c.key!) {
      const f = field(k)!;
      const r = parseLiteral(f.t as LitType, parsed.key!.get(k)!, facetsOf(f));
      if (!r.ok) return valueRefusal(`key.${k}`, r);
      key.push({ f: k, v: r.lit });
    }
    // A key value with a slash cannot go into a path segment (an
    // intermediary that decodes %2F would split it); it is read through a
    // filter instead, when SAP lets every key part be filtered.
    if (!c.keyViaFilter && key.some((p) => p.v.t === "S" && (p.v.v.includes("/") || p.v.v.includes("\\")))) {
      return queryRefusal("QUERY_INVALID", "KEY_NOT_ADDRESSABLE", "This key value cannot be addressed on this service.", {
        parameter: `key.${key.find((p) => p.v.v.includes("/") || p.v.v.includes("\\"))!.f}`,
      });
    }
  }

  if (parsed.kind === "LIST") {
    // 8 — required filters.
    const byField = new Map(predicates.map((p) => [p.f, p]));
    for (const n of c.requireFilterOn) {
      const p = byField.get(n);
      const constrained = p !== undefined && (p.op === "eq" || p.op === "in" || (p.op === "range" && p.lo !== undefined && p.hi !== undefined));
      if (!constrained) {
        return notGranted("FILTER_REQUIRED", `This interface requires a filter on ${n}: eq, in, or both a lower and an upper bound.`, {
          field: n,
          allowed: c.requireFilterOn,
        });
      }
    }
    if (c.requiresAnyFilter && predicates.length === 0) {
      return notGranted("FILTER_REQUIRED", "This interface requires at least one filter.", { allowed: filterable });
    }
    // 9 — every orderby field is sortable.
    for (const o of parsed.orderby) {
      if (field(o.f)?.sort !== true) {
        return notGranted("FIELD_NOT_SORTABLE", `orderby: this interface does not allow sorting on ${o.f}.`, {
          parameter: "orderby",
          field: o.f,
          allowed: sortable,
        });
      }
    }
    // 10 — count.
    if (parsed.count && !c.count) {
      return notGranted("COUNT_NOT_ALLOWED", "This interface does not allow count=true.", { parameter: "count" });
    }
    // 11 — page size: refused above the maximum, never clamped (D5).
    if (parsed.pageSize !== null && parsed.pageSize > c.page.maxSize) {
      return notGranted("PAGE_SIZE_NOT_ALLOWED", `pageSize may be at most ${c.page.maxSize} on this interface.`, { parameter: "pageSize" });
    }
    // 12 — a cursor needs a dataset that pages.
    if (parsed.cursor !== null && c.paging !== "OFFSET") {
      return queryRefusal("QUERY_INVALID", "CURSOR_INVALID", CURSOR_UNUSABLE_MESSAGE, { parameter: "cursor" });
    }
  }

  const select = parsed.select === null ? null : [...new Set(parsed.select)].sort(compareCodeUnits);
  const ast: QueryAstV1 =
    parsed.kind === "KEY"
      ? { v: 1, kind: "KEY", select, filter: [], orderby: [], key, count: false, pageSize: null }
      : {
          v: 1,
          kind: "LIST",
          select,
          filter: predicates,
          orderby: parsed.orderby.map((o) => ({ f: o.f, desc: o.desc })),
          key: null,
          count: parsed.count,
          pageSize: parsed.pageSize ?? c.page.defaultSize,
        };
  const selected = select === null ? null : new Set(select);
  const project = readable.filter((n) => selected === null || selected.has(n));
  const fields = new Map<string, CompiledField>();
  for (const n of readable) fields.set(n, policy.fields.get(n)!);
  return { ok: true, ast, project, fields };
}
