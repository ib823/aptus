/**
 * Discovery engagement pages authorize, not just the API behind them.
 *
 * The same split Affirm had, found by checking rather than assuming: the routes
 * under `/api/discovery/sessions/[id]/*` were guarded by
 * `requireDiscoveryEngagementAccess`, while the pages that render the same data
 * took an id and rendered it. Most did not even load the current user.
 *
 *   /discovery                       every consultant's engagements
 *   /discovery/sessions              the same, in full
 *   /discovery/outputs               the same, with decision counts
 *   /discovery/sessions/[id]         one engagement's setup
 *   /discovery/sessions/[id]/facilitate   the live workshop console
 *   /discovery/outputs/[id]          the assembled client pack
 *
 * WHAT IS DELIBERATELY UNGUARDED, and why this test does not demand otherwise:
 * the library, coverage, health and the product map read a COMMITTED FILE. That
 * is practice knowledge, shared by construction, and not any one client's data.
 * The product map is "consultant only" in the sense of never reaching a client
 * session — which the (workbench) route group already enforces — not in the
 * sense of being private between consultants.
 *
 * So the rule this pins is narrow and checkable: a page that reads a
 * DiscoveryEngagement, by id or as a list, must scope it.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { discoveryEngagementScope } from "@/lib/discovery/authz";

const ROOT = path.resolve(process.cwd(), "src/app/(workbench)/discovery");

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pageFiles(full));
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

const PAGES = pageFiles(ROOT);
const rel = (p: string) => path.relative(process.cwd(), p);
const read = (p: string) => readFileSync(p, "utf8");

/** Pages that LIST engagements. */
const LIST_PAGES = PAGES.filter((p) => /discoveryEngagement\.findMany/.test(read(p)));

/**
 * Pages for one engagement, identified by their route rather than their query:
 * they call `getSession`, `getConsole` and `buildClientPack`, which hide the
 * engagement read behind an assembled view — which is exactly how they came to
 * have no guard.
 */
const DETAIL_ROUTES = [
  "sessions/[id]/page.tsx",
  "sessions/[id]/facilitate/page.tsx",
  "outputs/[id]/page.tsx",
];
const DETAIL_PAGES = DETAIL_ROUTES.map((r) => path.join(ROOT, r));

describe("the scan found what it is meant to check", () => {
  it("walked the discovery route tree", () => {
    expect(PAGES.length).toBeGreaterThan(8);
    expect(LIST_PAGES.length).toBeGreaterThanOrEqual(3);
  });

  it("the named detail pages still exist", () => {
    // A renamed route would otherwise silently drop out of this suite.
    for (const p of DETAIL_PAGES) {
      expect(PAGES, `${rel(p)} is missing — has the route moved?`).toContain(p);
    }
  });
});

describe("every page that lists engagements scopes the query", () => {
  it.each(LIST_PAGES.map((p) => [rel(p), p] as const))("%s", (name, file) => {
    expect(
      /discoveryEngagementScope\s*\(/.test(read(file)),
      `${name} lists engagements without scoping.\n` +
        "Add `where: discoveryEngagementScope(user)` — in the query, not a filter " +
        "afterwards, so `take` pages over rows the caller can open.",
    ).toBe(true);
  });
});

describe("every page for one engagement checks who is asking", () => {
  it.each(DETAIL_PAGES.map((p) => [rel(p), p] as const))("%s", (name, file) => {
    const source = read(file);
    expect(
      /discoveryEngagementReadable\s*\(/.test(source),
      `${name} renders one engagement without authorizing it.\n` +
        "Add: if (!(await discoveryEngagementReadable(id, user))) notFound();",
    ).toBe(true);
    expect(
      /discoveryEngagementReadable\([^)]*\)\)\)\s*notFound/.test(source),
      `${name} must notFound() on refusal — a redirect would confirm the ` +
        "engagement exists.",
    ).toBe(true);
  });
});

describe("no page asserts its way past the auth check", () => {
  it.each([...LIST_PAGES, ...DETAIL_PAGES].map((p) => [rel(p), p] as const))(
    "%s",
    (name, file) => {
      /*
       * `discoveryEngagementScope(user!)` typechecks and is wrong: it asserts
       * the one value the authorization decision rests on, on the word of a
       * layout further up the tree. The pages redirect explicitly instead.
       */
      expect(
        /(discoveryEngagementScope|discoveryEngagementReadable)\([^)]*user!/.test(read(file)),
        `${name} uses a non-null assertion on the session user`,
      ).toBe(false);
    },
  );
});

describe("the scope rule itself", () => {
  it("limits a consultant to their own engagements", () => {
    expect(discoveryEngagementScope({ id: "u-1", role: "consultant" })).toEqual({
      createdById: "u-1",
    });
  });

  it("widens only for a platform admin", () => {
    expect(discoveryEngagementScope({ id: "u-9", role: "platform_admin" })).toEqual({});
  });

  it("does not widen for a viewer", () => {
    expect(discoveryEngagementScope({ id: "u-2", role: "viewer" })).toEqual({
      createdById: "u-2",
    });
  });
});
