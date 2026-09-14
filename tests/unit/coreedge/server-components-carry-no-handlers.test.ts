/**
 * A component that attaches a DOM event handler must be a Client Component.
 *
 * THE BUG THIS EXISTS FOR. `blockedControlProps()` returns an `onClick` — the
 * refusal handler that makes `aria-disabled` mean something — and DecisionBar
 * spread it onto a host <button> without a "use client" directive. React cannot
 * serialize a function onto a host element from a Server Component, so every
 * server-rendered page that showed a disabled action returned HTTP 500:
 *
 *   Error: Event handlers cannot be passed to Client Component props.
 *
 * Five real screens were dead in production for the life of that omission.
 *
 * WHY NOTHING CAUGHT IT, and why this file is source-level rather than a render:
 *
 *   1. /coreedge/design-system renders DecisionBar from DesignSystemClient.tsx,
 *      which IS "use client" — the reference page exercised the exact component
 *      that was killing four routes, and could not fail.
 *   2. Every test in this folder renders in jsdom, which never performs RSC
 *      serialization. A mount test cannot see this class of bug and never will.
 *   3. The authenticated Playwright run DOES visit /coreedge/sap-systems — but
 *      every seeded E2E user has organizationId = NULL, so the page took its
 *      "not attached to an organization" branch, never reached the DecisionBar,
 *      and passed its heading assertion on a different page than a real user
 *      gets. That is the one that looked like coverage.
 *
 * So the only check that runs on every commit and can actually see it is this
 * one: read the source, and require the directive wherever a handler is bound.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DIRS = [
  "src/components/coreedge",
  "src/components/coreedge/primitives",
] as const;

function filesIn(dir: string): string[] {
  return readdirSync(path.resolve(ROOT, dir))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => `${dir}/${f}`);
}

const COMPONENTS = DIRS.flatMap(filesIn).sort();

function source(file: string): string {
  return readFileSync(path.resolve(ROOT, file), "utf8");
}

const isClient = (file: string): boolean => /^\s*["']use client["']/.test(source(file));

/** Strips comments, so prose about a handler is not mistaken for binding one. */
function code(file: string): string {
  return source(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

/** Optional handler props this component declares: `onOpen?: () => void`. */
function optionalHandlerProps(file: string): string[] {
  return [...code(file).matchAll(/readonly\s+(on[A-Z]\w*)\?:/g)].map((m) => m[1] ?? "");
}

/** Every DOM handler bound in this file's own JSX, with what it is bound to. */
function boundHandlers(file: string): { attr: string; value: string }[] {
  return [...code(file).matchAll(/\s(on[A-Z]\w+)=\{([^}]*)\}/g)].map((m) => ({
    attr: m[1] ?? "",
    value: m[2] ?? "",
  }));
}

describe("a server component never binds a handler it creates itself", () => {
  /*
   * THE DISTINCTION THAT MATTERS, and the reason this is not a blanket ban.
   *
   * Forwarding an OPTIONAL prop is safe on the server: `onClick={onOpen}` with
   * `onOpen` undefined renders `onClick={undefined}` and nothing is serialized.
   * LaneCard, StatusChip and OpsTable all do exactly this and are correct as
   * server components — OpsTable's arrow is guarded by `onRowOpen !== undefined`
   * so it is not even constructed unless a caller opted in.
   *
   * Creating a handler UNCONDITIONALLY is what kills the page: there is no
   * caller choice, so every server render carries a function onto a host
   * element. That is what DecisionBar did via blockedControlProps.
   *
   * So the rule is: a server component may bind only handlers traceable to one
   * of its own optional props. The suite below covers the other half — that no
   * server page ever passes one.
   */
  it.each(COMPONENTS)("%s", (file) => {
    if (isClient(file)) return;
    const optional = optionalHandlerProps(file);
    const unconditional = boundHandlers(file).filter(
      ({ value }) => !optional.some((prop) => value.includes(prop)),
    );
    expect(
      unconditional.map((h) => `${h.attr}={${h.value}}`),
      `${file} is a Server Component and binds a handler that is not one of its ` +
        `own optional props (${optional.join(", ") || "it declares none"}). React ` +
        `cannot serialize a function onto a host element from a Server Component — ` +
        `every server-rendered page using it returns HTTP 500.`,
    ).toEqual([]);
  });
});

describe("blockedControlProps is only ever spread inside a client component", () => {
  /*
   * This helper ALWAYS returns an onClick, so unlike an optional handler prop
   * there is no safe server usage of it at all. Called out separately because
   * the rule is absolute where the one above is conditional.
   */
  it.each(COMPONENTS)("%s", (file) => {
    if (!code(file).includes("blockedControlProps")) return;
    expect(
      isClient(file),
      `${file} spreads blockedControlProps, which always returns an onClick, ` +
        `without "use client".`,
    ).toBe(true);
  });

  it("is spread by at least one component, so this suite is not vacuous", () => {
    const users = COMPONENTS.filter((f) => code(f).includes("blockedControlProps"));
    expect(users.length).toBeGreaterThan(0);
  });
});

describe("no server page passes a handler to a component that accepts one", () => {
  /*
   * The mirror image: LaneCard, OpsTable and StatusChip each declare an
   * OPTIONAL handler prop and are server components. That is safe only while no
   * server-rendered page passes one. If a page ever does, it fails the same way
   * DecisionBar did — so the rule is checked rather than trusted to a comment.
   */
  const PAGES_DIR = path.resolve(ROOT, "src/app/(coreedge)");

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return e.isFile() && full.endsWith(".tsx") ? [full] : [];
    });
  }

  it.each(walk(PAGES_DIR).map((f) => path.relative(ROOT, f)))("%s", (file) => {
    if (isClient(file)) return; // a client page may bind whatever it likes
    const bound = boundHandlers(file).map((h) => `${h.attr}={${h.value}}`);
    expect(
      bound,
      `${file} is a Server Component and binds a DOM event handler. That is the ` +
        `HTTP 500 DecisionBar shipped; either mark the file "use client" or move ` +
        `the interactive part into a component that is.`,
    ).toEqual([]);
  });
});
