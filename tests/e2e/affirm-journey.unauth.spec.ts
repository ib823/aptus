/**
 * ABeam Workbench — Affirm external executive journey (PR-3) e2e.
 *
 * Full guest journey against a self-seeded bundle over the pilot streams:
 *   landing → ack → redeem (device pre-verified) → home → stream → process
 *   story → affirm (answer incl. a deviate with reason) → submit → executive
 *   summary → sealed read-only.
 *
 * REQUIREMENTS (kept out of the default suite so CI stays green when off):
 *   - Dev server booted with AFFIRM_EXTERNAL_ENABLED=true.
 *   - Run with AFFIRM_E2E=1.
 * (The runtime flow is also covered by the curl smoke test recorded in
 * docs/affirm-external/BUILD-LOG.md.)
 */

import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashToken, mintRawToken } from "../../src/lib/affirm/external/tokens";
import { hashUserAgent } from "../../src/lib/security/ua-fingerprint";

const RUN = process.env.AFFIRM_E2E === "1";
const UA = "AffirmJourneyE2E/1.0 (Playwright) Chrome/142.0.0.0";
const CLIENT_LABEL = "E2E Journey Co";

const prisma = new PrismaClient();
let bundleId = "";
let token = "";

test.describe("Affirm executive journey (PR-3)", () => {
  test.skip(!RUN, "Set AFFIRM_E2E=1 and boot the server with AFFIRM_EXTERNAL_ENABLED=true");
  test.use({ userAgent: UA });

  test.beforeAll(async () => {
    const items = await prisma.affirmScopeItem.findMany({
      where: { streamId: { in: ["lead-to-cash", "source-to-pay"] } },
      select: { id: true },
    });
    const bundle = await prisma.affirmBundle.create({
      data: { client: CLIENT_LABEL, state: "issued", issuedAt: new Date() },
    });
    bundleId = bundle.id;
    await prisma.affirmBundleScopeItem.createMany({
      data: items.map((i) => ({ bundleId, scopeItemId: i.id })),
      skipDuplicates: true,
    });
    token = mintRawToken();
    await prisma.affirmAccessGrant.create({
      data: {
        bundleId,
        email: "journey.exec@e2e.test",
        displayName: "Journey Exec",
        roleLabel: "COO",
        tokenHash: hashToken(token),
        valueStreamIds: [],
        otpVerifiedUaHashes: [hashUserAgent(UA)],
      },
    });
  });

  test.afterAll(async () => {
    if (bundleId) await prisma.affirmBundle.delete({ where: { id: bundleId } }).catch(() => {});
    await prisma.$disconnect();
  });

  test("landing → home → stream → process → affirm → submit → summary", async ({ page }) => {
    // Landing + ack → home (device pre-verified skips OTP).
    await page.goto(`/a/${token}`);
    await page.getByRole("checkbox", { name: /named recipient/i }).check();
    await page.getByRole("button", { name: /begin/i }).click();
    await expect(page).toHaveURL(/\/a\/home$/);
    await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();

    // Ribbon → the source-to-pay stream (has reviewed stories: J45, 1XF).
    await page.goto("/a/stream/source-to-pay");
    await expect(page.getByText(/see the process/i).first()).toBeVisible();

    // The reviewed process story for J45 renders chapters + the SAP reveal.
    await page.goto("/a/process/J45");
    await expect(page.getByText(/SAP source of truth/i).first()).toBeVisible();
    await page.getByRole("link", { name: /affirm this process/i }).click();
    await expect(page).toHaveURL(/\/a\/affirm\/J45$/);

    // Answer: pick "We do this differently" on the first decision + reason.
    const differ = page.getByRole("radio", { name: /we do this differently/i }).first();
    await differ.click();
    await expect(page.getByText(/usually means extension work/i)).toBeVisible(); // calibrated note
    await page.getByRole("textbox", { name: /reason we differ/i }).first().fill("Custom approval matrix");
    await page.getByRole("textbox", { name: /reason we differ/i }).first().blur();

    // Submit from home.
    await page.goto("/a/home");
    await page.getByRole("button", { name: /submit my answers/i }).click();
    await page.getByRole("button", { name: /submit and seal/i }).click();

    // Executive summary + sealed read-only.
    await expect(page.getByRole("heading", { name: /thank you/i })).toBeVisible();
    await page.goto("/a/affirm/J45");
    await expect(page.getByText(/your answers are sealed/i)).toBeVisible();
  });
});
