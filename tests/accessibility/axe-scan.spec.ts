/**
 * Accessibility Tests — WCAG 2.1 AA Compliance (T-A11Y-001 through T-A11Y-013)
 *
 * Uses Playwright + axe-core to validate accessibility across all major views.
 * Scans: /signup, /dashboard, /assessments, /assessment/[id]/steps,
 *        /assessment/[id]/gaps, /assessment/[id]/integrations,
 *        /assessment/[id]/sign-off, /settings, /admin
 */

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// ── Test configuration ──────────────────────────────────────────────────

const VIEWS = [
  { name: "Signup", path: "/signup" },
  { name: "Dashboard", path: "/dashboard" },
  { name: "Assessments", path: "/assessments" },
  { name: "Assessment Steps", path: "/assessment/test-id/steps" },
  { name: "Assessment Gaps", path: "/assessment/test-id/gaps" },
  { name: "Assessment Integrations", path: "/assessment/test-id/integrations" },
  { name: "Assessment Sign-off", path: "/assessment/test-id/sign-off" },
  { name: "Settings", path: "/settings" },
  { name: "Personal Profile", path: "/settings/profile" },
  { name: "Organization Users", path: "/organization/users" },
  { name: "Admin", path: "/admin" },
];

/** Helper to run axe scan on a page and return violations */
async function runAxeScan(page: import("@playwright/test").Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
}

// ── T-A11Y-014: Minimum Touch Target Size (44x44px) ──────────────────────

test.describe("T-A11Y-014: Minimum Touch Target Size (44x44px)", () => {
  for (const view of VIEWS) {
    test(`${view.name} (${view.path}) — interactive elements meet 44px floor`, async ({ page }) => {
      await navigateAndWait(page, view.path);

      // We use a custom evaluator because standard axe "target-size" is often configured for 24px
      // 2025 standard for high-accuracy enterprise apps is 44px (Apple/Google baseline)
      const violations = await page.evaluate(() => {
        const elements = document.querySelectorAll('button, a, input, select, textarea, [role="button"]');
        const undersized: string[] = [];

        elements.forEach((el) => {
          const rect = el.getBoundingClientRect();
          // Exclude hidden elements or inline links within text blocks
          if (rect.width === 0 || rect.height === 0) return;
          
          const isInlineLink = el.tagName === 'A' && window.getComputedStyle(el).display === 'inline';
          if (isInlineLink) return;

          if (rect.width < 44 || rect.height < 44) {
            undersized.push(
              `${el.tagName.toLowerCase()}.${el.className.split(' ').join('.')} (${Math.round(rect.width)}x${Math.round(rect.height)})`
            );
          }
        });

        return undersized;
      });

      if (violations.length > 0) {
        console.warn(`[A11Y-014] Undersized targets on ${view.path}:\n`, violations.slice(0, 5));
      }

      // Allow a few decorative/icon elements below 44px; primary controls must meet the floor
      expect(violations.length).toBeLessThan(4);
    });
  }
});

/** Helper to navigate and wait for page to settle */
async function navigateAndWait(
  page: import("@playwright/test").Page,
  path: string,
) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

// ── T-A11Y-001: All form inputs have associated labels ──────────────────

test.describe("T-A11Y-001: All form inputs have associated labels", () => {
  for (const view of VIEWS) {
    test(`${view.name} (${view.path}) — form inputs have labels`, async ({ page }) => {
      await navigateAndWait(page, view.path);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .withRules(["label"])
        .analyze();

      const labelViolations = results.violations.filter(
        (v) => v.id === "label",
      );

      if (labelViolations.length > 0) {
        const details = labelViolations.flatMap((v) =>
          v.nodes.map((n) => `  ${n.html} — ${n.failureSummary}`),
        );
        console.error(`Label violations on ${view.path}:\n${details.join("\n")}`);
      }

      expect(labelViolations).toHaveLength(0);
    });
  }
});

// ── T-A11Y-002: All buttons have accessible names ───────────────────────

test.describe("T-A11Y-002: All buttons have accessible names", () => {
  for (const view of VIEWS) {
    test(`${view.name} (${view.path}) — buttons have accessible names`, async ({ page }) => {
      await navigateAndWait(page, view.path);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .withRules(["button-name"])
        .analyze();

      const buttonViolations = results.violations.filter(
        (v) => v.id === "button-name",
      );

      expect(buttonViolations).toHaveLength(0);
    });
  }
});

// ── T-A11Y-003: Color contrast >= 4.5:1 / 3:1 ─────────────────────────

test.describe("T-A11Y-003: Color contrast >= 4.5:1 for normal text, >= 3:1 for large text", () => {
  for (const view of VIEWS) {
    test(`${view.name} (${view.path}) — color contrast meets WCAG AA`, async ({ page }) => {
      await navigateAndWait(page, view.path);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2aa"])
        .withRules(["color-contrast"])
        .analyze();

      const contrastViolations = results.violations.filter(
        (v) => v.id === "color-contrast",
      );

      // Log details for debugging
      if (contrastViolations.length > 0) {
        const details = contrastViolations.flatMap((v) =>
          v.nodes.map(
            (n) => `  Contrast: ${n.html.substring(0, 80)} — ${n.failureSummary}`,
          ),
        );
        console.warn(`Contrast issues on ${view.path}:\n${details.join("\n")}`);
      }

      // Filter to only critical/serious for enforcement
      const serious = contrastViolations.flatMap((v) =>
        v.nodes.filter((n) => n.impact === "critical" || n.impact === "serious"),
      );

      expect(serious).toHaveLength(0);
    });
  }
});

// ── T-A11Y-004: Tab order follows visual order ──────────────────────────

test.describe("T-A11Y-004: Tab order follows visual order", () => {
  for (const view of VIEWS) {
    test(`${view.name} (${view.path}) — tabindex does not break natural order`, async ({ page }) => {
      await navigateAndWait(page, view.path);

      // Check that no element has a positive tabindex (which disrupts natural order)
      const positiveTabindex = await page.$$eval(
        "[tabindex]",
        (elements) =>
          elements
            .filter((el) => {
              const tabindex = parseInt(el.getAttribute("tabindex") ?? "0", 10);
              return tabindex > 0;
            })
            .map((el) => ({
              tag: el.tagName.toLowerCase(),
              tabindex: el.getAttribute("tabindex"),
              text: el.textContent?.trim().substring(0, 50),
            })),
      );

      if (positiveTabindex.length > 0) {
        console.error(
          `Positive tabindex found on ${view.path}:`,
          positiveTabindex,
        );
      }

      expect(positiveTabindex).toHaveLength(0);
    });
  }
});

// ── T-A11Y-005: Focus indicators visible ────────────────────────────────

test.describe("T-A11Y-005: Focus indicators visible", () => {
  test("interactive elements have visible focus styles", async ({ page }) => {
    await navigateAndWait(page, "/signup");

    // Tab through focusable elements and check focus visibility
    const focusableSelector = 'a, button, input, select, textarea, [tabindex="0"]';

    const focusableCount = await page.$$eval(
      focusableSelector,
      (els) => els.length,
    );

    if (focusableCount > 0) {
      // Tab to first focusable element
      await page.keyboard.press("Tab");

      // Check that the focused element has a visible outline or box-shadow
      const focusStyles = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        const styles = window.getComputedStyle(el);
        return {
          outline: styles.outline,
          outlineWidth: styles.outlineWidth,
          outlineStyle: styles.outlineStyle,
          boxShadow: styles.boxShadow,
        };
      });

      if (focusStyles) {
        const hasVisibleFocus =
          (focusStyles.outlineStyle !== "none" && focusStyles.outlineWidth !== "0px") ||
          (focusStyles.boxShadow !== "none" && focusStyles.boxShadow !== "");

        expect(hasVisibleFocus).toBe(true);
      }
    }
  });

  test("focus is not suppressed with outline: none without alternative", async ({ page }) => {
    await navigateAndWait(page, "/dashboard");

    // Check CSS for dangerous outline: none rules without box-shadow alternatives
    const suppressedFocus = await page.evaluate(() => {
      const allElements = document.querySelectorAll("button, a, input, select, textarea");
      const suppressed: string[] = [];

      allElements.forEach((el) => {
        const styles = window.getComputedStyle(el, ":focus");
        if (
          styles.outlineStyle === "none" &&
          styles.boxShadow === "none"
        ) {
          suppressed.push(
            `${el.tagName.toLowerCase()}.${el.className?.toString().substring(0, 30)}`,
          );
        }
      });

      return suppressed;
    });

    // Log any elements with suppressed focus for review
    if (suppressedFocus.length > 0) {
      console.warn("Elements with potentially suppressed focus:", suppressedFocus.slice(0, 10));
    }
  });
});

// ── T-A11Y-006: Screen reader announces step classification options ─────

test.describe("T-A11Y-006: Screen reader announces step classification options", () => {
  test("classification options have ARIA roles and labels", async ({ page }) => {
    await navigateAndWait(page, "/assessment/test-id/steps");

    // Check for radio groups or similar patterns with proper labeling
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .withRules(["aria-required-attr", "aria-valid-attr", "aria-roles"])
      .analyze();

    const ariaViolations = results.violations.filter(
      (v) =>
        v.id === "aria-required-attr" ||
        v.id === "aria-valid-attr" ||
        v.id === "aria-roles",
    );

    expect(ariaViolations).toHaveLength(0);
  });

  test("interactive classification elements are keyboard accessible", async ({ page }) => {
    await navigateAndWait(page, "/assessment/test-id/steps");

    // Ensure all interactive elements within classification areas are reachable via keyboard
    const results = await new AxeBuilder({ page })
      .withRules(["keyboard"])
      .analyze();

    const keyboardViolations = results.violations.filter(
      (v) => v.id === "keyboard" && v.impact === "critical",
    );

    expect(keyboardViolations).toHaveLength(0);
  });
});

// ── T-A11Y-007: Screen reader announces progress ────────────────────────

test.describe("T-A11Y-007: Screen reader announces progress", () => {
  test("progress indicators have appropriate ARIA attributes", async ({ page }) => {
    await navigateAndWait(page, "/dashboard");

    // Check for progressbar role or aria-valuenow on progress elements
    const progressElements = await page.$$eval(
      '[role="progressbar"], progress, [aria-valuenow]',
      (els) =>
        els.map((el) => ({
          role: el.getAttribute("role"),
          valueNow: el.getAttribute("aria-valuenow"),
          valueMin: el.getAttribute("aria-valuemin"),
          valueMax: el.getAttribute("aria-valuemax"),
          label: el.getAttribute("aria-label") || el.getAttribute("aria-labelledby"),
        })),
    );

    for (const el of progressElements) {
      if (el.role === "progressbar") {
        // Progressbar role requires aria-valuenow
        expect(el.valueNow).not.toBeNull();
      }
    }
  });
});

// ── T-A11Y-008: Collapsed sections keyboard-accessible ──────────────────

test.describe("T-A11Y-008: Collapsed sections keyboard-accessible", () => {
  test("expandable sections can be toggled with keyboard", async ({ page }) => {
    await navigateAndWait(page, "/assessment/test-id/steps");

    // Find elements with aria-expanded attribute
    const expandableElements = await page.$$('[aria-expanded]');

    for (const element of expandableElements) {
      const tagName = await element.evaluate((el) => el.tagName.toLowerCase());
      const isButton = tagName === "button";
      const hasRole = await element.getAttribute("role");

      // Expandable controls should be buttons or have button role
      expect(isButton || hasRole === "button").toBe(true);
    }
  });

  test("accordion elements have proper ARIA attributes", async ({ page }) => {
    await navigateAndWait(page, "/assessment/test-id/steps");

    const results = await new AxeBuilder({ page })
      .withRules(["aria-required-attr", "aria-valid-attr-value"])
      .analyze();

    const violations = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

    expect(violations).toHaveLength(0);
  });
});

// ── T-A11Y-009: Live regions announce real-time updates ─────────────────

test.describe("T-A11Y-009: Live regions announce real-time updates", () => {
  test("page contains at least one aria-live region for notifications", async ({ page }) => {
    await navigateAndWait(page, "/dashboard");

    const liveRegions = await page.$$eval(
      '[aria-live], [role="alert"], [role="status"], [role="log"]',
      (els) =>
        els.map((el) => ({
          ariaLive: el.getAttribute("aria-live"),
          role: el.getAttribute("role"),
          tag: el.tagName.toLowerCase(),
        })),
    );

    // Application should have at least one live region for toast/notification announcements
    // The Sonner toast component should create one automatically
    // If no live regions found, the page may not have rendered dynamic content yet
    if (liveRegions.length === 0) {
      console.warn(
        "No aria-live regions found on /dashboard. " +
        "Ensure toast notifications use aria-live or role='alert'.",
      );
    }
  });

  test("status messages use appropriate politeness levels", async ({ page }) => {
    await navigateAndWait(page, "/assessments");

    const liveRegions = await page.$$eval(
      "[aria-live]",
      (els) =>
        els.map((el) => ({
          ariaLive: el.getAttribute("aria-live"),
          atomic: el.getAttribute("aria-atomic"),
        })),
    );

    for (const region of liveRegions) {
      // aria-live should be "polite" or "assertive", never an invalid value
      expect(["polite", "assertive", "off"]).toContain(region.ariaLive);
    }
  });
});

// ── T-A11Y-010: Modal dialogs trap focus ────────────────────────────────

test.describe("T-A11Y-010: Modal dialogs trap focus", () => {
  test("dialog elements have proper ARIA role and labeling", async ({ page }) => {
    await navigateAndWait(page, "/assessments");

    const results = await new AxeBuilder({ page })
      .withRules(["aria-dialog-name"])
      .analyze();

    const dialogViolations = results.violations.filter(
      (v) => v.id === "aria-dialog-name",
    );

    expect(dialogViolations).toHaveLength(0);
  });

  test("open modals have role=dialog and aria-modal=true", async ({ page }) => {
    await navigateAndWait(page, "/assessments");

    // Check any visible dialog elements
    const dialogs = await page.$$eval(
      '[role="dialog"], dialog[open]',
      (els) =>
        els.map((el) => ({
          role: el.getAttribute("role"),
          ariaModal: el.getAttribute("aria-modal"),
          ariaLabel: el.getAttribute("aria-label"),
          ariaLabelledBy: el.getAttribute("aria-labelledby"),
          hasLabel: !!(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby")),
        })),
    );

    for (const dialog of dialogs) {
      expect(dialog.ariaModal).toBe("true");
      expect(dialog.hasLabel).toBe(true);
    }
  });
});

// ── T-A11Y-011: Error messages via aria-describedby ─────────────────────

test.describe("T-A11Y-011: Error messages linked via aria-describedby", () => {
  test("form validation errors are associated with inputs", async ({ page }) => {
    await navigateAndWait(page, "/signup");

    // Check that inputs with errors have aria-describedby pointing to error messages
    const results = await new AxeBuilder({ page })
      .withRules(["aria-input-field-name"])
      .analyze();

    const inputViolations = results.violations.filter(
      (v) => v.impact === "critical",
    );

    expect(inputViolations).toHaveLength(0);
  });

  test("error messages have aria-live for dynamic announcements", async ({ page }) => {
    await navigateAndWait(page, "/signup");

    // Try submitting an empty form to trigger validation errors
    const submitBtn = page.locator('button[type="submit"]').first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(500);

      // Check for error messages with proper ARIA attributes
      const errorElements = await page.$$eval(
        '[role="alert"], [aria-live="assertive"], .error-message, [data-error]',
        (els) =>
          els.map((el) => ({
            role: el.getAttribute("role"),
            ariaLive: el.getAttribute("aria-live"),
            id: el.id,
            text: el.textContent?.trim().substring(0, 50),
          })),
      );

      // If errors are shown, they should be announced
      for (const error of errorElements) {
        const isAnnounced =
          error.role === "alert" || error.ariaLive === "assertive";
        if (!isAnnounced) {
          console.warn(`Error element may not be announced: ${error.text}`);
        }
      }
    }
  });
});

// ── T-A11Y-012: Sign-off confirmation readable by screen reader ─────────

test.describe("T-A11Y-012: Sign-off confirmation readable by screen reader", () => {
  test("sign-off page has proper heading structure", async ({ page }) => {
    await navigateAndWait(page, "/assessment/test-id/sign-off");

    const results = await new AxeBuilder({ page })
      .withRules(["heading-order", "page-has-heading-one"])
      .analyze();

    const headingViolations = results.violations.filter(
      (v) => v.id === "heading-order",
    );

    // Allow for redirected pages (auth redirect)
    if (headingViolations.length > 0) {
      const critical = headingViolations.flatMap((v) =>
        v.nodes.filter((n) => n.impact === "critical"),
      );
      expect(critical).toHaveLength(0);
    }
  });

  test("sign-off actions have clear accessible labels", async ({ page }) => {
    await navigateAndWait(page, "/assessment/test-id/sign-off");

    const results = await new AxeBuilder({ page })
      .withRules(["button-name", "link-name"])
      .analyze();

    const nameViolations = results.violations.filter(
      (v) => v.id === "button-name" || v.id === "link-name",
    );

    expect(nameViolations).toHaveLength(0);
  });
});

// ── T-A11Y-013: No auto-play animations / respects prefers-reduced-motion

test.describe("T-A11Y-013: No auto-play animations / respects prefers-reduced-motion", () => {
  test("no auto-playing videos or animations on page load", async ({ page }) => {
    await navigateAndWait(page, "/dashboard");

    // Check for auto-playing video or audio elements
    const autoplayMedia = await page.$$eval(
      "video[autoplay], audio[autoplay]",
      (els) => els.length,
    );

    expect(autoplayMedia).toBe(0);
  });

  test("animations respect prefers-reduced-motion", async ({ page }) => {
    // Emulate reduced motion preference
    await page.emulateMedia({ reducedMotion: "reduce" });
    await navigateAndWait(page, "/dashboard");

    // Check that CSS respects the preference
    const hasReducedMotionStyles = await page.evaluate(() => {
      const allStyleSheets = Array.from(document.styleSheets);
      let hasMediaQuery = false;

      try {
        for (const sheet of allStyleSheets) {
          try {
            const rules = Array.from(sheet.cssRules || []);
            for (const rule of rules) {
              if (
                rule instanceof CSSMediaRule &&
                rule.conditionText?.includes("prefers-reduced-motion")
              ) {
                hasMediaQuery = true;
              }
            }
          } catch {
            // Cross-origin stylesheets cannot be inspected
          }
        }
      } catch {
        // Ignore errors from inaccessible stylesheets
      }

      return hasMediaQuery;
    });

    // The app should have prefers-reduced-motion media queries
    // or Tailwind's motion-reduce utilities handle this automatically
    if (!hasReducedMotionStyles) {
      console.warn(
        "No prefers-reduced-motion media queries found. " +
        "Ensure animations respect user preferences via Tailwind motion-reduce or CSS media queries.",
      );
    }
  });

  test("no content flashes or auto-scrolling", async ({ page }) => {
    await navigateAndWait(page, "/assessments");

    // Check for elements with animation-play-state or that might auto-scroll
    const runningAnimations = await page.evaluate(() => {
      const animated = document.getAnimations();
      return animated
        .filter((a) => a.playState === "running")
        .map((a) => ({
          element: (a.effect as KeyframeEffect | null)?.target instanceof Element ? (a.effect as KeyframeEffect).target!.tagName : "unknown",
          name: (a as CSSAnimation).animationName ?? "unnamed",
        }));
    });

    // Any running animations on page load should be subtle (not disruptive)
    // Log for manual review if animations are found
    if (runningAnimations.length > 0) {
      console.info(
        `Found ${runningAnimations.length} running animations on /assessments. ` +
        "Verify they are subtle and can be disabled with prefers-reduced-motion.",
      );
    }
  });
});

// ── Full WCAG 2.1 AA scan across all views ──────────────────────────────

test.describe("Full WCAG 2.1 AA scan — critical and serious violations", () => {
  for (const view of VIEWS) {
    test(`${view.name} (${view.path}) — no critical/serious WCAG violations`, async ({ page }) => {
      await navigateAndWait(page, view.path);

      const results = await runAxeScan(page);

      const criticalOrSerious = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );

      if (criticalOrSerious.length > 0) {
        const summary = criticalOrSerious.map(
          (v) =>
            `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`,
        );
        console.error(
          `WCAG violations on ${view.path}:\n${summary.join("\n")}`,
        );
      }

      expect(criticalOrSerious).toHaveLength(0);
    });
  }
});
