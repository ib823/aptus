/**
 * OData vocabulary annotations: the small part of them the Contract IR reads.
 *
 * A term can be written three ways in one document — `Common.Label`,
 * `SAP__common.Label` (an alias a RAP service declares itself) and
 * `com.sap.vocabularies.Common.v1.Label` — so every term is resolved through
 * the document's own alias table to its vocabulary NAMESPACE, and only then
 * given the short name the IR uses. A term from a vocabulary not listed here
 * is ignored, which is the point: the IR keeps what it interprets.
 *
 * Qualified annotations (`Qualifier="…"`) are UI variants and are ignored.
 */

/** Vocabulary namespace → the short name the IR uses for its terms. */
const KNOWN_VOCABULARIES: ReadonlyMap<string, string> = new Map([
  ["Org.OData.Core.V1", "Core"],
  ["Org.OData.Capabilities.V1", "Capabilities"],
  ["com.sap.vocabularies.Common.v1", "Common"],
  ["com.sap.vocabularies.PersonalData.v1", "PersonalData"],
]);

/** An annotation's value, as the IR reads it. */
export type AnnotationValue =
  | boolean
  | string
  | number
  | AnnotationValue[]
  | { readonly [property: string]: AnnotationValue };

/** Canonical term ("Common.Label") → value. */
export type AnnotationSet = Map<string, AnnotationValue>;

/** Alias or namespace → namespace, for one document. */
export class AliasTable {
  private readonly aliases = new Map<string, string>();

  add(namespace: string, alias?: string): void {
    this.aliases.set(namespace, namespace);
    if (alias) this.aliases.set(alias, namespace);
  }

  /** "SAP__self.Foo" → "com.example.Foo"; anything unaliased is returned as given. */
  qualify(name: string): string {
    const dot = name.lastIndexOf(".");
    if (dot <= 0) return name;
    const prefix = name.slice(0, dot);
    const ns = this.aliases.get(prefix);
    return ns ? `${ns}${name.slice(dot)}` : name;
  }

  /** "Common.Label" (any spelling) → "Common.Label"; an unknown vocabulary → null. */
  canonicalTerm(term: string): string | null {
    const dot = term.lastIndexOf(".");
    if (dot <= 0) return null;
    const prefix = term.slice(0, dot);
    const ns = this.aliases.get(prefix) ?? prefix;
    const short = KNOWN_VOCABULARIES.get(ns);
    return short ? `${short}.${term.slice(dot + 1)}` : null;
  }

  /**
   * An annotation target with its leading qualified name resolved:
   * "SAP__self.Container/Set/Prop" → "com.example.Container/Set/Prop".
   */
  target(raw: string): string {
    const slash = raw.indexOf("/");
    const head = slash === -1 ? raw : raw.slice(0, slash);
    const rest = slash === -1 ? "" : raw.slice(slash);
    // A target may carry an overload signature, "ns.Action(ns.Type)"; it is kept as written.
    const paren = head.indexOf("(");
    if (paren !== -1) return `${this.qualify(head.slice(0, paren))}${head.slice(paren)}${rest}`;
    return `${this.qualify(head)}${rest}`;
  }
}

/**
 * An EnumMember value "PersonalData.EntitySemanticsType/DataSubject" (or
 * several, space-separated, for a flags enum) → "DataSubject".
 */
export function enumMemberName(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((m) => m.slice(m.lastIndexOf("/") + 1))
    .join(" ");
}

/** Read a boolean-valued term; tag terms with no value are true. */
export function boolTerm(set: AnnotationSet | undefined, term: string): boolean | undefined {
  const v = set?.get(term);
  return typeof v === "boolean" ? v : undefined;
}

export function stringTerm(set: AnnotationSet | undefined, term: string): string | undefined {
  const v = set?.get(term);
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** A property of a record-valued term: `Capabilities.InsertRestrictions` → `Insertable`. */
export function recordBool(set: AnnotationSet | undefined, term: string, property: string): boolean | undefined {
  const v = set?.get(term);
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const p = (v as Record<string, AnnotationValue>)[property];
  return typeof p === "boolean" ? p : undefined;
}

/** A collection of paths inside a record-valued term, as strings. */
export function recordPaths(set: AnnotationSet | undefined, term: string, property: string): string[] | undefined {
  const v = set?.get(term);
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const p = (v as Record<string, AnnotationValue>)[property];
  if (!Array.isArray(p)) return undefined;
  const paths = p.flatMap((x) => {
    if (typeof x === "string") return [x];
    // V4 JSON CSDL writes a property path as { "$PropertyPath": "X" }.
    if (x && typeof x === "object" && !Array.isArray(x)) {
      const inner = Object.values(x as Record<string, AnnotationValue>)[0];
      return typeof inner === "string" ? [inner] : [];
    }
    return [];
  });
  return paths;
}

/** Merge `from` into `into` (later declarations win, as in the spec's targeting rules). */
export function mergeAnnotations(into: Map<string, AnnotationSet>, target: string, from: AnnotationSet): void {
  if (from.size === 0) return;
  const existing = into.get(target);
  if (!existing) {
    into.set(target, new Map(from));
    return;
  }
  for (const [k, v] of from) existing.set(k, v);
}
