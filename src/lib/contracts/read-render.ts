/**
 * WHERE A READ PATH RENDERS (P1.3, structural hardening round 2).
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
 * So the request thread renders a read path only when it is cheap BY
 * CONSTRUCTION, and the envelope renders everything else:
 *
 *   - a budget of at most LIMITS.inlineRender.bytes (known before anything is
 *     rendered: a function of the sizes stored) renders here, under a
 *     deadline of LIMITS.inlineRender.ms — a full budget is ~100 ms at the
 *     ~50 ns a byte measured, and every real contract is a small fraction of
 *     it;
 *   - a larger budget, or a render that meets that deadline, renders in the
 *     envelope (envelope.ts: a worker with its own heap cap and deadline, in
 *     slots of its own, shared fairly between organisations), from at most
 *     LIMITS.inlineRender.inputBytes of input measured before it is copied;
 *   - what comes back is text, spliced verbatim into the answer (RawJson), so
 *     the request thread copies the bytes once and never parses or
 *     re-serialises them.
 *
 * The bound does not depend on which shape of contract makes a render
 * expensive — enum unions, copies, $ref stems, or one nobody has found: the
 * request thread's share is the inline budget and the inline clock, and the
 * rest is the envelope's. A render the envelope cannot finish (its deadline
 * or heap) is TOO_LARGE; one it cannot start (no free slot, no worker) is
 * UNAVAILABLE, and the caller says so and that a retry may succeed.
 */

import { randomUUID } from "node:crypto";

import { LIMITS } from "@/lib/contracts/budget";
import { runInEnvelope } from "@/lib/contracts/envelope";
import { renderForRead, type RenderJobInput } from "@/lib/contracts/pipeline";

export type ReadRender =
  | { ok: true; texts: string[]; where: "request" | "envelope" }
  | { ok: false; reason: "TOO_LARGE" | "UNAVAILABLE"; limit: number };

/** Whether a render under this budget may run on the request thread at all. */
export function rendersOnRequestThread(limit: number): boolean {
  return limit <= LIMITS.inlineRender.bytes;
}

/**
 * Render one read path's output under its budget: on the request thread when
 * the budget allows it and the render keeps to the inline clock, in the
 * envelope otherwise. `tenant` is the organisation whose share of the
 * envelope's render slots it takes.
 */
export async function renderReadPath(input: RenderJobInput, opts: { tenant: string | null }): Promise<ReadRender> {
  if (rendersOnRequestThread(input.limit)) {
    const r = renderForRead(input, Date.now() + LIMITS.inlineRender.ms);
    if (r.ok) return { ok: true, texts: r.texts, where: "request" };
    if (r.reason === "TOO_LARGE") return { ok: false, reason: "TOO_LARGE", limit: r.limit };
    // TIME: slower on this thread than its bytes justify — the envelope renders it instead.
  }
  const e = await runInEnvelope({ kind: "render", input }, undefined, { tenant: opts.tenant });
  if (!e.ok) return { ok: false, reason: e.reason === "RESOURCE_LIMIT" ? "TOO_LARGE" : "UNAVAILABLE", limit: input.limit };
  if (e.value.ok) return { ok: true, texts: e.value.texts, where: "envelope" };
  return { ok: false, reason: "TOO_LARGE", limit: e.value.limit };
}

/**
 * JSON with rendered texts spliced in verbatim: `slot(text)` stands for the
 * value `text` is the compact JSON of, and `stringify` writes exactly what
 * JSON.stringify would have written for that value — without the request
 * thread parsing the text back into a value only to serialise it again. A
 * slot is a token with a per-answer random nonce, so nothing else in the
 * answer (a name a builder chose, a field from SAP) can be mistaken for one.
 */
export class RawJson {
  private readonly nonce = randomUUID();
  private readonly texts: string[] = [];

  slot(text: string): string {
    this.texts.push(text);
    return this.token(this.texts.length - 1);
  }

  stringify(value: unknown): string {
    let out = JSON.stringify(value);
    for (let i = 0; i < this.texts.length; i++) out = out.split(JSON.stringify(this.token(i))).join(this.texts[i]!);
    return out;
  }

  private token(i: number): string {
    return `\u0000raw:${this.nonce}:${i}\u0000`;
  }
}
