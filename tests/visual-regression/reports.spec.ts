/** Visual-regression suite for the report bundle design mocks (spec v1.2).
 *
 * For each of the 27 HTML mocks under docs/design/v1.2/reports/, render via
 * file://, wait for fonts + network to settle, then compare a full-page
 * screenshot against a checked-in baseline. Any unintentional pixel drift
 * fails the test with a diff image attached to the report.
 *
 * To intentionally update baselines after a deliberate design change:
 *   pnpm test:visual:update
 *
 * Workflow contract: baselines live next to the spec doc — when the design
 * spec moves to v1.3, generate a new mocks folder and a fresh baseline set.
 * Baselines are NEVER updated silently — that's a policy violation. */

import { test, expect } from "@playwright/test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const REPORTS_DIR = join(__dirname, "..", "..", "docs", "design", "v1.2", "reports");

/** All HTML files under reports/ that represent a deliverable mock.
 * Excludes infrastructure files (index, contact_sheet) which are review
 * scaffolding, not deliverables — they're tested separately. */
const DELIVERABLE_MOCKS = readdirSync(REPORTS_DIR)
  .filter((f) => f.endsWith(".html"))
  .filter((f) => !["index.html", "contact_sheet.html"].includes(f))
  .sort();

/** Review-scaffolding HTML files — also visual-tested but tracked separately
 * since they're not part of the printed bundle. */
const SCAFFOLDING_MOCKS = ["index.html", "contact_sheet.html"];

/** Wait for the page to be visually stable — fonts loaded, no in-flight
 * network requests, layout settled. */
async function waitForRenderStable(page: import("@playwright/test").Page) {
  // 1. Wait for the network to settle (Google Fonts CSS/woff requests).
  await page.waitForLoadState("networkidle");
  // 2. Wait for all fonts declared in CSS @font-face to actually load.
  await page.evaluate(() => document.fonts.ready);
  // 3. Hide the on-screen review bar — it's a developer affordance, not
  //    part of the deliverable. Leaving it in screenshots would couple
  //    the baseline to the review-bar styling.
  await page.addStyleTag({ content: ".review-bar { display: none !important; }" });
  // 4. One more frame to let layout settle after the style injection.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

test.describe("Report bundle deliverables (v1.2)", () => {
  for (const mock of DELIVERABLE_MOCKS) {
    test(`${mock} matches baseline`, async ({ page }) => {
      const url = `file://${join(REPORTS_DIR, mock)}`;
      await page.goto(url);
      await waitForRenderStable(page);

      // Full-page screenshot — captures the entire .page element plus the
      // gray surround. fullPage: true so card-variants (intentionally tall)
      // and per-area pages (variable height) capture everything.
      await expect(page).toHaveScreenshot(`${mock}.png`, {
        fullPage: true,
      });
    });
  }
});

test.describe("Review scaffolding (index + contact sheet)", () => {
  // Scaffolding pages use CSS aspect-ratio in card grids, which produces a ±1
  // pixel height variance across rendering environments (codespace vs CI's
  // playwright Docker image). Clipping to a deterministic area sidesteps it
  // — we still verify the visible top portion matches pixel-for-pixel.
  for (const mock of SCAFFOLDING_MOCKS) {
    test(`${mock} matches baseline`, async ({ page }) => {
      const url = `file://${join(REPORTS_DIR, mock)}`;
      await page.goto(url);
      await waitForRenderStable(page);
      await expect(page).toHaveScreenshot(`${mock}.png`, {
        clip: { x: 0, y: 0, width: 1280, height: 1500 },
      });
    });
  }
});

test.describe("Coverage guard", () => {
  test("every HTML file in reports/ is covered by exactly one screenshot test", () => {
    const allMocks = readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".html"));
    const covered = new Set([...DELIVERABLE_MOCKS, ...SCAFFOLDING_MOCKS]);
    const uncovered = allMocks.filter((f) => !covered.has(f));

    expect(uncovered).toEqual([]);

    // Sanity: 29 deliverable mocks (27 spec'd + brand-accent variant +
    //         13_flow_atlas cover counted separately) + 2 scaffolding files.
    expect(DELIVERABLE_MOCKS.length).toBe(29);
    expect(SCAFFOLDING_MOCKS.length).toBe(2);
  });
});
