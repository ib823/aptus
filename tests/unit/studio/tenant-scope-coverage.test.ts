/**
 * Every mutation of a tenant-anchored row must name its organization.
 *
 * WHY THIS IS A SOURCE SCAN RATHER THAN A RUNTIME GUARD. `tenantScopeGuard()`
 * exists and is correct, but attaching it to the test Prisma client would
 * protect nothing: every test in this suite mocks `@/lib/db/prisma`, so no test
 * ever reaches the real client for the extension to intercept. Wiring it there
 * would look like a control and be a no-op — the exact shape of dishonesty this
 * codebase is built to avoid. Attaching it in PRODUCTION is a separate,
 * deliberately-scheduled piece of work: it would require every anchored-model
 * query in Studio, the Workbench and the portal to satisfy it simultaneously.
 *
 * So the protection that actually holds today is this: a static assertion that
 * no mutation of a tenant-anchored model is written with a bare id. Same shape
 * as the append-only audit test, and it fails on the PR that introduces the
 * regression rather than on the request that exploits it.
 *
 * THE FAILURE MODE IT CATCHES. The idiom is a scoped `findFirst` followed by
 * `update({ where: { id } })`. That reads as safe and usually is — but the
 * safety lives in the line above, so deleting or reordering that line silently
 * removes it, and nothing fails. Prisma's `extendedWhereUnique` lets the update
 * carry the tenant itself (`where: { id, organizationId }`), which makes the
 * mutation independently safe instead of conditionally safe.
 *
 * WHAT CHANGED, AND WHY THE PARSER REPLACED THE REGEX. The first version of
 * this scan matched `(update|updateMany|delete|deleteMany)` and captured the
 * where-clause as `\{[^}]*\}` — everything up to the first closing brace. Two
 * consequences, both found in review rather than by the scan itself:
 *
 *   1. `upsert` was not in the list. There was an unscoped one in production
 *      the whole time (`issue.ts`, keyed on `{ solutionId }`), in the update
 *      branch that rotates a token hash and revives a revoked credential.
 *   2. `[^}]*` cannot see a nested object, so a compound-key `where` was
 *      judged on a truncated fragment. It happened to pass — but by accident of
 *      what fell inside the truncation, not because the key binds the tenant.
 *
 * So the where-clause is now extracted by balanced-brace matching and tested
 * with a word-boundary match. That distinction is load-bearing: `\b` does not
 * treat `_` as a boundary, so the compound key NAME `organizationId_product_key`
 * does not satisfy the check on its own — only the `organizationId:` binding
 * inside it does. A compound key that does not actually constrain the tenant is
 * therefore still an offender, which is the property we want.
 *
 * The parser is deliberately strict about shapes it cannot verify: a `where`
 * that is a variable or a shorthand (`update({ where, data })`) is reported
 * rather than skipped. A static check that silently passes what it cannot read
 * is the failure mode this whole file exists to avoid.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

import { TENANT_ANCHORED_MODELS } from "@/lib/studio/tenant-scope";
import { stripSource } from "../../helpers/source";

const ROOT = path.resolve(__dirname, "../../..");

/** Every Prisma operation that writes. A read needs no tenant in its `where`
 *  to be safe — it needs one to be correct, which is a different test. */
const MUTATIONS = ["update", "updateMany", "delete", "deleteMany", "upsert"] as const;

function walk(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/**
 * Comments and string literals removed, so the parser reads code.
 *
 * Necessary, not decorative: this codebase comments its security reasoning
 * heavily, and the fixed `issueClientToken` has a comment containing the word
 * `where` between the call and the real clause. Without this, the parser read
 * the prose, found no colon after it, and reported the correctly-scoped upsert
 * as unverifiable. A scanner that fails on a comment gets switched off.
 *
 * Shared with the workspace-chrome guard, which was broken by the OPPOSITE
 * mistake — see tests/helpers/source.ts.
 */
function stripNonCode(src: string): string {
  return stripSource(src, "comments-and-strings");
}

/** The `{...}` starting at `open`, brace-balanced. Null if it never closes. */
function balancedObject(src: string, open: number): string | null {
  if (src[open] !== "{") return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open, i + 1);
  }
  return null;
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

type WhereClause =
  | { kind: "object"; text: string }
  /** Present but not statically readable — a variable, a spread, a shorthand. */
  | { kind: "opaque" }
  | { kind: "absent" };

/** The top-level `where` of a Prisma call argument. Depth-tracked, so a `where`
 *  nested inside `data:` or `create:` is not mistaken for the real one. */
function topLevelWhere(argObject: string): WhereClause {
  let depth = 0;
  for (let i = 0; i < argObject.length; i++) {
    const ch = argObject[i]!;
    if (ch === "{") {
      depth++;
      continue;
    }
    if (ch === "}") {
      depth--;
      continue;
    }
    if (depth !== 1) continue;
    if (!argObject.startsWith("where", i)) continue;
    // Reject `whereClause`, `myWhere` and friends.
    if (isWordChar(argObject[i - 1]) || isWordChar(argObject[i + 5])) continue;

    const after = argObject.slice(i + 5);
    const colon = /^\s*:\s*/.exec(after);
    // `{ where, data }` — shorthand. Real, unverifiable, reported.
    if (!colon) return { kind: "opaque" };

    const valueAt = i + 5 + colon[0].length;
    const object = argObject[valueAt] === "{" ? balancedObject(argObject, valueAt) : null;
    return object === null ? { kind: "opaque" } : { kind: "object", text: object };
  }
  return { kind: "absent" };
}

export interface Offence {
  operation: string;
  reason: string;
  where: string;
}

/**
 * Unscoped mutations of `prisma.<property>` in one source file.
 *
 * Exported and pure so the detector itself can be tested against synthetic
 * source below. A scan whose own correctness is only ever asserted against the
 * codebase it scans proves nothing on the day it stops working.
 */
export function findUnscopedMutations(source: string, property: string): Offence[] {
  const src = stripNonCode(source);
  const found: Offence[] = [];
  const call = new RegExp(`prisma\\.${property}\\.(${MUTATIONS.join("|")})\\s*\\(\\s*\\{`, "g");

  for (const match of src.matchAll(call)) {
    const operation = match[1]!;
    const argStart = match.index! + match[0].length - 1;
    const arg = balancedObject(src, argStart);
    if (arg === null) {
      found.push({ operation, reason: "argument object never closes", where: "" });
      continue;
    }

    const where = topLevelWhere(arg);
    if (where.kind === "absent") {
      found.push({ operation, reason: "no `where` at all", where: "" });
      continue;
    }
    if (where.kind === "opaque") {
      found.push({
        operation,
        reason: "`where` is not an object literal, so the tenant cannot be verified here",
        where: "(not a literal)",
      });
      continue;
    }
    // `\b` does not break on `_`, so a compound key NAMED organizationId_x does
    // not pass on its name — only a real `organizationId:` binding does.
    if (!/\borganizationId\b/.test(where.text)) {
      found.push({
        operation,
        reason: "no organizationId",
        where: where.text.replace(/\s+/g, " "),
      });
    }
  }
  return found;
}

/** `Solution` → `solution`, matching the Prisma client's property casing. */
const ANCHORED_PROPERTIES = TENANT_ANCHORED_MODELS.map(
  (m) => m.charAt(0).toLowerCase() + m.slice(1),
);

describe("tenant-scope coverage", () => {
  it("no mutation of a tenant-anchored model omits the organization", () => {
    const offenders: string[] = [];

    for (const file of walk(path.resolve(ROOT, "src")).filter((f) => /\.tsx?$/.test(f))) {
      const src = readFileSync(file, "utf8");
      for (const prop of ANCHORED_PROPERTIES) {
        for (const o of findUnscopedMutations(src, prop)) {
          offenders.push(
            `${file.replace(`${ROOT}/`, "")} — prisma.${prop}.${o.operation}: ${o.reason} ${o.where}`,
          );
        }
      }
    }

    expect(
      offenders,
      "These mutate a tenant-anchored row without naming the organization. Use\n" +
        "`where: { id, organizationId }` (Prisma extendedWhereUnique), or a compound\n" +
        "unique key that contains organizationId, so the write re-asserts the tenant\n" +
        "instead of trusting the lookup above it:\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("knows which models it is guarding", () => {
    // A model added to TENANT_ANCHORED_MODELS is automatically covered by the
    // scan above. This pins the list so silently shrinking it is visible.
    expect(TENANT_ANCHORED_MODELS).toContain("SolutionClient");
    expect(TENANT_ANCHORED_MODELS).toContain("ApiAccessGrant");
    expect(TENANT_ANCHORED_MODELS).toContain("SapConnection");
    expect(TENANT_ANCHORED_MODELS.length).toBeGreaterThanOrEqual(9);
  });
});

/**
 * The scan's own regression suite.
 *
 * Every case below is a shape that reached production or was named as a way
 * past the previous version. If one of these stops failing, the scan has
 * quietly stopped defending something.
 */
describe("the scan itself", () => {
  const reasons = (src: string) => findUnscopedMutations(src, "solutionClient").map((o) => o.reason);

  it("catches an unscoped upsert — the shape that was live in issue.ts", () => {
    expect(
      reasons(`prisma.solutionClient.upsert({
        where: { solutionId: input.solutionId },
        create: { organizationId: scope.organizationId },
        update: { isActive: true, revokedAt: null },
      })`),
    ).toEqual(["no organizationId"]);
  });

  it("accepts a compound unique key that binds the organization", () => {
    expect(
      reasons(`prisma.solutionClient.upsert({
        where: { organizationId_solutionId: { organizationId: scope.organizationId, solutionId: id } },
        create: {}, update: {},
      })`),
    ).toEqual([]);
  });

  it("rejects a compound key that only NAMES the organization", () => {
    // `organizationId_solutionId` contains the string but binds nothing. The
    // old substring check passed this; `\b` does not.
    expect(
      reasons(`prisma.solutionClient.upsert({
        where: { organizationId_solutionId: { solutionId: id } },
      })`),
    ).toEqual(["no organizationId"]);
  });

  it("is not fooled by an organizationId that appears only in `data`", () => {
    expect(
      reasons(`prisma.solutionClient.update({
        where: { id },
        data: { organizationId: scope.organizationId },
      })`),
    ).toEqual(["no organizationId"]);
  });

  it("accepts extendedWhereUnique", () => {
    expect(reasons(`prisma.solutionClient.update({ where: { id, organizationId }, data: {} })`)).toEqual([]);
  });

  it("reports a `where` it cannot read rather than passing it", () => {
    // Both defeated the previous regex silently.
    expect(reasons(`prisma.solutionClient.update({ where, data: {} })`)).toHaveLength(1);
    expect(reasons(`prisma.solutionClient.update({ where: whereClause, data: {} })`)).toHaveLength(1);
  });

  it("survives a where-clause with nested objects and long preambles", () => {
    // The old scan gave up after 200 characters between the call and `where:`.
    expect(
      reasons(`prisma.solutionClient.updateMany({
        // ${"x".repeat(400)}
        where: { organizationId, expiresAt: { lt: new Date() }, AND: [{ isActive: true }] },
        data: { isActive: false },
      })`),
    ).toEqual([]);
  });

  it("does not confuse a read for a mutation", () => {
    expect(reasons(`prisma.solutionClient.findFirst({ where: { solutionId } })`)).toEqual([]);
  });

  it("reads code, not comments — a comment mentioning `where` must not decide it", () => {
    // This is the real shape of the fixed issueClientToken, and the first
    // version of the parser reported it as unverifiable.
    expect(
      reasons(`prisma.solutionClient.upsert({
        // the organization is not in this \`where\` unless we put it there
        where: { organizationId_solutionId: { organizationId: scope.organizationId, solutionId: id } },
      })`),
    ).toEqual([]);
    // And the converse: a comment cannot launder an unscoped clause either.
    expect(
      reasons(`prisma.solutionClient.update({
        // scoped by organizationId in the findFirst above
        where: { id },
      })`),
    ).toEqual(["no organizationId"]);
  });
});
