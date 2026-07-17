/**
 * ABeam Workbench — the client↔consultant seam (PR-5) e2e.
 *
 * TWO BROWSERS: a consultant drives the console while a client guest follows in
 * Present mode. This is the spec that proves §8's pairing and §9.4's privacy at
 * the same time — the notes must be absent from the client's network traffic
 * while the consultant is looking at them on the other screen.
 *
 * REQUIREMENTS: server with NEUTRAL_DISCOVERY_ENABLED=true; DISCOVERY_E2E=1; a
 * consultant storage state (the `consultant` project).
 *
 * NOTE: never executed here — no Postgres, and global-setup opens Prisma before
 * any spec. Gates in preview.
 */

import { expect, test, type Browser, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hashToken, mintRawToken } from "../../src/lib/affirm/external/tokens";
import { hashUserAgent } from "../../src/lib/security/ua-fingerprint";

const RUN = process.env.DISCOVERY_E2E === "1";
const UA = "DiscoverySeamE2E/1.0 (Playwright) Chrome/142.0.0.0";
const CLIENT_LABEL = "E2E Seam Co";
const SECRET_NOTE = "PRIVATE-FACILITATOR-NOTE-DO-NOT-LEAK-42";

const prisma = new PrismaClient();
let engagementId = "";
let token = "";
let firstId = "";
let secondId = "";

async function clientLands(browser: Browser): Promise<Page> {
  // A separate context: the client is a different browser in a different room.
  const ctx = await browser.newContext({ userAgent: UA });
  const page = await ctx.newPage();
  await page.goto(`/d/${token}`);
  await page.getByRole("checkbox", { name: /named recipient/i }).check();
  await page.getByRole("button", { name: /^Begin$/ }).click();
  await expect(page).toHaveURL(/\/d\/home$/);
  return page;
}

test.describe("the seam · consultant drives, client follows", () => {
  test.skip(!RUN, "Set DISCOVERY_E2E=1 and boot with NEUTRAL_DISCOVERY_ENABLED=true");

  test.beforeAll(async () => {
    // Scope to Source-to-Pay so the scoping assertions have something to bite on.
    const e = await prisma.discoveryEngagement.create({
      data: {
        client: CLIENT_LABEL,
        state: "issued",
        issuedAt: new Date(),
        valueStreamIds: ["VS2"],
      },
    });
    engagementId = e.id;
    token = mintRawToken();
    await prisma.discoveryAccessGrant.create({
      data: {
        engagementId,
        email: "seam.reviewer@e2e.test",
        displayName: "Seam Reviewer",
        tokenHash: hashToken(token),
        valueStreamIds: [],
        otpVerifiedUaHashes: [hashUserAgent(UA)],
      },
    });
    // Two real Source-to-Pay processes to drive between.
    firstId = "31G";
    secondId = "18J";
  });

  test.afterAll(async () => {
    if (engagementId) {
      await prisma.discoveryEngagement.delete({ where: { id: engagementId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  test("the client's Present view follows the consultant's driving", async ({ page, browser }) => {
    const client = await clientLands(browser);
    await client.keyboard.press("p"); // Present mode
    await client.goto(`/d/process/${firstId}`);

    // Consultant starts projecting and drives to another process.
    await page.goto(`/discovery/sessions/${engagementId}/facilitate`);
    await page.getByRole("button", { name: /Start projecting/ }).click();
    await expect(page.getByText(new RegExp(`LIVE — projecting to ${CLIENT_LABEL}`))).toBeVisible();

    await page.getByLabel("Jump to").fill(secondId);
    await page.getByRole("button", { name: new RegExp(secondId) }).first().click();

    // The room follows. The SSE poll is 3s; allow a human-tolerable margin.
    await expect(client).toHaveURL(new RegExp(`/d/process/${secondId}$`), { timeout: 20_000 });
    await expect(client.getByText("Following the session")).toBeVisible();

    await client.context().close();
  });

  test("a client decision appears in the consultant's tally", async ({ page, browser }) => {
    const client = await clientLands(browser);
    await client.goto(`/d/process/${firstId}`);
    await client.getByRole("radio", { name: /Runs as standard/ }).click();
    await expect(client.getByText("Saved")).toBeVisible();

    await page.goto(`/discovery/sessions/${engagementId}/facilitate`);
    // The console polls every 4s.
    await expect(page.getByText(/1 of \d+ processes decided/)).toBeVisible({ timeout: 20_000 });
    await client.context().close();
  });

  test("PRIVACY: a facilitator note never reaches the client", async ({ page, browser }) => {
    // Consultant writes a private note.
    await page.goto(`/discovery/sessions/${engagementId}/facilitate`);
    await page.getByLabel("Private facilitator note").fill(SECRET_NOTE);
    await page.getByRole("button", { name: "Save note" }).click();
    await expect(page.getByText(SECRET_NOTE)).toBeVisible(); // consultant sees it

    // The client's browser records EVERY response body it receives.
    const client = await clientLands(browser);
    const bodies: string[] = [];
    client.on("response", async (res) => {
      try {
        bodies.push(await res.text());
      } catch {
        // non-text response
      }
    });

    await client.keyboard.press("p");
    await client.goto(`/d/process/${firstId}`);
    await client.goto("/d/home");
    await client.goto("/d/summary");
    await client.goto("/d/export");
    await client.waitForTimeout(6_000); // let the SSE stream deliver a frame

    const leaked = bodies.filter((b) => b.includes(SECRET_NOTE));
    expect(leaked, "the facilitator's note reached the client's browser").toHaveLength(0);

    // And it is not on the client's rendered page either.
    await expect(client.getByText(SECRET_NOTE)).toHaveCount(0);
    await client.context().close();
  });

  test("PRIVACY: the seam payload carries only the driven process", async ({ browser }) => {
    const client = await clientLands(browser);
    const frames: string[] = [];
    client.on("response", async (res) => {
      if (res.url().includes("/d/live")) {
        try {
          frames.push(await res.text());
        } catch {
          /* streamed */
        }
      }
    });
    await client.goto(`/d/process/${firstId}`);
    await client.waitForTimeout(6_000);

    for (const f of frames) {
      expect(f).not.toContain(SECRET_NOTE);
      // No consultant identity, no reason text, no park list.
      expect(f).not.toMatch(/notes|parked|consultant/i);
    }
    await client.context().close();
  });

  test("SCOPE: a scoped session shows only its streams, and says so", async ({ browser }) => {
    const client = await clientLands(browser);

    // Scoped to VS2 only — one stream link, not ten.
    await expect(client.locator('a[href^="/d/stream/"]')).toHaveCount(1);
    // ...and the client is TOLD the review is scoped, so "every stream reviewed"
    // can never read as "your whole business was looked at".
    await expect(client.getByText(/covers 1 of your 10 value streams/)).toBeVisible();

    // An out-of-scope stream is unreachable by URL, not merely unlinked.
    await client.goto("/d/stream/VS7");
    await expect(client).toHaveURL(/\/d\/home$/);
    await client.context().close();
  });

  test("SCOPE: an out-of-scope decision is refused by the server", async ({ browser }) => {
    const client = await clientLands(browser);
    // 1BS is a Lead-to-Cash process — outside the VS2 scope.
    const res = await client.request.post("/d/decisions", {
      data: { processId: "1BS", status: "standard", reason: "", csrf: "x" },
    });
    expect([400, 403]).toContain(res.status());
    await client.context().close();
  });

  test("End session stops projecting but does NOT seal", async ({ page, browser }) => {
    await page.goto(`/discovery/sessions/${engagementId}/facilitate`);
    await page.getByRole("button", { name: /Start projecting/ }).click();
    await page.getByRole("button", { name: /End session/ }).click();
    await expect(page.getByText(/Not projecting/)).toBeVisible();

    // Sealing stays the explicit action it already is — ending a projection is
    // not closing a review.
    const e = await prisma.discoveryEngagement.findUnique({
      where: { id: engagementId },
      select: { state: true, liveAt: true },
    });
    expect(e?.liveAt).toBeNull();
    expect(e?.state).toBe("issued");

    // The client can still decide after the room breaks up.
    const client = await clientLands(browser);
    await client.goto(`/d/process/${firstId}`);
    await expect(client.getByRole("radio", { name: /Runs as standard/ })).toBeEnabled();
    await client.context().close();
  });
});
