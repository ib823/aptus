/**
 * Every route group is classified, and every session-gated one actually gates.
 *
 * WHY THIS EXISTS. The `(help)` group shipped with no gate of any kind. All
 * twenty manual pages returned 200 to an anonymous request against the live
 * deployment — verified by curl, not inferred — while every other Console route
 * redirected to the login page. Nothing caught it: the layout was valid, the
 * pages rendered, typecheck and lint were clean, and 4932 tests passed. There
 * was no gate to get wrong, only a gate that was never written, and absence is
 * what a test suite is worst at noticing.
 *
 * It was also invisible to review, because the group's own header explained at
 * length that it was deliberately NOT ROLE-gated — a true statement about a
 * different gate, sitting exactly where a reader would look for this one.
 *
 * So this asserts the thing that has no natural home: that a new directory under
 * src/app has an access decision at all. Groups are enumerated FROM DISK. Adding
 * one without listing it below fails, which is the only property that matters —
 * the failure has to happen at the moment of forgetting.
 *
 * The three buckets are genuinely different mechanisms, not severity levels:
 *   SESSION  — the layout resolves a user and redirects when there is none.
 *   TOKEN    — reached by an unguessable capability URL; there is no session to
 *              check, and the token IS the credential.
 *   PUBLIC   — meant for anyone, including people who are not signed in.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const APP = resolve(__dirname, "../../../src/app");

/**
 * Route groups whose layout must resolve a session and redirect without one.
 */
const SESSION: readonly string[] = [
  "(studio)",
  "(operations)",
  "(control-tower)",
  "(help)",
  "(portal)",
  "(workbench)",
];

/**
 * Reached by capability URL. `(external)` is the presales and affirm guest
 * surfaces under /c/ and /a/; `(portal-customer)` is the [shareToken] assessment
 * view. Both are unauthenticated BY DESIGN — the secret in the path is the
 * credential, and requiring a session would defeat the surface's purpose.
 */
const TOKEN: readonly string[] = ["(external)", "(portal-customer)"];

/** Meant for anyone: sign-in, sign-up, marketing and legal pages. */
const PUBLIC: readonly string[] = ["(auth)", "(public)", "(workbench-public)"];

/** Anything that resolves a signed-in user server-side. */
const SESSION_CALL = /getCurrentUser|requireAuth|getServerSession|\bauth\(\)/;

function routeGroupsOnDisk(): string[] {
  return readdirSync(APP)
    .filter((e) => e.startsWith("(") && e.endsWith(")"))
    .filter((e) => statSync(join(APP, e)).isDirectory())
    .sort();
}

describe("every route group has an access decision", () => {
  const groups = routeGroupsOnDisk();

  it("finds route groups, so a broken read cannot pass vacuously", () => {
    expect(groups.length).toBeGreaterThan(5);
  });

  it("classifies every group on disk", () => {
    const classified = new Set([...SESSION, ...TOKEN, ...PUBLIC]);
    const unclassified = groups.filter((g) => !classified.has(g));
    expect(
      unclassified,
      "These route groups exist and no one has said how they are protected.\n" +
        "Add each to SESSION, TOKEN or PUBLIC in this file — deliberately, not to\n" +
        "make the test pass. `(help)` was anonymous-readable in production for\n" +
        "exactly as long as nobody had to make this choice:\n" +
        unclassified.join("\n"),
    ).toEqual([]);
  });

  it("lists no group that has been deleted", () => {
    const onDisk = new Set(groups);
    const ghosts = [...SESSION, ...TOKEN, ...PUBLIC].filter((g) => !onDisk.has(g));
    expect(ghosts, `Classified but gone from disk:\n${ghosts.join("\n")}`).toEqual([]);
  });
});

describe("session-gated groups actually resolve a session", () => {
  it.each(SESSION.map((g) => [g] as const))("%s redirects an anonymous caller", (group) => {
    const layout = join(APP, group, "layout.tsx");
    const src = readFileSync(layout, "utf8");

    expect(
      SESSION_CALL.test(src),
      `${group}/layout.tsx does not resolve a user. A group in SESSION whose ` +
        `layout never asks who is calling is ungated whatever the comments say.`,
    ).toBe(true);

    expect(
      /redirect\(/.test(src),
      `${group}/layout.tsx resolves a user but never redirects. Reading the ` +
        `session and then rendering anyway is not a gate.`,
    ).toBe(true);
  });

  it("cannot be satisfied by a static group, which could not read a session", () => {
    // force-static and a session check are mutually exclusive: the first is
    // resolved at build time, when there is no caller. A group holding both is
    // misconfigured, and the build is where that surfaces.
    for (const group of SESSION) {
      const src = readFileSync(join(APP, group, "layout.tsx"), "utf8");
      expect(src, `${group}/layout.tsx is force-static AND session-gated`).not.toMatch(
        /dynamic\s*=\s*["']force-static["']/,
      );
    }
  });
});
