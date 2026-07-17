/**
 * ABeam Workbench — Neutral Process Discovery guest journey (PR-2a) e2e.
 *
 * Full entry journey against a self-seeded engagement:
 *   landing → ack → redeem → OTP verify → V1 home (all 10 streams).
 *
 * Mirrors tests/e2e/affirm-journey.unauth.spec.ts, including its seeding
 * approach (mint a raw token, store its hash) and its gating.
 *
 * REQUIREMENTS (kept out of the default suite so CI stays green when off):
 *   - Dev server booted with NEUTRAL_DISCOVERY_ENABLED=true.
 *   - Run with DISCOVERY_E2E=1.
 *
 * The OTP is read back from the DB rather than the dev console: the code is
 * hashed with sha256(`${grantId}:${code}`), so it cannot be recovered from the
 * row. The test verifies the device directly instead, which is exactly what the
 * Affirm journey does (`otpVerifiedUaHashes` pre-seeded) — and then ALSO drives
 * the real OTP form on a second, unverified device to prove the gate works.
 */

import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import AxeBuilder from "@axe-core/playwright";
import { hashToken, mintRawToken } from "../../src/lib/affirm/external/tokens";
import { hashUserAgent } from "../../src/lib/security/ua-fingerprint";

const RUN = process.env.DISCOVERY_E2E === "1";
const UA = "DiscoveryJourneyE2E/1.0 (Playwright) Chrome/142.0.0.0";
const CLIENT_LABEL = "E2E Discovery Co";

const prisma = new PrismaClient();
let engagementId = "";
let token = "";

/**
 * FILE-LEVEL fixture. Both describes share this token — the OTP block below
 * exercises the same grant from an unverified device. Tearing it down inside the
 * first describe's afterAll left the second running against a deleted grant.
 */
test.beforeAll(async () => {
  if (!RUN) return;
  const engagement = await prisma.discoveryEngagement.create({
    data: { client: CLIENT_LABEL, state: "issued", issuedAt: new Date() },
  });
  engagementId = engagement.id;
  token = mintRawToken();
  await prisma.discoveryAccessGrant.create({
    data: {
      engagementId,
      email: "journey.reviewer@e2e.test",
      displayName: "Journey Reviewer",
      roleLabel: "COO",
      tokenHash: hashToken(token),
      valueStreamIds: [], // empty = all 10 streams
      otpVerifiedUaHashes: [hashUserAgent(UA)], // device pre-verified: skips OTP
    },
  });
});

test.afterAll(async () => {
  if (engagementId) {
    await prisma.discoveryEngagement.delete({ where: { id: engagementId } }).catch(() => {});
  }
  await prisma.$disconnect();
});

test.describe("Neutral Process Discovery guest journey (PR-2a)", () => {
  test.skip(!RUN, "Set DISCOVERY_E2E=1 and boot the server with NEUTRAL_DISCOVERY_ENABLED=true");
  test.use({ userAgent: UA });

  test("landing → ack → redeem → V1 renders all 10 streams", async ({ page }) => {
    await page.goto(`/d/${token}`);

    // The brief's §10 promise, verbatim, on the landing.
    await expect(
      page.getByRole("heading", { name: /Your business on one page — before you pick a system\./ }),
    ).toBeVisible();

    await page.getByRole("checkbox", { name: /named recipient/i }).check();
    await page.getByRole("button", { name: /^Begin$/ }).click();

    // Device pre-verified → straight to home, and the token is gone from the URL.
    await expect(page).toHaveURL(/\/d\/home$/);

    await expect(
      page.getByRole("heading", {
        name: /Your business on one page — before you pick a system\./,
        level: 1,
      }),
    ).toBeVisible();

    // Client identity comes from the session, never a fixture. The .dc's
    // "Asia Meals Group" must appear nowhere.
    await expect(page.getByText(CLIENT_LABEL).first()).toBeVisible();
    await expect(page.getByText("Asia Meals Group")).toHaveCount(0);

    // All 10 streams from the loader — not the .dc's 8, and no
    // "not modeled in this prototype pass" scaffolding.
    const streamLinks = page.locator('a[href^="/d/stream/"]');
    await expect(streamLinks).toHaveCount(10);
    await expect(page.getByText(/not modeled in this prototype pass/i)).toHaveCount(0);

    // Coverage row reads the loader's truth, not meta and not the .dc's numbers.
    // Scoped to the coverage list and exact-matched: "742" also legitimately
    // appears in the progress line ("Nothing reviewed yet — 742 processes…"),
    // which is a strict-mode violation, not a bug.
    const coverage = page.getByRole("list").filter({ hasText: "business processes" }).first();
    await expect(coverage.getByText("742", { exact: true })).toBeVisible();
    await expect(coverage.getByText("545", { exact: true })).toBeVisible();
    await expect(coverage.getByText("60", { exact: true })).toBeVisible();
    // 726 is the pre-D6 sentinel-inflated figure; it must never render.
    await expect(page.getByText("726", { exact: true })).toHaveCount(0);
    // 654/638 are the brief's pre-overlay numbers; superseded by the loader.
    await expect(page.getByText("654", { exact: true })).toHaveCount(0);
    await expect(page.getByText("638", { exact: true })).toHaveCount(0);
  });

  test("fresh state: nothing decided yet", async ({ page }) => {
    await page.goto(`/d/${token}`);
    await page.getByRole("checkbox", { name: /named recipient/i }).check();
    await page.getByRole("button", { name: /^Begin$/ }).click();
    await expect(page).toHaveURL(/\/d\/home$/);

    await expect(page.getByText(/Nothing reviewed yet/)).toBeVisible();
    // The all-reviewed banner must NOT show on a fresh engagement.
    await expect(page.getByText(/Every stream reviewed/)).toHaveCount(0);
  });

  test("V1 has no serious or critical axe violations", async ({ page }) => {
    await page.goto(`/d/${token}`);
    await page.getByRole("checkbox", { name: /named recipient/i }).check();
    await page.getByRole("button", { name: /^Begin$/ }).click();
    await expect(page).toHaveURL(/\/d\/home$/);
    await page.waitForLoadState("load");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(
      serious.map((v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`),
    ).toEqual([]);
  });

  test("the landing has no serious or critical axe violations", async ({ page }) => {
    await page.goto(`/d/${token}`);
    await page.waitForLoadState("load");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(serious.map((v) => `[${v.impact}] ${v.id}`)).toEqual([]);
  });
});

test.describe("Neutral Process Discovery OTP gate (PR-2a)", () => {
  test.skip(!RUN, "Set DISCOVERY_E2E=1 and boot the server with NEUTRAL_DISCOVERY_ENABLED=true");
  // A DIFFERENT device: no pre-verified UA hash, so the OTP gate must engage.
  test.use({ userAgent: "DiscoveryOtpE2E/1.0 (Playwright) Chrome/142.0.0.0" });

  test("an unverified device is sent to the OTP gate, not home", async ({ page }) => {
    await page.goto(`/d/${token}`);
    await page.getByRole("checkbox", { name: /named recipient/i }).check();
    await page.getByRole("button", { name: /^Begin$/ }).click();

    await expect(page).toHaveURL(/\/d\/verify$/);
    await expect(
      page.getByRole("heading", { name: /Enter the 6-digit code we emailed you/ }),
    ).toBeVisible();
  });

  test("a wrong code is refused and does not reach home", async ({ page }) => {
    await page.goto(`/d/${token}`);
    await page.getByRole("checkbox", { name: /named recipient/i }).check();
    await page.getByRole("button", { name: /^Begin$/ }).click();
    await expect(page).toHaveURL(/\/d\/verify$/);

    await page.getByRole("textbox").first().fill("000000");
    await page.getByRole("button", { name: /^Verify$/ }).click();

    await expect(page).toHaveURL(/\/d\/verify\?error=invalid/);
    await expect(page.getByRole("alert")).toContainText(/didn't match/);
  });

  test("the OTP gate has no serious or critical axe violations", async ({ page }) => {
    await page.goto(`/d/${token}`);
    await page.getByRole("checkbox", { name: /named recipient/i }).check();
    await page.getByRole("button", { name: /^Begin$/ }).click();
    await expect(page).toHaveURL(/\/d\/verify$/);
    await page.waitForLoadState("load");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    expect(serious.map((v) => `[${v.impact}] ${v.id}`)).toEqual([]);
  });
});
