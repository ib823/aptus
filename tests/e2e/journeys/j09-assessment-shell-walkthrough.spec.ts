import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * J09 — Assessment shell walkthrough (post-cleanup verification)
 *
 * After the App-5b cleanup (PRs #20–#22) retired the dual-nav structure
 * and folded the legacy AssessmentTabNav into per-step sub-tab strips,
 * this journey asserts every step + sub-tab is reachable from the new
 * shell — and specifically that the Bursa Malaysia /requirements page
 * (981 rows) is now nav-surfaced under the Scope step.
 *
 * The test discovers the Bursa assessment by company name. If no Bursa
 * row exists in the DB the suite skips with a clear message rather than
 * failing — the suite is for verifying nav, not seeding data.
 */

const prisma = new PrismaClient();

let assessmentId = "";
let companyName = "";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  const a = await prisma.assessment.findFirst({
    where: { companyName: "Bursa Malaysia Berhad", deletedAt: null },
    select: { id: true, companyName: true },
  });
  if (!a) {
    test.skip(true, "No Bursa Malaysia assessment in DB — re-run the importer");
    return;
  }
  assessmentId = a.id;
  companyName = a.companyName;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe("J09 — Assessment shell walkthrough", () => {
  test("Step 01 — Bursa appears in the assessments list", async ({ page }) => {
    await page.goto("/assessments");
    await expect(page.getByText(companyName).first()).toBeVisible();
  });

  test("Step 02 — Direct nav to bare /assessment/[id] redirects into a step route", async ({ page }) => {
    await page.goto(`/assessment/${assessmentId}`);
    // Index page server-redirects by status. Wait for the post-redirect URL
    // explicitly — toHaveURL alone occasionally races the navigation.
    await page.waitForURL(
      new RegExp(`/assessment/${assessmentId}/(scope|profile|report)$`),
      { timeout: 15_000 },
    );
  });

  test("Step 03 — All five steps are visible in the rail", async ({ page }) => {
    await page.goto(`/assessment/${assessmentId}/scope`);
    await page.waitForLoadState("networkidle");
    // Completed steps render a Check icon instead of the digit, so the
    // accessible name may or may not include a number prefix — match the
    // label text only.
    for (const label of ["Profile", "Scope", "Analyze", "Adjust", "Export"]) {
      await expect(
        page.getByRole("button", { name: new RegExp(`\\b${label}\\b`) }).first(),
      ).toBeVisible();
    }
  });

  test("Step 04 — Scope step exposes Requirements / Granularity / Workshops sub-tabs", async ({ page }) => {
    await page.goto(`/assessment/${assessmentId}/scope`);
    // Scope sub-tabs
    for (const label of ["Scope", "Requirements", "Granularity", "Workshops"]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    }
  });

  test("Step 05 — Clicking Requirements sub-tab loads the imported Bursa data", async ({ page }) => {
    await page.goto(`/assessment/${assessmentId}/scope`);
    await page.getByRole("link", { name: "Requirements", exact: true }).click();
    await expect(page).toHaveURL(`/assessment/${assessmentId}/requirements`);
    await expect(page.getByRole("heading", { name: "Client Requirements" })).toBeVisible();
    // The summary line reads e.g. "Bursa Malaysia Berhad · 981 requirements across 23 modules."
    const summary = page.getByText(/\d+ requirements across \d+ modules/);
    await expect(summary).toBeVisible();
    const txt = (await summary.textContent()) ?? "";
    const match = txt.match(/(\d+)\s+requirements/);
    const count = match ? parseInt(match[1]!, 10) : 0;
    expect(count).toBeGreaterThanOrEqual(900);
  });

  test("Step 06 — Analyze step swaps in Process Map / Flows / Review / Conversation", async ({ page }) => {
    await page.goto(`/assessment/${assessmentId}/process-map`);
    for (const label of ["Process Map", "Flows", "Review", "Conversation"]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    }
  });

  test("Step 07 — Adjust step swaps in 6 sub-tabs including Remaining", async ({ page }) => {
    await page.goto(`/assessment/${assessmentId}/gaps`);
    for (const label of ["Gaps", "Config", "Integrations", "Data Migration", "OCM", "Remaining"]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    }
  });

  test("Step 08 — Export step shows Report / Sign-off / Snapshots", async ({ page }) => {
    await page.goto(`/assessment/${assessmentId}/report`);
    for (const label of ["Report", "Sign-off", "Snapshots"]) {
      await expect(
        page.getByRole("link", { name: label, exact: true }),
      ).toBeVisible();
    }
  });

  test("Step 09 — Activity link in topbar navigates to /activity", async ({ page }) => {
    await page.goto(`/assessment/${assessmentId}/scope`);
    const activityLink = page.getByRole("link", { name: "View activity feed" });
    await expect(activityLink).toBeVisible();
    await activityLink.click();
    await expect(page).toHaveURL(`/assessment/${assessmentId}/activity`);
    await expect(page.getByRole("heading", { name: "Activity Feed" })).toBeVisible();
  });

  test("Step 10 — Step rail step click navigates to that step's primary route", async ({ page }) => {
    await page.goto(`/assessment/${assessmentId}/scope`);
    await page.waitForLoadState("networkidle");
    // The breadcrumb step rail locks any step > current + 1. From /scope
    // (step 2), only Analyze (step 3) is the next-reachable step. Clicking
    // it should land on the Analyze step's primary route.
    await page.getByRole("button", { name: /\bAnalyze\b/ }).first().click();
    await expect(page).toHaveURL(`/assessment/${assessmentId}/process-map`);
  });
});
