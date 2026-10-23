/**
 * Tier 2 of the query surface's conformance (P1.4, 3.21 item 7): the URLs
 * CoreEdge builds, sent to a live SAP service, and SAP's answers reduced to
 * VERDICTS. The pure part of scripts/odata-conformance-live.ts, kept here so
 * it is tested against the in-repo stub.
 *
 * WHAT A RUN DOES, per target (a service path and an entity set):
 *   1. reads the service's $metadata and compiles it with CoreEdge's own
 *      Contract Compiler into the query basis a verify would write;
 *   2. compiles the safe default query policy over it (Studio's "Enable
 *      queries"), with the count on when SAP says it counts;
 *   3. for each case, parses the query string, checks it against the policy
 *      and compiles the OData query, all with CoreEdge's own modules, and
 *      sends exactly that URL;
 *   4. records what tier 1 (tests/conformance/odata-query/) asserts of the
 *      same case: the status, the envelope keys present, the count's type,
 *      whether a next link came, whether SAP kept to $top, whether the next
 *      page repeated a row, whether only the selected fields came back, and
 *      whether a doubled quote was honoured.
 *
 * WHAT IT NEVER KEEPS. Records: a verdict is a status, booleans and the
 * protocol's own envelope key names (`results`, `__count`, `@odata.count`).
 * Nothing SAP returned is written anywhere, and no SAP data is committed
 * (decision D17).
 */

import { compileContract } from "@/lib/contracts/compile";
import { sliceForEntitySet } from "@/lib/contracts/slice";
import { queryBasisOf, withSnapshot, type QueryBasisV1 } from "@/lib/odata/basis";
import { checkQuery } from "@/lib/odata/check";
import { buildQueryUrl, compileQuery } from "@/lib/odata/operation-compiler";
import { parseQueryParams } from "@/lib/odata/params";
import { preparedFrom, type PreparedPolicy } from "@/lib/odata/policy";
import { compileQueryPolicy } from "@/lib/odata/policy-compiler";
import { suggestedQueryPolicy } from "@/lib/studio/query-policy";

export interface LiveTarget {
  readonly name: string;
  readonly odata: "V2" | "V4";
  readonly servicePath: string;
  readonly entitySet: string;
}

export interface Verdict {
  readonly target: string;
  readonly case: string;
  readonly status: number | null;
  readonly envelopeKeys: readonly string[];
  readonly countType: "string" | "number" | "absent" | null;
  readonly nextLink: boolean | null;
  readonly rowsWithinTop: boolean | null;
  readonly noRowRepeated: boolean | null;
  readonly onlySelected: boolean | null;
  readonly quoteHonoured: boolean | null;
  /** Every verdict this case has is the one tier 1 asserts. */
  readonly agrees: boolean;
  /** What tier 1 asserts of the case, in words, when this run differs. */
  readonly expected?: string;
}

export interface LiveDeps {
  readonly fetch: typeof fetch;
  /** The service root's origin and base path, e.g. https://sandbox.api.sap.com/s4hanacloud. */
  readonly baseUrl: string;
  /** Sent on every request: the sandbox's API key, never logged. */
  readonly headers: Readonly<Record<string, string>>;
}

const LIVE_SNAPSHOT = { id: "live", semver: "0.0.0", contentHash: "0".repeat(64) };

/** The basis a verify would write, from the service's own description. */
export function liveBasis(description: string, target: LiveTarget): QueryBasisV1 {
  const compiled = compileContract(description);
  if (!compiled.ok) throw new Error(`${target.name}: the description does not compile (${compiled.reason}).`);
  const slice = sliceForEntitySet(compiled.ir, target.entitySet, description.length);
  if (!slice.ok) throw new Error(`${target.name}: ${target.entitySet} is not in the description.`);
  return withSnapshot(queryBasisOf(slice.contract), LIVE_SNAPSHOT);
}

/** Studio's safe default, with the count on where SAP counts. */
export function livePolicy(basis: QueryBasisV1): PreparedPolicy {
  const source = { ...suggestedQueryPolicy(basis), count: basis.set.countable !== false };
  const r = compileQueryPolicy(source, basis, { mode: "save", interface: { entitySet: basis.entitySet, odataVersion: basis.odata }, revision: 1, now: new Date() });
  if (!r.ok) throw new Error(`the safe default does not compile: ${r.errors.map((e) => e.rule).join(", ")}`);
  return preparedFrom(r.compiled);
}

type Json = Record<string, unknown>;

/** SAP's answer reduced to what the verdicts read: the envelope, the raw rows, the count, the next link. */
function readEnvelope(odata: "V2" | "V4", body: unknown): { keys: string[]; rows: Json[] | null; count: unknown; next: boolean } {
  if (body === null || typeof body !== "object") return { keys: [], rows: null, count: undefined, next: false };
  if (odata === "V2") {
    const d = (body as Json).d;
    if (d === null || typeof d !== "object") return { keys: Object.keys(body as Json).sort(), rows: null, count: undefined, next: false };
    const rows = Array.isArray((d as Json).results) ? ((d as Json).results as Json[]) : null;
    return { keys: Object.keys(d as Json).sort(), rows, count: (d as Json).__count, next: typeof (d as Json).__next === "string" };
  }
  const root = body as Json;
  const rows = Array.isArray(root.value) ? (root.value as Json[]) : null;
  return { keys: Object.keys(root).sort(), rows, count: root["@odata.count"], next: typeof root["@odata.nextLink"] === "string" };
}

const ENVELOPE_KEY = /^(__metadata|__deferred)$|@/;

/** A row's own fields: the protocol's annotations and V2 metadata left out. */
const fieldsOf = (row: Json) => Object.keys(row).filter((k) => !ENVELOPE_KEY.test(k) && !(row[k] !== null && typeof row[k] === "object" && "__deferred" in (row[k] as Json)));

/** One case: CoreEdge's URL for a query string, and SAP's answer to it. */
async function send(deps: LiveDeps, target: LiveTarget, policy: PreparedPolicy, qs: string, position: { skip: number; page0: boolean }) {
  const parsed = parseQueryParams(new URLSearchParams(qs), qs.length + 1);
  if (!parsed.surface || !parsed.ok) throw new Error(`${target.name}: the case's query does not parse (${qs}).`);
  const checked = checkQuery(parsed, policy);
  if (!checked.ok) throw new Error(`${target.name}: the case's query is refused (${checked.detail.rule}).`);
  const top = checked.ast.kind === "LIST" && checked.ast.pageSize !== null ? checked.ast.pageSize + 1 : null;
  const query = compileQuery(checked.ast, policy, { skip: position.skip, top, page0: position.page0 }, checked.project);
  const built = buildQueryUrl(query, { baseUrl: deps.baseUrl, servicePath: target.servicePath, entitySet: target.entitySet });
  if (!built.ok) throw new Error(`${target.name}: the URL is over its cap.`);
  const res = await deps.fetch(built.url, {
    headers: { ...deps.headers, ...built.query.headers, Accept: "application/json" },
    redirect: "manual",
  });
  const text = await res.text().catch(() => "");
  let body: unknown = null;
  try {
    body = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    body = null;
  }
  return { status: res.status, envelope: readEnvelope(target.odata, body), top, selectSent: built.query.selectSent, keyParts: built.query.keyParts };
}

const keyOf = (row: Json, keys: readonly string[]) => JSON.stringify(keys.map((k) => row[k] ?? null));

/** Every case for one target, in order. Throws only on a fault of this run itself (a description that does not compile). */
export async function runTarget(target: LiveTarget, deps: LiveDeps): Promise<Verdict[]> {
  const metadata = await deps.fetch(`${deps.baseUrl}${target.servicePath}/$metadata`, { headers: { ...deps.headers, Accept: "application/xml" }, redirect: "manual" });
  if (metadata.status !== 200) {
    return [{ target: target.name, case: "METADATA", status: metadata.status, envelopeKeys: [], countType: null, nextLink: null, rowsWithinTop: null, noRowRepeated: null, onlySelected: null, quoteHonoured: null, agrees: false, expected: "200 with the service's description" }];
  }
  const basis = liveBasis(await metadata.text(), target);
  const policy = livePolicy(basis);
  const keys = policy.compiled.tieBreak.length > 0 ? policy.compiled.tieBreak : (policy.compiled.key ?? []);
  const firstKey = keys[0];
  if (firstKey === undefined) throw new Error(`${target.name}: the dataset has no key CoreEdge can address.`);
  const out: Verdict[] = [];
  const blank = { envelopeKeys: [] as string[], countType: null, nextLink: null, rowsWithinTop: null, noRowRepeated: null, onlySelected: null, quoteHonoured: null };
  const rowsKey = target.odata === "V2" ? "results" : "value";

  // C-INLINE: a counted first page, within $top, in the version's envelope.
  {
    const r = await send(deps, target, policy, `pageSize=5${policy.compiled.count ? "&count=true" : ""}`, { skip: 0, page0: true });
    const countType = r.envelope.count === undefined ? "absent" : typeof r.envelope.count === "number" ? "number" : typeof r.envelope.count === "string" ? "string" : null;
    const rowsWithinTop = r.envelope.rows === null ? null : r.top === null || r.envelope.rows.length <= r.top;
    const countOk = !policy.compiled.count || (target.odata === "V2" ? countType === "string" : countType === "number" || countType === "string");
    const agrees = r.status === 200 && r.envelope.keys.includes(rowsKey) && countOk && rowsWithinTop === true;
    out.push({ target: target.name, case: "C-INLINE", status: r.status, ...blank, envelopeKeys: r.envelope.keys, countType, nextLink: r.envelope.next, rowsWithinTop, agrees, ...(agrees ? {} : { expected: `200, ${rowsKey} present, rows within $top${policy.compiled.count ? `, a ${target.odata === "V2" ? "string" : "numeric"} count` : ""}` }) });
  }

  // P-SKIP-TOP-PEEK: the second page repeats no row of the first.
  if (policy.compiled.paging === "OFFSET") {
    const first = await send(deps, target, policy, "pageSize=3", { skip: 0, page0: true });
    const second = await send(deps, target, policy, "pageSize=3", { skip: 3, page0: false });
    const seen = new Set((first.envelope.rows ?? []).slice(0, 3).map((row) => keyOf(row, keys)));
    const noRowRepeated = second.envelope.rows === null ? null : second.envelope.rows.every((row) => !seen.has(keyOf(row, keys)));
    const agrees = first.status === 200 && second.status === 200 && noRowRepeated === true;
    out.push({ target: target.name, case: "P-SKIP-TOP-PEEK", status: second.status, ...blank, envelopeKeys: second.envelope.keys, noRowRepeated, agrees, ...(agrees ? {} : { expected: "200 on both pages, and no row of the first page on the second" }) });
  }

  // S-SELECT: only the selected field and the key come back.
  {
    const r = await send(deps, target, policy, `select=${firstKey}&pageSize=3`, { skip: 0, page0: true });
    const allowed = new Set([firstKey, ...keys]);
    const onlySelected = r.envelope.rows === null ? null : r.envelope.rows.every((row) => fieldsOf(row).every((f) => allowed.has(f)));
    const agrees = r.status === 200 && onlySelected === true;
    out.push({ target: target.name, case: "S-SELECT", status: r.status, ...blank, envelopeKeys: r.envelope.keys, onlySelected, agrees, ...(agrees ? {} : { expected: "200, and only the selected field and the key in each row (CoreEdge projects either way)" }) });
  }

  // L-STRING-QUOTE: a value with a quote is a value, not syntax.
  const stringKey = keys.find((k) => policy.fields.get(k)?.t === "S" && (policy.fields.get(k)?.ops ?? []).includes("eq"));
  if (stringKey !== undefined) {
    const r = await send(deps, target, policy, `filter.${stringKey}.eq=${encodeURIComponent("O'Q")}&pageSize=1`, { skip: 0, page0: true });
    const quoteHonoured = r.status === 200 && r.envelope.rows !== null;
    out.push({ target: target.name, case: "L-STRING-QUOTE", status: r.status, ...blank, envelopeKeys: r.envelope.keys, quoteHonoured, agrees: quoteHonoured, ...(quoteHonoured ? {} : { expected: "200: a doubled quote inside a string literal is honoured" }) });
  }
  return out;
}
