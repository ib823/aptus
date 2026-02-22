import { Page, Locator } from "@playwright/test";
import { BasePage } from "./base.page";

export class WorkshopPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ── Navigation ──────────────────────────────────────────────
  async goToWorkshopJoin() {
    await this.navigateTo("/workshops/join");
  }

  async goToWorkshopSession(sessionId: string) {
    await this.navigateTo(`/workshops/${sessionId}`);
  }

  // ── Workshop Creation Locators ──────────────────────────────
  get createWorkshopButton(): Locator {
    return this.page.getByRole("button", { name: /create.*workshop|new.*workshop|schedule/i });
  }

  get workshopTitleInput(): Locator {
    return this.page.locator(
      "[data-testid='workshop-title'], input[name='title'], input[name='workshopTitle']"
    );
  }

  get workshopDescriptionInput(): Locator {
    return this.page.locator(
      "[data-testid='workshop-description'], textarea[name='description']"
    );
  }

  get workshopDateInput(): Locator {
    return this.page.locator(
      "[data-testid='workshop-date'], input[name='date'], input[type='datetime-local']"
    );
  }

  get workshopAssessmentSelect(): Locator {
    return this.page.locator(
      "[data-testid='workshop-assessment'], select[name='assessmentId'], [name='assessmentId']"
    );
  }

  get saveWorkshopButton(): Locator {
    return this.page.getByRole("button", { name: /save|create|schedule/i });
  }

  // ── Workshop Join Locators ──────────────────────────────────
  get sessionCodeInput(): Locator {
    return this.page.locator(
      "[data-testid='session-code'], input[name='sessionCode'], input[name='code']"
    );
  }

  get joinButton(): Locator {
    return this.page.getByRole("button", { name: /join|enter/i });
  }

  // ── Workshop Session Locators ───────────────────────────────
  get workshopContainer(): Locator {
    return this.page.locator(
      "[data-testid='workshop'], [data-testid='workshop-session']"
    );
  }

  get attendeesList(): Locator {
    return this.page.locator(
      "[data-testid='attendees'], [data-testid='attendees-list']"
    );
  }

  get attendeeCount(): Locator {
    return this.page.locator(
      "[data-testid='attendee-count'], [data-testid='participants-count']"
    );
  }

  get currentStepDisplay(): Locator {
    return this.page.locator(
      "[data-testid='current-step'], [data-testid='workshop-step']"
    );
  }

  get stepNavigator(): Locator {
    return this.page.locator(
      "[data-testid='step-navigator'], [data-testid='workshop-nav']"
    );
  }

  get nextStepButton(): Locator {
    return this.page.getByRole("button", { name: /next/i });
  }

  get previousStepButton(): Locator {
    return this.page.getByRole("button", { name: /previous|back/i });
  }

  // ── Voting Locators ─────────────────────────────────────────
  get votingPanel(): Locator {
    return this.page.locator(
      "[data-testid='voting-panel'], [data-testid='vote-section']"
    );
  }

  get voteFitButton(): Locator {
    return this.page.locator(
      "[data-testid='vote-fit'], button:has-text('FIT')"
    );
  }

  get voteConfigureButton(): Locator {
    return this.page.locator(
      "[data-testid='vote-configure'], button:has-text('CONFIGURE')"
    );
  }

  get voteGapButton(): Locator {
    return this.page.locator(
      "[data-testid='vote-gap'], button:has-text('GAP')"
    );
  }

  get voteResults(): Locator {
    return this.page.locator(
      "[data-testid='vote-results'], [data-testid='tally']"
    );
  }

  get finalizeVoteButton(): Locator {
    return this.page.getByRole("button", { name: /finalize|confirm.*vote|lock.*vote/i });
  }

  // ── Discussion / Comments Locators ──────────────────────────
  get discussionPanel(): Locator {
    return this.page.locator(
      "[data-testid='discussion'], [data-testid='comments-panel']"
    );
  }

  get commentInput(): Locator {
    return this.page.locator(
      "[data-testid='comment-input'], textarea[name='comment'], input[name='comment']"
    );
  }

  get submitCommentButton(): Locator {
    return this.page.getByRole("button", { name: /send|post|comment/i });
  }

  get commentsList(): Locator {
    return this.page.locator(
      "[data-testid='comments-list'], [data-testid='discussion-messages']"
    );
  }

  // ── Action Items Locators ───────────────────────────────────
  get actionItemsPanel(): Locator {
    return this.page.locator(
      "[data-testid='action-items'], [data-testid='action-items-list']"
    );
  }

  get addActionItemButton(): Locator {
    return this.page.getByRole("button", { name: /add.*action|new.*action/i });
  }

  get actionItemTitleInput(): Locator {
    return this.page.locator(
      "[data-testid='action-title'], input[name='actionTitle'], input[name='title']"
    );
  }

  get actionItemAssigneeSelect(): Locator {
    return this.page.locator(
      "[data-testid='action-assignee'], select[name='assignee'], [name='assignee']"
    );
  }

  get saveActionItemButton(): Locator {
    return this.page.getByRole("button", { name: /save|add|create/i });
  }

  // ── Workshop Controls ───────────────────────────────────────
  get startWorkshopButton(): Locator {
    return this.page.getByRole("button", { name: /start.*workshop|begin/i });
  }

  get endWorkshopButton(): Locator {
    return this.page.getByRole("button", { name: /end.*workshop|close.*workshop/i });
  }

  get generateMinutesButton(): Locator {
    return this.page.getByRole("button", { name: /generate.*minutes|create.*minutes/i });
  }

  get minutesPreview(): Locator {
    return this.page.locator(
      "[data-testid='minutes-preview'], [data-testid='minutes']"
    );
  }

  get downloadMinutesButton(): Locator {
    return this.page.getByRole("button", { name: /download.*minutes|export.*minutes/i });
  }

  // ── Actions ─────────────────────────────────────────────────
  async createWorkshop(data: { title: string; description?: string }) {
    await this.createWorkshopButton.click();
    await this.workshopTitleInput.fill(data.title);
    if (data.description) {
      await this.workshopDescriptionInput.fill(data.description);
    }
    await this.saveWorkshopButton.click();
    await this.waitForPageLoad();
  }

  async joinWorkshop(sessionCode: string) {
    await this.sessionCodeInput.fill(sessionCode);
    await this.joinButton.click();
    await this.waitForPageLoad();
  }

  async castVote(vote: "FIT" | "CONFIGURE" | "GAP") {
    switch (vote) {
      case "FIT":
        await this.voteFitButton.click();
        break;
      case "CONFIGURE":
        await this.voteConfigureButton.click();
        break;
      case "GAP":
        await this.voteGapButton.click();
        break;
    }
  }

  async finalizeCurrentVote() {
    await this.finalizeVoteButton.click();
    await this.waitForPageLoad();
  }

  async addComment(text: string) {
    await this.commentInput.fill(text);
    await this.submitCommentButton.click();
  }

  async addActionItem(data: { title: string }) {
    await this.addActionItemButton.click();
    await this.actionItemTitleInput.fill(data.title);
    await this.saveActionItemButton.click();
    await this.waitForPageLoad();
  }

  async startWorkshop() {
    await this.startWorkshopButton.click();
    await this.waitForPageLoad();
  }

  async endWorkshop() {
    await this.endWorkshopButton.click();
    const confirmBtn = this.page.getByRole("button", { name: /confirm|yes/i });
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await this.waitForPageLoad();
  }

  async generateMinutes() {
    await this.generateMinutesButton.click();
    await this.waitForPageLoad();
  }

  async navigateToNextStep() {
    await this.nextStepButton.click();
    await this.waitForPageLoad();
  }

  async navigateToPreviousStep() {
    await this.previousStepButton.click();
    await this.waitForPageLoad();
  }

  // ── Assertions ──────────────────────────────────────────────
  async getAttendeeCountText(): Promise<string> {
    return (await this.attendeeCount.textContent()) ?? "0";
  }

  async isVotingPanelVisible(): Promise<boolean> {
    return this.votingPanel.isVisible({ timeout: 5_000 }).catch(() => false);
  }

  async getSessionIdFromUrl(): Promise<string> {
    const url = this.page.url();
    const match = url.match(/\/workshops\/([^/]+)/);
    return match?.[1] ?? "";
  }
}
