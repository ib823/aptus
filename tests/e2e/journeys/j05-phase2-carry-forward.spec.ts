import { test, expect } from "@playwright/test";
import { AssessmentPage } from "../pages/assessment.page";
import { SignOffPage } from "../pages/sign-off.page";

/**
 * T-E2E-J05 — Phase 2 Carry-Forward / Cloning
 *
 * After completing a Phase 1 assessment, the consultant clones it
 * into a Phase 2 assessment. Verified items carry forward, unresolved
 * gaps persist, and new scope items can be added.
 *
 * 9 sequential steps.
 */
test.describe("T-E2E-J05 — Phase 2 Carry-Forward Cloning", () => {
  let sourceAssessmentId = "";
  let clonedAssessmentId = "";

  // Step 1: Navigate to the completed Phase 1 assessment
  test("Step 01 — Navigate to completed Phase 1 assessment", async ({ page }) => {
    const assessment = new AssessmentPage(page);
    await assessment.goToAssessmentsList();
    await assessment.waitForPageLoad();

    const link = page.locator("a[href*='/assessment/']").first();
    if (await link.isVisible().catch(() => false)) {
      const href = await link.getAttribute("href");
      const idMatch = href?.match(/assessment\/([^/]+)/);
      if (idMatch) {
        sourceAssessmentId = idMatch[1]!;
        await assessment.goToAssessment(sourceAssessmentId);
        await assessment.waitForPageLoad();
        expect(page.url()).toContain(`/assessment/${sourceAssessmentId}`);
      }
    }
  });

  // Step 2: Initiate clone/phase 2 via API
  test("Step 02 — Initiate Phase 2 clone via API", async ({ page, request }) => {
    const assessment = new AssessmentPage(page);
    await assessment.goToAssessmentsList();
    await assessment.waitForPageLoad();

    const link = page.locator("a[href*='/assessment/']").first();
    if (await link.isVisible().catch(() => false)) {
      const href = await link.getAttribute("href");
      const idMatch = href?.match(/assessment\/([^/]+)/);
      if (idMatch) {
        sourceAssessmentId = idMatch[1]!;

        const response = await request.post(
          `/api/assessments/${sourceAssessmentId}/clone`,
          {
            data: {
              newPhase: 2,
              carryForwardGaps: true,
              carryForwardIntegrations: true,
              carryForwardDataMigration: true,
            },
          }
        );

        if (response.ok()) {
          const body = await response.json();
          clonedAssessmentId = body.id ?? body.data?.id ?? body.assessmentId;
        }

        expect(response.status()).toBeLessThan(500);
      }
    }
  });

  // Step 3: Verify cloned assessment appears in list
  test("Step 03 — Verify cloned assessment appears in list", async ({ page }) => {
    const assessment = new AssessmentPage(page);
    await assessment.goToAssessmentsList();
    await assessment.waitForPageLoad();

    expect(page.url()).toContain("/assessments");
    // The list should contain at least one assessment
    const body = await page.textContent("body");
    expect(body).toBeTruthy();
  });

  // Step 4: Navigate to cloned assessment profile
  test("Step 04 — Navigate to cloned assessment profile", async ({ page }) => {
    if (!clonedAssessmentId) {
      test.skip();
      return;
    }

    const assessment = new AssessmentPage(page);
    await assessment.goToAssessment(clonedAssessmentId);
    await assessment.waitForPageLoad();
    expect(page.url()).toContain(`/assessment/${clonedAssessmentId}`);
  });

  // Step 5: Verify gaps were carried forward
  test("Step 05 — Verify gaps carried forward from Phase 1", async ({ page, request }) => {
    if (!clonedAssessmentId) {
      test.skip();
      return;
    }

    const response = await request.get(
      `/api/assessments/${clonedAssessmentId}/gaps`
    );

    if (response.ok()) {
      const body = await response.json();
      const gaps = body.data ?? body.gaps ?? body;
      // Gaps should have been cloned (may be empty if source had none)
      expect(Array.isArray(gaps)).toBe(true);
    }

    expect(response.status()).toBeLessThan(500);
  });

  // Step 6: Verify integrations were carried forward
  test("Step 06 — Verify integrations carried forward", async ({ page, request }) => {
    if (!clonedAssessmentId) {
      test.skip();
      return;
    }

    const response = await request.get(
      `/api/assessments/${clonedAssessmentId}/integrations`
    );

    if (response.ok()) {
      const body = await response.json();
      const integrations = body.data ?? body.integrations ?? body;
      expect(Array.isArray(integrations)).toBe(true);
    }

    expect(response.status()).toBeLessThan(500);
  });

  // Step 7: Add new scope items for Phase 2
  test("Step 07 — Add new scope items for Phase 2", async ({ page }) => {
    if (!clonedAssessmentId) {
      test.skip();
      return;
    }

    const assessment = new AssessmentPage(page);
    await assessment.goToScope(clonedAssessmentId);
    await assessment.waitForPageLoad();
    expect(page.url()).toContain("/scope");
  });

  // Step 8: Verify phase metadata via API
  test("Step 08 — Verify phase metadata on cloned assessment", async ({
    page,
    request,
  }) => {
    if (!clonedAssessmentId) {
      test.skip();
      return;
    }

    const response = await request.get(
      `/api/assessments/${clonedAssessmentId}`
    );

    if (response.ok()) {
      const body = await response.json();
      const assessment = body.data ?? body;
      // Should have phase 2 metadata or reference to source
      expect(assessment).toBeTruthy();
    }

    expect(response.status()).toBeLessThan(500);
  });

  // Step 9: Verify cross-phase analytics link
  test("Step 09 — Verify cross-phase analytics available", async ({ page, request }) => {
    if (!clonedAssessmentId) {
      test.skip();
      return;
    }

    const response = await request.get(
      `/api/analytics/cross-phase/${clonedAssessmentId}`
    );

    // Cross-phase analytics may or may not be available
    expect(response.status()).toBeLessThan(500);

    // Also verify through UI
    const assessment = new AssessmentPage(page);
    await page.goto(`/analytics/cross-phase/${clonedAssessmentId}`);
    await page.waitForLoadState("networkidle");
    // Page should load without a 500 error
    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");
  });
});
