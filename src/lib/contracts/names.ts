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
