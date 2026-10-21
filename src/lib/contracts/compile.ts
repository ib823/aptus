/**
 * The Contract Compiler's entry point: a service description, as text, in →
 * a Contract IR or a reason out (P1.3).
 *
 * Accepts OData V2 EDMX, OData V4 CSDL XML and OData V4 CSDL JSON — the form
 * is told from the first non-blank character, never guessed from content.
 *
 * WHERE IT RUNS. At registration and verification time (the verify-service
 * route, and P1.2's EDMX upload), never on the broker's per-call path: a
 * description can be megabytes, and a data call must not pay for parsing it.
 *
 * Pure: no I/O, no clock, no randomness. The same text compiles to the same IR,
 * byte for byte, which is what lets a content hash decide whether a snapshot is
 * new (snapshot.ts).
 */

import { compileCsdlJson } from "@/lib/contracts/csdl-json";
import { compileCsdlXml, type CsdlRefusal } from "@/lib/contracts/csdl-xml";
import type { ContractIR } from "@/lib/contracts/ir";
import { unstorableText } from "@/lib/contracts/storable";
import { DEFAULT_XML_LIMITS, parseXml, type XmlLimits, type XmlRefusal } from "@/lib/contracts/xml";

export type CompileRefusal = "EMPTY" | XmlRefusal | CsdlRefusal;

export type CompileResult =
  | {
      ok: true;
      ir: ContractIR;
      format: "xml" | "json";
      /**
       * The length of the document it was compiled from, in UTF-16 units:
       * what a slice of it may grow to is in proportion to this (slice.ts).
       */
      sourceLength: number;
    }
  | { ok: false; reason: CompileRefusal; detail: string };

/**
 * A description holding text no database column can hold (U+0000, an
 * unpaired surrogate) is refused: no service description needs either
 * (storable.ts).
 */
const unstorable = (): { ok: false; reason: "INVALID_CSDL"; detail: string } => ({
  ok: false,
  reason: "INVALID_CSDL",
  detail: "The service description contains a NUL character or an unpaired surrogate, which no name or text can be stored with.",
});

/**
 * Whether any key or string of a parsed JSON document is unstorable. Walked
 * with a stack (the document can be nested past any recursion depth), each
 * value once: JSON.parse shares nothing, so this is linear in the document.
 */
function hasUnstorableText(doc: unknown): boolean {
  const stack: unknown[] = [doc];
  while (stack.length > 0) {
    const v = stack.pop();
    if (typeof v === "string") {
      if (unstorableText(v)) return true;
    } else if (Array.isArray(v)) {
      for (const x of v) stack.push(x);
    } else if (v !== null && typeof v === "object") {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (unstorableText(k)) return true;
        stack.push(x);
      }
    }
  }
  return false;
}

export function compileContract(input: string, limits: XmlLimits = DEFAULT_XML_LIMITS): CompileResult {
  let start = 0;
  while (start < input.length && /\s/.test(input[start]!)) start += 1;
  if (start === input.length) return { ok: false, reason: "EMPTY", detail: "The document is empty." };

  if (input[start] === "{") {
    if (Buffer.byteLength(input, "utf8") > limits.maxBytes) {
      return {
        ok: false,
        reason: "TOO_LARGE",
        detail: `The document is larger than ${Math.floor(limits.maxBytes / (1024 * 1024))} MB.`,
      };
    }
    let doc: unknown;
    try {
      doc = JSON.parse(input);
    } catch {
      // A syntax error, or nesting deep enough to exhaust the parser: either
      // way not a description this compiler will read.
      return { ok: false, reason: "NOT_WELL_FORMED", detail: "The document is not well-formed JSON." };
    }
    if (hasUnstorableText(doc)) return unstorable();
    const r = compileCsdlJson(doc, limits.maxElements);
    return r.ok ? { ok: true, ir: r.ir, format: "json", sourceLength: input.length } : r;
  }

  const xml = parseXml(input, limits);
  if (!xml.ok) return xml;
  if (unstorableText(input)) return unstorable();
  const r = compileCsdlXml(xml.root, limits.maxElements);
  return r.ok ? { ok: true, ir: r.ir, format: "xml", sourceLength: input.length } : r;
}
