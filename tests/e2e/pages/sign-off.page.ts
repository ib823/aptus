import { Page, Locator } from "@playwright/test";
import { BasePage } from "./base.page";

export class SignOffPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ── Navigation ──────────────────────────────────────────────
  async goToSignOff(assessmentId: string) {
    await this.navigateTo(`/assessment/${assessmentId}/review`);
  }

  // ── Sign-Off Status Locators ────────────────────────────────
  get signOffContainer(): Locator {
    return this.page.locator(
      "[data-testid='sign-off'], [data-testid='sign-off-container']"
    );
  }

  get signOffStatus(): Locator {
    return this.page.locator(
      "[data-testid='sign-off-status'], [data-testid='signoff-state']"
    );
  }

  get signOffTimeline(): Locator {
    return this.page.locator(
      "[data-testid='sign-off-timeline'], [data-testid='signoff-progress']"
    );
  }

  // ── Initiate Sign-Off ──────────────────────────────────────
  get initiateSignOffButton(): Locator {
    return this.page.getByRole("button", {
      name: /initiate sign-off|start sign-off|begin sign-off|submit for sign-off/i,
    });
  }

  get confirmInitiateButton(): Locator {
    return this.page.getByRole("button", { name: /confirm|yes|proceed/i });
  }

  // ── Area Validation Locators ────────────────────────────────
  get areaValidationSection(): Locator {
    return this.page.locator(
      "[data-testid='area-validation'], [data-testid='po-validation']"
    );
  }

  get areaValidationList(): Locator {
    return this.page.locator(
      "[data-testid='area-list'], [data-testid='validation-areas']"
    );
  }

  get areaApproveButton(): Locator {
    return this.page.getByRole("button", { name: /approve|validate|accept/i });
  }

  get areaRejectButton(): Locator {
    return this.page.getByRole("button", { name: /reject|decline|request changes/i });
  }

  get areaCommentsInput(): Locator {
    return this.page.locator(
      "[data-testid='area-comments'], textarea[name='comments'], textarea[name='validationComments']"
    );
  }

  get areaSignatureInput(): Locator {
    return this.page.locator(
      "[data-testid='area-signature'], input[name='signature'], [data-testid='signature-pad']"
    );
  }

  get submitAreaValidation(): Locator {
    return this.page.getByRole("button", { name: /submit.*validation|sign off.*area/i });
  }

  areaByName(name: string): Locator {
    return this.page.locator(
      `[data-testid='area-item']:has-text("${name}"), tr:has-text("${name}")`
    );
  }

  // ── Technical Validation Locators ───────────────────────────
  get technicalValidationSection(): Locator {
    return this.page.locator(
      "[data-testid='technical-validation'], [data-testid='it-validation']"
    );
  }

  get technicalApproveButton(): Locator {
    return this.page.getByRole("button", { name: /approve.*technical|validate.*technical/i });
  }

  // ── Cross-Functional Validation Locators ────────────────────
  get crossFunctionalSection(): Locator {
    return this.page.locator(
      "[data-testid='cross-functional'], [data-testid='cross-functional-validation']"
    );
  }

  get crossFunctionalApproveButton(): Locator {
    return this.page.getByRole("button", { name: /approve.*cross|validate.*cross/i });
  }

  // ── Executive Sign-Off Locators ─────────────────────────────
  get executiveSignOffSection(): Locator {
    return this.page.locator(
      "[data-testid='executive-sign-off'], [data-testid='exec-signoff']"
    );
  }

  get executiveApproveButton(): Locator {
    return this.page.getByRole("button", {
      name: /approve|sign off|executive.*approve|accept/i,
    });
  }

  get executiveRejectButton(): Locator {
    return this.page.getByRole("button", {
      name: /reject|decline|executive.*reject|send back/i,
    });
  }

  get executiveCommentsInput(): Locator {
    return this.page.locator(
      "[data-testid='exec-comments'], textarea[name='executiveComments']"
    );
  }

  get executiveSignatureInput(): Locator {
    return this.page.locator(
      "[data-testid='exec-signature'], input[name='executiveSignature'], [data-testid='signature-pad']"
    );
  }

  get submitExecutiveSignOff(): Locator {
    return this.page.getByRole("button", { name: /submit.*executive|executive.*sign/i });
  }

  // ── Partner Countersign Locators ────────────────────────────
  get partnerCountersignSection(): Locator {
    return this.page.locator(
      "[data-testid='partner-countersign'], [data-testid='partner-signoff']"
    );
  }

  get partnerApproveButton(): Locator {
    return this.page.getByRole("button", {
      name: /countersign|partner.*approve|finalize/i,
    });
  }

  get partnerCommentsInput(): Locator {
    return this.page.locator(
      "[data-testid='partner-comments'], textarea[name='partnerComments']"
    );
  }

  get partnerSignatureInput(): Locator {
    return this.page.locator(
      "[data-testid='partner-signature'], input[name='partnerSignature'], [data-testid='signature-pad']"
    );
  }

  get submitPartnerCountersign(): Locator {
    return this.page.getByRole("button", { name: /submit.*countersign|finalize.*sign/i });
  }

  // ── Certificate Locators ────────────────────────────────────
  get certificate(): Locator {
    return this.page.locator(
      "[data-testid='certificate'], [data-testid='sign-off-certificate']"
    );
  }

  get certificateDownloadButton(): Locator {
    return this.page.getByRole("button", { name: /download.*certificate/i });
  }

  get archiveButton(): Locator {
    return this.page.getByRole("button", { name: /archive|complete/i });
  }

  // ── Change Request Locators ─────────────────────────────────
  get changeRequestButton(): Locator {
    return this.page.getByRole("button", { name: /change request|request change/i });
  }

  get changeRequestTitleInput(): Locator {
    return this.page.locator(
      "[data-testid='cr-title'], input[name='changeTitle'], input[name='title']"
    );
  }

  get changeRequestDescriptionInput(): Locator {
    return this.page.locator(
      "[data-testid='cr-description'], textarea[name='changeDescription'], textarea[name='description']"
    );
  }

  get changeRequestJustificationInput(): Locator {
    return this.page.locator(
      "[data-testid='cr-justification'], textarea[name='justification']"
    );
  }

  get submitChangeRequest(): Locator {
    return this.page.getByRole("button", { name: /submit.*change|create.*request/i });
  }

  get changeRequestsList(): Locator {
    return this.page.locator(
      "[data-testid='change-requests-list'], [data-testid='cr-list']"
    );
  }

  get approveChangeRequest(): Locator {
    return this.page.getByRole("button", { name: /approve.*change|accept.*change/i });
  }

  get rejectChangeRequest(): Locator {
    return this.page.getByRole("button", { name: /reject.*change|deny.*change/i });
  }

  // ── Actions ─────────────────────────────────────────────────
  async initiateSignOff() {
    await this.initiateSignOffButton.click();
    const confirmVisible = await this.confirmInitiateButton
      .isVisible({ timeout: 3_000 })
      .catch(() => false);
    if (confirmVisible) {
      await this.confirmInitiateButton.click();
    }
    await this.waitForPageLoad();
  }

  async approveArea(areaName: string, comments?: string) {
    const area = this.areaByName(areaName);
    await area.scrollIntoViewIfNeeded();

    if (comments) {
      await this.areaCommentsInput.fill(comments);
    }

    await this.areaApproveButton.click();
    await this.waitForPageLoad();
  }

  async submitAreaValidationForm(comments?: string) {
    if (comments) {
      await this.areaCommentsInput.fill(comments);
    }
    await this.areaApproveButton.click();
    await this.waitForPageLoad();
  }

  async submitExecutiveApproval(comments?: string) {
    if (comments) {
      await this.executiveCommentsInput.fill(comments);
    }
    await this.executiveApproveButton.click();
    await this.waitForPageLoad();
  }

  async submitPartnerCountersignForm(comments?: string) {
    if (comments) {
      await this.partnerCommentsInput.fill(comments);
    }
    await this.partnerApproveButton.click();
    await this.waitForPageLoad();
  }

  async createChangeRequest(data: {
    title: string;
    description: string;
    justification?: string;
  }) {
    await this.changeRequestButton.click();
    await this.changeRequestTitleInput.fill(data.title);
    await this.changeRequestDescriptionInput.fill(data.description);
    if (data.justification) {
      await this.changeRequestJustificationInput.fill(data.justification);
    }
    await this.submitChangeRequest.click();
    await this.waitForPageLoad();
  }

  async archiveAssessment() {
    await this.archiveButton.click();
    const confirmBtn = this.page.getByRole("button", { name: /confirm|yes/i });
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await this.waitForPageLoad();
  }

  // ── Assertions ──────────────────────────────────────────────
  async getSignOffStatusText(): Promise<string> {
    return (await this.signOffStatus.textContent()) ?? "";
  }

  async isCertificateVisible(): Promise<boolean> {
    return this.certificate.isVisible({ timeout: 5_000 }).catch(() => false);
  }

  async isAreaValidationComplete(): Promise<boolean> {
    const text = await this.areaValidationSection.textContent().catch(() => "");
    return /complete|approved|validated/i.test(text ?? "");
  }
}
