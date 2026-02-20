import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility — Login Page", () => {
  test("login page should have no critical accessibility violations", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");

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
