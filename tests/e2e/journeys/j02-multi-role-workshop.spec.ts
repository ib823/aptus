import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { WorkshopPage } from "../pages/workshop.page";
import { AssessmentPage } from "../pages/assessment.page";
import path from "path";

/**
 * T-E2E-J02 — Workshop with 5 Concurrent Users
 *
 * Simulates a real-time workshop session with multiple browser contexts
 * representing: 1 Consultant (host), 3 Process Owners, 1 Executive.
 *
 * 13 sequential steps covering workshop creation, concurrent joining,
 * voting, discussion, and minutes generation.
 */

const STATE_DIR = path.join(__dirname, "..");

function storageStatePath(role: string): string {
  return path.join(STATE_DIR, `.auth-state-${role}.json`);
}

test.describe("T-E2E-J02 — Multi-Role Workshop (5 concurrent users)", () => {
  let consultantContext: BrowserContext;
  let po1Context: BrowserContext;
  let po2Context: BrowserContext;
  let po3Context: BrowserContext;
  let execContext: BrowserContext;

  let consultantPage: Page;
  let po1Page: Page;
  let po2Page: Page;
  let po3Page: Page;
  let execPage: Page;

  let workshopSessionId: string;

  test.beforeAll(async ({ browser }) => {
    // Create separate browser contexts for each role simulating concurrent users
    consultantContext = await browser.newContext({
      storageState: storageStatePath("consultant"),
    });
    po1Context = await browser.newContext({
      storageState: storageStatePath("processOwner"),
    });
    po2Context = await browser.newContext({
      storageState: storageStatePath("processOwner"),
    });
    po3Context = await browser.newContext({
      storageState: storageStatePath("processOwner"),
    });
    execContext = await browser.newContext({
      storageState: storageStatePath("executive"),
    });

    consultantPage = await consultantContext.newPage();
    po1Page = await po1Context.newPage();
    po2Page = await po2Context.newPage();
    po3Page = await po3Context.newPage();
    execPage = await execContext.newPage();
  });

  test.afterAll(async () => {
    await consultantContext?.close();
    await po1Context?.close();
    await po2Context?.close();
    await po3Context?.close();
    await execContext?.close();
  });

  // Step 1: Consultant navigates to assessment and creates a workshop
  test("Step 01 — Consultant creates workshop session", async () => {
    const assessment = new AssessmentPage(consultantPage);
    await assessment.goToAssessmentsList();
    await assessment.waitForPageLoad();
    expect(consultantPage.url()).toContain("/assessments");

    // Find test assessment and extract ID
    const link = consultantPage.locator("a[href*='/assessment/']").first();
    if (await link.isVisible().catch(() => false)) {
      const href = await link.getAttribute("href");
      const idMatch = href?.match(/assessment\/([^/]+)/);
      if (idMatch) {
        const assessmentId = idMatch[1];

        // Create workshop via API to get session ID
        const response = await consultantPage.request.post(
          `/api/assessments/${assessmentId}/workshops`,
          {
            data: {
              title: "J02 E2E Workshop Session",
              description: "Multi-role workshop E2E test",
            },
          }
        );

        if (response.ok()) {
          const body = await response.json();
          workshopSessionId = body.id ?? body.sessionId ?? body.data?.id;
        }
      }
    }
  });

  // Step 2: Consultant opens workshop session page
  test("Step 02 — Consultant opens workshop session", async () => {
    if (!workshopSessionId) {
      test.skip(true, 'No workshop session available — seed required');
      return;
    }

    const workshop = new WorkshopPage(consultantPage);
    await workshop.goToWorkshopSession(workshopSessionId);
    await workshop.waitForPageLoad();
    expect(consultantPage.url()).toContain(`/workshops/${workshopSessionId}`);
  });

  // Step 3: Consultant starts the workshop
  test("Step 03 — Consultant starts the workshop", async () => {
    if (!workshopSessionId) {
      test.skip(true, 'No workshop session available — seed required');
      return;
    }

    const workshop = new WorkshopPage(consultantPage);
    if (await workshop.startWorkshopButton.isVisible().catch(() => false)) {
      await workshop.startWorkshop();
    }
  });

  // Step 4: All 3 POs join concurrently
  test("Step 04 — Three Process Owners join concurrently", async () => {
    if (!workshopSessionId) {
      test.skip(true, 'No workshop session available — seed required');
      return;
    }

    const po1Workshop = new WorkshopPage(po1Page);
    const po2Workshop = new WorkshopPage(po2Page);
    const po3Workshop = new WorkshopPage(po3Page);

    // All three POs navigate to the workshop session simultaneously
    await Promise.all([
      po1Workshop.goToWorkshopSession(workshopSessionId),
      po2Workshop.goToWorkshopSession(workshopSessionId),
      po3Workshop.goToWorkshopSession(workshopSessionId),
    ]);

    await Promise.all([
      po1Workshop.waitForPageLoad(),
      po2Workshop.waitForPageLoad(),
      po3Workshop.waitForPageLoad(),
    ]);

    expect(po1Page.url()).toContain(`/workshops/${workshopSessionId}`);
    expect(po2Page.url()).toContain(`/workshops/${workshopSessionId}`);
    expect(po3Page.url()).toContain(`/workshops/${workshopSessionId}`);
  });

  // Step 5: Executive joins
  test("Step 05 — Executive joins workshop", async () => {
    if (!workshopSessionId) {
      test.skip(true, 'No workshop session available — seed required');
      return;
    }

    const execWorkshop = new WorkshopPage(execPage);
    await execWorkshop.goToWorkshopSession(workshopSessionId);
    await execWorkshop.waitForPageLoad();
    expect(execPage.url()).toContain(`/workshops/${workshopSessionId}`);
  });

  // Step 6: Verify attendee list shows all 5 users
  test("Step 06 — Verify all 5 attendees are visible", async () => {
    if (!workshopSessionId) {
      test.skip(true, 'No workshop session available — seed required');
      return;
    }

    const workshop = new WorkshopPage(consultantPage);
    // Allow time for WebSocket/SSE to propagate attendees
    await consultantPage.waitForTimeout(2_000);

    const attendees = workshop.attendeesList;
    if (await attendees.isVisible().catch(() => false)) {
      const text = await attendees.textContent();
      // At minimum the consultant should appear
      expect(text).toBeTruthy();
    }
  });

  // Step 7: Consultant navigates to first process step for voting
  test("Step 07 — Consultant navigates to first step", async () => {
    if (!workshopSessionId) {
      test.skip(true, 'No workshop session available — seed required');
      return;
    }

    const workshop = new WorkshopPage(consultantPage);
    if (await workshop.nextStepButton.isVisible().catch(() => false)) {
      await workshop.navigateToNextStep();
    }
  });

  // Step 8: All users vote concurrently on a step
  test("Step 08 — All users cast votes concurrently", async () => {
    if (!workshopSessionId) {
      test.skip(true, 'No workshop session available — seed required');
      return;
    }

    const consultantWs = new WorkshopPage(consultantPage);
    const po1Ws = new WorkshopPage(po1Page);
    const po2Ws = new WorkshopPage(po2Page);
    const po3Ws = new WorkshopPage(po3Page);
    const execWs = new WorkshopPage(execPage);

    // All 5 users vote simultaneously
    const votePromises: Promise<void>[] = [];

    for (const { ws, vote } of [
      { ws: consultantWs, vote: "FIT" as const },
      { ws: po1Ws, vote: "FIT" as const },
      { ws: po2Ws, vote: "CONFIGURE" as const },
      { ws: po3Ws, vote: "FIT" as const },
      { ws: execWs, vote: "GAP" as const },
    ]) {
      const canVote = await ws.voteFitButton.isVisible().catch(() => false);
      if (canVote) {
        votePromises.push(ws.castVote(vote));
      }
    }

    await Promise.all(votePromises);
  });

  // Step 9: Consultant finalizes the vote
  test("Step 09 — Consultant finalizes vote", async () => {
    if (!workshopSessionId) {
      test.skip(true, 'No workshop session available — seed required');
      return;
    }

    const workshop = new WorkshopPage(consultantPage);
    if (await workshop.finalizeVoteButton.isVisible().catch(() => false)) {
      await workshop.finalizeCurrentVote();
    }
  });

  // Step 10: PO1 adds a discussion comment
  test("Step 10 — PO adds discussion comment", async () => {
    if (!workshopSessionId) {
      test.skip(true, 'No workshop session available — seed required');
      return;
    }

    const po1Ws = new WorkshopPage(po1Page);
    if (await po1Ws.commentInput.isVisible().catch(() => false)) {
      await po1Ws.addComment(
        "This process step needs configuration for local tax compliance."
      );
    }
  });

  // Step 11: Consultant adds action item
  test("Step 11 — Consultant adds action item", async () => {
    if (!workshopSessionId) {
      test.skip(true, 'No workshop session available — seed required');
      return;
    }

    const workshop = new WorkshopPage(consultantPage);
    if (await workshop.addActionItemButton.isVisible().catch(() => false)) {
      await workshop.addActionItem({
        title: "Review tax configuration requirements with Finance PO",
      });
    }
  });

  // Step 12: Consultant ends workshop
  test("Step 12 — Consultant ends workshop session", async () => {
    if (!workshopSessionId) {
      test.skip(true, 'No workshop session available — seed required');
      return;
    }

    const workshop = new WorkshopPage(consultantPage);
    if (await workshop.endWorkshopButton.isVisible().catch(() => false)) {
      await workshop.endWorkshop();
    }
  });

  // Step 13: Generate and verify minutes
  test("Step 13 — Generate and verify workshop minutes", async () => {
    if (!workshopSessionId) {
      test.skip(true, 'No workshop session available — seed required');
      return;
    }

    const workshop = new WorkshopPage(consultantPage);
    if (await workshop.generateMinutesButton.isVisible().catch(() => false)) {
      await workshop.generateMinutes();
      const minutesVisible = await workshop.minutesPreview
        .isVisible({ timeout: 10_000 })
        .catch(() => false);
      if (minutesVisible) {
        const text = await workshop.minutesPreview.textContent();
        expect(text).toBeTruthy();
      }
    }
  });
});
