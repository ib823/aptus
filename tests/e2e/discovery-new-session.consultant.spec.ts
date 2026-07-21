/**
 * ABeam Workbench — C7 "New session" entry point (PR-5 gap) e2e.
 *
 * REQUIREMENTS: server booted with NEUTRAL_DISCOVERY_ENABLED=true; DISCOVERY_E2E=1.
 * Runs on the `consultant` project, which carries an authenticated consultant
 * storage state — the (workbench) layout redirects anonymous users away.
 *
 * This is the coverage the PR-5 e2e was meant to carry but never ran in CI: the
 * "New session" CTA pointed at /discovery/sessions/new with no route there, so
 * id="new" fell through to [id] and 404'd on a hard nav / 503'd on an RSC
 * prefetch — blocking the entry point to the whole client workflow. These
 * assert the CTA lands on a real setup form, that launching creates a session,
 * and that a bad session id is a clean 404 on BOTH a hard navigation and an
 * RSC prefetch (never a 5xx).
 */

import { expect, test } from "@playwright/test";

const RUN = process.env.DISCOVERY_E2E === "1";

test.describe("Discovery — New session (C7)", () => {
  test.skip(!RUN, "Set DISCOVERY_E2E=1 and boot with NEUTRAL_DISCOVERY_ENABLED=true");

  test("the 'New session' CTA lands on a working setup form", async ({ page }) => {
    await page.goto("/discovery/sessions");
    await page.getByRole("link", { name: "New session" }).click();

    await expect(page).toHaveURL(/\/discovery\/sessions\/new$/);
    // A real form, not a 404: the heading, the client field, the reviewer
    // control and the launch button are all present.
    await expect(page.getByRole("heading", { name: "New session" })).toBeVisible();
    await expect(page.getByLabel("Client")).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Add reviewer" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Launch session/ })).toBeVisible();
  });

  test("launching a named session creates it and lands on its setup page", async ({ page }) => {
    await page.goto("/discovery/sessions/new");
    const client = `E2E Session ${Date.now()}`;
    await page.getByLabel("Client").fill(client);
    await page.getByRole("button", { name: /Launch session/ }).click();

    // With no reviewers, launch redirects straight to the [id] setup page.
    await expect(page).toHaveURL(/\/discovery\/sessions\/[a-z0-9]+$/i);
    await expect(page.getByRole("heading", { name: client })).toBeVisible();
    // And the new session now appears in the list.
    await page.goto("/discovery/sessions");
    await expect(page.getByRole("rowheader", { name: client })).toBeVisible();
  });

  test("a bad session id is a clean 404 — hard nav AND RSC prefetch, never 5xx", async ({ page, request }) => {
    const bad = "/discovery/sessions/does-not-exist-000";

    // Hard navigation: a literal 404 that renders the not-found boundary.
    const hard = await page.goto(bad);
    expect(hard?.status(), "hard navigation status").toBe(404);
    await expect(page.getByRole("heading", { name: "Session not found" })).toBeVisible();

    // RSC prefetch: Next requests the route with the RSC header on link
    // prefetch. For a notFound() route it responds 200 with a not-found flight
    // payload (the client then renders the boundary) — deliberately NOT a
    // literal 404 status. The contract this guards is the reported regression:
    // it was a 503 here, and must never be a 5xx again. The hard navigation
    // above already asserts the user-facing 404.
    const rsc = await request.get(bad, { headers: { RSC: "1" } });
    expect(rsc.status(), "RSC prefetch must never be a 5xx (the 503 regression)").toBeLessThan(500);
  });
});
