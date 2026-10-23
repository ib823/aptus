import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility — Authenticated Pages", () => {
  test("assessments page should have no critical accessibility violations", async ({ page }) => {
    await page.goto("/assessments");
    await page.waitForLoadState("load");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .disableRules(["color-contrast"]) // Allow minor contrast issues in initial pass
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

    if (critical.length > 0) {
      const summary = critical.map(
        (v) => `[${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} nodes)`,
      );
      console.error("Accessibility violations:", summary.join("\n"));
    }

    expect(critical).toHaveLength(0);
  });

  test("dashboard page should have no critical accessibility violations", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForLoadState("load");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

    expect(critical).toHaveLength(0);
  });

  test("new assessment page should have no critical accessibility violations", async ({ page }) => {
    await page.goto("/assessments/new");
    await page.waitForLoadState("load");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .disableRules(["color-contrast"])
      .analyze();

    const critical = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

    expect(critical).toHaveLength(0);
  });
});

/**
 * SAP Operations' write panel AFTER A WRITE, at desktop width and on a phone,
 * in both themes. A created record's answer is the whole entity, which runs
 * past the result box's 360px (712px of answer), so the box scrolls and failed
 * scrollable-region-focusable: a keyboard user could not read the rest. The
 * write panel's own calls are stood in for (no tenant in E2E); the page's other
 * panels get the server's own answers. Scoped to the panel.
 */
const CREATED_ENTITY = {
  __metadata: { uri: "https://my000001-api.s4hana.cloud.sap/sap/opu/odata/sap/CPD_SRV/ProjectSet('P-000123')", type: "CPD_SRV.Project" },
  ProjectID: "P-000123",
  ProjectName: "Commercial project created from the workbench",
  ProjectStage: "P001",
  ProjectCategory: "C",
  CustomerID: "17100001",
  CostCenter: "17101101",
  ProfitCenter: "YB101",
  ProjectCurrency: "USD",
  OrgID: "1710",
  StartDate: "/Date(1729641600000)/",
  EndDate: "/Date(1761177600000)/",
  ProjManagerExtId: "CB9980000123",
  ProjAccountantExtId: "CB9980000124",
  ProjControllerExtId: "CB9980000125",
  ConfidentialityLevel: "0",
  RestrictedStaffingFlag: false,
  ProjectDescription: "A free-text description of the length a real one has, a line or two wider than the box.",
  WorkPackageSet: { __deferred: { uri: "https://my000001-api.s4hana.cloud.sap/sap/opu/odata/sap/CPD_SRV/ProjectSet('P-000123')/WorkPackageSet" } },
};

test.describe("Accessibility — SAP Operations write result", () => {
  for (const viewport of [{ name: "desktop", width: 1280, height: 800 }, { name: "390px", width: 390, height: 844 }]) {
    for (const theme of ["light", "dark"] as const) {
      test(`the write result has no serious or critical violations at ${viewport.name} in ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        if (theme === "dark") {
          await page.addInitScript(() => {
            window.localStorage.setItem("theme", "dark");
          });
        }
        await page.route("**/api/sap/tdd/**", (route) => {
          const url = new URL(route.request().url());
          const json = (body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
          if (url.pathname.endsWith("/catalog")) {
            return json({
              data: {
                products: [{ key: "s4hana", label: "S/4HANA Cloud", description: "TDD", protocol: "odata", configured: true }],
                tenants: [{ key: "s4-development", label: "S/4HANA TDD (development)" }],
                services: [{ key: "commercial-projects", label: "Commercial Projects", scenario: "Commercial project management", domain: "Projects" }],
              },
            });
          }
          if (url.pathname.endsWith("/write") && route.request().method() === "GET") return json({ data: { enabled: true, writeSecretRequired: false } });
          if (url.pathname.endsWith("/write")) {
            return json({ data: { ok: true, status: 201, durationMs: 412, location: CREATED_ENTITY.__metadata.uri, body: { d: CREATED_ENTITY } } });
          }
          if (url.pathname.endsWith("/entities")) return json({ data: { entitySets: [{ name: "ProjectSet", entityType: "Project" }], probes: [] } });
          return route.continue();
        });
        await page.goto("/sap-explorer");
        await page.waitForLoadState("load");
        const panel = page.locator("[data-sap-write-panel]");
        await expect(panel.getByText("Live write.")).toBeVisible();
        await panel.getByPlaceholder("WRITE TO SAP TDD").fill("WRITE TO SAP TDD");
        await panel.getByRole("button", { name: "Create record" }).click();
        const result = panel.getByRole("region", { name: "Write result" });
        await expect(result).toBeVisible();
        if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
        // The case this guards: the box really scrolls.
        expect(await result.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);

        const results = await new AxeBuilder({ page })
          .include("[data-sap-write-panel]")
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        const serious = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
        expect(
          serious
            .map((v) => `[${v.impact}] ${v.id}: ${v.description}\n${v.nodes.map((n) => `    ${n.target.join(" ")}`).join("\n")}`)
            .join("\n"),
        ).toBe("");
      });
    }
  }
});
