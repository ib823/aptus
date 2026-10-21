/**
 * STORED JSON CROSSES AS ITS TEXT (P1.3, structural hardening round 4).
 *
 * A job handed to the envelope (envelope.ts) is measured and then copied into
 * its worker on the request thread. Round 3 handed it object graphs: a kit's
 * fixtures (up to 8 MiB of stored text) and the IRs a diff compares (up to six
 * of 2 MiB) were parsed by Prisma on this thread, walked by the size bound,
 * and structured-cloned node by node — 130 to 600 ms of blocked event loop
 * per job, before the job reached the isolate whose limits were meant to
 * bound it.
 *
 * So stored JSON that a job only hands on is read from the database as its
 * TEXT (`ir::text`, `body::text`) and carried as a reference to that text
 * (jsonTextRef): its size is its length, known without walking it; copying
 * it into the worker is one copy of a string; and it is parsed where it is
 * used — in the worker, under the heap cap and the deadline — by
 * hydrateJsonTexts, before the job runs. On the request thread (a small read,
 * read-render.ts) it is parsed the same way, inside the render's clock.
 *
 * A reference stands where the parsed value will stand; its type is the
 * value's, so the job's own types are unchanged, and nothing reads it before
 * it is hydrated (the job runners hydrate first, pipeline.ts).
 *
 * Pure; no I/O.
 */

import { jsonBytesUpToWith } from "@/lib/contracts/budget";

/** The key a reference to stored JSON text carries; nothing a contract, schema or fixture holds is an object of this one key. */
export const JSON_TEXT = "__coreedgeStoredJsonText";

interface JsonTextRef {
  readonly [JSON_TEXT]: string;
}

/** A reference: an object of exactly the one key, holding a string. */
function isRef(v: unknown): v is JsonTextRef {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  if (typeof (v as Record<string, unknown>)[JSON_TEXT] !== "string") return false;
  const keys = Object.keys(v);
  return keys.length === 1 && keys[0] === JSON_TEXT;
}

/**
 * The value a reference's text is the JSON of. A text that is not JSON was
 * never one of ours (stored JSON always parses): an object of that shape in
 * stored data itself, left as it is rather than failing the job.
 */
function parsed(ref: JsonTextRef): unknown {
  try {
    return JSON.parse(ref[JSON_TEXT]);
  } catch {
    return ref;
  }
}

/** Set an own member, whatever its key ("__proto__" included): never the object's prototype. */
function setOwn(o: object, k: string | number, v: unknown): void {
  Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
}

/**
 * A stand-in for the value `text` is the JSON of, until it is hydrated: typed
 * as that value so it can stand where the value stands.
 */
export function jsonTextRef<T>(text: string): T {
  return { [JSON_TEXT]: text } as unknown as T;
}

/** Whether a value is still a reference to stored text (not yet hydrated). */
export function isJsonTextRef(v: unknown): boolean {
  return isRef(v);
}

/** The JSON text a reference carries, to store as it is (json-text.ts); a value that is no reference throws. */
export function jsonTextOf(v: unknown): string {
  if (!isRef(v)) throw new TypeError("jsonTextOf: not a reference to JSON text");
  return v[JSON_TEXT];
}

/**
 * How deep the walks below look for references: they stand in a job's own
 * structure (a document's interfaces' contracts, a kit's fixtures), never
 * inside a contract, schema or body, which these walks do not enter.
 */
const REF_DEPTH = 8;

/**
 * `value` with every reference replaced by the value its text is the JSON of.
 * Not in place: what is copied is only the structure on the way to a
 * reference (the job's own, to REF_DEPTH), so the input a caller holds still
 * carries its texts (a render handed on to the envelope, read-render.ts). A
 * parsed value is never walked.
 */
export function hydrateJsonTexts<T>(value: T): T {
  return hydrate(value, 0) as T;
}

function hydrate(v: unknown, depth: number): unknown {
  if (isRef(v)) return parsed(v);
  if (depth >= REF_DEPTH || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) {
    let out: unknown[] | null = null;
    for (let i = 0; i < v.length; i++) {
      const x: unknown = v[i];
      const y = hydrate(x, depth + 1);
      if (y !== x) (out ??= v.slice())[i] = y;
    }
    return out ?? v;
  }
  // Only plain objects: a Uint8Array, a Date, a Map is never a place a reference stands.
  const proto = Object.getPrototypeOf(v) as unknown;
  if (proto !== Object.prototype && proto !== null) return v;
  const o = v as Record<string, unknown>;
  let out: Record<string, unknown> | null = null;
  for (const k of Object.keys(o)) {
    const x = o[k];
    const y = hydrate(x, depth + 1);
    if (y !== x) setOwn((out ??= { ...o }), k, y);
  }
  return out ?? o;
}

/**
 * The bytes a job's input is counted as, up to `limit`: its own structure as
 * JSON, and each reference as its text's length — never walking the text, or
 * anything parsed. A number above `limit` once it is known to be past it.
 * (A text's length in UTF-16 units: its UTF-8 bytes may be more, by at most
 * the factor the bound's own headroom was sized for.)
 */
export function inputBytesUpTo(value: unknown, limit: number): number {
  return jsonBytesUpToWith(value, limit, (v) => (isRef(v) ? v[JSON_TEXT].length : null));
}
