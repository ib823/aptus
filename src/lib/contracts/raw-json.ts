/**
 * JSON WITH STORED OR RENDERED TEXT SPLICED IN (P1.3).
 *
 * GET /schema serves the texts the record rendered and stored (snapshot.ts),
 * and the starter kit the bytes its render job sent back (jobs.ts). Neither
 * is parsed back on the request thread: the answer is the small JSON around
 * them, with each text written in where its value stands.
 */

import { randomUUID } from "node:crypto";

/**
 * A text to splice: a string (read from the database), or the UTF-8 bytes a
 * worker encoded and transferred (compile.worker.ts), written as they are.
 */
export type RenderedText = string | Uint8Array<ArrayBuffer>;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * JSON with rendered texts spliced in verbatim: `slot(text)` stands for the
 * value `text` is the compact JSON of, and the answer is exactly what
 * JSON.stringify would have written for that value — without the request
 * thread parsing the text back into a value, nor re-encoding a worker's
 * bytes: `bytes` writes the small JSON around the slots and the slots' text
 * as it came. A slot is a token with a per-answer random nonce, so nothing
 * else in the answer (a name a builder chose, a field from SAP) can be
 * mistaken for one.
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
