import { Page, Locator } from "@playwright/test";
import { BasePage } from "./base.page";

export class AuthPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  // ── Navigation ──────────────────────────────────────────────
  async goToLogin() {
    await this.navigateTo("/login");
  }

  async goToSignup() {
    await this.navigateTo("/login");
  }

  async goToMfaSetup() {
    await this.navigateTo("/mfa/setup");
  }

  async goToMfaVerify() {
    await this.navigateTo("/mfa/verify");
  }

  // ── Locators ────────────────────────────────────────────────
  get emailInput(): Locator {
    return this.page.locator("input[type='email']");
  }

  get passwordInput(): Locator {
    return this.page.locator("input[type='password']");
  }

  get companyNameInput(): Locator {
    return this.page.locator("[data-testid='company-name'], input[name='companyName']");
  }

  get fullNameInput(): Locator {
    return this.page.locator("[data-testid='full-name'], input[name='name']");
  }

  get signInButton(): Locator {
    return this.page.getByRole("button", { name: /sign in|send|log in/i });
  }

  get signUpButton(): Locator {
    return this.page.getByRole("button", { name: /sign up|register|create account/i });
  }

  get signInHeading(): Locator {
    return this.page.getByText(/sign in/i);
  }

  get ssoButton(): Locator {
    return this.page.getByRole("button", { name: /sso|single sign-on|enterprise/i });
  }

  get magicLinkMessage(): Locator {
    return this.page.getByText(/check your email|magic link|verification/i);
  }

  get totpInput(): Locator {
    return this.page.locator(
      "[data-testid='totp-input'], input[name='code'], input[name='totp']"
    );
  }

  get totpSubmitButton(): Locator {
    return this.page.getByRole("button", { name: /verify|confirm|submit/i });
  }

  get qrCode(): Locator {
    return this.page.locator("[data-testid='qr-code'], canvas, img[alt*='QR']");
  }

  get setupSecret(): Locator {
    return this.page.locator("[data-testid='setup-secret'], code");
  }

  get errorMessage(): Locator {
    return this.page.locator("[data-testid='error'], [role='alert']");
  }

  // ── Actions ─────────────────────────────────────────────────
  async fillLoginForm(email: string) {
    await this.emailInput.fill(email);
  }

  async submitLogin() {
    await this.signInButton.click();
  }

  async loginWithMagicLink(email: string) {
    await this.fillLoginForm(email);
    await this.submitLogin();
  }

  async fillSignupForm(data: { name: string; email: string; company: string }) {
    await this.fullNameInput.fill(data.name);
    await this.emailInput.fill(data.email);
    if (await this.companyNameInput.isVisible()) {
      await this.companyNameInput.fill(data.company);
    }
  }

  async submitSignup() {
    await this.signUpButton.click();
  }

  async fillTotp(code: string) {
    await this.totpInput.fill(code);
  }

  async submitTotp() {
    await this.totpSubmitButton.click();
  }

  async clickSsoButton() {
    await this.ssoButton.click();
  }

  async fillSsoEmail(email: string) {
    const ssoEmailInput = this.page.locator(
      "[data-testid='sso-email'], input[name='ssoEmail'], input[type='email']"
    );
    await ssoEmailInput.fill(email);
  }

  // ── Assertions ──────────────────────────────────────────────
  async isOnLoginPage(): Promise<boolean> {
    return this.page.url().includes("/login");
  }

  async isOnVerifyPage(): Promise<boolean> {
    const url = this.page.url();
    return url.includes("verify") || url.includes("mfa");
  }

  async isOnDashboard(): Promise<boolean> {
    const url = this.page.url();
    return url.includes("/dashboard") || url.includes("/assessments");
  }
}
