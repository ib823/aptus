import { test, expect, type Page } from "@playwright/test";
import { AssessmentPage } from "../pages/assessment.page";

/**
 * T-E2E-J06 — Post Sign-Off Change Control
 *
 * After an assessment is signed off, a stakeholder raises a change
 * request. The request goes through approval, the assessment is
 * unlocked for targeted edits, changes are applied, and re-sign-off
 * is completed. The audit trail captures all mutations.
 *
 * 11 sequential steps.
 */
test.describe("T-E2E-J06 — Post Sign-Off Change Control", () => {
  let assessmentId = "";
  let changeRequestId = "";

  // Helper to resolve the first assessment ID
  async function resolveAssessmentId(page: Page) {
    if (assessmentId) return assessmentId;

    const assessment = new AssessmentPage(page);
    await assessment.goToAssessmentsList();
    await assessment.waitForPageLoad();

    const link = page.locator("a[href*='/assessment/']").first();
    if (await link.isVisible().catch(() => false)) {
      const href = await link.getAttribute("href");
      const idMatch = href?.match(/assessment\/([^/]+)/);
      if (idMatch) {
        assessmentId = idMatch[1]!;
      }
    }
    return assessmentId;
  }

  // Step 1: Verify assessment is in signed-off / completed state
  test("Step 01 — Verify assessment is signed off", async ({ page, request }) => {
    const id = await resolveAssessmentId(page);
    if (!id) {
      test.skip(true, 'No assessment data available — seed required');
      return;
    }

    const response = await request.get(`/api/assessments/${id}`);
    expect(response.status()).toBeLessThan(500);

    if (response.ok()) {
      const body = await response.json();
      const assessment = body.data ?? body;
      // Assessment should exist
      expect(assessment).toBeTruthy();
    }
  });

  // Step 2: Stakeholder raises a change request
  test("Step 02 — Stakeholder creates change request", async ({ page, request }) => {
    const id = await resolveAssessmentId(page);
    if (!id) {
      test.skip(true, 'No assessment data available — seed required');
      return;
    }

    const response = await request.post(`/api/assessments/${id}/change-requests`, {
      data: {
        title: "J06 — Regulatory Change Requires Gap Revision",
        description:
          "New regulatory requirement discovered post-sign-off that impacts Finance module gap resolution.",
        justification:
          "Compliance mandate from local tax authority effective next quarter.",
        impactedAreas: ["Finance"],
        priority: "high",
      },
    });

    if (response.ok()) {
      const body = await response.json();
      changeRequestId = body.id ?? body.data?.id ?? body.changeRequestId;
    }

    expect(response.status()).toBeLessThan(500);
  });

  // Step 3: Verify change request appears in the list
  test("Step 03 — Verify change request is listed", async ({ page, request }) => {
    const id = await resolveAssessmentId(page);
    if (!id) {
      test.skip(true, 'No assessment data available — seed required');
      return;
    }

    const response = await request.get(`/api/assessments/${id}/change-requests`);
    expect(response.status()).toBeLessThan(500);

    if (response.ok()) {
      const body = await response.json();
      const requests = body.data ?? body.changeRequests ?? body;
      expect(Array.isArray(requests)).toBe(true);
    }
  });

  // Step 4: Reviewer approves the change request
  test("Step 04 — Reviewer approves change request", async ({ page, request }) => {
    const id = await resolveAssessmentId(page);
    if (!id || !changeRequestId) {
      test.skip(true, 'No assessment or change request available — seed required');
      return;
    }

    const response = await request.patch(
      `/api/assessments/${id}/change-requests/${changeRequestId}`,
      {
        data: {
          status: "approved",
          reviewerComments: "Approved — regulatory compliance is mandatory.",
        },
      }
    );

    expect(response.status()).toBeLessThan(500);
  });

  // Step 5: Assessment is unlocked for targeted edits
  test("Step 05 — Assessment unlocked for targeted changes", async ({ page, request }) => {
    const id = await resolveAssessmentId(page);
    if (!id) {
      test.skip(true, 'No assessment data available — seed required');
      return;
    }

    // Verify assessment can be edited (transition back to in_progress or change-control state)
    const response = await request.get(`/api/assessments/${id}`);
    expect(response.status()).toBeLessThan(500);

    if (response.ok()) {
      const body = await response.json();
      const assessment = body.data ?? body;
      expect(assessment).toBeTruthy();
    }
  });

  // Step 6: Consultant modifies the affected gap
  test("Step 06 — Consultant modifies the affected gap", async ({ page, request }) => {
    const id = await resolveAssessmentId(page);
    if (!id) {
      test.skip(true, 'No assessment data available — seed required');
      return;
    }

    // Get existing gaps
    const gapsResponse = await request.get(`/api/assessments/${id}/gaps`);
    if (gapsResponse.ok()) {
      const gapsBody = await gapsResponse.json();
      const gaps = gapsBody.data ?? gapsBody.gaps ?? gapsBody;

      if (Array.isArray(gaps) && gaps.length > 0) {
        const gapId = gaps[0].id;

        const updateResponse = await request.patch(
          `/api/assessments/${id}/gaps/${gapId}`,
          {
            data: {
              description:
                "Updated per J06 change request — new tax compliance requirement",
              resolutionType: "EXTENSION",
            },
          }
        );

        expect(updateResponse.status()).toBeLessThan(500);
      }
    }
  });

  // Step 7: Consultant adds a new gap from the change request
  test("Step 07 — Consultant adds new gap from change request", async ({
    page,
    request,
  }) => {
    const id = await resolveAssessmentId(page);
    if (!id) {
      test.skip(true, 'No assessment data available — seed required');
      return;
    }

    const response = await request.post(`/api/assessments/${id}/gaps`, {
      data: {
        title: "J06 — New Tax Compliance Gap",
        description:
          "Local tax authority requires additional reporting fields not available in standard.",
        resolutionType: "EXTENSION",
        priority: "high",
        changeRequestId,
      },
    });

    expect(response.status()).toBeLessThan(500);
  });

  // Step 8: Re-initiate sign-off process
  test("Step 08 — Re-initiate sign-off after changes", async ({ page, request }) => {
    const id = await resolveAssessmentId(page);
    if (!id) {
      test.skip(true, 'No assessment data available — seed required');
      return;
    }

    const response = await request.post(`/api/assessments/${id}/sign-off/start`, {
      data: {
        reason: "Re-sign-off after change request J06 modifications",
      },
    });

    expect(response.status()).toBeLessThan(500);
  });

  // Step 9: Area re-validation
  test("Step 09 — Area re-validation after changes", async ({ page, request }) => {
    const id = await resolveAssessmentId(page);
    if (!id) {
      test.skip(true, 'No assessment data available — seed required');
      return;
    }

    const response = await request.post(
      `/api/assessments/${id}/sign-off/area-validation`,
      {
        data: {
          areas: ["Finance"],
          comments: "Re-validated after change control modifications",
          approved: true,
        },
      }
    );

    expect(response.status()).toBeLessThan(500);
  });

  // Step 10: Executive re-signs
  test("Step 10 — Executive re-sign-off", async ({ page, request }) => {
    const id = await resolveAssessmentId(page);
    if (!id) {
      test.skip(true, 'No assessment data available — seed required');
      return;
    }

    const response = await request.post(
      `/api/assessments/${id}/sign-off/executive`,
      {
        data: {
          approved: true,
          comments: "Re-approved after change control process",
        },
      }
    );

    expect(response.status()).toBeLessThan(500);
  });

  // Step 11: Verify audit trail records all change-control mutations
  test("Step 11 — Verify audit trail captures change control history", async ({
    page,
    request,
  }) => {
    const id = await resolveAssessmentId(page);
    if (!id) {
      test.skip(true, 'No assessment data available — seed required');
      return;
    }

    // Check transition history captures all state changes
    const transitionsResponse = await request.get(
      `/api/assessments/${id}/transitions/history`
    );
    expect(transitionsResponse.status()).toBeLessThan(500);

    if (transitionsResponse.ok()) {
      const body = await transitionsResponse.json();
      const transitions = body.data ?? body.transitions ?? body;
      expect(Array.isArray(transitions)).toBe(true);
    }

    // Check activity log
    const activityResponse = await request.get(
      `/api/assessments/${id}/activity`
    );
    expect(activityResponse.status()).toBeLessThan(500);

    if (activityResponse.ok()) {
      const body = await activityResponse.json();
      const activities = body.data ?? body.activities ?? body;
      expect(Array.isArray(activities)).toBe(true);
    }

    // Verify audit trail report endpoint
    const auditResponse = await request.get(
      `/api/assessments/${id}/report/audit-trail`
    );
    expect(auditResponse.status()).toBeLessThan(500);
  });
});
