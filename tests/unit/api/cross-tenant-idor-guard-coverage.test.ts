/**
 * Cross-tenant IDOR guard coverage (security re-audit follow-up).
 *
 * Two structural guards, asserted statically so the whole class fails loudly if
 * a future route reintroduces the pattern:
 *
 *   1. Presales routes that scope a Prisma query with the conditional org-drop
 *      idiom `...(user.organizationId ? { bundle: { organizationId } } : {})`
 *      MUST also call `lacksTenantScope`. Without it, a non-admin user carrying
 *      a null `organizationId` drops the org filter entirely and matches rows in
 *      EVERY tenant. Five routes were fixed in the first hardening pass; two
 *      (grants/[grantId]/reissue, bundles/[bundleId]/grants/[grantId]/email)
 *      were missed and fixed in this follow-up.
 *
 *   2. The Discovery pack export route resolves an engagement by attacker-
 *      supplied id and returns its (internal-lane) product map / notes / captures.
 *      It MUST call `requireDiscoveryEngagementAccess` — the same owner/admin
 *      guard its sibling notes/grants/drive routes already use.
 *
 * These are source-level assertions (matching the repo's existing
 * assessment-route-guard-coverage style) rather than mocked handler invocations:
 * the guard helpers themselves are unit-tested elsewhere
 * (tests/unit/presales/rbac.test.ts, tests/unit/discovery/authz.test.ts); what
 * these tests protect is that the routes actually CALL them.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function collectRouteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectRouteFiles(entryPath);
    return entry.isFile() && entry.name === "route.ts" ? [entryPath] : [];
  });
}

/** Matches the conditional org-drop idiom on one or across lines (\s covers \n). */
const ORG_DROP_IDIOM = /user\.organizationId\s*\?/;

describe("presales cross-tenant IDOR guard coverage", () => {
  const root = path.resolve(process.cwd(), "src/app/api/presales");
  const routes = collectRouteFiles(root);

  it("detects the org-drop idiom in the known routes (guard against a dead detector)", () => {
    const withIdiom = routes.filter((f) => ORG_DROP_IDIOM.test(readFileSync(f, "utf8")));
    // Sanity floor: the seven routes that use this scoping idiom.
    expect(withIdiom.length).toBeGreaterThanOrEqual(7);
  });

  it("every route using the org-drop idiom also calls lacksTenantScope", () => {
    const missingGuard = routes
      .filter((f) => ORG_DROP_IDIOM.test(readFileSync(f, "utf8")))
      .filter((f) => !readFileSync(f, "utf8").includes("lacksTenantScope"))
      .map((f) => f.replace(process.cwd() + "/", ""));

    expect(
      missingGuard,
      `These presales routes drop the org filter for null-org users but never ` +
        `reject them with lacksTenantScope (cross-tenant IDOR):\n${missingGuard.join("\n")}`,
    ).toEqual([]);
  });
});

describe("discovery pack export authz coverage", () => {
  it("the pack export route calls requireDiscoveryEngagementAccess", () => {
    const src = readFileSync(
      path.resolve(process.cwd(), "src/app/api/discovery/packs/[id]/route.ts"),
      "utf8",
    );
    expect(src).toContain("requireDiscoveryEngagementAccess");
  });
});
