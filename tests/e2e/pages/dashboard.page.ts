import { Page, Locator } from "@playwright/test";
import { BasePage } from "./base.page";

export class DashboardPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ── Navigation ──────────────────────────────────────────────
  async goToDashboard() {
    await this.navigateTo("/dashboard");
  }

  async goToAnalytics() {
    await this.navigateTo("/analytics");
  }

  // ── Locators ────────────────────────────────────────────────
  get dashboardContainer(): Locator {
    return this.page.locator(
      "[data-testid='dashboard'], main, [data-testid='dashboard-container']"
    );
  }

  get widgetsContainer(): Locator {
    return this.page.locator(
      "[data-testid='widgets'], [data-testid='dashboard-widgets']"
    );
  }

  get assessmentCountWidget(): Locator {
    return this.page.locator(
      "[data-testid='assessment-count'], [data-testid='widget-assessments']"
    );
  }

  get activeAssessmentsWidget(): Locator {
    return this.page.locator(
      "[data-testid='active-assessments'], [data-testid='widget-active']"
    );
  }

  get completionRateWidget(): Locator {
    return this.page.locator(
      "[data-testid='completion-rate'], [data-testid='widget-completion']"
    );
  }

  get recentActivityFeed(): Locator {
    return this.page.locator(
      "[data-testid='activity-feed'], [data-testid='recent-activity']"
    );
  }

  get assessmentsSummaryTable(): Locator {
    return this.page.locator(
      "[data-testid='assessments-summary'], table, [data-testid='dashboard-table']"
    );
  }

  get readinessScorecard(): Locator {
    return this.page.locator(
      "[data-testid='readiness-scorecard'], [data-testid='scorecard']"
    );
  }

  get chartContainer(): Locator {
    return this.page.locator(
      "[data-testid='chart'], canvas, svg.recharts-surface, [data-testid='dashboard-chart']"
    );
  }

  get filterDropdown(): Locator {
    return this.page.locator(
      "[data-testid='dashboard-filter'], select[name='filter'], [data-testid='filter']"
    );
  }

  get dateRangePicker(): Locator {
    return this.page.locator(
      "[data-testid='date-range'], [data-testid='date-picker']"
    );
  }

  get navigationSidebar(): Locator {
    return this.page.locator("nav, [data-testid='sidebar']");
  }

  get dashboardLink(): Locator {
    return this.page.locator("a[href='/dashboard']");
  }

  get assessmentsLink(): Locator {
    return this.page.locator("a[href='/assessments']");
  }

  get analyticsLink(): Locator {
    return this.page.locator("a[href='/analytics']");
  }

  get adminLink(): Locator {
    return this.page.locator("a[href='/admin']");
  }

  get templatesLink(): Locator {
    return this.page.locator("a[href='/templates']");
  }

  get organizationLink(): Locator {
    return this.page.locator("a[href='/organization']");
  }

  get userMenuButton(): Locator {
    return this.page.locator(
      "[data-testid='user-menu'], [data-testid='avatar'], button:has([data-testid='user-avatar'])"
    );
  }

  get logoutButton(): Locator {
    return this.page.getByRole("menuitem", { name: /log out|sign out|logout/i });
  }

  // ── Partner View Locators ───────────────────────────────────
  get partnerOverview(): Locator {
    return this.page.locator("[data-testid='partner-overview']");
  }

  get portfolioView(): Locator {
    return this.page.locator("[data-testid='portfolio-view'], [data-testid='portfolio']");
  }

  // ── Executive View Locators ─────────────────────────────────
  get executiveSummary(): Locator {
    return this.page.locator("[data-testid='executive-summary']");
  }

  get pendingSignOffs(): Locator {
    return this.page.locator("[data-testid='pending-signoffs']");
  }

  // ── PM View Locators ───────────────────────────────────────
  get projectTimeline(): Locator {
    return this.page.locator("[data-testid='project-timeline']");
  }

  get taskList(): Locator {
    return this.page.locator("[data-testid='task-list']");
  }

  // ── Actions ─────────────────────────────────────────────────
  async openUserMenu() {
    await this.userMenuButton.click();
  }

  async logout() {
    await this.openUserMenu();
    await this.logoutButton.click();
    await this.waitForPageLoad();
  }

  async selectFilter(filterValue: string) {
    await this.filterDropdown.click();
    await this.page.getByText(filterValue, { exact: false }).click();
  }

  async navigateToAssessmentFromDashboard(assessmentName: string) {
    await this.page.getByText(assessmentName).first().click();
    await this.waitForPageLoad();
  }

  async clickCreateNewAssessment() {
    await this.page.locator("a[href='/assessments/new']").click();
    await this.waitForPageLoad();
  }

  // ── Assertions ──────────────────────────────────────────────
  async isOnDashboard(): Promise<boolean> {
    return this.page.url().includes("/dashboard");
  }

  async hasNavigationItem(name: string): Promise<boolean> {
    const link = this.page.locator(`nav a:has-text("${name}")`);
    return (await link.count()) > 0;
  }

  async getWidgetCount(): Promise<number> {
    return this.widgetsContainer.locator("> *").count();
  }
}
