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

/**
 * The directories these guards cover.
 *
 * `src/app/api/ops` and `src/lib/ops` were added in the PR that introduced the
 * Operations Center endpoints — which read credential and connection rows, the
 * exact data these guards exist for — and the scan did not follow. That was not
 * a defect on the day, but "where the guards look" had stopped matching "where
 * the data is handled", which is how it becomes one.
 */
const GUARDED_DIRS = [
  path.resolve(ROOT, "src/app/(studio)"),
  path.resolve(ROOT, "src/lib/studio"),
  path.resolve(ROOT, "src/components/studio"),
  path.resolve(ROOT, "src/app/api/ops"),
  path.resolve(ROOT, "src/lib/ops"),
];

const studioFiles = GUARDED_DIRS.flatMap((d) => collect(d, (f) => /\.tsx?$/.test(f)));
const rel = (f: string) => f.replace(`${ROOT}/`, "");

/**
 * Files permitted to name a secret column, with the reason recorded here rather
 * than left to be rediscovered.
 *
 * An exception is only safe because of the assertion that follows it: naming a
 * column in a `where` is a filter, and does not put the value anywhere. Naming
 * it in a `select` loads it. The test below proves this file does the first and
 * never the second, so the allowance cannot silently widen into a disclosure.
 */
const SECRET_REFERENCE_ALLOWANCES: ReadonlyArray<{ file: string; symbol: string; why: string }> = [
  {
    file: "src/app/api/ops/tokens/route.ts",
    symbol: "secretsCiphertext",
    why: "Counts how many credentials HAVE a write secret, via `{ secretsCiphertext: { not: null } }`. A filter, never a select — the value is not read.",
  },
];

/** Every balanced `select: { … }` in a source file. */
function selectBlocks(src: string): string[] {
  const blocks: string[] = [];
  const re = /\bselect\s*:\s*\{/g;
  for (const m of src.matchAll(re)) {
    const open = m.index! + m[0].length - 1;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}" && --depth === 0) {
        blocks.push(src.slice(open, i + 1));
        break;
      }
    }
  }
  return blocks;
}

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
        const allowed = SECRET_REFERENCE_ALLOWANCES.find((a) => a.file === rel(f));
        const hits = ["secretsCiphertext", "openSecrets", "decryptSecret"].filter((s) =>
          src.includes(s),
        );
        return hits.some((h) => h !== allowed?.symbol);
      })
      .map(rel);

    expect(
      offenders,
      `These files touch connection secrets:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("every secret-reference allowance is real, and is a filter rather than a select", () => {
    // The allowance is only defensible if the file genuinely does what the
    // reason claims. Two directions:
    //
    //   1. The reference still exists — otherwise the allowance is stale and
    //      is quietly permitting a future one.
    //   2. The symbol never appears inside a `select`, which is the line
    //      between "filter on whether a secret exists" and "load the secret".
    expect(SECRET_REFERENCE_ALLOWANCES.length).toBeGreaterThan(0);

    for (const allowance of SECRET_REFERENCE_ALLOWANCES) {
      const src = code(path.resolve(ROOT, allowance.file));
      expect(src, `${allowance.file} no longer references ${allowance.symbol} — drop the allowance`)
        .toContain(allowance.symbol);

      for (const block of selectBlocks(src)) {
        expect(
          block,
          `${allowance.file} SELECTS ${allowance.symbol}. The allowance covers a filter, not a read.`,
        ).not.toContain(allowance.symbol);
      }
    }
  });

  it("scopes every Prisma access to a tenant", () => {
    /**
     * The mechanisms that count as scoping.
     *
     * This used to test for the literal string `organizationId`, which was a
     * proxy and not the property. When the Ops routes moved from spreading a
     * plain `{ organizationId }` filter to `opsWhere(actor, …)` — a strictly
     * STRONGER guarantee, since it cannot be called without an actor and puts
     * the organization last so a caller cannot override it — the word left the
     * file and this guard reported the improvement as a regression.
     *
     * A guard that fails on the fix teaches people to revert the fix. So it now
     * names the helpers that carry the tenant, and the literal remains valid for
     * a hand-written `where`.
     */
    const SCOPING = ["organizationId", "scopedWhere", "scopedById", "opsWhere"];

    const offenders = studioFiles
      .filter((f) => {
        const src = code(f);
        // Only files that actually query need a tenant filter.
        if (!/\bprisma\s*\.\s*\w+\s*\.\s*(findMany|findFirst|findUnique|count|create|update|delete|upsert|aggregate|groupBy)/.test(src)) {
          return false;
        }
        return !SCOPING.some((s) => src.includes(s));
      })
      .map(rel);

    expect(
      offenders,
      `These files query Prisma with no tenant scope — use scopedWhere/opsWhere, or name organizationId in the where:\n${offenders.join("\n")}`,
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
