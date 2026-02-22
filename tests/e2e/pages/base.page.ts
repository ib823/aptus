import { Page, Locator } from "@playwright/test";

export class BasePage {
  constructor(protected page: Page) {}

  async waitForPageLoad() {
    await this.page.waitForLoadState("networkidle");
  }

  get notification(): Locator {
    return this.page.locator("[data-testid='notification']");
  }

  get loadingSpinner(): Locator {
    return this.page.locator("[data-testid='loading']");
  }

  async waitForNotification(text?: string) {
    await this.notification.first().waitFor({ state: "visible", timeout: 10_000 });
    if (text) {
      await this.page.locator(`[data-testid='notification']:has-text("${text}")`).waitFor({
        state: "visible",
        timeout: 10_000,
      });
    }
  }

  async waitForSpinnerToDisappear() {
    const spinner = this.loadingSpinner.first();
    if (await spinner.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await spinner.waitFor({ state: "hidden", timeout: 30_000 });
    }
  }

  async getPageTitle(): Promise<string> {
    return this.page.title();
  }

  async navigateTo(path: string) {
    await this.page.goto(path);
    await this.waitForPageLoad();
  }

  async hasConsoleErrors(): Promise<string[]> {
    const errors: string[] = [];
    this.page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(msg.text());
      }
    });
    return errors;
  }

  async checkNoHorizontalOverflow(viewportWidth: number) {
    const bodyWidth = await this.page.evaluate(() => document.body.scrollWidth);
    return bodyWidth <= viewportWidth + 1;
  }
}
