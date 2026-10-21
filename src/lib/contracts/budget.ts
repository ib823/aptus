/**
 * THE ONE OUTPUT BUDGET of the Contract Compiler and of everything rendered
 * from a contract (P1.3, structural containment).
 *
 * WHY ONE MODULE. Three hostile-input reviews each found a path that turned a
 * small description into a large output — copies of a base type, an enum
 * union per property, a diff repeating a name per change, imports multiplying
 * an action's parameters, `$ref` stems, a /schema with no budget — and each
 * was closed by its own check, in its own place, with its own constant. That
 * does not converge. So every writer of contract-derived output counts the
 * bytes it writes HERE, as it writes them, and stops at a limit stated HERE:
 *
 *   - the canonical writer (the content hash streams through writeJson);
 *   - the slice (each copy of a declaration is charged before it is made);
 *   - the stored diff;
 *   - /schema, the starter kit and the per-solution OpenAPI documents.
 *
 * A limit spent is a typed refusal (BudgetExceeded), never a RangeError, an
 * out-of-memory or a string built in full only to be refused for its size.
 *
 * THE BOUNDS (LIMITS, below), each proportional to what it is made from and
 * each capped absolutely:
 *
 *   description  ≤ 8 MiB                                   (the verify's read)
 *   contract     ≤ max(128 KiB, 12 × description chars), ≤ 2 MiB  canonical JSON
 *   stored diff  ≤ 1 MiB
 *   /schema      ≤ 64 KiB + 16 × contract bytes, ≤ 16 MiB
 *   starter kit  ≤ 512 KiB + 32 × contract bytes + 8 × fixture bytes, ≤ 32 MiB
 *   solution doc ≤ 256 KiB + Σ (128 KiB + 16 × contract bytes), ≤ 32 MiB,
 *                  over contracts (and captured schemas) adding up to ≤ 2 MiB,
 *                  for at most (32 MiB − 256 KiB) / 128 KiB = 254 interfaces
 *   captured schema ≤ 2,000 properties and 512 KiB, from a request body of
 *                  ≤ 4.5 MiB; read back only while its stored text is ≤ 1 MiB
 *   snapshot history ≤ 100 rows per interface, plus each environment's newest
 *   envelope input  ≤ the description cap (compile) or the contract cap per
 *                  contract (prepare, diff), measured before it is copied in
 *
 * The factors are the worst shapes measured (tests/unit/contracts and the
 * fuzz property test); a real slice renders at 2-16x, and its fixed text
 * (README, mock server, error envelopes) is what the floors are for.
 *
 * WHERE THE WORK IS BOUNDED. Bytes are counted here; CPU and memory of the
 * compile are bounded by the envelope it runs in (envelope.ts: a worker with
 * a heap cap and a wall-clock deadline). Every read path renders under the
 * budget its contract was measured against at record time, inside that
 * envelope (pipeline.ts), so what a read renders was rendered once already,
 * within the same bytes, before the contract was ever stored.
 *
 * PURE. No I/O; usable in the worker and on a read path alike.
 */

const KiB = 1024;
const MiB = 1024 * KiB;

export const LIMITS = {
  /** The description read from a tenant (VERIFY_MAX_METADATA_BYTES, the XML reader's maxBytes). */
  sourceBytes: 8 * MiB,
  /** A sliced contract as canonical JSON: in proportion to its description, and capped. */
  contract: { perSourceChar: 12, floor: 128 * KiB, cap: 2 * MiB },
  /** A snapshot's stored diff. */
  storedDiff: 1 * MiB,
  /** GET /schema: the four schemas and the write body beside them. */
  schema: { perContractByte: 16, floor: 64 * KiB, cap: 16 * MiB },
  /** The starter kit (every file, before the response wraps them). */
  kit: { perContractByte: 32, perFixtureByte: 8, floor: 512 * KiB, cap: 32 * MiB },
  /** The per-solution OpenAPI document. */
  document: { perContractByte: 16, perInterface: 128 * KiB, floor: 256 * KiB, cap: 32 * MiB, contractsCap: 2 * MiB },
  /**
   * A schema captured from sampled rows (schema-capture.ts), as stored on the
   * Interface row and served by /schema, the kit and the solution document.
   * Refused at capture past `properties` distinct fields or `bytes` of compact
   * JSON, from a request body of at most `requestBytes`; on a read path, a
   * stored one whose text (Postgres's jsonb text, at most twice the compact
   * JSON of one stored under the cap) is past `storedTextBytes` is named and
   * never read (captured-schema-store.ts), and what is served is charged to
   * the read path's budget as `served` more bytes than its contract allows.
   */
  capturedSchema: { properties: 2000, bytes: 512 * KiB, requestBytes: 4.5 * MiB, storedTextBytes: 1 * MiB, served: 520 * KiB },
  /**
   * Rows of contract history kept per interface beyond each environment's
   * newest (snapshot.ts): older ones are pruned when a new one is recorded, so
   * what a record reads and stores stays bounded however often a description
   * flips.
   */
  snapshotHistory: 100,
  /** Documents up to this size are indented for the person reading them; larger ones are compact. */
  prettyDocument: 512 * KiB,
  /** Nesting a writer follows before it refuses: no contract, schema or fixture comes near it. */
  jsonDepth: 1000,
} as const;

/** The read paths' budgets, as functions of a contract's size take them (configurable, for a test that tightens them). */
export interface RenderLimits {
  schema: { perContractByte: number; floor: number; cap: number };
  kit: { perContractByte: number; perFixtureByte: number; floor: number; cap: number };
  document: { perContractByte: number; perInterface: number; floor: number; cap: number };
}

/** What a budget was for, as a refusal names it. */
export type BudgetName =
  | "contract"
  | "slice"
  | "storedDiff"
  | "schema"
  | "kit"
  | "document"
  | "capturedSchema"
  | "envelopeInput"
  | "measure"
  | "time"
  | "depth";

/** A budget spent: a refusal, typed, never an error the caller has to guess at. */
export class BudgetExceeded extends Error {
  override readonly name = "BudgetExceeded";
  constructor(
    readonly budget: BudgetName,
    readonly limit: number,
    readonly spent: number,
  ) {
    super(`The ${budget} budget of ${limit} was spent (${spent}).`);
  }
}

/** How many charges pass between two looks at the clock. */
const CLOCK_EVERY = 1024;

/**
 * Bytes, counted as they are written, refused past `limit`. Optionally a
 * wall-clock deadline too (ms since the epoch), checked every CLOCK_EVERY
 * charges: a read path that renders far slower than its bytes justify stops
 * with the same typed refusal.
 */
export class OutputBudget {
  spent = 0;
  private charges = 0;

  constructor(
    readonly budget: BudgetName,
    readonly limit: number,
    private readonly deadline: number | null = null,
  ) {}

  charge(bytes: number): void {
    this.spent += bytes;
    if (this.spent > this.limit) throw new BudgetExceeded(this.budget, this.limit, this.spent);
    if (this.deadline !== null && ++this.charges % CLOCK_EVERY === 0 && Date.now() > this.deadline) {
      throw new BudgetExceeded("time", this.deadline, Date.now());
    }
  }

  /** Charge a string's UTF-8 length. */
  chargeText(s: string): void {
    this.charge(utf8Length(s));
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.spent);
  }

  /** No limit and no deadline: nothing for a writer to stop at. */
  get unbounded(): boolean {
    return this.limit === Number.POSITIVE_INFINITY && this.deadline === null;
  }

  /** Look at the clock now: for work that is not writing bytes (compactSize's walk). */
  checkClock(): void {
    if (this.deadline !== null && Date.now() > this.deadline) throw new BudgetExceeded("time", this.deadline, Date.now());
  }
}

/** A budget nothing spends: for writers called where no limit applies (tests, small values). */
export const UNLIMITED = (): OutputBudget => new OutputBudget("measure", Number.POSITIVE_INFINITY);

const hasBuffer = typeof Buffer !== "undefined" && typeof Buffer.byteLength === "function";

/** The UTF-8 length of a string; a lone surrogate counts as the three bytes of U+FFFD, as Buffer encodes it. */
export function utf8Length(s: string): number {
  if (hasBuffer) return Buffer.byteLength(s, "utf8");
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

export interface JsonWriteOptions {
  /**
   * Object keys in the canonical order: exactly JSON.stringify(sortKeys(v))
   * as canonical.ts always wrote it — keys sorted by UTF-16 code unit, then
   * re-inserted, so integer-like keys come first in numeric order, as any
   * object re-built from sorted keys orders them. `toJSON` is not called.
   */
  sortKeys?: boolean;
  /** Spaces of indentation, as JSON.stringify's third argument; 0 or absent is compact. */
  indent?: number;
}

/**
 * JSON, written in pieces to `sink`, every piece charged to `budget` BEFORE it
 * is handed on: the same text JSON.stringify(value, null, indent) writes (or,
 * with sortKeys, canonical.ts's canonical form), but refused (BudgetExceeded)
 * as soon as it would pass the limit, however much the value shares. A value
 * small in memory and enormous as text — one string referenced from a
 * hundred thousand places — costs at most `limit` bytes of work here.
 *
 * Top-level `undefined` (or a function) writes nothing, as JSON.stringify
 * returns undefined for it.
 *
 * Compact and unsorted — the large documents (a kit's two OpenAPI files, the
 * solution document) — it is sized exactly first and refused before a byte is
 * written when it would pass the budget, then written by the native writer
 * (compactJson). Indented or canonical, it is written here piece by piece,
 * small plain subtrees through the native writer (isSmallFlat).
 */
export function writeJson(value: unknown, budget: OutputBudget, sink: ((piece: string) => void) | null, opts: JsonWriteOptions = {}): void {
  const sortKeys = opts.sortKeys === true;
  if (!sortKeys && !(opts.indent && opts.indent > 0)) {
    // Compact and unsorted: sized, then written natively (compactJson).
    const text = compactJson(value, budget);
    if (sink !== null && text.length > 0) sink(text);
    return;
  }
  const unit = opts.indent && opts.indent > 0 ? " ".repeat(Math.min(10, opts.indent)) : "";
  /*
   * Pieces are charged one by one (so the budget stops within one piece of
   * its limit) and handed to the sink in runs of about FLUSH_AT characters
   * (so a hash or an array of parts sees few, large pieces).
   */
  let buffered = "";
  const emit = (s: string) => {
    budget.charge(NON_ASCII.test(s) ? utf8Length(s) : s.length);
    if (sink === null) return;
    buffered += s;
    if (buffered.length >= FLUSH_AT) {
      sink(buffered);
      buffered = "";
    }
  };
  /** Newline plus indentation per depth, made once each. */
  const breaks: string[] = [];
  const lineAt = (depth: number): string => (unit ? (breaks[depth] ??= `\n${unit.repeat(depth)}`) : "");
  /** Whether a member with this value is written at all (JSON.stringify skips undefined, functions, symbols). */
  const skipped = (v: unknown) => v === undefined || typeof v === "function" || typeof v === "symbol";

  const write = (raw: unknown, depth: number, key: string): void => {
    let v = raw;
    if (!sortKeys && v !== null && typeof v === "object" && typeof (v as { toJSON?: unknown }).toJSON === "function") {
      v = (v as { toJSON: (k: string) => unknown }).toJSON(key);
    }
    if (v === null) return emit("null");
    switch (typeof v) {
      case "string":
        return emit(JSON.stringify(v));
      case "number":
        return emit(Number.isFinite(v) ? JSON.stringify(v) : "null");
      case "boolean":
        return emit(v ? "true" : "false");
      case "bigint":
        throw new TypeError("Do not know how to serialize a BigInt");
      case "object":
        break;
      default:
        return emit("null");
    }
    if (depth >= LIMITS.jsonDepth) throw new BudgetExceeded("depth", LIMITS.jsonDepth, depth);
    if (isSmallFlat(v)) {
      // A small tree of plain values: the native writer, whose text is the
      // same and whose size is bounded by the check (isSmallFlat) — on a copy
      // with its keys in the canonical order when that is asked for.
      const s = JSON.stringify(sortKeys ? sortedCopy(v) : v, null, unit || undefined);
      return emit(unit && depth > 0 ? s.replace(/\n/g, lineAt(depth)) : s);
    }
    const inner = lineAt(depth + 1);
    const outer = lineAt(depth);
    if (Array.isArray(v)) {
      if (v.length === 0) return emit("[]");
      for (let i = 0; i < v.length; i++) {
        emit(i === 0 ? `[${inner}` : `,${inner}`);
        const x: unknown = v[i];
        if (skipped(x)) emit("null");
        else write(x, depth + 1, String(i));
      }
      emit(`${outer}]`);
      return;
    }
    const obj = v as Record<string, unknown>;
    let keys = Object.keys(obj);
    if (sortKeys) {
      // Exactly the order of an object re-built from the sorted keys (see JsonWriteOptions).
      const rebuilt: Record<string, true> = {};
      for (const k of keys.sort()) if (obj[k] !== undefined) rebuilt[k] = true;
      keys = Object.keys(rebuilt);
    }
    let first = true;
    const colon = unit ? ": " : ":";
    for (const k of keys) {
      const x = obj[k];
      if (skipped(x)) continue;
      emit(`${first ? "{" : ","}${inner}${JSON.stringify(k)}${colon}`);
      first = false;
      write(x, depth + 1, k);
    }
    emit(first ? "{}" : `${outer}}`);
  };

  if (!skipped(value)) write(value, 0, "");
  if (sink !== null && buffered.length > 0) sink(buffered);
}

/** Members (counted at every level, every time they are reached) and characters a small value may add up to (isSmallFlat). */
const FLAT_MEMBERS = 512;
const FLAT_CHARS = 64 * 1024;
const FLAT_DEPTH = 16;

/**
 * A small tree of plain objects and arrays — few members, short text, shallow
 * — written by the native JSON.stringify in one call, which is many times
 * faster than member by member. Bounded by construction: every member is
 * counted each time it is reached, shared or not, so its text is at most
 * FLAT_CHARS characters plus a few per member and it can never be the
 * amplification the budget is for.
 */
function isSmallFlat(root: object): boolean {
  const tally = { members: 0, chars: 0 };
  return fitsFlat(root, 0, tally);
}

function fitsFlat(v: object, depth: number, tally: { members: number; chars: number }): boolean {
  if (depth > FLAT_DEPTH) return false;
  const isArray = Array.isArray(v);
  if (!isArray) {
    const proto = Object.getPrototypeOf(v) as unknown;
    if (proto !== Object.prototype && proto !== null) return false;
  } else if ((v as unknown[]).length > FLAT_MEMBERS) {
    // A sparse array's holes are not own keys, but JSON writes each one.
    return false;
  }
  const keys = isArray ? null : Object.keys(v);
  const n = keys ? keys.length : (v as unknown[]).length;
  for (let i = 0; i < n; i++) {
    const k = keys ? keys[i]! : i;
    if (++tally.members > FLAT_MEMBERS) return false;
    const x = (v as Record<string | number, unknown>)[k];
    if (typeof k === "string") tally.chars += k.length;
    if (typeof x === "string") tally.chars += x.length;
    else if (typeof x === "bigint") return false;
    else if (x !== null && typeof x === "object" && !fitsFlat(x, depth + 1, tally)) return false;
    if (tally.chars > FLAT_CHARS) return false;
  }
  return true;
}

/**
 * A small plain tree (isSmallFlat) re-built with every object's keys sorted
 * and its undefined members dropped: exactly what canonical.ts's sortKeys
 * always made, so JSON.stringify of it is the canonical text.
 */
function sortedCopy(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortedCopy);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) {
      const x = (v as Record<string, unknown>)[k];
      if (x !== undefined) out[k] = sortedCopy(x);
    }
    return out;
  }
  return v;
}

/** Characters past ASCII: a piece without them is as many bytes as it is long. */
const NON_ASCII = /[^\x00-\x7f]/;
/** How much the writer buffers before handing a run of pieces to its sink. */
const FLUSH_AT = 16 * 1024;

/**
 * writeJson into a string.
 *
 * Compact and unsorted, the text is JSON.stringify's own, written only once
 * its exact size is known to fit (compactJson).
 */
export function jsonText(value: unknown, budget: OutputBudget, opts: JsonWriteOptions = {}): string {
  const parts: string[] = [];
  writeJson(value, budget, (p) => parts.push(p), opts);
  return parts.join("");
}

/** A string whose JSON is itself in quotes: printable ASCII but `"` and `\`. */
const PLAIN = /^[\x20\x21\x23-\x5b\x5d-\x7e]*$/;

/** The UTF-8 bytes of a string written as JSON. */
function quotedBytes(s: string): number {
  return PLAIN.test(s) ? s.length + 2 : utf8Length(JSON.stringify(s));
}

/** Nodes the size walk visits between two looks at a budget's clock. */
const CLOCK_EVERY_NODES = 4096;

/**
 * THE EXACT UTF-8 LENGTH OF JSON.stringify(value), compact, refused
 * (BudgetExceeded) as soon as it is known to pass `budget.remaining`.
 * Nothing is written, and the walk stops at the limit: every node it visits
 * adds at least one byte, so it visits at most `remaining` of them however
 * much of the value is shared — one object referenced from a million places
 * is refused after `remaining` bytes of counting, not walked a million times.
 *
 * The same rules as JSON.stringify: `toJSON` is called; undefined, a
 * function or a symbol is left out of an object (and so is a member whose
 * toJSON gives undefined) and written as null in an array; a non-finite
 * number is null; a BigInt throws TypeError, and a cycle meets the depth
 * cap (BudgetExceeded) where JSON.stringify would throw.
 */
function compactSize(value: unknown, budget: OutputBudget): number {
  const limit = budget.remaining;
  let n = 0;
  let nodes = 0;
  const add = (k: number) => {
    n += k;
    if (n > limit) throw new BudgetExceeded(budget.budget, budget.limit, budget.spent + n);
  };
  /** Adds what `raw` writes, and whether it wrote anything at all (an object member may be left out). */
  const size = (raw: unknown, key: string | number, depth: number, inArray: boolean): boolean => {
    let v = raw;
    if (v !== null && typeof v === "object" && typeof (v as { toJSON?: unknown }).toJSON === "function") {
      v = (v as { toJSON: (k: string) => unknown }).toJSON(String(key));
    }
    if (v === null) {
      add(4);
      return true;
    }
    switch (typeof v) {
      case "string":
        add(quotedBytes(v));
        return true;
      case "number":
        add(Number.isFinite(v) ? String(v).length : 4);
        return true;
      case "boolean":
        add(v ? 4 : 5);
        return true;
      case "bigint":
        throw new TypeError("Do not know how to serialize a BigInt");
      case "object":
        break;
      default:
        // undefined, a function or a symbol: null in an array, left out of an object.
        if (inArray) add(4);
        return inArray;
    }
    if (depth >= LIMITS.jsonDepth) throw new BudgetExceeded("depth", LIMITS.jsonDepth, depth);
    if (++nodes % CLOCK_EVERY_NODES === 0) budget.checkClock();
    add(2);
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        if (i > 0) add(1);
        size(v[i], i, depth + 1, true);
      }
      return true;
    }
    let first = true;
    for (const k of Object.keys(v)) {
      const before = n;
      add((first ? 0 : 1) + quotedBytes(k) + 1);
      if (size((v as Record<string, unknown>)[k], k, depth + 1, false)) first = false;
      else n = before; // left out: its key and comma are not written either
    }
    return true;
  };

  if (value === undefined || typeof value === "function" || typeof value === "symbol") return 0;
  size(value, "", 0, false);
  return n;
}

/**
 * JSON.stringify(value), compact, under `budget`: its exact size is charged
 * first (compactSize: refused before a byte is written when it would pass the
 * budget, in time proportional to the value in memory), and only then is it
 * written — by the native writer, so the text is JSON.stringify's own and at
 * native speed, and never longer than what was charged.
 */
function compactJson(value: unknown, budget: OutputBudget): string {
  try {
    if (budget.unbounded) {
      // Nothing to stop at (UNLIMITED: a test, a value known small): written, then counted.
      const text = (JSON.stringify(value) as string | undefined) ?? "";
      budget.chargeText(text);
      return text;
    }
    budget.charge(compactSize(value, budget));
    return (JSON.stringify(value) as string | undefined) ?? "";
  } catch (err) {
    // Nesting the native writer cannot follow (the size walk already capped
    // it, so a defect if it happens): the same typed refusal.
    if (err instanceof RangeError) throw new BudgetExceeded("depth", LIMITS.jsonDepth, budget.spent);
    throw err;
  }
}

/**
 * The UTF-8 length of JSON.stringify(value), counted without keeping any of
 * it, or BudgetExceeded once it passes `limit` (when one is given). Exact.
 */
export function measureJson(value: unknown, limit: number = Number.POSITIVE_INFINITY, opts: JsonWriteOptions = {}): number {
  const budget = new OutputBudget("measure", limit);
  // Compact: sized without writing anything, exactly (compactSize).
  if (opts.sortKeys !== true && !(opts.indent && opts.indent > 0)) {
    budget.charge(compactSize(value, budget));
    return budget.spent;
  }
  writeJson(value, budget, null, opts);
  return budget.spent;
}

/** The size of JSON.stringify(value), or a number above `limit` once it is known to be past it. */
export function jsonBytesUpTo(value: unknown, limit: number): number {
  try {
    return measureJson(value, limit);
  } catch (err) {
    if (err instanceof BudgetExceeded && err.budget === "measure") return err.spent;
    throw err;
  }
}

/**
 * Charge the size of JSON.stringify(value), compact, to `budget` without
 * writing it: refused (BudgetExceeded, the budget's own name) as soon as the
 * walk passes what remains, so charging costs at most the budget's remaining
 * bytes of work however large the value is. Returns the bytes charged.
 */
export function chargeJson(value: unknown, budget: OutputBudget): number {
  const n = compactSize(value, budget);
  budget.charge(n);
  return n;
}

const clamp = (n: number, cap: number) => Math.min(cap, Math.ceil(n));

/** The most bytes of canonical JSON a slice of a `sourceLength`-character description may be. */
export function contractLimit(sourceLength: number | undefined): number {
  const c = LIMITS.contract;
  if (sourceLength === undefined) return c.cap;
  return clamp(Math.max(c.floor, c.perSourceChar * sourceLength), c.cap);
}

/** GET /schema's budget for a contract of `contractBytes`. */
export function schemaLimit(contractBytes: number, s: RenderLimits["schema"] = LIMITS.schema): number {
  return clamp(s.floor + s.perContractByte * contractBytes, s.cap);
}

/** The starter kit's budget for a contract of `contractBytes` (0 when there is none) and fixtures of `fixtureBytes`. */
export function kitLimit(contractBytes: number, fixtureBytes = 0, k: RenderLimits["kit"] = LIMITS.kit): number {
  return clamp(k.floor + k.perContractByte * contractBytes + k.perFixtureByte * fixtureBytes, k.cap);
}

/**
 * The most interfaces one solution document carries: as many as its cap has
 * room for at the per-interface floor. Past it the document is refused before
 * anything is read (solutions/[id]/openapi).
 */
export function maxDocumentInterfaces(d: RenderLimits["document"] = LIMITS.document): number {
  return Math.floor((d.cap - d.floor) / d.perInterface);
}

/** A solution document's budget, for its interfaces' contract sizes (0 for one with no compiled contract). */
export function documentLimit(contractBytes: readonly number[], d: RenderLimits["document"] = LIMITS.document): number {
  let n = d.floor;
  for (const b of contractBytes) n += d.perInterface + d.perContractByte * b;
  return clamp(n, d.cap);
}
