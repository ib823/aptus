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

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function collectFiles(dir: string, filename: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(entryPath, filename);
    return entry.isFile() && entry.name === filename ? [entryPath] : [];
  });
}

const collectRouteFiles = (dir: string) => collectFiles(dir, "route.ts");

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

describe("presales PAGES are covered by the same rule as the routes", () => {
  /*
   * THE GAP THAT LET THIS THROUGH. The suite above walks `src/app/api/presales`
   * for `route.ts`. Six PAGES use the identical org-drop idiom and none called
   * `lacksTenantScope` — so the API was hardened and tested while the screens
   * rendering the same rows stayed open.
   *
   * The gate now lives on the presales route-group LAYOUT, which every page
   * inherits, rather than on each page: this is the second time these files
   * have been fixed one at a time, and a per-page check is one forgotten page
   * away from open again.
   */
  const pagesRoot = path.resolve(process.cwd(), "src/app/(workbench)/presales");
  const layout = path.join(pagesRoot, "layout.tsx");

  it("the pages really do use the org-drop idiom (guard against a dead detector)", () => {
    const withIdiom = collectFiles(pagesRoot, "page.tsx").filter((f) =>
      ORG_DROP_IDIOM.test(readFileSync(f, "utf8")),
    );
    expect(withIdiom.length).toBeGreaterThanOrEqual(6);
  });

  it("a layout exists to gate them all", () => {
    expect(
      existsSync(layout),
      "src/app/(workbench)/presales/layout.tsx is the only place that can gate " +
        "every presales page at once. Without it each page must guard itself.",
    ).toBe(true);
  });

  it("the layout rejects a null-org caller before any page queries", () => {
    const src = readFileSync(layout, "utf8");
    expect(src).toContain("lacksTenantScope");
    // And the role gate, so the two refusals are decided in one place.
    expect(src).toContain("canAccessPresales");
  });

  it("does not redirect to a page inside its own gate", () => {
    // `redirect("/presales")` from a layout that wraps /presales is an infinite
    // loop. The refusals render instead; only the anonymous case redirects, and
    // /presales/login lives in the (workbench-public) group, outside this layout.
    const src = readFileSync(layout, "utf8");
    const redirects = [...src.matchAll(/redirect\("([^"]+)"\)/g)].map((m) => m[1]!);
    expect(redirects).toEqual(["/presales/login"]);
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
