/**
 * Studio surface guards — structural, not by-convention.
 *
 * This repository has repeatedly shipped cross-tenant IDOR of exactly one shape:
 * a query that forgot `where: { organizationId }`. Studio adds a whole new
 * organization-anchored surface, so these guards fail the build if a Studio file
 * ever reaches Prisma without a tenant filter, or if any Studio code goes near a
 * connection secret.
 *
 * These are source-level guards (the repo's established
 * `*guard-coverage*` pattern). PR-D1 replaces the tenant half with a structural
 * repository that makes an unscoped query impossible to write; until then this is
 * the net.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function collect(dir: string, match: (f: string) => boolean): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) return collect(p, match);
    return match(p) ? [p] : [];
  });
}

const STUDIO_DIRS = [
  path.resolve(ROOT, "src/app/(studio)"),
  path.resolve(ROOT, "src/lib/studio"),
  path.resolve(ROOT, "src/components/studio"),
];

const studioFiles = STUDIO_DIRS.flatMap((d) => collect(d, (f) => /\.tsx?$/.test(f)));
const rel = (f: string) => f.replace(`${ROOT}/`, "");

/**
 * Match the ACCESS, not the word.
 *
 * These guards must fire on code, never on prose — a file whose comment explains
 * *why* it does not read a secret is doing the right thing, and a guard that
 * flags it teaches people to delete the comment (or the guard). So strip comments
 * and string literals before matching.
 */
function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ") // block comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ") // line comments (not URLs)
    .replace(/"(?:[^"\\]|\\.)*"/g, '""') // double-quoted strings
    .replace(/'(?:[^'\\]|\\.)*'/g, "''") // single-quoted strings
    .replace(/`(?:[^`\\]|\\.)*`/g, "``"); // template literals
}

describe("studio surface", () => {
  it("has files to guard (a dead guard is worse than none)", () => {
    expect(studioFiles.length).toBeGreaterThan(0);
  });

  it("the comment-stripping detector works (guard against a dead guard)", () => {
    // If `code()` ever stopped stripping, the secret guard below would pass
    // vacuously on prose and fail loudly on honest comments. Pin both directions.
    expect(code(path.resolve(ROOT, "src/app/(studio)/layout.tsx"))).not.toContain(
      "secretsCiphertext",
    );
    expect(readFileSync(path.resolve(ROOT, "src/app/(studio)/layout.tsx"), "utf8")).toContain(
      "secretsCiphertext",
    );
  });

  it("never reads a SAP connection secret", () => {
    // secretsCiphertext must be unreachable from Studio: the Connections screen is
    // a metadata projection, and nothing else has any business near the sealed
    // bundle. openSecrets/decryptSecret are server-only keystone internals.
    const offenders = studioFiles
      .filter((f) => {
        const src = code(f);
        return (
          src.includes("secretsCiphertext") ||
          src.includes("openSecrets") ||
          src.includes("decryptSecret")
        );
      })
      .map(rel);

    expect(
      offenders,
      `These Studio files touch connection secrets:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("scopes every Prisma access by organizationId", () => {
    const offenders = studioFiles
      .filter((f) => {
        const src = code(f);
        // Only files that actually query need a tenant filter.
        if (!/\bprisma\s*\.\s*\w+\s*\.\s*(findMany|findFirst|findUnique|count|create|update|delete|upsert|aggregate|groupBy)/.test(src)) {
          return false;
        }
        return !src.includes("organizationId");
      })
      .map(rel);

    expect(
      offenders,
      `These Studio files query Prisma without an organizationId scope:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("resolves tenant context from the session, never from request input", () => {
    // A Studio route that read the org from a query string or body would hand an
    // attacker another tenant's data. The tenant cookie is a view preference and
    // is validated against the caller's own list before use.
    const offenders = studioFiles
      .filter((f) => {
        // Note: read raw here — the parameter NAME lives inside a string literal,
        // which `code()` deliberately blanks. Prose false-positives are not a risk
        // for this pattern because it requires the surrounding call syntax.
        const src = readFileSync(f, "utf8");
        return (
          /searchParams\s*\.\s*get\(\s*["'](organizationId|orgId|tenant|tenantId)["']/.test(src) ||
          /body\s*\.\s*(organizationId|orgId)\b/.test(src)
        );
      })
      .map(rel);

    expect(
      offenders,
      `These Studio files take tenant context from request input:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
