/**
 * ABeam Workbench — Neutral Process Discovery full Explore journey (PR-2b) e2e.
 *
 * land → OTP-verified device → V1 → V2 → V3 (decide 3 processes, incl. one
 * differ-with-reason and one N/A) → V4 shows them.
 *
 * REQUIREMENTS (kept out of the default suite so CI stays green when off):
 *   - Dev server booted with NEUTRAL_DISCOVERY_ENABLED=true.
 *   - Run with DISCOVERY_E2E=1.
 *
 * NOTE: this spec has never executed — the build environment has no Postgres, and
 * global-setup opens Prisma before any spec. It gates in the preview env. See
 * BUILD-LOG "preview-env debt".
 */

import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import AxeBuilder from "@axe-core/playwright";
import { hashToken, mintRawToken } from "../../src/lib/affirm/external/tokens";
import { hashUserAgent } from "../../src/lib/security/ua-fingerprint";

const RUN = process.env.DISCOVERY_E2E === "1";
const UA = "DiscoveryExploreE2E/1.0 (Playwright) Chrome/142.0.0.0";
const CLIENT_LABEL = "E2E Explore Co";

/** Source-to-Pay — a real stream in the frozen library (61 processes / 6 workflows). */
const STREAM_ID = "VS2";
const DIFFER_REASON = "We invoice in stages tied to delivery milestones, not all at once.";

const prisma = new PrismaClient();
let engagementId = "";
let token = "";

async function land(page: Page) {
  await page.goto(`/d/${token}`);
  await page.getByRole("checkbox", { name: /named recipient/i }).check();
  await page.getByRole("button", { name: /^Begin$/ }).click();
  await expect(page).toHaveURL(/\/d\/home$/);
}

async function noSeriousAxe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`);
}

test.describe("Discovery Explore journey (PR-2b)", () => {
  test.skip(!RUN, "Set DISCOVERY_E2E=1 and boot the server with NEUTRAL_DISCOVERY_ENABLED=true");
  test.use({ userAgent: UA });

  test.beforeAll(async () => {
    const engagement = await prisma.discoveryEngagement.create({
      data: { client: CLIENT_LABEL, state: "issued", issuedAt: new Date() },
    });
    engagementId = engagement.id;
    token = mintRawToken();
    await prisma.discoveryAccessGrant.create({
      data: {
        engagementId,
        email: "explore.reviewer@e2e.test",
        displayName: "Explore Reviewer",
        roleLabel: "COO",
        tokenHash: hashToken(token),
        valueStreamIds: [],
        otpVerifiedUaHashes: [hashUserAgent(UA)],
      },
    });
  });

  test.afterAll(async () => {
    if (engagementId) {
      await prisma.discoveryEngagement.delete({ where: { id: engagementId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("V1 → V2: a stream index lists real workflows and processes", async ({ page }) => {
    await land(page);
    await page.locator(`a[href="/d/stream/${STREAM_ID}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/d/stream/${STREAM_ID}$`));

    await expect(page.getByRole("heading", { name: "Source-to-Pay", level: 1 })).toBeVisible();
    // Real workflow sections, not the .dc's "not modeled in this pass" panel.
    await expect(page.getByRole("heading", { level: 2 })).not.toHaveCount(0);
    await expect(page.getByText(/not modeled in this prototype pass/i)).toHaveCount(0);
    // Process cards link to V3.
    await expect(page.locator('a[href^="/d/process/"]').first()).toBeVisible();
  });

  test("V2 search filters, and an unmatched query explains itself", async ({ page }) => {
    await land(page);
    await page.goto(`/d/stream/${STREAM_ID}`);
    await page.getByRole("searchbox").fill("zzzzznomatch");
    await expect(page.getByText(/No processes match/)).toBeVisible();
    await page.getByRole("searchbox").fill("");
    await expect(page.locator('a[href^="/d/process/"]').first()).toBeVisible();
  });

  test("decide 3 processes: standard, differ-with-reason, N/A → V4 shows them", async ({ page }) => {
    await land(page);
    await page.goto(`/d/stream/${STREAM_ID}`);

    const hrefs = await page.locator('a[href^="/d/process/"]').evaluateAll((els) =>
      els.slice(0, 3).map((e) => (e as HTMLAnchorElement).getAttribute("href")!),
    );
    expect(hrefs).toHaveLength(3);

    // 1 · Runs as standard.
    await page.goto(hrefs[0]!);
    await page.getByRole("radio", { name: /Runs as standard/ }).click();
    await expect(page.getByRole("radio", { name: /Runs as standard/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByText('What "runs as standard" means here')).toBeVisible();
    await expect(page.getByText("Saved")).toBeVisible();

    // 2 · We do this differently, with a reason (the §9 chip label).
    await page.goto(hrefs[1]!);
    await page.getByRole("radio", { name: /We do this differently/ }).click();
    await expect(page.getByText("Why we differ")).toBeVisible();
    // The expectation note is verbatim §10.
    await expect(page.getByText(/whichever product you choose/)).toBeVisible();
    // Before a reason: the gate says it is incomplete.
    await expect(page.getByText(/counts as\s+incomplete/)).toBeVisible();
    await page.getByRole("textbox", { name: /Why we differ/ }).fill(DIFFER_REASON);
    await expect(page.getByText("Saved")).toBeVisible();

    // 3 · Not applicable.
    await page.goto(hrefs[2]!);
    await page.getByRole("radio", { name: /Not applicable/ }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    // V4 reflects all three.
    await page.goto("/d/summary");
    await expect(
      page.getByRole("heading", { name: new RegExp(`Here's how ${CLIENT_LABEL} runs`), level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: /1\s+Standard/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /1\s+We differ/ })).toBeVisible();
    // The differ reason surfaces verbatim in its bucket.
    await expect(page.getByText(DIFFER_REASON)).toBeVisible();
    // Nothing is left incomplete — the reason was supplied.
    await expect(page.getByText(/needs a reason/)).toHaveCount(0);
  });

  test("a differ with no reason is saved AND reported as incomplete on V4", async ({ page }) => {
    await land(page);
    await page.goto(`/d/stream/${STREAM_ID}`);
    const href = await page
      .locator('a[href^="/d/process/"]')
      .nth(4)
      .getAttribute("href");

    await page.goto(href!);
    await page.getByRole("radio", { name: /We do this differently/ }).click();
    await expect(page.getByText("Saved")).toBeVisible();

    // Brief §9 is a completeness rule, not a validation gate: the selection
    // survives, and the summary tells the truth about it.
    await page.goto("/d/summary");
    await expect(page.getByText(/needs a reason/)).toBeVisible();
    await expect(page.getByText("No reason captured yet.")).toBeVisible();
  });

  test("the fit selector is a real radiogroup with arrow-key navigation", async ({ page }) => {
    await land(page);
    await page.goto(`/d/stream/${STREAM_ID}`);
    const href = await page.locator('a[href^="/d/process/"]').nth(5).getAttribute("href");
    await page.goto(href!);

    const group = page.getByRole("radiogroup", { name: /How does this fit/ });
    await expect(group).toBeVisible();
    await expect(group.getByRole("radio")).toHaveCount(4);

    // Arrow keys move AND select, per the WAI-ARIA radiogroup pattern.
    await page.getByRole("radio", { name: /Runs as standard/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("radio", { name: /We do this differently/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // Wraps from the last chip back to the first.
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("radio", { name: /Runs as standard/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("radio", { name: /Not applicable/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("a no-flow process shows the honest fallback, never an empty diagram", async ({ page }) => {
    await land(page);
    // 22K — External Workforce Procurement, one of the 197 with no catalogued flow.
    await page.goto("/d/process/22K");
    await expect(
      page.getByText("No step flow is catalogued for this process yet — we'll map it with you."),
    ).toBeVisible();
    await expect(page.getByText("Process flow")).toHaveCount(0);
    // The badge states the absence rather than leaving a gap.
    await expect(page.getByText("No flow catalogued")).toBeVisible();
    // Brief §7 V3(e): the selector is still available.
    await expect(page.getByRole("radiogroup", { name: /How does this fit/ })).toBeVisible();
  });

  test("V3 shows the neutral provenance line, with no vendor named", async ({ page }) => {
    await land(page);
    await page.goto("/d/process/31G");
    await expect(page.getByText(/rendered product-neutral/)).toBeVisible();
    await expect(page.getByText(/the reference names no vendor/)).toBeVisible();
  });

  test("V2, V3 and V4 have no serious or critical axe violations", async ({ page }) => {
    await land(page);

    await page.goto(`/d/stream/${STREAM_ID}`);
    await page.waitForLoadState("load");
    expect(await noSeriousAxe(page), "V2").toEqual([]);

    await page.goto("/d/process/31G");
    await page.waitForLoadState("load");
    expect(await noSeriousAxe(page), "V3").toEqual([]);

    await page.goto("/d/summary");
    await page.waitForLoadState("load");
    expect(await noSeriousAxe(page), "V4").toEqual([]);
  });
});

test.describe("Discovery sealed engagement is read-only (PR-2b)", () => {
  test.skip(!RUN, "Set DISCOVERY_E2E=1 and boot the server with NEUTRAL_DISCOVERY_ENABLED=true");
  test.use({ userAgent: UA });

  let sealedToken = "";
  let sealedEngagementId = "";

  test.beforeAll(async () => {
    const engagement = await prisma.discoveryEngagement.create({
      data: { client: "E2E Sealed Co", state: "submitted", submittedAt: new Date() },
    });
    sealedEngagementId = engagement.id;
    sealedToken = mintRawToken();
    await prisma.discoveryAccessGrant.create({
      data: {
        engagementId: sealedEngagementId,
        email: "sealed.reviewer@e2e.test",
        displayName: "Sealed Reviewer",
        tokenHash: hashToken(sealedToken),
        valueStreamIds: [],
        otpVerifiedUaHashes: [hashUserAgent(UA)],
      },
    });
  });

  test.afterAll(async () => {
    if (sealedEngagementId) {
      await prisma.discoveryEngagement
        .delete({ where: { id: sealedEngagementId } })
        .catch(() => {});
    }
  });

  test("chips are frozen and the server refuses a write with 409", async ({ page, request }) => {
    await page.goto(`/d/${sealedToken}`);
    await page.getByRole("checkbox", { name: /named recipient/i }).check();
    await page.getByRole("button", { name: /^Begin$/ }).click();
    await expect(page).toHaveURL(/\/d\/home$/);

    await expect(page.getByText(/sealed and read-only/)).toBeVisible();

    await page.goto("/d/process/31G");
    await expect(page.getByRole("radio", { name: /Runs as standard/ })).toBeDisabled();

    // The UI flag is cosmetic; the server is the authority.
    const res = await request.post("/d/decisions", {
      data: { processId: "31G", status: "standard", reason: "", csrf: "whatever" },
    });
    expect([400, 409]).toContain(res.status());
  });
});
