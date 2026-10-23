import { createHash, randomBytes } from "node:crypto";

import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Studio · the Query policy card (P1.4), in both themes, with `color-contrast`
 * enabled: the bargain accessibility.coreedge.auth.spec.ts makes for every
 * CoreEdge screen.
 *
 * WHAT IS SCANNED. Each state the card can be in on a real page, reached the
 * way a builder reaches it rather than seeded into place:
 *   - "needs verify": an interface no verify has described for queries;
 *   - "queries off": an interface with a query basis and no policy;
 *   - "queries on": after Enable queries, which the route compiles against
 *     the basis (so the compiled policy is the product's own, not a fixture);
 *   - the editor: the field table, its chips, its reasons and the paging,
 *     lookup and required-filter groups.
 * And, beside axe: every control in the editor has an accessible name, the
 * state is said in words (the chip's text), and Enable queries takes keyboard
 * focus.
 *
 * THE FIXTURE IS ITS OWN, in an organization of its own, removed after: a
 * builder (consultant, so the editing controls render) with a session, a
 * solution, and two READ interfaces on the customer's own API. One carries a
 * query basis, hand-written in the shape a verify writes (odata/basis.ts) for
 * a small order-lines dataset with invented names; nothing here reaches SAP.
 * SERIAL, for the reason the Interfaces scan gives: one fixture, one teardown.
 *
 * Scoped to `main[data-studio-main]`, as the Interfaces scan is.
 */

const QP = {
  organizationId: "e2e-studio-qp-org",
  userEmail: "e2e-studio-query-policy@abeam.test",
  solutionId: "e2e-studio-qp-solution",
  describedId: "e2e-studio-qp-described",
  undescribedId: "e2e-studio-qp-undescribed",
  servicePath: "/sap/opu/odata/sap/ZE2E_QUERY_ORDERS_SRV",
  solutionName: "E2E Query Policy Solution",
  describedName: "Query policy order lines",
  undescribedName: "Query policy not yet verified",
} as const;

/** A query basis in the shape a verify writes it (src/lib/odata/basis.ts QueryBasisV1). */
const BASIS = {
  v: 1,
  snapshot: { id: "e2e-qp-snapshot", semver: "1.0.0", contentHash: "e".repeat(64) },
  entitySet: "OrderLines",
  odata: "V2",
  source: "METADATA",
  set: {},
  keys: ["Order", "Line"],
  properties: [
    { n: "Order", edm: "Edm.String", t: "S", nullable: false, ml: 10, label: "Order" },
    { n: "Line", edm: "Edm.Int32", t: "I32", nullable: false, label: "Line" },
    { n: "Customer", edm: "Edm.String", t: "S", nullable: true, ml: 10, label: "Customer", requiredInFilter: true },
    { n: "Blocked", edm: "Edm.Boolean", t: "B", nullable: true, label: "Blocked" },
    { n: "Note", edm: "Edm.String", t: "S", nullable: true, filterable: false, sortable: false, label: "Note" },
    { n: "Duration", edm: "Edm.Time", t: "OTHER", nullable: true, label: "Duration" },
  ],
};

async function removeFixture(prisma: PrismaClient): Promise<void> {
  await prisma.session.deleteMany({ where: { user: { email: QP.userEmail } } });
  await prisma.configAudit.deleteMany({ where: { organizationId: QP.organizationId } });
  await prisma.interface.deleteMany({ where: { id: { in: [QP.describedId, QP.undescribedId] } } });
  await prisma.solution.deleteMany({ where: { id: QP.solutionId } });
  await prisma.user.deleteMany({ where: { email: QP.userEmail } });
  await prisma.organization.deleteMany({ where: { id: QP.organizationId } });
}

/** Serious and critical only, matching the sibling specs. */
async function scan(page: Page): Promise<string> {
  const results = await new AxeBuilder({ page })
    .include("main[data-studio-main]")
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `[${v.impact}] ${v.id}: ${v.description}\n` + v.nodes.map((n) => `    ${n.target.join(" ")} — ${n.failureSummary ?? ""}`).join("\n"))
    .join("\n");
}

test.describe("Studio · the Query policy card", () => {
  test.describe.configure({ mode: "serial" });

  let prisma: PrismaClient;
  let sessionToken = "";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    await removeFixture(prisma);
    await prisma.organization.create({ data: { id: QP.organizationId, name: "E2E Studio Query Policy Org", type: "partner" } });
    const user = await prisma.user.create({
      data: { email: QP.userEmail, name: "E2E Query Policy Builder", role: "consultant", isActive: true, organizationId: QP.organizationId },
    });
    sessionToken = randomBytes(32).toString("hex");
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(sessionToken).digest("hex"),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ipAddress: "127.0.0.1",
        userAgent: "Playwright E2E (query policy card)",
      },
    });
    await prisma.solution.create({
      data: {
        id: QP.solutionId,
        organizationId: QP.organizationId,
        name: QP.solutionName,
        slug: "e2e-query-policy-solution",
        classification: "CLIENT_APP",
        businessProblem: "Renders the Query policy card for the accessibility scan.",
        dataClass: "internal",
        status: "ACTIVE",
        technicalOwnerId: user.id,
      },
    });
    for (const [id, name, basis] of [
      [QP.describedId, QP.describedName, BASIS],
      [QP.undescribedId, QP.undescribedName, null],
    ] as const) {
      await prisma.interface.create({
        data: {
          id,
          solutionId: QP.solutionId,
          organizationId: QP.organizationId,
          name,
          sapProduct: "s4hana",
          externalId: `custom:${QP.servicePath}`,
          servicePath: QP.servicePath,
          odataVersion: "V2",
          entitySet: "OrderLines",
          operation: "READ",
          mode: "READ",
          status: "DRAFT",
          ...(basis === null ? {} : { queryBasis: basis as unknown as Prisma.InputJsonValue }),
        },
      });
    }
  });

  test.beforeEach(async () => {
    // Every theme starts from "queries off": the previous one enabled them.
    await prisma.interface.updateMany({
      where: { id: QP.describedId, organizationId: QP.organizationId },
      data: { queryPolicy: Prisma.DbNull, queryPolicyCompiled: Prisma.DbNull, queryPolicyRevision: 0 },
    });
  });

  test.afterAll(async () => {
    await removeFixture(prisma);
    await prisma.$disconnect();
  });

  for (const theme of ["light", "dark"] as const) {
    test(`every state of the card has no serious or critical violations in ${theme}`, async ({ page }) => {
      await page.context().addCookies([
        { name: "abeam-session", value: sessionToken, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax" },
      ]);
      if (theme === "dark") {
        // Seeded before navigation, for the reason the design-system scan gives.
        await page.addInitScript(() => {
          window.localStorage.setItem("theme", "dark");
        });
      }
      await page.goto("/studio/interfaces");
      await page.waitForLoadState("load");
      if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
      const main = page.locator("main[data-studio-main]");
      const card = main.locator("section", { has: page.getByRole("heading", { name: /^Query policy/ }) });

      // Needs verify: the interface no verify has described.
      await main.getByRole("button", { name: QP.undescribedName, exact: true }).click();
      await expect(card.getByRole("status", { name: /needs verify/ })).toBeVisible();
      await expect(card.getByRole("link", { name: "Go to Verify" })).toBeVisible();
      expect(await scan(page)).toBe("");

      // Queries off, on the described one.
      await main.getByRole("button", { name: QP.describedName, exact: true }).click();
      await expect(card.getByRole("status", { name: /queries off/ })).toBeVisible();
      const enable = card.getByRole("button", { name: "Enable queries" });
      await enable.focus();
      await expect(enable).toBeFocused();
      expect(await scan(page)).toBe("");

      // Queries on: the route compiled the safe default against the basis.
      await enable.click();
      await expect(card.getByRole("status", { name: /queries on/ })).toBeVisible();
      await expect(card.getByText(/^Compiled against contract 1\.0\.0/)).toBeVisible();
      expect(await scan(page)).toBe("");

      // The editor: every control named, every unavailable one with its reason in words.
      await card.getByRole("button", { name: "Edit" }).click();
      const form = card.getByRole("form", { name: "Edit the query policy" });
      await expect(form).toBeVisible();
      await expect(form.getByText("Not filterable: SAP does not allow filtering on it")).toBeVisible();
      await expect(form.getByText("Not filterable: its type (Edm.Time) cannot be filtered on")).toBeVisible();
      for (const control of await form.locator("input, select, button").all()) {
        const name = await control.evaluate((el) => {
          const labelled = (el as HTMLInputElement).labels?.[0]?.textContent ?? "";
          return (el.getAttribute("aria-label") ?? "") || labelled || el.textContent || "";
        });
        expect(name.trim(), await control.evaluate((el) => el.outerHTML.slice(0, 120))).not.toBe("");
      }
      expect(await scan(page)).toBe("");
    });
  }
});
