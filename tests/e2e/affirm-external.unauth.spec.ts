/**
 * ABeam Workbench — Affirm external executive journey (PR-1) e2e.
 *
 * Drives the real guest pipeline against a self-seeded bundle + grant:
 *   1. Happy path: /a/[token] landing → legal ack → redeem → (device
 *      pre-verified so the OTP gate is skipped) → /a/home placeholder.
 *   2. Invalid token → the polymorphic /a/expired terminal (no oracle).
 *
 * REQUIREMENTS to run (kept out of the default suite so CI stays green when
 * the feature is off):
 *   - The dev server must boot with AFFIRM_EXTERNAL_ENABLED=true.
 *   - Run with AFFIRM_E2E=1 so this spec is not skipped.
 *
 * The OTP-required branch (fresh device → /a/verify) is asserted without
 * completing OTP, since the code is emailed/dev-logged and not readable here.
 */

import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashToken, mintRawToken } from "../../src/lib/affirm/external/tokens";
import { hashUserAgent } from "../../src/lib/security/ua-fingerprint";

const RUN = process.env.AFFIRM_E2E === "1";
const UA = "AffirmE2E/1.0 (Playwright) Chrome/142.0.0.0";
const CLIENT_LABEL = "E2E Test Co (affirm-external)";

const prisma = new PrismaClient();

let bundleId = "";
let verifiedToken = "";
let freshToken = "";

test.describe("Affirm external executive journey (PR-1)", () => {
  test.skip(!RUN, "Set AFFIRM_E2E=1 and boot the server with AFFIRM_EXTERNAL_ENABLED=true");
  test.use({ userAgent: UA });

  test.beforeAll(async () => {
    const bundle = await prisma.affirmBundle.create({
      data: { client: CLIENT_LABEL, state: "issued", issuedAt: new Date() },
    });
    bundleId = bundle.id;

    // Device already OTP-verified → redeem skips straight to /a/home.
    verifiedToken = mintRawToken();
    await prisma.affirmAccessGrant.create({
      data: {
        bundleId,
        email: "verified.exec@e2e.test",
        displayName: "Verified Exec",
        roleLabel: "CFO",
        tokenHash: hashToken(verifiedToken),
        valueStreamIds: [],
        otpVerifiedUaHashes: [hashUserAgent(UA)],
      },
    });

    // Fresh device → redeem must bounce to /a/verify.
    freshToken = mintRawToken();
    await prisma.affirmAccessGrant.create({
      data: {
        bundleId,
        email: "fresh.exec@e2e.test",
        displayName: "Fresh Exec",
        tokenHash: hashToken(freshToken),
        valueStreamIds: [],
        otpVerifiedUaHashes: [],
      },
    });
  });

  test.afterAll(async () => {
    if (bundleId) await prisma.affirmBundle.delete({ where: { id: bundleId } }).catch(() => {});
    await prisma.$disconnect();
  });

  test("happy path: landing → ack → redeem → home (device pre-verified)", async ({ page }) => {
    await page.goto(`/a/${verifiedToken}`);
    await expect(page.getByText(CLIENT_LABEL)).toBeVisible();

    await page.getByRole("checkbox", { name: /named recipient/i }).check();
    await page.getByRole("button", { name: /begin/i }).click();

    await expect(page).toHaveURL(/\/a\/home$/);
    await expect(page.getByRole("heading", { name: /you're in/i })).toBeVisible();
    // The token is gone from the URL after the 303.
    expect(page.url()).not.toContain(verifiedToken);
  });

  test("fresh device is routed to OTP verification", async ({ page }) => {
    await page.goto(`/a/${freshToken}`);
    await page.getByRole("checkbox", { name: /named recipient/i }).check();
    await page.getByRole("button", { name: /begin/i }).click();
    await expect(page).toHaveURL(/\/a\/verify$/);
    await expect(page.getByText(/confirm it's you/i)).toBeVisible();
  });

  test("invalid token lands on the polymorphic terminal", async ({ page }) => {
    await page.goto("/a/this-is-not-a-valid-token-000");
    await expect(page).toHaveURL(/\/a\/expired$/);
    await expect(page.getByText(/no longer active/i)).toBeVisible();
  });
});
