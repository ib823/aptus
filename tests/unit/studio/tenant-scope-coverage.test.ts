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
 * no `update`/`delete` on a tenant-anchored model is written with a bare id.
 * Same shape as the append-only audit test, and it fails on the PR that
 * introduces the regression rather than on the request that exploits it.
 *
 * THE FAILURE MODE IT CATCHES. The idiom is a scoped `findFirst` followed by
 * `update({ where: { id } })`. That reads as safe and usually is — but the
 * safety lives in the line above, so deleting or reordering that line silently
 * removes it, and nothing fails. Prisma's `extendedWhereUnique` lets the update
 * carry the tenant itself (`where: { id, organizationId }`), which makes the
 * mutation independently safe instead of conditionally safe.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

import { describe, expect, it } from "vitest";

import { TENANT_ANCHORED_MODELS } from "@/lib/studio/tenant-scope";

const ROOT = path.resolve(__dirname, "../../..");

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

/** `Solution` → `solution`, matching the Prisma client's property casing. */
const ANCHORED_PROPERTIES = TENANT_ANCHORED_MODELS.map(
  (m) => m.charAt(0).toLowerCase() + m.slice(1),
);

describe("tenant-scope coverage", () => {
  it("no update or delete on a tenant-anchored model uses a bare id", () => {
    const offenders: string[] = [];

    for (const file of walk(path.resolve(ROOT, "src")).filter((f) => /\.tsx?$/.test(f))) {
      const src = readFileSync(file, "utf8");

      for (const prop of ANCHORED_PROPERTIES) {
        // Match the call and the where-clause that follows it, across lines.
        const re = new RegExp(
          `prisma\\.${prop}\\.(update|updateMany|delete|deleteMany)\\(\\{\\s*[\\s\\S]{0,200}?where:\\s*(\\{[^}]*\\})`,
          "g",
        );
        for (const m of src.matchAll(re)) {
          const where = m[2] ?? "";
          if (!where.includes("organizationId")) {
            offenders.push(`${file.replace(`${ROOT}/`, "")} — prisma.${prop}.${m[1]} ${where.replace(/\s+/g, " ")}`);
          }
        }
      }
    }

    expect(
      offenders,
      "These mutate a tenant-anchored row without naming the organization. Use\n" +
        "`where: { id, organizationId }` (Prisma extendedWhereUnique) so the write\n" +
        "re-asserts the tenant instead of trusting the lookup above it:\n" +
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
