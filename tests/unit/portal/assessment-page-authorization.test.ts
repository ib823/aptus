/**
 * Portal pages that resolve a record from the URL check who is asking.
 *
 * THE FOURTH INSTANCE OF ONE PATTERN, and the largest. `requireAssessmentAccess`
 * has guarded the assessment API routes for a long time and has its own
 * coverage suite (`tests/unit/api/assessment-route-guard-coverage.test.ts`). No
 * PAGE called it, or the predicate underneath it.
 *
 * `(portal)/assessment/[id]/layout.tsx` resolved an assessment by id and
 * rendered it — company name, industry, revenue, ERP landscape — and every
 * child screen beneath: scope, gaps, requirements, integrations, the report.
 * The portal layout above it supplies a session and nothing more. So any
 * signed-in user could read any organization's assessment by id.
 *
 * `(portal)/workshops/[sessionId]` was the same: a session resolved by id, its
 * title, agenda, current step and attendee list rendered. The `isFacilitator`
 * line reads like a guard and is not — it decides which controls to draw.
 *
 * WHY THE GATE IS ON THE LAYOUT. Twenty-odd pages hang under
 * `assessment/[id]/`. Guarding each is one forgotten page away from open, which
 * is exactly how this survived: the API side was guarded route by route, tested
 * route by route, and the layout that renders all of it was never in scope.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const PORTAL = path.resolve(process.cwd(), "src/app/(portal)");
const ASSESSMENT_LAYOUT = path.join(PORTAL, "assessment/[id]/layout.tsx");
const WORKSHOP_PAGE = path.join(PORTAL, "workshops/[sessionId]/page.tsx");

const read = (p: string) => readFileSync(p, "utf8");

function pageFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...pageFiles(full));
    else if (entry === "page.tsx") out.push(full);
  }
  return out;
}

describe("the assessment shell authorizes before it renders", () => {
  it("calls the same predicate the API routes use", () => {
    /*
     * A CALL, not the identifier. `includes("verifyAssessmentAccess")` is
     * satisfied by the import line alone — deleting the check but leaving the
     * import left this assertion passing, which I only noticed by removing the
     * guard to see the suite fail.
     */
    const src = read(ASSESSMENT_LAYOUT);
    expect(
      /await\s+verifyAssessmentAccess\s*\(/.test(src),
      "assessment/[id]/layout.tsx must CALL verifyAssessmentAccess — it resolves " +
        "an assessment from the URL and every child page renders inside it.",
    ).toBe(true);
  });

  it("refuses with notFound(), not a 403", () => {
    // Confirming an assessment with this id exists is itself a cross-tenant
    // disclosure.
    // `[\s\S]` rather than the `s` flag: the tsconfig target predates it.
    const src = read(ASSESSMENT_LAYOUT);
    expect(/verifyAssessmentAccess\([^;]*\)\s*\)[\s\S]{0,12}notFound\(\)/.test(src)).toBe(true);
  });

  it("checks after loading the row, so it costs no extra query", () => {
    // The organizationId is passed from the assessment already fetched;
    // verifyAssessmentAccess only queries when it is not given one.
    const src = read(ASSESSMENT_LAYOUT);
    expect(src).toContain("organizationId: true");
    expect(src).toContain("assessment.organizationId");
  });

  it("still exists as the single gate — no child page has been given its own", () => {
    /*
     * Not a style rule. If a child page starts guarding itself, the next one
     * added will be written without a guard on the assumption that its sibling's
     * presence means the layout does not — which is how twenty pages end up
     * relying on nineteen checks.
     */
    const children = pageFiles(path.join(PORTAL, "assessment/[id]"));
    expect(children.length).toBeGreaterThan(10);
    const selfGuarding = children
      .filter((p) => read(p).includes("verifyAssessmentAccess"))
      .map((p) => path.relative(process.cwd(), p));
    expect(
      selfGuarding,
      "These pages guard themselves; the layout already does it for all of them:\n" +
        selfGuarding.join("\n"),
    ).toEqual([]);
  });
});

describe("the workshop room authorizes on its assessment", () => {
  it("verifies access before rendering the session", () => {
    const src = read(WORKSHOP_PAGE);
    expect(/await\s+verifyAssessmentAccess\s*\(/.test(src)).toBe(true);
  });

  it("does not mistake the facilitator check for a guard", () => {
    /*
     * `isFacilitator` decides which controls appear. If it were ever the only
     * check, every non-facilitator would be refused — including the client
     * stakeholders the room exists for — so its presence must not be read as
     * authorization.
     */
    const src = read(WORKSHOP_PAGE);
    const guardIndex = src.indexOf("verifyAssessmentAccess");
    const facilitatorIndex = src.indexOf("const isFacilitator");
    expect(guardIndex).toBeGreaterThan(-1);
    expect(
      guardIndex < facilitatorIndex,
      "the access check must run before anything derived from the session is used",
    ).toBe(true);
  });
});

describe("the assessments list stays scoped", () => {
  it("filters with the shared visibility helper rather than listing everything", () => {
    const src = read(path.join(PORTAL, "assessments/page.tsx"));
    expect(
      src.includes("getVisibleAssessmentWhere"),
      "the index must scope in the query — it was already correct, and this " +
        "keeps it that way while its neighbours were being fixed",
    ).toBe(true);
  });
});
