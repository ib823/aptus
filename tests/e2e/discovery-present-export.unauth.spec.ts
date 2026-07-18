/**
 * ABeam Workbench — Present + Export (PR-3) e2e.
 *
 * Keyboard-first Present (1–4, arrows, Shift+arrows, Space, P) and the
 * print-clean Export pack.
 *
 * REQUIREMENTS: dev server with NEUTRAL_DISCOVERY_ENABLED=true; DISCOVERY_E2E=1.
 *
 * NOTE: never executed here — no Postgres in the build environment, and
 * global-setup opens Prisma before any spec. Gates in preview. See BUILD-LOG.
 */

import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import AxeBuilder from "@axe-core/playwright";
import { hashToken, mintRawToken } from "../../src/lib/affirm/external/tokens";
import { hashUserAgent } from "../../src/lib/security/ua-fingerprint";

const RUN = process.env.DISCOVERY_E2E === "1";
const UA = "DiscoveryPresentE2E/1.0 (Playwright) Chrome/142.0.0.0";
const CLIENT_LABEL = "E2E Present Co";
const PROCESS_ID = "31G"; // real, has a flow

const prisma = new PrismaClient();
let engagementId = "";
let token = "";

async function land(page: Page) {
  await page.goto(`/d/${token}`);
  await page.getByRole("checkbox", { name: /named recipient/i }).check();
  await page.getByRole("button", { name: /^Begin$/ }).click();
  await expect(page).toHaveURL(/\/d\/home$/);
}

test.describe("Present mode (PR-3)", () => {
  test.skip(!RUN, "Set DISCOVERY_E2E=1 and boot with NEUTRAL_DISCOVERY_ENABLED=true");
  test.use({ userAgent: UA, viewport: { width: 1920, height: 1080 } });

  test.beforeAll(async () => {
    const e = await prisma.discoveryEngagement.create({
      data: { client: CLIENT_LABEL, state: "issued", issuedAt: new Date() },
    });
    engagementId = e.id;
    token = mintRawToken();
    await prisma.discoveryAccessGrant.create({
      data: {
        engagementId,
        email: "present.reviewer@e2e.test",
        displayName: "Present Reviewer",
        roleLabel: "COO",
        tokenHash: hashToken(token),
        valueStreamIds: [],
        otpVerifiedUaHashes: [hashUserAgent(UA)],
      },
    });
  });

  test.afterAll(async () => {
    if (engagementId) {
      await prisma.discoveryEngagement.delete({ where: { id: engagementId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("the mode switch enters Present and persists across navigation", async ({ page }) => {
    await land(page);
    await page.getByRole("button", { name: /Present mode/ }).click();

    // §8: Present hides nav, breadcrumbs, search.
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0);
    await expect(page.getByRole("searchbox")).toHaveCount(0);

    // Persists per session (§6/22) — a fresh navigation stays in Present.
    await page.goto(`/d/process/${PROCESS_ID}`);
    await expect(page.getByRole("button", { name: /Park for workshop/ })).toBeVisible();
  });

  test("P / E / X switch modes from the keyboard", async ({ page }) => {
    await land(page);
    await page.keyboard.press("p");
    await page.goto(`/d/process/${PROCESS_ID}`);
    await expect(page.getByRole("button", { name: /Park for workshop/ })).toBeVisible();

    // E leaves Present — back to the full Explore IA.
    await page.keyboard.press("e");
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();

    // X goes to the Export pack.
    await page.keyboard.press("x");
    await expect(page).toHaveURL(/\/d\/export$/);
  });

  test("P/E/X are suppressed while typing — a reason box is not a hotkey trap", async ({ page }) => {
    await land(page);
    await page.goto(`/d/process/${PROCESS_ID}`);
    await page.getByRole("radio", { name: /We do this differently/ }).click();
    const box = page.getByRole("textbox", { name: /Why we differ/ });
    await box.fill("we park expensive orders");
    // Still on V3 in Explore: typing "p"/"e"/"x" must not have navigated.
    await expect(page).toHaveURL(new RegExp(`/d/process/${PROCESS_ID}$`));
    await expect(box).toHaveValue("we park expensive orders");
  });

  test("1–4 set the fit state", async ({ page }) => {
    await land(page);
    await page.keyboard.press("p");
    await page.goto(`/d/process/${PROCESS_ID}`);

    await page.keyboard.press("2");
    await expect(page.getByRole("radio", { name: /We do this differently/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.keyboard.press("1");
    await expect(page.getByRole("radio", { name: /Runs as standard/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("arrows walk STEPS; shift+arrows walk PROCESSES (brief §6/23)", async ({ page }) => {
    await land(page);
    await page.keyboard.press("p");
    await page.goto(`/d/process/${PROCESS_ID}`);

    await expect(page.getByText(/Step 1/)).toBeVisible();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByText(/Step 2/)).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByText(/Step 1/)).toBeVisible();

    // The .dc binds ←/→ to processes; the brief binds them to steps and puts
    // processes on Shift. Conflict #33 — brief wins.
    const url = page.url();
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page).not.toHaveURL(url);
  });

  test("Space reveals the sub-steps", async ({ page }) => {
    await land(page);
    await page.keyboard.press("p");
    await page.goto(`/d/process/${PROCESS_ID}`);
    await page.keyboard.press(" ");
    // 31G's first step has sub-steps in the frozen library.
    await expect(page.getByText(/Assign Supplier to Raw Material/)).toBeVisible();
  });

  test("P parks the process (= Discuss), rather than re-entering Present", async ({ page }) => {
    await land(page);
    await page.keyboard.press("p");
    await page.goto(`/d/process/${PROCESS_ID}`);
    await page.keyboard.press("p");
    await expect(page.getByRole("radio", { name: /Discuss in workshop/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("Present has no serious or critical axe violations", async ({ page }) => {
    await land(page);
    await page.keyboard.press("p");
    await page.goto(`/d/process/${PROCESS_ID}`);
    await page.waitForLoadState("load");
    const r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      r.violations
        .filter((v) => v.impact === "critical" || v.impact === "serious")
        .map((v) => `[${v.impact}] ${v.id}`),
    ).toEqual([]);
  });
});

test.describe("Export pack (PR-3)", () => {
  test.skip(!RUN, "Set DISCOVERY_E2E=1 and boot with NEUTRAL_DISCOVERY_ENABLED=true");
  test.use({ userAgent: UA });

  test("renders the pack with no interactive affordances (§8)", async ({ page }) => {
    await land(page);
    await page.goto("/d/export");

    await expect(page.getByRole("heading", { name: CLIENT_LABEL, level: 1 })).toBeVisible();
    // §8: "strip all chrome and interaction".
    await expect(page.getByRole("button")).toHaveCount(0);
    await expect(page.getByRole("link")).toHaveCount(0);
    await expect(page.getByRole("searchbox")).toHaveCount(0);
  });

  test("an in-progress engagement is stamped Draft", async ({ page }) => {
    await land(page);
    await page.goto("/d/export");
    // Printing a half-finished review without saying so is the dishonesty
    // invariant 4 exists to prevent.
    await expect(page.getByText(/Draft — decisions incomplete/)).toBeVisible();
  });

  test("every decision carries a text label, never colour alone (§11)", async ({ page }) => {
    await land(page);
    await page.goto(`/d/process/${PROCESS_ID}`);
    await page.getByRole("radio", { name: /Runs as standard/ }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    await page.goto("/d/export");
    // The register row names the decision in words.
    await expect(page.getByText("Runs as standard").first()).toBeVisible();
    // And the legend explains the patterns.
    await expect(page.getByText(/never colour alone/)).toBeVisible();
  });

  test("the pack carries the neutral provenance and the confidentiality line", async ({ page }) => {
    await land(page);
    await page.goto("/d/export");
    await expect(page.getByText(/rendered product-neutral/)).toBeVisible();
    await expect(page.getByText(/the reference names no vendor/)).toBeVisible();
    await expect(
      page.getByText(/product-agnostic process discovery · Confidential/).first(),
    ).toBeVisible();
  });

  test("the pack is real selectable text, not a raster (§11)", async ({ page }) => {
    await land(page);
    await page.goto("/d/export");
    const text = await page.locator(".dx-root").innerText();
    expect(text.length).toBeGreaterThan(200);
    expect(text).toContain(CLIENT_LABEL);
    await expect(page.locator(".dx-root img")).toHaveCount(0);
  });

  test("Export has no serious or critical axe violations", async ({ page }) => {
    await land(page);
    await page.goto("/d/export");
    await page.waitForLoadState("load");
    const r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    expect(
      r.violations
        .filter((v) => v.impact === "critical" || v.impact === "serious")
        .map((v) => `[${v.impact}] ${v.id}: ${v.description}`),
    ).toEqual([]);
  });

  test("print snapshot: the pack lays out as A4 pages", async ({ page }) => {
    await land(page);
    await page.goto("/d/export");
    await page.emulateMedia({ media: "print" });
    await page.waitForLoadState("load");
    // Each .dx-page is a page in the pack; the cover always exists.
    expect(await page.locator(".dx-page").count()).toBeGreaterThanOrEqual(4);
    await expect(page).toHaveScreenshot("discovery-export-print.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.02,
    });
  });
});
