import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Let entry animations settle before scanning.
 *
 * The login card fades in over 300ms (`animate-in fade-in`). axe measures
 * COMPUTED colours, so scanning mid-fade samples a partially-blended background
 * and reports a colour-contrast violation that does not exist once the animation
 * finishes — the same button was reported at #83a9fc (2.27:1) and #739efc
 * (2.56:1) on consecutive retries of one run, which is the animation being
 * caught at different frames rather than a real defect.
 *
 * Waiting on the animations themselves rather than a fixed sleep keeps the test
 * fast when there is nothing to wait for, and correct if the duration changes.
 * The catch is deliberate: an indefinite animation (a spinner) must not hang the
 * suite — scanning slightly early is a better failure than never scanning.
 */
async function settleAnimations(page: Page): Promise<void> {
  await page
    .waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running"), undefined, {
      timeout: 3000,
    })
    .catch(() => {});
}

test.describe("Accessibility — Login Page", () => {
  test("login page should have no critical accessibility violations", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("load");
    await settleAnimations(page);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

    if (critical.length > 0) {
      const summary = critical.map(
        (v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`,
      );
      console.error("Accessibility violations:", summary.join("\n"));
    }

    expect(critical).toHaveLength(0);
  });

  test("login page should have proper form labels", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.locator("input[type='email']");
    // Should have an associated label or aria-label
    const hasLabel = await emailInput.evaluate((el) => {
      const id = el.id;
      const label = id ? document.querySelector(`label[for="${id}"]`) : null;
      const ariaLabel = el.getAttribute("aria-label");
      const ariaLabelledBy = el.getAttribute("aria-labelledby");
      return !!(label || ariaLabel || ariaLabelledBy);
    });
    expect(hasLabel).toBe(true);
  });

  test("login page should be keyboard navigable", async ({ page }) => {
    await page.goto("/login");
    // Tab should reach the email input
    await page.keyboard.press("Tab");
    const focusedTag = await page.evaluate(() => document.activeElement?.tagName);
    // Eventually should reach an input or button
    let foundInput = focusedTag === "INPUT";
    for (let i = 0; i < 10 && !foundInput; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => document.activeElement?.tagName);
      if (tag === "INPUT") foundInput = true;
    }
    expect(foundInput).toBe(true);
  });
});
