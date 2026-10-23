/**
 * P1.2 — Discover's "On this tenant" tab and the catalogue's Ask Basis panel,
 * as the builder sees them (acceptance A1 and A3, end to end).
 *
 * NO LAB, NO SAP CALL FOR THE LISTING. The listing is seeded straight into
 * TenantServiceListing from the synthetic lab-shape fixture
 * (tests/fixtures/tenant-discovery/catalogservice-v2.lab-shape.json), through
 * the same parser, path rule and classifier the live listing uses, for the
 * e2e organisation's own connection (global-setup.ts, key e2e-dev). The tab
 * opens on the stored listing, so the page reads only the database. The live
 * listing against a real Gateway is proved on the lab later (P1.8), with the
 * recording that replaces the fixture (docs/runbooks/coreedge-tenant-discovery.md).
 *
 * THE ASK BASIS CASE seeds its own content release, one scenario and one
 * catalogue row, because the e2e database is `prisma db push` with no seed.
 * The connection's host is sap.invalid, so the detail's live probe cannot
 * answer: the service is not shown as activated, and the panel is the call to
 * action it is on a tenant where nobody has set the scenario up.
 *
 * Runs on the `consultant` project (the builder persona), which the smoke
 * suite never touches: CI runs it in its own step (pnpm test:e2e:discover-tenant).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

import {
  classifyService,
  listedService,
  parseServiceCollectionPage,
  servicePathFromEntry,
  sourceIdOf,
  type ListingEntry,
} from "../../src/lib/sap-public/tenant-discovery";

const prisma = new PrismaClient();

/** global-setup.ts seeds these. */
const ORG = "e2e-test-org";
const CONNECTION_ID = "e2e-coreedge-connection";
const TENANT_KEY = "e2e-dev";

/** The fixture's host stands for the connection's own (its `_synthetic` note). */
const FIXTURE_HOST = { baseUrl: "https://lab.example.invalid" };
const FIXTURE = readFileSync(path.resolve(__dirname, "../fixtures/tenant-discovery/catalogservice-v2.lab-shape.json"), "utf8");

/** Ask Basis: a release of its own, so cleaning up touches nothing else. */
const LOCALISATION = "E2E-P12";
const SUPPLIER_INVOICE = "API_SUPPLIERINVOICE_PROCESS_SRV";

function fixtureEntries(): ListingEntry[] {
  const page = parseServiceCollectionPage(FIXTURE);
  if (!page) throw new Error("[discover-tenant e2e] the fixture did not parse");
  // Published as the catalogue would say: the one Hub row the fixture lists.
  const index = { published: new Set(["API_BUSINESS_PARTNER_0001"]), inScenarioTable: new Set<string>() };
  return page.entries.map((raw) => {
    const e = listedService(raw, servicePathFromEntry(raw, FIXTURE_HOST));
    return {
      id: e.id,
      technicalName: e.technicalName,
      version: e.version,
      odataVersion: e.odataVersion,
      path: e.path,
      title: e.title,
      class: classifyService(e, index),
      catalogueExternalId: sourceIdOf(e) === "API_BUSINESS_PARTNER_0001" ? "API_BUSINESS_PARTNER" : null,
      scenarioIds: [],
    };
  });
}

/** Serious and critical WCAG 2.1 AA violations inside one region, as accessibility.coreedge.auth.spec.ts scans. */
async function violationsIn(page: Page, selector: string): Promise<string> {
  const results = await new AxeBuilder({ page }).include(selector).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `[${v.impact}] ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)
    .join("\n");
}

test.describe("Discover · On this tenant (P1.2)", () => {
  let createdHubRow = false;

  test.beforeAll(async () => {
    const consultant = await prisma.user.findUnique({ where: { email: "e2e-consultant@abeam.test" }, select: { id: true } });
    const connection = await prisma.sapConnection.findUnique({ where: { id: CONNECTION_ID }, select: { revision: true } });
    if (!consultant || !connection) throw new Error("[discover-tenant e2e] global-setup did not seed the consultant or the connection");
    const entries = fixtureEntries();
    const listing = {
      connectionRevision: connection.revision,
      product: "s4hana",
      listedAt: new Date(),
      listedById: consultant.id,
      correlationId: "e2e-tenant-listing",
      catalogueStatus: "OK",
      v4Status: "NOT_TRIED",
      entryCount: entries.length,
      truncated: false,
      entries: entries as unknown as object,
    };
    await prisma.tenantServiceListing.upsert({
      where: { organizationId_connectionId: { organizationId: ORG, connectionId: CONNECTION_ID } },
      update: listing,
      create: { organizationId: ORG, connectionId: CONNECTION_ID, ...listing },
    });

    // Ask Basis: SAP's table lists the supplier invoice service under SAP_COM_0057.
    const release = await prisma.sapContentRelease.upsert({
      where: { release_localisation: { release: "2608", localisation: LOCALISATION } },
      update: {},
      create: { release: "2608", localisation: LOCALISATION },
    });
    await prisma.sapCommScenario.upsert({
      where: { releaseId_commScenarioId: { releaseId: release.id, commScenarioId: "SAP_COM_0057" } },
      update: {},
      create: {
        releaseId: release.id,
        commScenarioId: "SAP_COM_0057",
        name: "Supplier Invoice Integration",
        direction: "Inbound",
        apiIds: [`${SUPPLIER_INVOICE}_0001`, "API_SUPPLIERINVOICE_PROCESS_SRV_0002"],
      },
    });
    const existing = await prisma.sapHubContent.findUnique({
      where: { contentType_externalId: { contentType: "API", externalId: SUPPLIER_INVOICE } },
      select: { id: true },
    });
    if (!existing) {
      await prisma.sapHubContent.create({
        data: {
          contentType: "API",
          externalId: SUPPLIER_INVOICE,
          title: "Supplier Invoice",
          description: "Seeded by the P1.2 Discover e2e.",
          status: "Released",
          hubUrl: `https://api.sap.com/api/${SUPPLIER_INVOICE}`,
          apiType: "ODATAV2",
          appliesToPublic: true,
        },
      });
      createdHubRow = true;
    }
  });

  test.afterAll(async () => {
    await prisma.tenantServiceListing.deleteMany({ where: { organizationId: ORG, connectionId: CONNECTION_ID } });
    await prisma.sapContentRelease.deleteMany({ where: { localisation: LOCALISATION } });
    if (createdHubRow) {
      await prisma.sapHubContent.deleteMany({ where: { contentType: "API", externalId: SUPPLIER_INVOICE } });
    }
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page, baseURL }) => {
    // The switcher's remembered tenant: the e2e organisation's own connection.
    await page.context().addCookies([{ name: "studio-tenant", value: TENANT_KEY, url: baseURL ?? "http://localhost:3003" }]);
  });

  test("lists the tenant's customer-built services with their badge, and Register opens pre-filled", async ({ page }) => {
    await page.goto("/studio/discover");
    await page.getByRole("tab", { name: "On this tenant" }).click();

    const customer = page.getByRole("region", { name: "Customer-built" });
    await expect(customer).toBeVisible();
    await expect(customer.getByText("ZUI_TRAVEL_O2", { exact: true })).toBeVisible();
    await expect(customer.getByText("Developer (Z*, Y*)").first()).toBeVisible();
    await expect(customer.getByText("Key user (YY1_)")).toBeVisible();
    // A cross-origin address is not stored as a path: no Register for it.
    await expect(customer.getByRole("button", { name: "Register Z_BONUS_PLAN" })).toHaveCount(0);
    // No listed URL is ever a link: the tab carries none at all.
    await expect(page.getByRole("tabpanel", { name: "On this tenant" }).locator("a")).toHaveCount(0);

    await customer.getByRole("button", { name: "Register ZUI_TRAVEL_O2" }).click();
    const dialog = page.getByRole("dialog", { name: "Register your own API" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Service path")).toHaveValue("/sap/opu/odata/sap/ZUI_TRAVEL_O2");
  });

  test("keeps SAP's unpublished services apart, with §1.2 and no action", async ({ page }) => {
    await page.goto("/studio/discover");
    await page.getByRole("tab", { name: "On this tenant" }).click();
    const other = page.getByText(/Other SAP services, not Published APIs/);
    await expect(other).toBeVisible();
    await other.click();
    await expect(page.getByText(/SAP API Policy §1\.2/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Register C_PURCHASEORDER_FS_SRV" })).toHaveCount(0);
  });

  for (const theme of ["light", "dark"] as const) {
    test(`the tab and the upload dialog have no serious or critical violations in ${theme}`, async ({ page }) => {
      if (theme === "dark") {
        await page.addInitScript(() => {
          window.localStorage.setItem("theme", "dark");
        });
      }
      await page.goto("/studio/discover");
      if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
      await page.getByRole("tab", { name: "On this tenant" }).click();
      await expect(page.getByRole("region", { name: "Customer-built" })).toBeVisible();
      await page.getByText(/Other SAP services, not Published APIs/).click();
      expect(await violationsIn(page, "[role=tabpanel]:not([hidden])")).toBe("");

      await page.getByRole("tab", { name: "From a file" }).click();
      await page.getByRole("button", { name: "Upload a description" }).click();
      await expect(page.getByRole("dialog", { name: "Register from a description file" })).toBeVisible();
      expect(await violationsIn(page, "[role=dialog]")).toBe("");
    });
  }

  test("the catalogue detail of a service not activated here says which scenario to ask Basis for", async ({ page }) => {
    await page.goto("/studio/discover");
    await page.getByRole("button", { name: new RegExp(SUPPLIER_INVOICE) }).first().click();
    const panel = page.getByTestId("ask-basis");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("Ask Basis for SAP_COM_0057");
    await expect(panel.getByRole("button", { name: "Copy a request to Basis for SAP_COM_0057" })).toBeVisible();
  });
});
