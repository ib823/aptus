/**
 * The raw-literal rule actually fires (PR-1).
 *
 * WHY THIS RUNS ESLINT RATHER THAN READING THE CONFIG. A test that asserts
 * `eslint.config.mjs` contains a `no-restricted-syntax` block proves the block
 * was typed, not that it matches anything — and an AST selector that matches
 * nothing is the single most likely way for this rule to be silently useless.
 * Both halves have to hold: the selectors must catch the literals, and the
 * `files` patterns must resolve to the new console's directories.
 *
 * WHY `lintText` AND NOT FIXTURE FILES. The first version of this test wrote
 * fixtures into `src/app/(coreedge)/__fixtures__` so that a file would pick the
 * rule up by virtue of where it lived. That created a real route group on disk,
 * and `tests/unit/routing/route-group-gating.test.ts` enumerates route groups
 * FROM DISK and fails on any that has no access decision — which it did, exactly
 * as designed. Teardown would not have fixed it either: vitest runs files in
 * parallel, so the fixture only had to exist for the instant that test collected.
 *
 * `lintText` takes a `filePath` that ESLint resolves config against WITHOUT the
 * file existing, so the `files` patterns are still what decides the outcome —
 * which is the property under test — while nothing is written to `src/`. The
 * route group itself is PR-4's to create, with the layout that gates it.
 *
 * The `files` half is not hypothetical. The first version of this rule used
 * `*.{ts,tsx}`, which crashed the entire lint run — this repo's pnpm overrides
 * pin `brace-expansion` to >=5, whose API minimatch@3 (still used by
 * @eslint/config-array) cannot call, so a braced pattern throws "expand is not a
 * function" rather than failing to match. Every other block in the config
 * already lists patterns one extension at a time; now there is a test that says
 * why.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

import { ESLint } from "eslint";

const ROOT = process.cwd();

/**
 * Paths, not files. Each is inside a guarded directory; none is created.
 */
const IN_COMPONENTS = "src/components/coreedge/specimen.ts";
const IN_ROUTES = "src/app/(coreedge)/specimen.tsx";
/** The control: byte-identical content, one directory outside the scope. */
const OUTSIDE = "src/components/specimen-control.ts";

const OFFENDING = `export const styles = {
  colour: "#C8102E",
  wash: "rgba(255, 255, 255, 0.08)",
  gap: "12px",
  border: \`1px solid #E5E1D6\`,
};
`;

/*
 * WHAT A CLEAN COMPONENT LOOKS LIKE — and note what is NOT here.
 *
 * The first draft of this fixture ended `border: "1px solid var(--border-default)"`
 * and the rule refused it, correctly. A hairline is a length like any other, and
 * A2 declares no border-width token — so in CoreEdge a 1px border comes from
 * Tailwind's `border` utility on the element, not from a string in a style
 * object. That is exactly the habit this rule exists to create, and the fixture
 * was wrong rather than the rule.
 */
const CLEAN = `export const styles = {
  colour: "var(--cta-red)",
  wash: "var(--rail-hover)",
  gap: "var(--space-5)",
  radius: "var(--radius-input)",
};

export const classes = "border border-[color:var(--border-default)] bg-gate-ok-bg";
`;

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: ROOT });
});

async function messagesFor(relativePath: string, code: string): Promise<string[]> {
  const results = await eslint.lintText(code, {
    filePath: path.resolve(ROOT, relativePath),
  });
  return results.flatMap((r) =>
    r.messages.filter((m) => m.ruleId === "no-restricted-syntax").map((m) => m.message),
  );
}

describe("inside src/components/coreedge", () => {
  it("refuses a raw hex colour", async () => {
    const messages = await messagesFor(IN_COMPONENTS, OFFENDING);
    expect(messages.some((m) => m.startsWith("Raw hex colour."))).toBe(true);
  });

  it("refuses rgb()/rgba()", async () => {
    const messages = await messagesFor(IN_COMPONENTS, OFFENDING);
    expect(messages.some((m) => m.startsWith("Raw rgb()/rgba()."))).toBe(true);
  });

  it("refuses a px literal", async () => {
    const messages = await messagesFor(IN_COMPONENTS, OFFENDING);
    expect(messages.some((m) => m.startsWith("Raw px literal."))).toBe(true);
  });

  it("catches a hex hiding in a template literal", async () => {
    // A template literal is a different AST node, so the selector has to name it
    // separately — the easiest thing in the world to forget.
    const messages = await messagesFor(IN_COMPONENTS, OFFENDING);
    expect(messages.some((m) => m.includes("template literal"))).toBe(true);
  });

  it("says where the right value lives, in every message", async () => {
    // A refusal that does not name the alternative just teaches people to add an
    // eslint-disable comment.
    const messages = await messagesFor(IN_COMPONENTS, OFFENDING);
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message).toContain("src/app/coreedge-tokens.css");
    }
  });

  it("permits var(--token) and Tailwind utilities", async () => {
    expect(await messagesFor(IN_COMPONENTS, CLEAN)).toEqual([]);
  });
});

describe("inside src/app/(coreedge)", () => {
  it("applies there too — the parenthesised route group is matched", async () => {
    // `(coreedge)` is a Next.js route group. Parentheses are extglob syntax in
    // minimatch when preceded by ?*+@!, and literal otherwise; this asserts the
    // pattern resolves rather than silently matching nothing.
    const messages = await messagesFor(IN_ROUTES, OFFENDING);
    expect(messages.some((m) => m.startsWith("Raw hex colour."))).toBe(true);
  });
});

describe("outside the scope", () => {
  it("leaves the rest of the repo alone", async () => {
    /*
     * The control, and the reason the rule is scoped at all. The audit counted
     * 239 raw hex values, 27 rgb() calls and 1343 px literals across the
     * existing components. Running this everywhere would produce ~1600 errors on
     * code this work does not touch — and a rule that cannot be satisfied is a
     * rule everyone learns to disable.
     */
    expect(await messagesFor(OUTSIDE, OFFENDING)).toEqual([]);
  });
});

describe("the test writes nothing into src/", () => {
  it("leaves no fixture directory behind, anywhere under src/", async () => {
    /*
     * The property is that THIS TEST writes nothing — not that any particular
     * directory is absent.
     *
     * The first version asserted `src/app/(coreedge)` did not exist, which was
     * true when it was written and became wrong the moment PR-3 created the
     * route group for real. That assertion was describing the symptom (a
     * directory appeared) rather than the cause (this test created one), so it
     * started failing on a change it had no opinion about. Fixture directories
     * are the cause, and they are what is checked.
     *
     * If this test ever goes back to writing fixtures under src/, it takes
     * route-group-gating.test.ts down with it — see the header.
     */
    const { execFileSync } = await import("node:child_process");
    let found = "";
    try {
      found = execFileSync(
        "find",
        [path.resolve(ROOT, "src"), "-type", "d", "-name", "__fixtures__"],
        { encoding: "utf8" },
      );
    } catch {
      found = "";
    }
    const dirs = found.split("\n").filter(Boolean);
    expect(dirs, `Fixture directories left under src/:\n${dirs.join("\n")}`).toEqual([]);
  });
});

describe("the config does not use brace patterns", () => {
  it("lists each extension separately, so the lint run cannot crash", () => {
    const config = readFileSync(path.resolve(ROOT, "eslint.config.mjs"), "utf8");
    // `{ts,tsx}` anywhere in a files pattern throws "expand is not a function"
    // under this repo's brace-expansion override — a whole-run failure, not a
    // missed match.
    const filesBlocks = [...config.matchAll(/files:\s*\[([\s\S]*?)\]/g)].map((m) => m[1]!);
    expect(filesBlocks.length).toBeGreaterThan(0);
    for (const b of filesBlocks) {
      expect(b, "no braced extension groups in a files pattern").not.toMatch(/\{[^}]*,[^}]*\}/);
    }
  });
});
