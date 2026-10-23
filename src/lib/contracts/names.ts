/**
 * The longest name toTypeName returns. Real SAP entity sets and types are a
 * few dozen characters; a name past this keeps its first characters and a
 * hash of the whole, so distinct long names stay distinct.
 *
 * BOUNDED BECAUSE IT IS REPEATED. The entity set's name is the stem of every
 * component name of its contract, so it is repeated in every `$ref` of every
 * property, in the record, each body and both OpenAPI documents of the kit:
 * a 511-character set name made a kit 109 times its contract, where the
 * contract states the name once (hostile-input review round 2).
 */
export const MAX_TYPE_NAME_LENGTH = 64;

/** 32-bit FNV-1a, as 8 hex digits: a short, stable tag for a name cut short (not a security boundary). */
function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** A conservative PascalCase identifier, safe as a TypeScript name and an OpenAPI component name; never longer than MAX_TYPE_NAME_LENGTH. */
export function toTypeName(raw: string): string {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  const safe = /^[0-9]/.test(cleaned) ? `X${cleaned}` : cleaned;
  if (safe.length === 0) return "CoreEdgeResource";
  if (safe.length <= MAX_TYPE_NAME_LENGTH) return safe;
  const tag = `H${fnv1a(raw)}`;
  return `${safe.slice(0, MAX_TYPE_NAME_LENGTH - tag.length)}${tag}`;
}

/**
 * Names that never repeat, first come first served: a base name as it is
 * while it is free, then `${base}2`, `${base}3`, … — the smallest suffix not
 * yet taken. `taken` is reserved before anything is named.
 *
 * LINEAR, NOT QUADRATIC. Each base remembers where its next free suffix can
 * start (every smaller one is taken, and a taken name is never given back),
 * so N types sharing one name cost N probes, not N²/2. A description with
 * 30,000 schemas each declaring a ComplexType "T" spent 36 s of CPU here when
 * every type probed from 2 again, on every GET /schema (P1 wave A review).
 */
export function nameAllocator(taken: Iterable<string> = []): (base: string) => string {
  const used = new Set(taken);
  const nextSuffix = new Map<string, number>();
  return (base: string): string => {
    let name = base;
    if (used.has(name)) {
      let i = nextSuffix.get(base) ?? 2;
      while (used.has(`${base}${i}`)) i++;
      name = `${base}${i}`;
      nextSuffix.set(base, i + 1);
    }
    used.add(name);
    return name;
  };
}
