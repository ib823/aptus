/**
 * P1.2 — register an interface from a description file, as the builder does
 * it (acceptance A2, end to end): Discover, "From a file", upload the YY1
 * golden description, pick its dataset, and the DRAFT appears in Interfaces
 * with "contract 1.0.0 (from file, not verified)". The dialog takes the
 * keyboard as a modal dialog must (focus in, Tab kept inside, Escape out,
 * focus back to its trigger).
 *
 * NO SAP SYSTEM IS CONTACTED. The upload is compiled in the contract worker
 * (P1.3's envelope) and stored; the integration test
 * (tests/integration/contract-upload.test.ts) proves no console or platform
 * audit row is written. This spec proves the screens around it.
 *
 * Runs on the `consultant` project (the builder persona) against the e2e
 * organisation's solution (global-setup.ts). The interface it creates is
 * named per run and removed afterwards. Only some e2e targets run in CI
 * (see discover-responsive.auth.spec.ts), so this one has its own step with
 * the tenant spec (pnpm test:e2e:discover-tenant).
 */
import path from "node:path";

import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ORG = "e2e-test-org";
const NAME = `Sales bonus from file (e2e ${Date.now().toString(36)})`;
const FILE = path.resolve(__dirname, "../fixtures/contracts/edmx/yy1-sales-bonus.v2.xml");

test.describe("Discover · From a file (P1.2)", () => {
  test.afterAll(async () => {
    const created = await prisma.interface.findMany({ where: { organizationId: ORG, name: NAME }, select: { id: true } });
    const ids = created.map((i) => i.id);
    if (ids.length > 0) {
      await prisma.contractSnapshot.deleteMany({ where: { interfaceId: { in: ids } } });
      await prisma.interface.deleteMany({ where: { id: { in: ids } } });
    }
    await prisma.$disconnect();
  });

  test("the dialog takes the keyboard: focus moves in, Tab stays inside, Escape closes it and returns focus", async ({ page }) => {
    await page.goto("/studio/discover");
    await page.getByRole("tab", { name: "From a file" }).click();
    const trigger = page.getByRole("button", { name: "Upload a description" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "Register from a description file" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Register from a description file" })).toBeFocused();
    // Past the last control and back before the first, focus stays in the dialog.
    for (let i = 0; i < 20; i++) await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    for (let i = 0; i < 20; i++) await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("an uploaded description becomes a DRAFT with its contract, not verified", async ({ page }) => {
    await page.goto("/studio/discover");
    await page.getByRole("tab", { name: "From a file" }).click();
    await page.getByRole("button", { name: "Upload a description" }).click();

    const dialog = page.getByRole("dialog", { name: "Register from a description file" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Description file").setInputFiles(FILE);
    // The picker is filled from the file, in the browser.
    await expect(dialog.getByText("1 dataset found in the file.")).toBeVisible();
    await expect(dialog.getByLabel("Entity set (dataset)")).toHaveValue("YY1_SALESBONUS");

    await dialog.getByLabel("Name").fill(NAME);
    await dialog.getByLabel("SAP product").selectOption("s4hana");
    await dialog.getByLabel("Your own service path").check();
    // Exact: "Your own service path" (the radio above) also contains the words.
    await dialog.getByLabel("Service path", { exact: true }).fill("/sap/opu/odata/sap/YY1_SALESBONUS_CDS");
    await dialog.getByRole("button", { name: "Create draft" }).click();

    await expect(dialog.getByRole("status")).toContainText("DRAFT created, contract 1.0.0 from your file, not verified on any tenant.", {
      timeout: 30_000,
    });

    await page.goto("/studio/interfaces");
    await page.getByRole("button", { name: NAME }).click();
    await expect(page.getByText("1.0.0 (from file, not verified)")).toBeVisible();
    await expect(page.getByText("draft", { exact: true }).first()).toBeVisible();
  });
});
