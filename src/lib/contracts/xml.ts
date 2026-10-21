/**
 * A bounded XML reader for service descriptions fetched from a CUSTOMER'S SAP
 * system.
 *
 * THE INPUT IS HOSTILE BY DEFAULT. `$metadata` is whatever the system at the
 * end of a customer's connection answers — and a connection's base URL is
 * typed by a person. So this reader assumes the document may be built to hurt
 * the process that parses it, and refuses before it can:
 *
 *   - ENTITY EXPANSION ("billion laughs", external entities). A service
 *     description never has a DOCTYPE, so any document that declares one is
 *     refused outright, before an entity could be declared. Beneath that, the
 *     parser (saxes) does not process DTDs at all: it never expands an entity
 *     a document declares and never fetches anything, and a reference to an
 *     undeclared entity is a well-formedness error.
 *   - HUGE DOCUMENTS. Refused above `maxBytes` before parsing begins — the
 *     same 8 MB bound the verify read already applies to the wire.
 *   - DEEP NESTING. Refused at `maxDepth` open elements; nothing here recurses
 *     over the document, but the tree it returns is walked by code that does.
 *   - ELEMENT AND ATTRIBUTE FLOODS. Refused past `maxElements` in total and
 *     `maxAttributes` on one element, so a flat document of a million empty
 *     tags cannot build a million objects.
 *   - QUADRATIC SCANS. There are none: saxes is a single linear pass. That is
 *     the reason this module exists — the regex readers it replaces had to be
 *     individually hardened against `<EntitySet <EntitySet …` (tdd-connector.ts).
 *
 * NEVER REGEXES OVER THE DOCUMENT. Names and namespace URIs come from the
 * parser; nothing here pattern-matches markup.
 *
 * The dependency: saxes (ISC, Louis-Dominique Dubeau; already in the tree
 * through jsdom and exceljs) — a strict, namespace-aware SAX parser with one
 * dependency (xmlchars). See docs/runbooks/coreedge-contract-compiler.md.
 */

import { SaxesParser, type SaxesTagNS } from "saxes";

import { LIMITS } from "@/lib/contracts/budget";

export interface XmlAttribute {
  local: string;
  /** Namespace URI; "" for an unprefixed attribute. */
  uri: string;
  value: string;
}

export interface XmlElement {
  local: string;
  uri: string;
  attributes: XmlAttribute[];
  children: XmlElement[];
  /** Concatenated character data directly inside this element, trimmed. */
  text: string;
}

export interface XmlLimits {
  maxBytes: number;
  maxDepth: number;
  maxElements: number;
  maxAttributes: number;
  /** Character data kept per element; anything past it is dropped, never accumulated. */
  maxTextPerElement: number;
}

/**
 * The defaults. 8 MB matches VERIFY_MAX_METADATA_BYTES (service-verify.ts):
 * nothing larger is ever read from a tenant. 400,000 elements is several times
 * the largest public S/4HANA description; 64 levels is four times the depth of
 * the deepest real annotation.
 */
export const DEFAULT_XML_LIMITS: XmlLimits = {
  maxBytes: LIMITS.sourceBytes,
  maxDepth: 64,
  maxElements: 400_000,
  maxAttributes: 128,
  maxTextPerElement: 64 * 1024,
};

export type XmlRefusal =
  | "TOO_LARGE"
  | "DOCTYPE_REFUSED"
  | "TOO_DEEP"
  | "TOO_MANY_ELEMENTS"
  | "TOO_MANY_ATTRIBUTES"
  | "NOT_WELL_FORMED";

export type XmlResult = { ok: true; root: XmlElement } | { ok: false; reason: XmlRefusal; detail: string };

class LimitExceeded extends Error {
  constructor(
    readonly reason: XmlRefusal,
    message: string,
  ) {
    super(message);
  }
}

export function parseXml(input: string, limits: XmlLimits = DEFAULT_XML_LIMITS): XmlResult {
  // Bytes, not characters: the bound is on what was read off the wire.
  if (Buffer.byteLength(input, "utf8") > limits.maxBytes) {
    return {
      ok: false,
      reason: "TOO_LARGE",
      detail: `The document is larger than ${Math.floor(limits.maxBytes / (1024 * 1024))} MB.`,
    };
  }

  const parser = new SaxesParser({ xmlns: true, position: false });
  const stack: XmlElement[] = [];
  let root: XmlElement | null = null;
  let elements = 0;

  parser.on("doctype", () => {
    throw new LimitExceeded(
      "DOCTYPE_REFUSED",
      "The document declares a DOCTYPE. A service description never does, and one can declare entities, so it is refused.",
    );
  });

  parser.on("opentag", (tag: SaxesTagNS) => {
    elements += 1;
    if (elements > limits.maxElements) {
      throw new LimitExceeded("TOO_MANY_ELEMENTS", `The document has more than ${limits.maxElements} elements.`);
    }
    if (stack.length >= limits.maxDepth) {
      throw new LimitExceeded("TOO_DEEP", `The document nests deeper than ${limits.maxDepth} levels.`);
    }
    const names = Object.keys(tag.attributes);
    if (names.length > limits.maxAttributes) {
      throw new LimitExceeded(
        "TOO_MANY_ATTRIBUTES",
        `An element carries more than ${limits.maxAttributes} attributes.`,
      );
    }
    const attributes: XmlAttribute[] = [];
    for (const name of names) {
      const a = tag.attributes[name]!;
      // Namespace declarations are the parser's business, not the document's content.
      if (a.prefix === "xmlns" || (a.prefix === "" && a.local === "xmlns")) continue;
      attributes.push({ local: a.local, uri: a.uri, value: a.value });
    }
    const el: XmlElement = { local: tag.local, uri: tag.uri, attributes, children: [], text: "" };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(el);
    else root = el;
    stack.push(el);
  });

  parser.on("closetag", () => {
    const el = stack.pop();
    if (el) el.text = el.text.trim();
  });

  const onText = (text: string) => {
    const el = stack[stack.length - 1];
    if (!el) return;
    const room = limits.maxTextPerElement - el.text.length;
    if (room > 0) el.text += text.length > room ? text.slice(0, room) : text;
  };
  parser.on("text", onText);
  parser.on("cdata", onText);

  try {
    parser.write(input).close();
  } catch (err) {
    if (err instanceof LimitExceeded) return { ok: false, reason: err.reason, detail: err.message };
    // saxes' own message names the line and the rule broken, never content
    // beyond a character or two; it is still not echoed to callers, who get a
    // fixed sentence.
    return { ok: false, reason: "NOT_WELL_FORMED", detail: "The document is not well-formed XML." };
  }
  if (!root) return { ok: false, reason: "NOT_WELL_FORMED", detail: "The document has no root element." };
  return { ok: true, root };
}

/** The value of an attribute by local name (and namespace URI; "" = unprefixed). */
export function attr(el: XmlElement, local: string, uri = ""): string | undefined {
  for (const a of el.attributes) if (a.local === local && a.uri === uri) return a.value;
  return undefined;
}

/** Children with this local name, in any of the given namespaces (all, when none is given). */
export function childrenNamed(el: XmlElement, local: string, uris?: ReadonlySet<string>): XmlElement[] {
  return el.children.filter((c) => c.local === local && (uris === undefined || uris.has(c.uri)));
}
