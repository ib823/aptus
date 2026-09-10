import { test, expect } from "@playwright/test";

/**
 * Responsive — Discover / the CoreEdge Studio shell (CE-013a).
 *
 * A SEPARATE FILE SO CI CAN ACTUALLY RUN IT. The obvious home for this was
 * responsive.auth.spec.ts, beside the assessments and dashboard checks. But CI
 * runs only the smoke, discovery-session and to-be-pack e2e targets — that file
 * runs in no job, which is how its /assessments and /dashboard mobile cases came
 * to be failing on main (both overflow to 556px at 375px) with nothing reporting
 * it. Adding these cases there would have inherited the same silence, and wiring
 * that whole file into CI would have started red for a defect this change does
 * not fix. So this stands alone and has its own CI step.
 */

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  /** The plan's embedded width — Discover rendered inside a host panel. */
  { name: "embedded", width: 420, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "wide", width: 1920, height: 1080 },
] as const;

/**
 * What the assertions below are for.
 *
 * THE REGRESSION THIS GUARDS. Before the studio responsive pass, /studio/discover
 * overflowed by 117px at 375px and 72px at 420px. StudioRail is a hard
 * `width: 220px; flex-shrink: 0` column, so the content got 155px, and after
 * <main>'s gutters roughly 107px of it was usable — Discover's prose wrapped to
 * two words a line and the top bar's controls were pushed off the right edge.
 *
 * The overflow assertion alone would pass on a page that failed to render, so
 * the breakpoint assertions below check that the layout ACTUALLY switched: the
 * shell stacks and the rail goes full width under 900px, and above it the rail
 * is still the 220px column it has always been.
 */
const STUDIO_STACK_BREAKPOINT = 900;

test.describe("Responsive — Discover (Studio shell)", () => {
  for (const viewport of VIEWPORTS) {
    test(`discover renders at ${viewport.name} (${viewport.width}x${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/studio/discover");
      await page.waitForLoadState("load");

      // The shell must be present — otherwise every assertion below is vacuous
      // and a role-gated empty state would "pass" the overflow check.
      const rail = page.locator("[data-studio-rail]");
      await expect(rail).toBeVisible();

      // No horizontal overflow. Items inside the rail's scroll strips may sit
      // past the right edge by design; the PAGE must not.
      const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
      expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 1);

      const layout = await page.evaluate(() => {
        const shell = document.querySelector("[data-studio]") as HTMLElement;
        const railEl = document.querySelector("[data-studio-rail]") as HTMLElement;
        const current = railEl.querySelector('[aria-current="page"]') as HTMLElement | null;
        return {
          shellDirection: getComputedStyle(shell).flexDirection,
          railWidth: Math.round(railEl.getBoundingClientRect().width),
          activeBackground: current ? getComputedStyle(current).backgroundColor : null,
        };
      });

      if (viewport.width < STUDIO_STACK_BREAKPOINT) {
        // Stacked: rail above content, spanning the viewport.
        expect(layout.shellDirection).toBe("column");
        expect(layout.railWidth).toBeGreaterThan(viewport.width * 0.9);

        /*
         * The selected item must still LOOK selected. RailHighlight draws the
         * one selected background for the whole rail and itemStyle carries none
         * of its own by design — but that bar is positioned by offsetTop and
         * stretched edge to edge, so in a horizontal strip it would highlight
         * every item. It is hidden here and the active item paints its own
         * background instead. Losing that leaves the strip with no visible
         * selection at all, which no overflow assertion would ever catch.
         */
        expect(layout.activeBackground).not.toBe("rgba(0, 0, 0, 0)");
        expect(layout.activeBackground).not.toBe("transparent");
      } else {
        // Desktop is untouched: the 220px navy rail, beside the content.
        expect(layout.shellDirection).toBe("row");
        expect(layout.railWidth).toBe(220);
      }

      if (process.env.E2E_VISUAL_REGRESSION === "true") {
        await expect(page).toHaveScreenshot(`discover-${viewport.name}.png`, {
          maxDiffPixelRatio: 0.05,
        });
      }
    });
  }
});
