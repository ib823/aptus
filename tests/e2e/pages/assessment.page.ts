import { type Page, type Locator } from "@playwright/test";
import { BasePage } from "./base.page";

export class AssessmentPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ── Navigation ──────────────────────────────────────────────
  async goToAssessmentsList() {
    await this.navigateTo("/assessments");
  }

  async goToNewAssessment() {
    await this.navigateTo("/assessments/new");
  }

  async goToAssessment(id: string) {
    await this.navigateTo(`/assessment/${id}/profile`);
  }

  async goToScope(id: string) {
    await this.navigateTo(`/assessment/${id}/scope`);
  }

  async goToReview(id: string) {
    await this.navigateTo(`/assessment/${id}/review`);
  }

  async goToGaps(id: string) {
    await this.navigateTo(`/assessment/${id}/gaps`);
  }

  async goToIntegrations(id: string) {
    await this.navigateTo(`/assessment/${id}/integrations`);
  }

  async goToDataMigration(id: string) {
    await this.navigateTo(`/assessment/${id}/data-migration`);
  }

  async goToOcm(id: string) {
    await this.navigateTo(`/assessment/${id}/ocm`);
  }

  async goToReport(id: string) {
    await this.navigateTo(`/assessment/${id}/report`);
  }

  async goToConfig(id: string) {
    await this.navigateTo(`/assessment/${id}/config`);
  }

  async goToFlows(id: string) {
    await this.navigateTo(`/assessment/${id}/flows`);
  }

  async goToRemaining(id: string) {
    await this.navigateTo(`/assessment/${id}/remaining`);
  }

  // ── Assessment List Locators ────────────────────────────────
  get createAssessmentButton(): Locator {
    return this.page.locator(
      "a[href='/assessments/new'], [data-testid='create-assessment'], button:has-text('New Assessment')"
    );
  }

  get assessmentList(): Locator {
    return this.page.locator(
      "[data-testid='assessment-list'], [data-testid='assessments-table'], table"
    );
  }

  get assessmentCards(): Locator {
    return this.page.locator(
      "[data-testid='assessment-card'], [data-testid='assessment-row'], tr[data-assessment-id]"
    );
  }

  assessmentByName(name: string): Locator {
    return this.page.locator(`text=${name}`).first();
  }

  // ── New Assessment Form Locators ────────────────────────────
  get companyNameInput(): Locator {
    return this.page.locator(
      "[data-testid='company-name'], input[name='companyName'], #company-name"
    );
  }

  get industrySelect(): Locator {
    return this.page.locator(
      "[data-testid='industry-select'], select[name='industry'], [name='industry'], #industry"
    );
  }

  get countrySelect(): Locator {
    return this.page.locator(
      "[data-testid='country-select'], select[name='country'], [name='country'], #country"
    );
  }

  get companySizeSelect(): Locator {
    return this.page.locator(
      "[data-testid='company-size'], select[name='companySize'], [name='companySize'], #company-size"
    );
  }

  get sapVersionSelect(): Locator {
    return this.page.locator(
      "[data-testid='sap-version'], select[name='sapVersion'], [name='sapVersion']"
    );
  }

  get submitButton(): Locator {
    return this.page.locator("form button[type='submit']").first();
  }

  // ── Profile Locators ───────────────────────────────────────
  get profileForm(): Locator {
    return this.page.locator("[data-testid='profile-form'], form");
  }

  get saveProfileButton(): Locator {
    return this.page.getByRole("button", { name: /save|update|next/i });
  }

  // ── Scope Locators ─────────────────────────────────────────
  get scopeTree(): Locator {
    return this.page.locator("[data-testid='scope-tree'], [data-testid='scope-list']");
  }

  get scopeItems(): Locator {
    return this.page.locator(
      "[data-testid='scope-item'], [data-testid='scope-row'], [role='treeitem']"
    );
  }

  get scopeSearchInput(): Locator {
    return this.page.locator(
      "[data-testid='scope-search'], input[placeholder*='search' i], input[placeholder*='filter' i]"
    );
  }

  get lockScopeButton(): Locator {
    return this.page.getByRole("button", { name: /lock|finalize|confirm scope/i });
  }

  get preSelectButton(): Locator {
    return this.page.getByRole("button", { name: /pre-select|auto-select|recommend/i });
  }

  get selectAllCheckbox(): Locator {
    return this.page.locator("[data-testid='select-all'], input[type='checkbox']").first();
  }

  // ── Step Review / Classify Locators ─────────────────────────
  get stepsList(): Locator {
    return this.page.locator("[data-testid='steps-list'], [data-testid='step-review']");
  }

  get currentStep(): Locator {
    return this.page.locator("[data-testid='current-step'], [data-testid='step-detail']");
  }

  get fitButton(): Locator {
    return this.page.getByRole("button", { name: /^fit$/i });
  }

  get configureButton(): Locator {
    return this.page.getByRole("button", { name: /configure/i });
  }

  get gapButton(): Locator {
    return this.page.getByRole("button", { name: /^gap$/i });
  }

  get notApplicableButton(): Locator {
    return this.page.getByRole("button", { name: /not applicable|n\/a/i });
  }

  get nextStepButton(): Locator {
    return this.page.getByRole("button", { name: /next|continue|proceed/i });
  }

  get previousStepButton(): Locator {
    return this.page.getByRole("button", { name: /previous|back/i });
  }

  get stepProgressBar(): Locator {
    return this.page.locator("[data-testid='progress'], [role='progressbar']");
  }

  get bulkClassifyButton(): Locator {
    return this.page.getByRole("button", { name: /bulk|batch/i });
  }

  get stepNotesInput(): Locator {
    return this.page.locator(
      "[data-testid='step-notes'], textarea[name='notes'], [data-testid='notes-input']"
    );
  }

  // ── Gap Locators ────────────────────────────────────────────
  get gapsList(): Locator {
    return this.page.locator("[data-testid='gaps-list'], [data-testid='gap-register']");
  }

  get addGapButton(): Locator {
    return this.page.getByRole("button", { name: /add gap|new gap|create gap/i });
  }

  get gapTitleInput(): Locator {
    return this.page.locator(
      "[data-testid='gap-title'], input[name='title'], input[name='gapTitle']"
    );
  }

  get gapDescriptionInput(): Locator {
    return this.page.locator(
      "[data-testid='gap-description'], textarea[name='description']"
    );
  }

  get gapResolutionSelect(): Locator {
    return this.page.locator(
      "[data-testid='gap-resolution'], select[name='resolution'], [name='resolutionType']"
    );
  }

  get gapPrioritySelect(): Locator {
    return this.page.locator(
      "[data-testid='gap-priority'], select[name='priority'], [name='priority']"
    );
  }

  get saveGapButton(): Locator {
    return this.page.getByRole("button", { name: /save|create|submit/i });
  }

  get gapCards(): Locator {
    return this.page.locator("[data-testid='gap-card'], [data-testid='gap-row']");
  }

  get suggestResolutionButton(): Locator {
    return this.page.getByRole("button", { name: /suggest|recommend|ai/i });
  }

  // ── Integration Locators ────────────────────────────────────
  get integrationsTable(): Locator {
    return this.page.locator(
      "[data-testid='integrations-list'], [data-testid='integrations-table']"
    );
  }

  get addIntegrationButton(): Locator {
    return this.page.getByRole("button", { name: /add integration|new integration/i });
  }

  get integrationNameInput(): Locator {
    return this.page.locator(
      "[data-testid='integration-name'], input[name='name'], input[name='integrationName']"
    );
  }

  get integrationSourceInput(): Locator {
    return this.page.locator(
      "[data-testid='source-system'], input[name='sourceSystem'], [name='source']"
    );
  }

  get integrationTargetInput(): Locator {
    return this.page.locator(
      "[data-testid='target-system'], input[name='targetSystem'], [name='target']"
    );
  }

  get integrationTypeSelect(): Locator {
    return this.page.locator(
      "[data-testid='integration-type'], select[name='type'], [name='integrationType']"
    );
  }

  get saveIntegrationButton(): Locator {
    return this.page.getByRole("button", { name: /save|create|add/i });
  }

  // ── Data Migration Locators ─────────────────────────────────
  get dataMigrationTable(): Locator {
    return this.page.locator(
      "[data-testid='data-migration-list'], [data-testid='migration-table']"
    );
  }

  get addMigrationObjectButton(): Locator {
    return this.page.getByRole("button", { name: /add.*object|new.*object|add.*migration/i });
  }

  get migrationObjectNameInput(): Locator {
    return this.page.locator(
      "[data-testid='object-name'], input[name='objectName'], input[name='name']"
    );
  }

  get migrationSourceInput(): Locator {
    return this.page.locator(
      "[data-testid='migration-source'], input[name='source']"
    );
  }

  get migrationStrategySelect(): Locator {
    return this.page.locator(
      "[data-testid='migration-strategy'], select[name='strategy'], [name='strategy']"
    );
  }

  get saveMigrationObjectButton(): Locator {
    return this.page.getByRole("button", { name: /save|create|add/i });
  }

  // ── OCM Locators ────────────────────────────────────────────
  get ocmImpactsList(): Locator {
    return this.page.locator("[data-testid='ocm-list'], [data-testid='ocm-impacts']");
  }

  get addOcmImpactButton(): Locator {
    return this.page.getByRole("button", { name: /add.*impact|new.*impact/i });
  }

  get ocmAreaSelect(): Locator {
    return this.page.locator(
      "[data-testid='ocm-area'], select[name='area'], [name='impactArea']"
    );
  }

  get ocmSeveritySelect(): Locator {
    return this.page.locator(
      "[data-testid='ocm-severity'], select[name='severity'], [name='severity']"
    );
  }

  get ocmDescriptionInput(): Locator {
    return this.page.locator(
      "[data-testid='ocm-description'], textarea[name='description']"
    );
  }

  get saveOcmImpactButton(): Locator {
    return this.page.getByRole("button", { name: /save|create|add/i });
  }

  get ocmHeatmap(): Locator {
    return this.page.locator("[data-testid='ocm-heatmap']");
  }

  // ── Report / Export Locators ────────────────────────────────
  get exportButton(): Locator {
    return this.page.getByRole("button", { name: /export|download|generate/i });
  }

  get exportExecutiveSummary(): Locator {
    return this.page.locator("[data-testid='export-executive-summary']");
  }

  get exportGapRegister(): Locator {
    return this.page.locator("[data-testid='export-gap-register']");
  }

  get exportConfigWorkbook(): Locator {
    return this.page.locator("[data-testid='export-config-workbook']");
  }

  get reportTabs(): Locator {
    return this.page.locator("[data-testid='report-tabs'], [role='tablist']");
  }

  get certificateView(): Locator {
    return this.page.locator("[data-testid='certificate'], [data-testid='sign-off-certificate']");
  }

  // ── Actions ─────────────────────────────────────────────────
  async createAssessment(data: {
    companyName: string;
    industry?: string;
    country?: string;
    companySize?: string;
  }) {
    await this.companyNameInput.fill(data.companyName);

    if (data.industry) {
      await this.industrySelect.selectOption(data.industry);
    }
    if (data.country) {
      await this.countrySelect.fill(data.country);
    }
    if (data.companySize) {
      await this.companySizeSelect.selectOption(data.companySize);
    }

    await this.submitButton.click();
    await this.waitForPageLoad();
  }

  async selectScopeItems(count: number) {
    const items = this.scopeItems;
    const checkboxes = items.locator("input[type='checkbox']");
    const totalCheckboxes = await checkboxes.count();
    const toSelect = Math.min(count, totalCheckboxes);

    for (let i = 0; i < toSelect; i++) {
      const checkbox = checkboxes.nth(i);
      if (!(await checkbox.isChecked())) {
        await checkbox.check();
      }
    }
  }

  async lockScope() {
    await this.lockScopeButton.click();
    await this.waitForPageLoad();
  }

  async classifyStepAs(classification: "FIT" | "CONFIGURE" | "GAP" | "NOT_APPLICABLE") {
    switch (classification) {
      case "FIT":
        await this.fitButton.click();
        break;
      case "CONFIGURE":
        await this.configureButton.click();
        break;
      case "GAP":
        await this.gapButton.click();
        break;
      case "NOT_APPLICABLE":
        await this.notApplicableButton.click();
        break;
    }
  }

  async addGap(data: { title: string; description: string }) {
    await this.addGapButton.click();
    await this.gapTitleInput.fill(data.title);
    await this.gapDescriptionInput.fill(data.description);
    await this.saveGapButton.click();
    await this.waitForPageLoad();
  }

  async addIntegration(data: { name: string; source: string; target: string }) {
    await this.addIntegrationButton.click();

    const dialog = this.page.getByRole("dialog");
    await dialog.locator("input[placeholder*='Bank Statement' i]").first().fill(data.name);
    await dialog.locator("textarea[placeholder*='Describe the integration' i]").first().fill(`Integration for ${data.name}`);
    await dialog.locator("input[placeholder*='SAP ECC' i]").first().fill(data.source);
    await dialog.locator("input[placeholder*='SAP Cloud' i]").first().fill(data.target);

    const selects = dialog.locator("select");
    await selects.nth(0).selectOption("INBOUND");
    await selects.nth(1).selectOption("API");
    await selects.nth(2).selectOption("REAL_TIME");

    await dialog.getByRole("button", { name: /create|save|update/i }).first().click();
    await this.waitForPageLoad();
  }

  async addDataMigrationObject(data: { name: string; source: string }) {
    await this.addMigrationObjectButton.click();

    const dialog = this.page.getByRole("dialog");
    await dialog.locator("input[placeholder*='Customer Master' i]").first().fill(data.name);
    await dialog.locator("textarea[placeholder*='Describe the migration object' i]").first().fill(`Migration object for ${data.name}`);
    await dialog.locator("input[placeholder*='SAP ECC' i]").first().fill(data.source);

    const selects = dialog.locator("select");
    await selects.nth(0).selectOption("MASTER_DATA");

    await dialog.getByRole("button", { name: /create|save|update/i }).first().click();
    await this.waitForPageLoad();
  }

  async addOcmImpact(data: { description: string }) {
    await this.addOcmImpactButton.click();

    const dialog = this.page.getByRole("dialog");
    await dialog.locator("input[placeholder*='AP Clerk' i]").first().fill("Finance Analyst");
    await dialog.locator("textarea[placeholder*='Describe the change impact' i]").first().fill(data.description);

    const selects = dialog.locator("select");
    await selects.nth(0).selectOption("PROCESS_CHANGE");
    await selects.nth(1).selectOption("MEDIUM");

    await dialog.getByRole("button", { name: /create|save|update/i }).first().click();
    await this.waitForPageLoad();
  }

  async getAssessmentIdFromUrl(): Promise<string> {
    const url = this.page.url();
    const match = url.match(/\/assessment\/([^/]+)/);
    return match?.[1] ?? "";
  }

  async clickAssessmentByName(name: string) {
    await this.assessmentByName(name).click();
    await this.waitForPageLoad();
  }

  async navigateToStep(stepIndex: number) {
    const steps = this.page.locator(
      "[data-testid='step-nav-item'], [data-testid='step-link']"
    );
    if (await steps.nth(stepIndex).isVisible()) {
      await steps.nth(stepIndex).click();
      await this.waitForPageLoad();
    }
  }
}
