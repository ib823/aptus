/**
 * You can actually register a solution.
 *
 * The console had a hole shaped exactly like its own first instruction. Three
 * surfaces told you to register a solution — the Home first-run card, the
 * Solutions empty state, and Discover's "Add to interface" dialog — and not one
 * of them offered a way to do it. The POST route existed; no UI ever called it.
 * A developer following the product's own guidance reached a sentence telling
 * them to do something, and stopped.
 *
 * That is worse than an unbuilt feature. An absent screen is a gap; a screen
 * that names the next step and withholds it reads as a broken product, and sends
 * the reader hunting for a button that was never there.
 *
 * These guard the two halves: the form exists and posts, and every surface that
 * names the step also links to it.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");

/** Line comments first — a `//` ending in a glob must not open a block. */
function code(src: string): string {
  return src
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

/**
 * Collapse whitespace before matching prose or JSX shape.
 *
 * Without this these tests assert on where the formatter happened to wrap a
 * line: the copy below breaks between "no" and "access", so a literal search for
 * "grants no access" failed on text that reads exactly that way on screen.
 */
function flat(src: string): string {
  return src.replace(/\s+/g, " ");
}

const SOLUTIONS_UI = "src/components/studio/SolutionsClient.tsx";
const DISCOVER_UI = "src/components/studio/DiscoverClient.tsx";
const HOME = "src/app/(studio)/studio/page.tsx";
const API = "src/app/api/studio/solutions/route.ts";

describe("the registration form exists and posts", () => {
  const ui = code(read(SOLUTIONS_UI));

  it("POSTs to the solutions route", () => {
    // The route has had a POST all along. Nothing called it.
    expect(flat(ui)).toMatch(/fetch\("\/api\/studio\/solutions", \{ method: "POST"/);
  });

  it("collects every field the server requires", () => {
    for (const field of ["name", "classification", "businessProblem", "dataClass"]) {
      expect(ui, `${field} is required by the API and must be collected`).toContain(field);
    }
  });

  it("offers exactly the classifications the server accepts", () => {
    // A select listing a value the enum rejects is a validation error the user
    // cannot fix; one missing a value quietly removes a legitimate choice.
    const apiKinds = (read(API).match(/const KINDS = \[([^\]]*)\]/)?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    expect(apiKinds.length).toBeGreaterThan(0);

    const uiKinds = [...ui.matchAll(/value:\s*"([A-Z_]+)"/g)].map((m) => m[1]);
    expect(uiKinds.sort()).toEqual([...apiKinds].sort());
  });

  it("omits an empty repoUrl rather than sending a blank string", () => {
    // repoUrl is validated as a URL when present; "" fails, and the whole form
    // would be rejected over an optional field the user left alone.
    expect(flat(ui)).toMatch(/repoUrl\.trim\(\) \? \{ repoUrl/);
  });

  it("is offered only to builders", () => {
    // canMutateStudio is consultant-only; an admin sees Studio in an oversight
    // capacity. Showing them a form the server will refuse is a trap.
    expect(flat(ui)).toMatch(/canAuthor \? \( <RegisterSolutionForm/);
  });

  it("says why the submit button is disabled", () => {
    // A form that refuses to submit without saying what is missing is its own
    // bug — the user is left clicking a dead button.
    expect(ui).toMatch(/problems\.length > 0/);
    expect(read(SOLUTIONS_UI)).toContain("Still needs");
  });

  it("states plainly that registering grants no access", () => {
    expect(flat(read(SOLUTIONS_UI))).toMatch(/grants no access to anything/);
  });
});

describe("no surface names the step without offering it", () => {
  it("Discover's add-to-interface dialog links to Solutions", () => {
    const src = read(DISCOVER_UI);
    expect(src).toContain("no solutions yet");
    expect(src, "the dialog tells you to register and must link there").toContain(
      '"/studio/solutions"',
    );
  });

  it("the Home first-run card links to Solutions", () => {
    const src = read(HOME);
    expect(src).toContain('"/studio/solutions"');
    // The old copy — "Solution registration ships with the Solutions section" —
    // described a future rather than offering a link.
    expect(src).not.toMatch(/ships with the Solutions section/);
  });

  it("the Solutions empty state offers the form, not just an explanation", () => {
    const src = read(SOLUTIONS_UI);
    const emptyState = flat(src).match(/Register your first solution.{0,700}/)?.[0] ?? "";
    expect(emptyState).toContain("RegisterSolutionForm");
  });
});
