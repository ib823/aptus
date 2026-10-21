/**
 * WHERE A READ PATH RENDERS (P1.3, structural hardening rounds 2 and 3).
 *
 * /schema (and its /v1 alias), the starter kit and the per-solution OpenAPI
 * document render a stored contract on every read. Their budgets (budget.ts:
 * schemaLimit, kitLimit, documentLimit) bound the BYTES, and the record
 * rendered each contract under them once, in the envelope, before storing
 * it. That did not bound the request thread: a contract inside every cap
 * still rendered 13 MB of /schema, 25 MB of kit and 10 MB of document, 0.5 to
 * 1.4 s of blocked event loop per call, on every call, with nothing cached
 * and no deadline — and every other tenant's broker reads, writes and
 * verifies waited behind it.
 *
 * So the request thread renders a read path only when it is cheap, and the
 * envelope renders everything else:
 *
 *   - ROUTED BY COST (round 3). A read whose stored input — contract,
 *     captured schema, fixtures, their sizes known from the database before
 *     any of it is read — is at most LIMITS.inlineRender.inputBytes is
 *     rendered here under a deadline of LIMITS.inlineRender.ms, whatever its
 *     worst-case budget; one that meets the deadline is handed to the
 *     envelope. Every real contract (1-100 KB) renders here in milliseconds.
 *     (Round 2 routed by budget: a 57 KB contract's kit went to the envelope,
 *     and a fourth concurrent read of one organisation was refused.)
 *   - THE THREAD'S SHARE IS BOUNDED, NOT EACH READ'S (round 3). Inline
 *     renders draw on one token bucket of render time
 *     (LIMITS.inlineRender.sharePerSecondMs, holding at most one clock): a
 *     render starts here only while the bucket has time, and its deadline is
 *     what the bucket holds. A burst of reads — cheap or expensive, of any
 *     shape, found or not — holds the thread for at most one clock at a time
 *     and a fixed share of every second; the rest render in the envelope.
 *   - AND EACH ORGANISATION'S PART OF IT (round 4). One bucket for the
 *     process let one builder's large downloads spend it, overruns and all,
 *     so every other tenant's 1 ms read went to the envelope — a worker per
 *     read. Each organisation now draws on a part of its own as well
 *     (LIMITS.inlineRender.tenantMs), and pays for what its renders took:
 *     one tenant spends at most its part, and the rest of the share is left
 *     to the others' cheap reads.
 *   - A CLOCK THAT IS READ (round 4). The deadline is the render's, ambient,
 *     and looked at on a time basis through every stage — the stored texts'
 *     parse, the schema and document builders, every charge and size walk
 *     (budget.ts, the render clock) — and a render here writes at most
 *     LIMITS.inlineRender.outputBytes: so one that meets its clock stops
 *     within about the grant, not after building a whole document. A
 *     solution document is routed by its interfaces too (documentInputBytes),
 *     never as "0 bytes" for interfaces that have no contract.
 *   - SLOT FIRST (round 3). A read that renders in the envelope takes its
 *     render slot before anything is loaded, measured or copied for it: the
 *     route hands in a loader (renderReadPathLazy), and the loader runs only
 *     once the slot is held. A read refused for want of a slot has cost the
 *     request thread nothing; one waiting for a slot costs nothing either,
 *     so reads wait their turn (envelope.ts) instead of being refused.
 *   - WHAT COMES BACK FROM THE ENVELOPE IS BYTES, transferred, never copied
 *     (compile.worker.ts), and written into the answer as they are (RawJson):
 *     the request thread never decodes, splits, joins or re-encodes the text.
 *
 * A render the envelope cannot finish (its deadline or heap) is TOO_LARGE;
 * one whose stored input is past what a render may be handed is
 * INPUT_TOO_LARGE, said as such (never as the output's budget); one it
 * cannot start (no free slot within its deadline, no worker) is UNAVAILABLE,
 * and the caller says so and that a retry may succeed.
 */

import { randomUUID } from "node:crypto";

import { LIMITS } from "@/lib/contracts/budget";
import { INPUT_CAUSE, runLoadedInEnvelope } from "@/lib/contracts/envelope";
import { renderForRead, type RenderedText, type RenderJobInput } from "@/lib/contracts/pipeline";
import { inputBytesUpTo } from "@/lib/contracts/render-input";

export type ReadRender =
  | { ok: true; texts: RenderedText[]; where: "request" | "envelope" }
  | { ok: false; reason: "TOO_LARGE" | "INPUT_TOO_LARGE" | "UNAVAILABLE"; limit: number };

/** What a route knows of a read before reading any of it. */
export interface ReadPlan {
  /** The stored input's bytes (contract, captured schema, fixtures); null when a size was not kept. */
  inputBytes: number | null;
}

/** What a route's loader gives: the render's input, or the route's own refusal (found while loading). */
export type ReadLoad<R> = { ok: true; input: RenderJobInput } | { ok: false; refusal: R };

/** The least render time an inline render starts with; with less in the bucket, the read renders in the envelope. */
const MIN_INLINE_MS = 10;

/** A token bucket of render time: milliseconds, holding at most `cap`, refilled at `perSecond`. */
interface Bucket {
  ms: number;
  at: number;
}

function refill(b: Bucket, cap: number, perSecond: number, now: number): void {
  b.ms = Math.min(cap, b.ms + ((now - b.at) * perSecond) / 1000);
  b.at = now;
}

/** THE REQUEST THREAD'S SHARE of render time (see the header). */
const share: Bucket = { ms: LIMITS.inlineRender.ms, at: Date.now() };

/**
 * EACH ORGANISATION'S PART OF IT (structural hardening round 4; budget.ts,
 * LIMITS.inlineRender.tenantMs). One bucket for the whole process let one
 * builder's large downloads spend it — and every overrun was charged to it —
 * so every other tenant's 1 ms /schema read went to the envelope, a worker
 * per read, two at a time for the whole process. Now a render starts here
 * only while its organisation's bucket has time too, its deadline is the
 * lesser of the two, and what it took (overrun and all) is charged to both:
 * an organisation that spends its part renders in the envelope until it
 * refills, and the thread's share is left to the others. A read with no
 * organisation (a test, a script) draws on the thread's share alone.
 *
 * A bucket that has refilled is the same as none, so it is forgotten; the
 * map holds only the organisations that rendered here within the last
 * second or so (pruned when it grows past TENANT_BUCKETS_PRUNE_AT).
 */
const tenantShares = new Map<string, Bucket>();
const TENANT_BUCKETS_PRUNE_AT = 1024;

function tenantBucket(tenant: string, now: number): Bucket {
  let b = tenantShares.get(tenant);
  if (!b) {
    if (tenantShares.size >= TENANT_BUCKETS_PRUNE_AT) {
      for (const [k, v] of tenantShares) {
        refill(v, LIMITS.inlineRender.tenantMs, LIMITS.inlineRender.tenantSharePerSecondMs, now);
        if (v.ms >= LIMITS.inlineRender.tenantMs) tenantShares.delete(k);
      }
    }
    b = { ms: LIMITS.inlineRender.tenantMs, at: now };
    tenantShares.set(tenant, b);
  }
  refill(b, LIMITS.inlineRender.tenantMs, LIMITS.inlineRender.tenantSharePerSecondMs, now);
  return b;
}

/** The deadline an inline render of `tenant` may have now, in ms: 0 when the thread's share or the organisation's part is spent. */
function inlineGrant(tenant: string | null): number {
  const now = Date.now();
  refill(share, LIMITS.inlineRender.ms, LIMITS.inlineRender.sharePerSecondMs, now);
  let ms = Math.min(share.ms, LIMITS.inlineRender.ms);
  if (tenant !== null) ms = Math.min(ms, tenantBucket(tenant, now).ms);
  return ms >= MIN_INLINE_MS ? ms : 0;
}

/** What an inline render took, charged to the thread's share and to its organisation's part. */
function spend(tenant: string | null, ms: number): void {
  const now = Date.now();
  refill(share, LIMITS.inlineRender.ms, LIMITS.inlineRender.sharePerSecondMs, now);
  share.ms -= ms;
  if (tenant !== null) tenantBucket(tenant, now).ms -= ms;
}

/**
 * For a test: the request thread's share of render time left now (ms), after
 * spending `spend` of it — or, given a tenant, that organisation's part of it.
 */
export function requestThreadShare(spendMs = 0, tenant?: string): number {
  const now = Date.now();
  if (tenant !== undefined) {
    const b = tenantBucket(tenant, now);
    b.ms -= spendMs;
    return b.ms;
  }
  refill(share, LIMITS.inlineRender.ms, LIMITS.inlineRender.sharePerSecondMs, now);
  share.ms -= spendMs;
  return share.ms;
}

/** Whether a read of this much stored input is tried on the request thread at all (before the share is asked). */
export function rendersOnRequestThread(inputBytes: number | null): boolean {
  return inputBytes !== null && inputBytes <= LIMITS.inlineRender.inputBytes;
}

/**
 * What a solution document's stored input is counted as when it is routed:
 * its contracts and captured schemas, and LIMITS.inlineRender.perInterfaceBytes
 * for each interface — whose names, grants and notes it renders whether or
 * not it has a contract — so a document of a thousand interfaces with no
 * contract is not "0 bytes" (structural hardening round 4). Null when a
 * size was not kept.
 */
export function documentInputBytes(storedBytes: number | null, interfaces: number): number | null {
  return storedBytes === null ? null : storedBytes + interfaces * LIMITS.inlineRender.perInterfaceBytes;
}

/**
 * Render one read path's output under its budget: on the request thread when
 * its stored input is small and the thread's share has time, in the envelope
 * otherwise — and there, `load` runs only once a render slot is held.
 * `tenant` is the organisation whose share of the envelope's render slots it
 * takes. A loader's own refusal comes back as REFUSED, with the slot (if one
 * was taken) already handed on.
 */
export async function renderReadPathLazy<R>(
  plan: ReadPlan,
  load: () => Promise<ReadLoad<R>>,
  opts: { tenant: string | null },
): Promise<ReadRender | { ok: false; reason: "REFUSED"; refusal: R }> {
  let input: RenderJobInput | null = null;
  if (rendersOnRequestThread(plan.inputBytes) && inlineGrant(opts.tenant) > 0) {
    const l = await load();
    if (!l.ok) return { ok: false, reason: "REFUSED", refusal: l.refusal };
    input = l.input;
    // Asked again: other reads may have spent the share while this one loaded.
    const ms = inlineGrant(opts.tenant);
    if (ms > 0) {
      const started = Date.now();
      let r: ReturnType<typeof renderForRead>;
      try {
        r = renderForRead(input, started + ms);
      } finally {
        spend(opts.tenant, Date.now() - started);
      }
      if (r.ok) return { ok: true, texts: r.texts, where: "request" };
      if (r.reason === "TOO_LARGE") return { ok: false, reason: "TOO_LARGE", limit: r.limit };
      // TIME: slower on this thread than its share allows — the envelope renders it instead.
    }
  }
  let refusal: { value: R } | null = null;
  const e = await runLoadedInEnvelope(
    "render",
    async () => {
      if (input === null) {
        const l = await load();
        if (!l.ok) {
          refusal = { value: l.refusal };
          return null;
        }
        input = l.input;
      }
      return { kind: "render", input };
    },
    undefined,
    { tenant: opts.tenant },
  );
  if (e === null) return { ok: false, reason: "REFUSED", refusal: (refusal as { value: R } | null)!.value };
  const limit = (input as RenderJobInput | null)?.limit ?? 0;
  if (!e.ok) {
    return {
      ok: false,
      reason: e.cause === INPUT_CAUSE ? "INPUT_TOO_LARGE" : e.reason === "RESOURCE_LIMIT" ? "TOO_LARGE" : "UNAVAILABLE",
      limit,
    };
  }
  if (e.value.ok) return { ok: true, texts: e.value.texts, where: "envelope" };
  return { ok: false, reason: "TOO_LARGE", limit: e.value.limit };
}

/** renderReadPathLazy for an input already in hand (a test, a small value): its size measured up to the inline bound. */
export async function renderReadPath(input: RenderJobInput, opts: { tenant: string | null }): Promise<ReadRender> {
  const r = await renderReadPathLazy<never>(
    { inputBytes: inputBytesUpTo(input, LIMITS.inlineRender.inputBytes) },
    () => Promise.resolve({ ok: true, input }),
    opts,
  );
  return r as ReadRender;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * JSON with rendered texts spliced in verbatim: `slot(text)` stands for the
 * value `text` is the compact JSON of, and the answer is exactly what
 * JSON.stringify would have written for that value — without the request
 * thread parsing the text back into a value, nor splitting, joining or
 * re-encoding it: `bytes` writes the small JSON around the slots and the
 * slots' bytes as they came (a worker's, transferred). A slot is a token with
 * a per-answer random nonce, so nothing else in the answer (a name a builder
 * chose, a field from SAP) can be mistaken for one.
 */
export class RawJson {
  private readonly nonce = randomUUID();
  private readonly texts: RenderedText[] = [];

  slot(text: RenderedText): string {
    this.texts.push(text);
    return this.token(this.texts.length - 1);
  }

  /** The answer as UTF-8 bytes: what a route sends. */
  bytes(value: unknown): Uint8Array<ArrayBuffer> {
    const pieces = this.pieces(value).map((p) => (typeof p === "string" ? encoder.encode(p) : p));
    const out = new Uint8Array(pieces.reduce((n, p) => n + p.byteLength, 0));
    let at = 0;
    for (const p of pieces) {
      out.set(p, at);
      at += p.byteLength;
    }
    return out;
  }

  /** The answer as text (for a test). */
  stringify(value: unknown): string {
    return this.pieces(value)
      .map((p) => (typeof p === "string" ? p : decoder.decode(p)))
      .join("");
  }

  /** The JSON around the slots, cut where each slot's token stands, with the slots' texts between. */
  private pieces(value: unknown): RenderedText[] {
    const skeleton = JSON.stringify(value);
    const found: { at: number; end: number; i: number }[] = [];
    for (let i = 0; i < this.texts.length; i++) {
      const quoted = JSON.stringify(this.token(i));
      const at = skeleton.indexOf(quoted);
      if (at >= 0) found.push({ at, end: at + quoted.length, i });
    }
    found.sort((a, b) => a.at - b.at);
    const out: RenderedText[] = [];
    let from = 0;
    for (const f of found) {
      out.push(skeleton.slice(from, f.at), this.texts[f.i]!);
      from = f.end;
    }
    out.push(skeleton.slice(from));
    return out;
  }

  private token(i: number): string {
    return `\u0000raw:${this.nonce}:${i}\u0000`;
  }
}
