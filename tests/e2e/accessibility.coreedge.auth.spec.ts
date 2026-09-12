import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Accessibility — the CoreEdge design system, in both themes.
 *
 * WHY THIS SCAN DIFFERS FROM THE OTHERS IN THIS FOLDER: it does NOT disable the
 * `color-contrast` rule.
 *
 * Every other authenticated scan here carries `.disableRules(["color-contrast"])`
 * with the note "Allow minor contrast issues in initial pass" — a reasonable
 * concession for surfaces whose palette predates any contrast budget. CoreEdge
 * has no such excuse: PR-1 computed every ratio in the token scope against the
 * surface each token actually renders on, and pinned them in
 * `tests/unit/coreedge/token-contrast.test.ts`. Those are arithmetic on declared
 * values; this is the same claim measured on rendered pixels. If the two ever
 * disagree, one of them is wrong about what the page does, and that is worth a
 * failing test rather than a disabled rule.
 *
 * WHY THE DESIGN-SYSTEM PAGE IS THE RIGHT TARGET: it renders every component in
 * every state on one page, derived from the vocabulary rather than listed. So a
 * scan of this one route covers all fourteen components, all eighteen statuses,
 * all six hops and every disabled reason — and keeps covering them when a
 * nineteenth status is added, without anyone adding it here.
 *
 * KNOWN LIMIT, stated so nobody reads more into a green run than it earns: axe
 * measures what it can compute. It cannot judge whether a disabled control's
 * reason is a USEFUL sentence, only that it is associated; the unit tests in
 * `tests/unit/coreedge/design-system.test.tsx` carry that half.
 *
 * THE FILENAME IS LOAD-BEARING. playwright.config.ts selects specs per project
 * by filename suffix — `authenticated` is `testMatch: /.*\.auth\.spec\.ts/`.
 * This file was first written as `accessibility.coreedge.spec.ts`, which matches
 * NO project: listing it in the npm scripts would have added a test that never
 * ran and never said so. The `.auth.` segment is what puts it in the
 * authenticated project, whose storageState signs it in — which this page needs,
 * since the group layout redirects an anonymous caller.
 */

const ROUTE = "/coreedge/design-system";

/** Serious and critical only, matching the convention of the sibling specs. */
async function scan(page: Page, tags: readonly string[]) {
  const results = await new AxeBuilder({ page }).withTags([...tags]).analyze();
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function report(violations: Awaited<ReturnType<typeof scan>>): string {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.description}\n` +
        v.nodes.map((n) => `    ${n.target.join(" ")} — ${n.failureSummary ?? ""}`).join("\n"),
    )
    .join("\n");
}

test.describe("CoreEdge design system", () => {
  test("has no serious or critical violations in light", async ({ page }) => {
    await page.goto(ROUTE);
    await page.waitForLoadState("load");

    // The page is session-gated; an anonymous run lands on the login screen and
    // would scan the wrong thing, passing for the wrong reason.
    await expect(page.getByRole("heading", { name: "CoreEdge design system" })).toBeVisible();

    const violations = await scan(page, ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
    expect(report(violations)).toBe("");
  });

  test("has no serious or critical violations in dark", async ({ page }) => {
    /*
     * next-themes runs with attribute="class", so dark is `.dark` on <html> and
     * NOTHING sets data-theme anywhere — which is the reachability bug PR-1
     * fixed.
     *
     * WHY THE PREFERENCE IS SEEDED BEFORE NAVIGATION, and not the class added
     * after it. This test first did `classList.add("dark")` on the loaded page.
     * That is a race, and it lost on main at 3daf844: next-themes reads its
     * stored preference during hydration and WRITES the resolved theme onto
     * <html>, so an added class survives only when hydration happens to have
     * finished first. When it had not, the class was replaced by `light` and
     * the assertion saw "… light" — on the first run and both retries. A dark
     * scan that silently measures the light palette is worse than no dark scan,
     * so the fix seeds the same store next-themes reads.
     *
     * The provider takes no `storageKey`, so the default "theme" is the real
     * key; if that ever changes, the assertion below fails loudly rather than
     * letting the scan quietly run against light. `enableSystem` is why
     * emulating prefers-color-scheme is not used instead: it would only take
     * effect when the stored preference is "system", and would silently skip
     * the dark pass on any run where it is not.
     */
    await page.addInitScript(() => {
      window.localStorage.setItem("theme", "dark");
    });

    await page.goto(ROUTE);
    await page.waitForLoadState("load");

    await expect(page.locator("html")).toHaveClass(/dark/);

    const violations = await scan(page, ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
    expect(report(violations)).toBe("");
  });

  test("the token scope is actually applied", async ({ page }) => {
    /*
     * A scan of a page where `.coreedge` never mounted would be a scan of the
     * portal's palette reporting a clean CoreEdge. PR-1 deliberately scoped the
     * tokens under that class rather than at :root, so its presence is what
     * makes every ratio above a claim about CoreEdge at all.
     */
    await page.goto(ROUTE);
    await page.waitForLoadState("load");
    await expect(page.locator(".coreedge").first()).toBeVisible();

    const railFill = await page.evaluate(() => {
      const el = document.querySelector(".coreedge");
      return el === null ? "" : getComputedStyle(el).getPropertyValue("--surface-rail").trim();
    });
    expect(railFill, "--surface-rail is not defined on .coreedge").not.toBe("");
  });
});

/**
 * PR-6 · the seven remaining screens, scanned on the same terms.
 *
 * These are LIST AND DETAIL SCREENS, which is where contrast defects hide: a
 * table's muted secondary line, a disabled control's reason, a status glyph on
 * a tinted ground. PR-1 computed those ratios against declared tokens; this
 * measures the rendered pixels, with `color-contrast` still enabled — the same
 * bargain the design-system scan makes.
 *
 * Each one renders for any signed-in user by contract (role gating never
 * redirects), so the authenticated project reaches all of them. A route that
 * started redirecting on role would fail here by landing somewhere with no
 * heading, which is the point.
 *
 * KNOWN LIMIT, stated so a green run is not read for more than it earns: in CI
 * these render against an empty database, so what is scanned is the chrome,
 * the headings, the legends and the EMPTY states — not populated table rows.
 * The muted secondary lines and status glyphs inside a row are covered by the
 * design-system scan above, which renders every component in every state; they
 * are not covered here. A seeded fixture would close the gap and is not in this
 * PR.
 */
const PR6_ROUTES = [
  { path: "/coreedge/catalogue", heading: "Catalogue" },
  { path: "/coreedge/passport", heading: "Passport" },
  { path: "/coreedge/sap-systems", heading: "SAP systems" },
  { path: "/coreedge/operations/keys", heading: "Keys" },
] as const;

test.describe("CoreEdge · the PR-6 screens", () => {
  for (const route of PR6_ROUTES) {
    test(`${route.path} has no serious or critical violations`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState("load");

      // Session-gated like every /coreedge route: an anonymous run would land
      // on the login screen and scan the wrong thing, passing for the wrong
      // reason. Assert the heading before believing the result.
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();

      const violations = await scan(page, ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
      expect(report(violations)).toBe("");
    });
  }
});
