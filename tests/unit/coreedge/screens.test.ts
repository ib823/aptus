/**
 * The five screens keep the rules the console is built on (PR-4).
 *
 * These are SOURCE-LEVEL assertions, like the component contracts in PR-2 and
 * for the same reason: the rules have to hold for the screens nobody has written
 * yet, not only for the five that exist. A render test proves one screen
 * behaves; this makes the sixth one fail if it does not.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const COREEDGE_APP = path.resolve(ROOT, "src/app/(coreedge)");

/** Every page and layout under the CoreEdge route group. */
function screenFiles(): string[] {
  const found: string[] = [];
  (function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "page.tsx" || entry === "layout.tsx") found.push(full);
    }
  })(COREEDGE_APP);
  return found.sort();
}

const FILES = screenFiles();

function code(file: string): string {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

function rel(file: string): string {
  return path.relative(ROOT, file);
}

describe("the screens exist", () => {
  it("has the five core screens the bundle names", () => {
    const routes = FILES.filter((f) => f.endsWith("page.tsx")).map(rel);
    for (const expected of [
      "src/app/(coreedge)/coreedge/page.tsx",
      "src/app/(coreedge)/coreedge/apps/[app]/page.tsx",
      "src/app/(coreedge)/coreedge/apps/[app]/[feed]/[env]/page.tsx",
      "src/app/(coreedge)/coreedge/requests/page.tsx",
      "src/app/(coreedge)/coreedge/requests/[id]/page.tsx",
      "src/app/(coreedge)/coreedge/operations/page.tsx",
    ]) {
      expect(routes, `${expected} is missing`).toContain(expected);
    }
  });
});

describe("every place in the rail opens", () => {
  /*
   * The handoff's rail rule is exact: "Six places in the rail, all always
   * visible and enabled. A place you cannot act in still opens; the actions
   * inside carry the reason."
   *
   * A rail entry that 404s breaks that rule as surely as one that redirects on
   * role — the reader cannot tell whether they lack a permission, took a wrong
   * turn, or the feature does not exist. Three of the six are not built yet and
   * render a page that says so, which is the difference between "not built" and
   * "not found".
   */
  const shell = readFileSync(path.join(COREEDGE_APP, "coreedge/CoreEdgeShell.tsx"), "utf8");
  const hrefs = [...shell.matchAll(/href:\s*"(\/coreedge[^"]*)"/g)].map((m) => m[1]!);

  it("lists six places", () => {
    expect(hrefs).toHaveLength(6);
  });

  it("has a page on disk for every one of them", () => {
    const onDisk = new Set(
      FILES.filter((f) => f.endsWith("page.tsx")).map((f) => {
        const dir = path.dirname(path.relative(COREEDGE_APP, f));
        return `/${dir}`;
      }),
    );
    const missing = hrefs.filter((h) => !onDisk.has(h));
    expect(
      missing,
      `These rail places would 404:\n${missing.join("\n")}\n` +
        `Every place stays in the rail and every place must open — a screen ` +
        `that is not built yet says so.`,
    ).toEqual([]);
  });

  it("says 'not built' rather than faking a screen", () => {
    // No fake rows, no skeleton implying something is loading, no chip claiming
    // a status nothing measured. An empty screen that lies is worse than one
    // that admits it is empty.
    for (const slug of ["catalogue", "sap-systems", "passport"]) {
      const src = code(path.join(COREEDGE_APP, `coreedge/${slug}/page.tsx`));
      expect(src, `${slug}`).toContain("not built yet");
      expect(src, `${slug} fakes a status`).not.toContain("StatusChip");
      expect(src, `${slug} implies loading`).not.toContain("SkeletonRow");
    }
  });
});

describe("role gating never redirects", () => {
  it("redirects only an anonymous caller, never a role", () => {
    /*
     * "Every /coreedge route renders for every signed-in user, and only the
     * actions change, each disabled one carrying its reason." A redirect on
     * role teaches the wrong mental model and generates support tickets asking
     * whether a feature exists.
     *
     * A redirect guarded by `if (!user)` is the permitted one. Anything that
     * redirects after looking at a ROLE is not.
     */
    for (const file of FILES) {
      const src = code(file);
      for (const forbidden of [
        "canAccessOperations",
        "isAdminRole",
        "RoleGatedEmptyState",
        "lacksStudioTenantScope",
      ]) {
        expect(
          src.includes(forbidden),
          `${rel(file)} gates on role. CoreEdge routes render for every signed-in ` +
            `user; only the actions change.`,
        ).toBe(false);
      }
      // No redirect may mention a role at all.
      const redirects = [...src.matchAll(/redirect\([^)]*\)/g)].map((m) => m[0]);
      for (const r of redirects) {
        expect(r, `${rel(file)}: ${r}`).not.toMatch(/role|admin|consultant|operator|reviewer/i);
      }
    }
  });

  it("still gates on session, in the layout", () => {
    // Role never redirects; absence of a session always does.
    const layout = code(path.join(COREEDGE_APP, "layout.tsx"));
    expect(layout).toContain("getCurrentUser");
    expect(layout).toMatch(/redirect\(/);
  });
});

describe("every query is scoped to the caller's own organization", () => {
  it("never takes a tenant id from the URL", () => {
    /*
     * A console that accepts an organization id from a route param, a query
     * string or a header is a console with a tenant-isolation bug waiting for
     * someone to notice the parameter.
     */
    for (const file of FILES) {
      const src = code(file);
      expect(src, `${rel(file)} reads a tenant from params`).not.toMatch(
        /params[^\n]*organization|organizationId\s*[:=]\s*(params|searchParams)/i,
      );
    }
  });

  it("passes the session's organizationId into every lane query", () => {
    for (const file of FILES.filter((f) => code(f).includes("listLanes("))) {
      expect(code(file), `${rel(file)}`).toMatch(/listLanes\(\s*user\.organizationId/);
    }
  });

  it("handles a user with no organization rather than querying unscoped", () => {
    for (const file of FILES.filter((f) => code(f).includes("organizationId"))) {
      expect(
        code(file),
        `${rel(file)} does not handle a null organizationId`,
      ).toMatch(/organizationId === null/);
    }
  });
});

describe("the screens do not invent facts", () => {
  it("resolves every status through the vocabulary, never inline", () => {
    for (const file of FILES.filter((f) => f.endsWith("page.tsx"))) {
      const src = code(file);
      if (!src.includes("StatusChip")) continue;
      expect(
        src.includes("status-vocabulary") || src.includes("verdict.status") || src.includes('status="inReview"'),
        `${rel(file)} renders a chip without going through the vocabulary`,
      ).toBe(true);
    }
  });

  it("takes its words from the copy deck, not from string literals in the page", () => {
    const review = code(
      path.join(COREEDGE_APP, "coreedge/requests/[id]/page.tsx"),
    );
    // The disabled reasons are A6's, verbatim, via copy.ts.
    expect(review).toContain("DISABLED_REASONS");
    expect(review).toContain("ACTIONS.approve.button");
    // And not retyped.
    expect(review).not.toContain("You asked for this, so a colleague");
  });

  it("never renders an absence as a blank cell", () => {
    /*
     * The audit found an absence rendered as a blank cell on the existing
     * Operations screens, which reads as a bug rather than as a fact. A missing
     * SAP system is a reason, and the reason is why the lane is broken.
     */
    const ops = code(path.join(COREEDGE_APP, "coreedge/operations/page.tsx"));
    expect(ops).toContain("None connected");
    expect(ops).not.toMatch(/cell:\s*\(l\)\s*=>\s*l\.system\s*[,}]/);
  });
});

describe("the review screen refuses self-approval visibly", () => {
  const review = code(path.join(COREEDGE_APP, "coreedge/requests/[id]/page.tsx"));

  it("compares the requester to the viewer", () => {
    expect(review).toMatch(/requestedById === user\.id/);
  });

  it("disables the decision rather than hiding it", () => {
    /*
     * A hidden button leaves the reader unsure whether they lack a permission
     * or the product lacks a feature. A disabled one with its reason answers
     * both — and DecisionBar keeps it in the tab order.
     */
    expect(review).toContain("disabledReason");
    expect(review).toContain("DISABLED_REASONS.ownRequest");
  });

  it("does not offer sandbox-only approval (DECISION D2)", () => {
    // Kept for historical rows, never offered again — so it is absent from the
    // bar rather than present and disabled. A control nobody should ever use
    // again is not a control.
    expect(review).not.toContain("ACTIONS.approveSandboxOnly");
  });
});

describe("counted sentences count real rows", () => {
  it("computes every figure from the rows actually listed", () => {
    /*
     * The audit found a page length presented as a total and a sampled figure
     * presented as a window-wide one. Both read identically to a correct number,
     * which is what makes them dangerous.
     */
    const ops = code(path.join(COREEDGE_APP, "coreedge/operations/page.tsx"));
    // `[^)]*` would stop at the arrow's own closing paren, so match across it.
    expect(ops).toMatch(/const live = lanes\.filter\([\s\S]*?"live"[\s\S]*?\)\.length/);
    expect(ops).toMatch(/const unknown = lanes\.filter\([\s\S]*?"unknown"[\s\S]*?\)\.length/);
    expect(ops).toMatch(/lanes\.length/);
    // No hard-coded totals anywhere.
    expect(ops).not.toMatch(/total\s*[:=]\s*\d+/);
  });
});
