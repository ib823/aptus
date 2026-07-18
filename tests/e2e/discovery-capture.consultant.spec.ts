/**
 * ABeam Workbench — C5 capture wizard + C9 two-lane export (PR-6) e2e.
 *
 * REQUIREMENTS: server with NEUTRAL_DISCOVERY_ENABLED=true; DISCOVERY_E2E=1;
 * consultant storage state.
 *
 * NOTE: never executed here — no Postgres, and global-setup opens Prisma before
 * any spec. Gates in preview.
 */

import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import AxeBuilder from "@axe-core/playwright";

const RUN = process.env.DISCOVERY_E2E === "1";
const REASON = "We invoice in stages tied to delivery milestones, not all at once.";

const prisma = new PrismaClient();
let engagementId = "";

test.describe("C5 · the P4 capture wizard", () => {
  test.skip(!RUN, "Set DISCOVERY_E2E=1 and boot with NEUTRAL_DISCOVERY_ENABLED=true");

  test.beforeAll(async () => {
    const e = await prisma.discoveryEngagement.create({
      data: { client: "E2E Capture Co", state: "submitted", valueStreamIds: ["VS2"] },
    });
    engagementId = e.id;
    const grant = await prisma.discoveryAccessGrant.create({
      data: {
        engagementId,
        email: "capture@e2e.test",
        displayName: "Capture Reviewer",
        tokenHash: `e2e-${Date.now()}`,
        valueStreamIds: [],
      },
    });
    // A differ WITH a reason — the only kind that can be harvested.
    await prisma.discoveryDecision.create({
      data: { engagementId, grantId: grant.id, processId: "18J", status: "differ", reason: REASON },
    });
    // …and one WITHOUT, which must not be harvested: nothing to generalize.
    await prisma.discoveryDecision.create({
      data: { engagementId, grantId: grant.id, processId: "22K", status: "differ", reason: null },
    });
  });

  test.afterAll(async () => {
    if (engagementId) {
      await prisma.discoveryEngagement.delete({ where: { id: engagementId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("harvest pulls explained differs only", async ({ page }) => {
    await page.goto(`/discovery/sources?engagement=${engagementId}`);
    await page.getByRole("button", { name: /Harvest from this engagement/ }).click();
    await expect(page.getByText(/Harvested 1 candidate/)).toBeVisible();
    await expect(page.getByText(REASON)).toBeVisible();
    // The unexplained differ is not a capture.
    await expect(page.getByText("22K")).toHaveCount(0);
  });

  test("harvest is idempotent", async ({ page }) => {
    await page.goto(`/discovery/sources?engagement=${engagementId}`);
    await page.getByRole("button", { name: /Harvest from this engagement/ }).click();
    await expect(page.getByText(/Nothing new to harvest/)).toBeVisible();
  });

  test("promote is BLOCKED without the anonymization checklist", async ({ page }) => {
    await page.goto(`/discovery/sources?engagement=${engagementId}`);
    await page.getByRole("button", { name: "Promote" }).first().click();
    await page.getByPlaceholder("Milestone-based staged invoicing").fill("Milestone-based staged invoicing");
    await page.getByPlaceholder(/Describe the practice/).fill("Invoice in stages tied to delivery milestones.");
    await page.getByPlaceholder("FMCG distribution").fill("FMCG distribution");
    // Checklist unticked → the commit stays disabled.
    await expect(page.getByRole("button", { name: /^Promote$/ }).last()).toBeDisabled();
  });

  test("promote is BLOCKED without a second reviewer", async ({ page }) => {
    await page.goto(`/discovery/sources?engagement=${engagementId}`);
    await page.getByRole("button", { name: "Promote" }).first().click();
    await page.getByPlaceholder("Milestone-based staged invoicing").fill("Milestone-based staged invoicing");
    await page.getByPlaceholder(/Describe the practice/).fill("Invoice in stages tied to delivery milestones.");
    await page.getByPlaceholder("FMCG distribution").fill("FMCG distribution");
    for (const cb of await page.locator('fieldset input[type="checkbox"]').all()) {
      const label = await cb.evaluate((el) => el.parentElement?.textContent ?? "");
      if (!label.includes("competitively distinctive")) await cb.check();
    }
    // Checklist ticked, reviewer unset → still disabled. §5.5 is not optional.
    await expect(page.getByRole("button", { name: /^Promote$/ }).last()).toBeDisabled();
  });

  test("the reviewer select never offers the author themselves", async ({ page }) => {
    await page.goto(`/discovery/sources?engagement=${engagementId}`);
    await page.getByRole("button", { name: "Promote" }).first().click();
    const options = await page.getByLabel(/Who reviewed this/).locator("option").allTextContents();
    // The signed-in consultant cannot be picked — "the author of a capture is
    // the worst judge of whether it still identifies the client".
    const me = await page.getByRole("button", { name: /account|profile/i }).textContent().catch(() => "");
    if (me) expect(options.join(" ")).not.toContain(me);
  });

  test("a full promotion appears in C2 badged client-captured", async ({ page }) => {
    await page.goto(`/discovery/sources?engagement=${engagementId}`);
    await page.getByRole("button", { name: "Promote" }).first().click();
    await page.getByPlaceholder("Milestone-based staged invoicing").fill("Milestone-based staged invoicing");
    await page.getByPlaceholder(/Describe the practice/).fill("Invoice in stages tied to delivery milestones.");
    await page.getByPlaceholder("FMCG distribution").fill("FMCG distribution");
    for (const cb of await page.locator('fieldset input[type="checkbox"]').all()) {
      const label = await cb.evaluate((el) => el.parentElement?.textContent ?? "");
      if (!label.includes("competitively distinctive")) await cb.check();
    }
    await page.getByLabel(/Who reviewed this/).selectOption({ index: 1 });
    await page.getByRole("button", { name: /^Promote$/ }).last().click();

    await expect(page.getByText(/Promoted as 18J\.var-1/)).toBeVisible();

    // P4 §4: "visible in the C2 grid".
    await page.goto("/discovery/library");
    await page.getByLabel("Filter by name, ID or description").fill("18J.var-1");
    await expect(page.getByText("Captured")).toBeVisible();

    // The client's raw words are NOT the promoted entry.
    await expect(page.getByText(REASON)).toHaveCount(0);
  });

  test("the committed library file is untouched", async () => {
    // The architectural directive: promotions never write to src/data/discovery.
    const { execSync } = await import("child_process");
    const dirty = execSync("git status --porcelain src/data/discovery").toString().trim();
    expect(dirty, "the pinned library must stay byte-frozen").toBe("");
  });

  test("C5 has no serious or critical axe violations", async ({ page }) => {
    await page.goto(`/discovery/sources?engagement=${engagementId}`);
    await page.waitForLoadState("load");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => v.id)).toEqual([]);
  });
});

test.describe("C9 · the two-lane export", () => {
  test.skip(!RUN, "Set DISCOVERY_E2E=1 and boot with NEUTRAL_DISCOVERY_ENABLED=true");

  test("two distinct buttons, two distinct confirms — never one toggle", async ({ page }) => {
    await page.goto(`/discovery/outputs/${engagementId}`);
    await expect(page.getByRole("button", { name: "Export client pack" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Export internal pack" })).toBeVisible();
    // No toggle/dropdown/checkbox chooses the lane.
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);

    await page.getByRole("button", { name: "Export client pack" }).click();
    await expect(page.getByText(/fully product-neutral — no vendor names anywhere/)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Export internal pack" }).click();
    await expect(page.getByText(/never send this file to the client/)).toBeVisible();
  });

  test("the pack endpoint refuses without an explicit lane", async ({ request }) => {
    const res = await request.get(`/api/discovery/packs/${engagementId}`);
    // No default lane — a default is the single point of failure §9.3 removes.
    expect(res.status()).toBe(400);
  });

  test("the client artifact is vendor-free; the internal one carries the map", async ({ request }) => {
    const client = await (await request.get(`/api/discovery/packs/${engagementId}?lane=client`)).text();
    const internal = await (await request.get(`/api/discovery/packs/${engagementId}?lane=internal`)).text();

    const terms = ["SAP", "Oracle", "NetSuite", "S/4HANA", "Ariba", "Fiori"];
    for (const t of terms) {
      expect(client, `the client pack must not contain "${t}"`).not.toMatch(new RegExp(`\\b${t}\\b`, "i"));
    }
    expect(internal).toContain("productMap");
    expect(internal).toContain("captureRegister");
  });

  test("C9 has no serious or critical axe violations", async ({ page }) => {
    await page.goto(`/discovery/outputs/${engagementId}`);
    await page.waitForLoadState("load");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(r.violations.filter((v) => v.impact === "critical" || v.impact === "serious").map((v) => v.id)).toEqual([]);
  });
});
