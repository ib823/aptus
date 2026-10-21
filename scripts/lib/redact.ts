/**
 * Keep secrets out of what release tooling prints (P0.17).
 *
 * The post-deploy check and the backout rehearsal hold a runtime key, a
 * protection-bypass secret and database URLs, and they print text that came
 * from elsewhere: a server's error message, Prisma's stderr. Everything they
 * print goes through here, so a server that echoes a header, or a driver that
 * quotes its connection string, cannot put a credential in a terminal, a CI
 * log or the deploy record.
 */

import { findSecrets } from "@/lib/northbound/secret-patterns";

const REDACTED = "[redacted]";

/**
 * `text` with every known secret, every URL password, every bearer value and
 * every CoreEdge credential shape replaced. `known` is the exact values the
 * caller holds (keys, URLs): anything shorter than 6 characters is ignored, so
 * an empty or trivial setting cannot blank out ordinary words.
 */
export function redactSecrets(text: string, known: readonly (string | null | undefined)[] = []): string {
  let out = text;
  const exact = known
    .filter((s): s is string => typeof s === "string" && s.length >= 6)
    .sort((a, b) => b.length - a.length);
  for (const secret of exact) out = out.split(secret).join(REDACTED);

  // scheme://user:password@host -> scheme://user:[redacted]@host
  out = out.replace(/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, `$1${REDACTED}@`);
  // Authorization: Bearer <anything>
  out = out.replace(/\b(Bearer\s+)[^\s"',;]+/gi, `$1${REDACTED}`);
  // ce_live_, ce_test_, ce_, cew_ and cec_ credentials.
  for (const hit of findSecrets(out).sort((a, b) => b.index - a.index)) {
    const prefix = /^[a-z]+_(?:live_|test_)?/.exec(hit.match)?.[0] ?? "";
    out = out.slice(0, hit.index) + prefix + REDACTED + out.slice(hit.index + hit.match.length);
  }
  return out;
}
