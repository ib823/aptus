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
import { DEFAULT_XML_LIMITS, parseXml, type XmlLimits, type XmlRefusal } from "@/lib/contracts/xml";

export type CompileRefusal = "EMPTY" | XmlRefusal | CsdlRefusal;

export type CompileResult =
  | { ok: true; ir: ContractIR; format: "xml" | "json" }
  | { ok: false; reason: CompileRefusal; detail: string };

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
    const r = compileCsdlJson(doc, limits.maxElements);
    return r.ok ? { ok: true, ir: r.ir, format: "json" } : r;
  }

  const xml = parseXml(input, limits);
  if (!xml.ok) return xml;
  const r = compileCsdlXml(xml.root, limits.maxElements);
  return r.ok ? { ok: true, ir: r.ir, format: "xml" } : r;
}
