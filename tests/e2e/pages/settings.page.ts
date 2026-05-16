import { type Page, type Locator } from "@playwright/test";
import { BasePage } from "./base.page";

export class SettingsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ── Navigation ──────────────────────────────────────────────
  async goToOrganization() {
    await this.navigateTo("/organization");
  }

  async goToTeamManagement() {
    await this.navigateTo("/organization/users");
  }

  async goToAdminPanel() {
    await this.navigateTo("/admin");
  }

  async goToAdminUsers() {
    await this.navigateTo("/admin/users");
  }

  // ── Organization Settings Locators ──────────────────────────
  get orgNameInput(): Locator {
    return this.page.locator(
      "[data-testid='org-name'], input[name='orgName'], input[name='organizationName']"
    );
  }

  get orgTypeSelect(): Locator {
    return this.page.locator(
      "[data-testid='org-type'], select[name='orgType'], [name='type']"
    );
  }

  get orgLogoUpload(): Locator {
    return this.page.locator(
      "[data-testid='org-logo'], input[type='file']"
    );
  }

  get saveOrgSettingsButton(): Locator {
    return this.page.getByRole("button", { name: /save|update/i });
  }

  get orgSettingsForm(): Locator {
    return this.page.locator(
      "[data-testid='org-settings-form'], form"
    );
  }

  // ── Team Management Locators ────────────────────────────────
  get teamMembersTable(): Locator {
    return this.page.locator(
      "[data-testid='team-members'], table, [data-testid='users-table']"
    );
  }

  get teamMemberRows(): Locator {
    return this.page.locator(
      "[data-testid='team-member-row'], tbody tr, [data-testid='user-row']"
    );
  }

  get inviteUserButton(): Locator {
    return this.page.getByRole("button", { name: /invite|add.*user|add.*member/i });
  }

  get inviteEmailInput(): Locator {
    return this.page.locator(
      "[data-testid='invite-email'], input[name='email'], input[type='email']"
    );
  }

  get inviteRoleSelect(): Locator {
    return this.page.locator(
      "[data-testid='invite-role'], select[name='role'], [name='role']"
    );
  }

  get sendInviteButton(): Locator {
    return this.page.getByRole("button", { name: /send.*invite|invite/i });
  }

  get removeUserButton(): Locator {
    return this.page.getByRole("button", { name: /remove|delete|revoke/i });
  }

  get changeRoleButton(): Locator {
    return this.page.getByRole("button", { name: /change.*role|edit.*role/i });
  }

  get roleDropdown(): Locator {
    return this.page.locator(
      "[data-testid='role-dropdown'], select[name='newRole'], [data-testid='role-select']"
    );
  }

  // ── Subscription / Billing Locators ─────────────────────────
  get subscriptionSection(): Locator {
    return this.page.locator(
      "[data-testid='subscription'], [data-testid='billing']"
    );
  }

  get currentPlan(): Locator {
    return this.page.locator(
      "[data-testid='current-plan'], [data-testid='plan-name']"
    );
  }

  get upgradeButton(): Locator {
    return this.page.getByRole("button", { name: /upgrade|change plan/i });
  }

  get planCards(): Locator {
    return this.page.locator(
      "[data-testid='plan-card'], [data-testid='pricing-card']"
    );
  }

  get selectPlanButton(): Locator {
    return this.page.getByRole("button", { name: /select|choose|subscribe/i });
  }

  get paymentMethodSection(): Locator {
    return this.page.locator(
      "[data-testid='payment-method'], [data-testid='billing-info']"
    );
  }

  get addPaymentButton(): Locator {
    return this.page.getByRole("button", { name: /add.*payment|add.*card/i });
  }

  get cardNumberInput(): Locator {
    return this.page.locator(
      "[data-testid='card-number'], input[name='cardNumber']"
    );
  }

  get billingHistoryTable(): Locator {
    return this.page.locator(
      "[data-testid='billing-history'], [data-testid='invoice-list']"
    );
  }

  get cancelSubscriptionButton(): Locator {
    return this.page.getByRole("button", { name: /cancel.*subscription|cancel.*plan/i });
  }

  // ── SSO / SCIM Locators ─────────────────────────────────────
  get ssoSection(): Locator {
    return this.page.locator(
      "[data-testid='sso-settings'], [data-testid='sso-config']"
    );
  }

  get enableSsoToggle(): Locator {
    return this.page.locator(
      "[data-testid='sso-toggle'], input[name='ssoEnabled'], [role='switch']"
    );
  }

  get ssoProviderSelect(): Locator {
    return this.page.locator(
      "[data-testid='sso-provider'], select[name='provider'], [name='ssoProvider']"
    );
  }

  get ssoMetadataUrlInput(): Locator {
    return this.page.locator(
      "[data-testid='sso-metadata-url'], input[name='metadataUrl']"
    );
  }

  get ssoEntityIdInput(): Locator {
    return this.page.locator(
      "[data-testid='sso-entity-id'], input[name='entityId']"
    );
  }

  get ssoCertificateInput(): Locator {
    return this.page.locator(
      "[data-testid='sso-certificate'], textarea[name='certificate']"
    );
  }

  get saveSsoButton(): Locator {
    return this.page.getByRole("button", { name: /save.*sso|configure.*sso/i });
  }

  get scimSection(): Locator {
    return this.page.locator(
      "[data-testid='scim-settings'], [data-testid='scim-config']"
    );
  }

  get enableScimToggle(): Locator {
    return this.page.locator(
      "[data-testid='scim-toggle'], input[name='scimEnabled']"
    );
  }

  get scimEndpointUrl(): Locator {
    return this.page.locator(
      "[data-testid='scim-endpoint'], [data-testid='scim-url']"
    );
  }

  get scimTokenDisplay(): Locator {
    return this.page.locator(
      "[data-testid='scim-token'], [data-testid='scim-bearer-token']"
    );
  }

  get generateScimTokenButton(): Locator {
    return this.page.getByRole("button", { name: /generate.*token|new.*token/i });
  }

  // ── Admin Panel Locators ────────────────────────────────────
  get adminOverview(): Locator {
    return this.page.locator(
      "[data-testid='admin-overview'], [data-testid='admin-dashboard']"
    );
  }

  get adminAssessmentsLink(): Locator {
    return this.page.locator("a[href='/admin/assessments']");
  }

  get adminUsersLink(): Locator {
    return this.page.locator("a[href='/admin/users']");
  }

  get adminIndustriesLink(): Locator {
    return this.page.locator("a[href='/admin/industries']");
  }

  get adminBaselinesLink(): Locator {
    return this.page.locator("a[href='/admin/baselines']");
  }

  // ── Actions ─────────────────────────────────────────────────
  async updateOrgName(name: string) {
    await this.orgNameInput.clear();
    await this.orgNameInput.fill(name);
    await this.saveOrgSettingsButton.click();
    await this.waitForPageLoad();
  }

  async inviteUser(data: { email: string; role?: string }) {
    await this.inviteUserButton.click();
    await this.inviteEmailInput.fill(data.email);
    if (data.role) {
      await this.inviteRoleSelect.click();
      await this.page.getByText(data.role, { exact: false }).click();
    }
    await this.sendInviteButton.click();
    await this.waitForPageLoad();
  }

  async removeUser(email: string) {
    const row = this.page.locator(`tr:has-text("${email}"), [data-testid='user-row']:has-text("${email}")`);
    await row.locator("button:has-text('Remove'), button:has-text('Delete')").click();
    const confirmBtn = this.page.getByRole("button", { name: /confirm|yes/i });
    if (await confirmBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await confirmBtn.click();
    }
    await this.waitForPageLoad();
  }

  async changeUserRole(email: string, newRole: string) {
    const row = this.page.locator(`tr:has-text("${email}"), [data-testid='user-row']:has-text("${email}")`);
    await row.locator("button, [data-testid='role-select']").first().click();
    await this.page.getByText(newRole, { exact: false }).click();
    await this.waitForPageLoad();
  }

  async configureSso(data: { provider: string; metadataUrl: string; entityId: string }) {
    await this.enableSsoToggle.click();
    await this.ssoProviderSelect.click();
    await this.page.getByText(data.provider, { exact: false }).click();
    await this.ssoMetadataUrlInput.fill(data.metadataUrl);
    await this.ssoEntityIdInput.fill(data.entityId);
    await this.saveSsoButton.click();
    await this.waitForPageLoad();
  }

  async enableScim() {
    await this.enableScimToggle.click();
    await this.waitForPageLoad();
  }

  async generateScimToken() {
    await this.generateScimTokenButton.click();
    await this.waitForPageLoad();
  }

  // ── Assertions ──────────────────────────────────────────────
  async getTeamMemberCount(): Promise<number> {
    return this.teamMemberRows.count();
  }

  async getCurrentPlanName(): Promise<string> {
    return (await this.currentPlan.textContent()) ?? "";
  }

  async isAdminPanelAccessible(): Promise<boolean> {
    const url = this.page.url();
    const body = await this.page.textContent("body");
    return (
      url.includes("/admin") &&
      !body?.includes("denied") &&
      !body?.includes("authorized")
    );
  }
}
