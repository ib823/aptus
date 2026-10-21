/** A conservative PascalCase identifier, safe as a TypeScript name and an OpenAPI component name. */
export function toTypeName(raw: string): string {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  const safe = /^[0-9]/.test(cleaned) ? `X${cleaned}` : cleaned;
  return safe.length > 0 ? safe : "CoreEdgeResource";
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
