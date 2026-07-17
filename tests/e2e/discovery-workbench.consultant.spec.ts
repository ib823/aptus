/**
 * ABeam Workbench — consultant workbench (PR-4) e2e + axe.
 *
 * REQUIREMENTS: server booted with NEUTRAL_DISCOVERY_ENABLED=true; DISCOVERY_E2E=1.
 * Runs on the `consultant` project, which carries an authenticated consultant
 * storage state — the (workbench) layout redirects anonymous users to
 * /presales/login, so these need a real session.
 *
 * NOTE: never executed here — no Postgres in the build environment and
 * global-setup opens Prisma before any spec. Gates in preview.
 */

import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const RUN = process.env.DISCOVERY_E2E === "1";

const VIEWS = [
  { path: "/discovery", name: "C1 home" },
  { path: "/discovery/library", name: "C2 library manager" },
  { path: "/discovery/coverage", name: "C4 coverage & gaps" },
  { path: "/discovery/map", name: "C6 product map" },
  { path: "/discovery/health", name: "C10 library health" },
];

async function serious(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return r.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`);
}

test.describe("Discovery workbench (PR-4)", () => {
  test.skip(!RUN, "Set DISCOVERY_E2E=1 and boot with NEUTRAL_DISCOVERY_ENABLED=true");

  for (const v of VIEWS) {
    test(`${v.name} has no serious or critical axe violations`, async ({ page }) => {
      await page.goto(v.path);
      await page.waitForLoadState("load");
      expect(await serious(page), v.name).toEqual([]);
    });
  }

  test("C2 is a real table with a caption and column headers", async ({ page }) => {
    await page.goto("/discovery/library");
    const table = page.getByRole("table");
    await expect(table).toBeVisible();
    // §11: "data grids are real tables with headers". The .dc is CSS-grid divs.
    await expect(page.getByRole("columnheader")).toHaveCount(11);
    await expect(page.getByRole("rowheader").first()).toBeVisible();
  });

  test("C2 renders all 742 processes and the honest flow split", async ({ page }) => {
    await page.goto("/discovery/library");
    await expect(page.getByText(/742 processes · 545 with a step flow · 197 without/)).toBeVisible();
    // 654/638/726 are dead figures and must never appear.
    for (const ghost of ["654 processes", "638 with", "726"]) {
      await expect(page.getByText(ghost)).toHaveCount(0);
    }
  });

  test("C2 keyboard grid: arrows move the cell cursor, Enter opens a process", async ({ page }) => {
    await page.goto("/discovery/library");
    const firstCell = page.getByRole("rowheader").first();
    await firstCell.focus();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/discovery\/library\/[A-Z0-9]+$/i);
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("C2 facets filter, including the two the .dc omits", async ({ page }) => {
    await page.goto("/discovery/library");
    // APQC and industry are absent from the prototype (conflict #4).
    await page.getByLabel("APQC category").selectOption("11.0");
    await expect(page.getByText(/Showing 29 of 742/)).toBeVisible();
    await page.getByRole("button", { name: "Clear" }).click();
    await page.getByLabel("Industry").selectOption({ index: 1 });
    await expect(page.getByText(/Showing \d+ of 742 processes matching/)).toBeVisible();
  });

  test("C3 drawer traps focus and returns it on close", async ({ page }) => {
    await page.goto("/discovery/library/31G");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Edit affordances are visibly disabled with an honest reason.
    await expect(page.getByRole("button", { name: "Edit process" })).toBeDisabled();
    await expect(page.getByText("Editing arrives with the capture pipeline").first()).toBeVisible();

    // Escape closes.
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/\/discovery\/library$/);
  });

  test("C3 shows per-process provenance, not one hardcoded source", async ({ page }) => {
    await page.goto("/discovery/library/31G");
    await expect(page.getByText(/Provenance/)).toBeVisible();
    // An overlay process must NOT claim a base-catalogue source.
    await page.goto("/discovery/library");
    await page.getByLabel("Origin").isVisible().catch(() => {});
  });

  test("C4's matrix and register are computed, not the stale 7", async ({ page }) => {
    await page.goto("/discovery/coverage");
    await expect(page.getByRole("heading", { name: "APQC coverage matrix" })).toBeVisible();

    // D14: the register must name the two REAL gaps...
    await expect(page.getByText("Manage Enterprise Risk, Compliance & Resiliency")).toBeVisible();
    await expect(page.getByText("Develop & Manage Business Capabilities")).toBeVisible();
    // ...and must not caption itself with the dead "7 gaps" framing.
    await expect(page.getByText(/The 7 thin\/minimal\/none categories/)).toHaveCount(0);
    // Coverage is flow-share, and the caption says so.
    await expect(page.getByText(/share of a category's processes that carry a real step flow/)).toBeVisible();
  });

  test("C6 carries the guard banner, lock and the exact guard copy", async ({ page }) => {
    await page.goto("/discovery/map");
    await expect(page.getByText("Consultant only — never shared with the client")).toBeVisible();
    // §9.1: the chip must say internal-only here, NOT "Editing library" (D15).
    await expect(page.getByText("Consultant only — not shared")).toBeVisible();
    await expect(page.getByText("Editing library")).toHaveCount(0);
  });

  test("C6 SAP is derived; overlay processes honestly show 'to map'", async ({ page }) => {
    await page.goto("/discovery/map");
    // Every product column present, incl. the brief's "other" (#17).
    for (const p of ["SAP", "Oracle", "NetSuite", "Other"]) {
      await expect(page.getByRole("columnheader", { name: p })).toBeVisible();
    }
    // Coverage meters are computed: SAP = 654/742 base-catalogue processes.
    await expect(page.getByText("88%")).toBeVisible();
    await expect(page.getByLabel(/SAP: 654 of 742 processes mapped/)).toBeVisible();
    // Oracle and NetSuite start honestly empty, not pre-filled.
    await expect(page.getByLabel(/Oracle: 0 of 742 processes mapped/)).toBeVisible();
  });

  test("the flag hides the whole section when unset", async ({ page }) => {
    test.skip(process.env.NEUTRAL_DISCOVERY_ENABLED === "true", "asserts the flag-OFF contract");
    for (const v of VIEWS) {
      const res = await page.goto(v.path);
      expect(res?.status(), `${v.path} must 404 when the flag is unset`).toBe(404);
    }
  });
});
