import { createHash, randomBytes } from "node:crypto";

import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { PrismaClient } from "@prisma/client";

/**
 * Accessibility — the CoreEdge design system, in both themes.
 *
 * WHY THIS SCAN DIFFERS FROM THE OTHERS IN THIS FOLDER: it does NOT disable the
 * `color-contrast` rule.
 *
 * Every other authenticated scan here carries `.disableRules(["color-contrast"])`
 * with the note "Allow minor contrast issues in initial pass" — a reasonable
 * concession for surfaces whose palette predates any contrast budget. CoreEdge
 * has no such excuse: PR-1 computed every ratio in the token scope against the
 * surface each token actually renders on, and pinned them in
 * `tests/unit/coreedge/token-contrast.test.ts`. Those are arithmetic on declared
 * values; this is the same claim measured on rendered pixels. If the two ever
 * disagree, one of them is wrong about what the page does, and that is worth a
 * failing test rather than a disabled rule.
 *
 * WHY THE DESIGN-SYSTEM PAGE IS THE RIGHT TARGET: it renders every component in
 * every state on one page, derived from the vocabulary rather than listed. So a
 * scan of this one route covers all fourteen components, all eighteen statuses,
 * all six hops and every disabled reason — and keeps covering them when a
 * nineteenth status is added, without anyone adding it here.
 *
 * KNOWN LIMIT, stated so nobody reads more into a green run than it earns: axe
 * measures what it can compute. It cannot judge whether a disabled control's
 * reason is a USEFUL sentence, only that it is associated; the unit tests in
 * `tests/unit/coreedge/design-system.test.tsx` carry that half.
 *
 * THE FILENAME IS LOAD-BEARING. playwright.config.ts selects specs per project
 * by filename suffix — `authenticated` is `testMatch: /.*\.auth\.spec\.ts/`.
 * This file was first written as `accessibility.coreedge.spec.ts`, which matches
 * NO project: listing it in the npm scripts would have added a test that never
 * ran and never said so. The `.auth.` segment is what puts it in the
 * authenticated project, whose storageState signs it in — which this page needs,
 * since the group layout redirects an anonymous caller.
 */

const ROUTE = "/coreedge/design-system";

/** Serious and critical only, matching the convention of the sibling specs. */
async function scan(page: Page, tags: readonly string[]) {
  const results = await new AxeBuilder({ page }).withTags([...tags]).analyze();
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function report(violations: Awaited<ReturnType<typeof scan>>): string {
  return violations
    .map(
      (v) =>
        `[${v.impact}] ${v.id}: ${v.description}\n` +
        v.nodes.map((n) => `    ${n.target.join(" ")} — ${n.failureSummary ?? ""}`).join("\n"),
    )
    .join("\n");
}

test.describe("CoreEdge design system", () => {
  test("has no serious or critical violations in light", async ({ page }) => {
    await page.goto(ROUTE);
    await page.waitForLoadState("load");

    // The page is session-gated; an anonymous run lands on the login screen and
    // would scan the wrong thing, passing for the wrong reason.
    await expect(page.getByRole("heading", { name: "CoreEdge design system" })).toBeVisible();

    const violations = await scan(page, ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
    expect(report(violations)).toBe("");
  });

  test("has no serious or critical violations in dark", async ({ page }) => {
    /*
     * next-themes runs with attribute="class", so dark is `.dark` on <html> and
     * NOTHING sets data-theme anywhere — which is the reachability bug PR-1
     * fixed.
     *
     * WHY THE PREFERENCE IS SEEDED BEFORE NAVIGATION, and not the class added
     * after it. This test first did `classList.add("dark")` on the loaded page.
     * That is a race, and it lost on main at 3daf844: next-themes reads its
     * stored preference during hydration and WRITES the resolved theme onto
     * <html>, so an added class survives only when hydration happens to have
     * finished first. When it had not, the class was replaced by `light` and
     * the assertion saw "… light" — on the first run and both retries. A dark
     * scan that silently measures the light palette is worse than no dark scan,
     * so the fix seeds the same store next-themes reads.
     *
     * The provider takes no `storageKey`, so the default "theme" is the real
     * key; if that ever changes, the assertion below fails loudly rather than
     * letting the scan quietly run against light. `enableSystem` is why
     * emulating prefers-color-scheme is not used instead: it would only take
     * effect when the stored preference is "system", and would silently skip
     * the dark pass on any run where it is not.
     */
    await page.addInitScript(() => {
      window.localStorage.setItem("theme", "dark");
    });

    await page.goto(ROUTE);
    await page.waitForLoadState("load");

    await expect(page.locator("html")).toHaveClass(/dark/);

    const violations = await scan(page, ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
    expect(report(violations)).toBe("");
  });

  test("the token scope is actually applied", async ({ page }) => {
    /*
     * A scan of a page where `.coreedge` never mounted would be a scan of the
     * portal's palette reporting a clean CoreEdge. PR-1 deliberately scoped the
     * tokens under that class rather than at :root, so its presence is what
     * makes every ratio above a claim about CoreEdge at all.
     */
    await page.goto(ROUTE);
    await page.waitForLoadState("load");
    await expect(page.locator(".coreedge").first()).toBeVisible();

    const railFill = await page.evaluate(() => {
      const el = document.querySelector(".coreedge");
      return el === null ? "" : getComputedStyle(el).getPropertyValue("--surface-rail").trim();
    });
    expect(railFill, "--surface-rail is not defined on .coreedge").not.toBe("");
  });
});

/**
 * PR-6 · the seven remaining screens, scanned on the same terms.
 *
 * These are LIST AND DETAIL SCREENS, which is where contrast defects hide: a
 * table's muted secondary line, a disabled control's reason, a status glyph on
 * a tinted ground. PR-1 computed those ratios against declared tokens; this
 * measures the rendered pixels, with `color-contrast` still enabled — the same
 * bargain the design-system scan makes.
 *
 * Each one renders for any signed-in user by contract (role gating never
 * redirects), so the authenticated project reaches all of them. A route that
 * started redirecting on role would fail here by landing somewhere with no
 * heading, which is the point.
 *
 * KNOWN LIMIT, stated so a green run is not read for more than it earns: in CI
 * these render against an empty database, so what is scanned is the chrome,
 * the headings, the legends and the EMPTY states — not populated table rows.
 * The muted secondary lines and status glyphs inside a row are covered by the
 * design-system scan above, which renders every component in every state; they
 * are not covered here. A seeded fixture would close the gap and is not in this
 * PR.
 */
const PR6_ROUTES = [
  { path: "/coreedge/catalogue", heading: "Catalogue" },
  { path: "/coreedge/passport", heading: "Passport" },
  { path: "/coreedge/sap-systems", heading: "SAP systems" },
  { path: "/coreedge/operations/keys", heading: "Keys" },
  // P0.13: the members screen (invite form included) and the first-admin claim.
  { path: "/coreedge/members", heading: "Members" },
  { path: "/coreedge/bootstrap", heading: "Claim this instance" },
] as const;

test.describe("CoreEdge · the PR-6 screens", () => {
  for (const route of PR6_ROUTES) {
    test(`${route.path} has no serious or critical violations`, async ({ page }) => {
      await page.goto(route.path);
      await page.waitForLoadState("load");

      // Session-gated like every /coreedge route: an anonymous run would land
      // on the login screen and scan the wrong thing, passing for the wrong
      // reason. Assert the heading before believing the result.
      await expect(page.getByRole("heading", { name: route.heading })).toBeVisible();

      const violations = await scan(page, ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);
      expect(report(violations)).toBe("");
    });
  }
});

/**
 * P2.12 · time to first call, in both themes.
 *
 * The CoreEdge board's tiles are covered by the design-system scan above:
 * that page renders them, computed from sample milestones, so every figure,
 * target and verdict chip is on it in both themes. (The seeded E2E users have
 * no organization, so /coreedge/operations would render its "not attached"
 * branch and scan no tile.)
 *
 * Control Tower's screen is scanned here, SCOPED TO THE PAGE'S OWN CONTENT
 * (`main[data-studio-main]`). The Studio shell around it fails color-contrast
 * in dark today on every Control Tower screen, /control-tower/usage included:
 * in `.dark` the rail's --brand-navy becomes a light blue (#8bbcef) under
 * white text, 1.99:1, and the top bar's tenant chip is 1.66:1. That is the
 * shell's defect, not this screen's, and it is tracked separately; a
 * whole-page scan here would fail on it whatever this screen renders.
 */
const JOURNEY_ROUTE = "/control-tower/journey";

test.describe("Control Tower · time to first call", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`${JOURNEY_ROUTE} has no serious or critical violations in ${theme}`, async ({ page }) => {
      if (theme === "dark") {
        // Seeded before navigation, for the reason the design-system scan gives.
        await page.addInitScript(() => {
          window.localStorage.setItem("theme", "dark");
        });
      }
      await page.goto(JOURNEY_ROUTE);
      await page.waitForLoadState("load");
      await expect(page.getByRole("heading", { name: "Time to first real call" })).toBeVisible();
      if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);

      const results = await new AxeBuilder({ page })
        .include("main[data-studio-main]")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const violations = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
      expect(report(violations)).toBe("");
    });
  }
});

/**
 * Studio · Interfaces, POPULATED, in both themes.
 *
 * This screen's contrast defects lived only in the populated state: the
 * selected row's secondary line (4.44:1 in light), the disabled Mapping card
 * (drawn at opacity 0.55: 2.11:1 to 3.71:1 in light, 2.51:1 in dark), and in
 * dark the selected row itself, which kept the light --brand-navy-soft under
 * light text (1.05:1) because the .dark block never redefined it. An empty
 * Interfaces screen renders none of them, so a scan of one passes for the
 * wrong reason.
 *
 * So the spec seeds the populated state for ITSELF, in an organization of its
 * own: the organization, a user (admin, so the authoring controls render and
 * are scanned too) with a session, a solution, an interface on the customer's
 * own API (the "· own API" secondary line the defect was reported on), and an
 * active, declared SapConnection (so the Verify panel renders its target).
 * Nothing is added to the shared E2E organization, so no parallel spec meets a
 * row it did not expect, and afterAll removes every row created here.
 *
 * SERIAL, because the fixture is created once and removed once: under
 * fullyParallel two workers would each seed, and one worker's teardown could
 * delete the rows the other is still scanning.
 *
 * Scoped to `main[data-studio-main]` for the reason the Control Tower scan
 * above gives: the Studio shell's dark-mode defects are tracked separately,
 * and a whole-page scan would report them whatever this screen renders.
 */
const IFC = {
  organizationId: "e2e-studio-ifc-org",
  userEmail: "e2e-studio-interfaces@abeam.test",
  solutionId: "e2e-studio-ifc-solution",
  interfaceId: "e2e-studio-ifc-interface",
  connectionId: "e2e-studio-ifc-connection",
  servicePath: "/sap/opu/odata/sap/ZE2E_CONTRAST_SRV",
  interfaceName: "Contrast check orders",
  solutionName: "E2E Contrast Solution",
} as const;

async function removeInterfacesFixture(prisma: PrismaClient): Promise<void> {
  await prisma.session.deleteMany({ where: { user: { email: IFC.userEmail } } });
  await prisma.interface.deleteMany({ where: { id: IFC.interfaceId } });
  await prisma.solution.deleteMany({ where: { id: IFC.solutionId } });
  await prisma.sapConnection.deleteMany({ where: { id: IFC.connectionId } });
  await prisma.user.deleteMany({ where: { email: IFC.userEmail } });
  await prisma.organization.deleteMany({ where: { id: IFC.organizationId } });
}

test.describe("Studio · Interfaces with a seeded interface", () => {
  test.describe.configure({ mode: "serial" });

  let prisma: PrismaClient;
  let sessionToken = "";

  test.beforeAll(async () => {
    prisma = new PrismaClient();
    // Idempotent: a run that died before afterAll leaves nothing behind that
    // makes this one pass or fail for the wrong reason.
    await removeInterfacesFixture(prisma);

    await prisma.organization.create({
      data: { id: IFC.organizationId, name: "E2E Studio Interfaces Org", type: "partner" },
    });
    const user = await prisma.user.create({
      data: {
        email: IFC.userEmail,
        name: "E2E Studio Interfaces",
        role: "admin",
        isActive: true,
        organizationId: IFC.organizationId,
      },
    });
    sessionToken = randomBytes(32).toString("hex");
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: createHash("sha256").update(sessionToken).digest("hex"),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        ipAddress: "127.0.0.1",
        userAgent: "Playwright E2E (studio interfaces)",
      },
    });
    await prisma.solution.create({
      data: {
        id: IFC.solutionId,
        organizationId: IFC.organizationId,
        name: IFC.solutionName,
        slug: "e2e-contrast-solution",
        classification: "CLIENT_APP",
        businessProblem: "Renders the populated Interfaces screen for the contrast scan.",
        dataClass: "internal",
        status: "ACTIVE",
      },
    });
    await prisma.interface.create({
      data: {
        id: IFC.interfaceId,
        solutionId: IFC.solutionId,
        organizationId: IFC.organizationId,
        name: IFC.interfaceName,
        sapProduct: "s4hana",
        externalId: `custom:${IFC.servicePath}`,
        servicePath: IFC.servicePath,
        odataVersion: "V2",
        operation: "READ",
        mode: "READ",
        status: "DRAFT",
      },
    });
    await prisma.sapConnection.create({
      data: {
        id: IFC.connectionId,
        organizationId: IFC.organizationId,
        product: "s4hana",
        key: "e2e-studio-ifc",
        label: "E2E Studio Interfaces Dev",
        baseUrl: "https://sap.invalid",
        authType: "basic",
        // Never decrypted: the page reads connection METADATA only.
        secretsCiphertext: "e2e-not-a-real-ciphertext",
        environment: "DEV",
        isActive: true,
      },
    });
  });

  test.afterAll(async () => {
    await removeInterfacesFixture(prisma);
    await prisma.$disconnect();
  });

  for (const theme of ["light", "dark"] as const) {
    test(`/studio/interfaces has no serious or critical violations in ${theme}`, async ({ page }) => {
      // Signs in as the fixture's own user. Same cookie name, domain and path
      // as the project's storageState, so this replaces the shared admin's.
      await page.context().addCookies([
        {
          name: "abeam-session",
          value: sessionToken,
          domain: "localhost",
          path: "/",
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);
      if (theme === "dark") {
        // Seeded before navigation, for the reason the design-system scan gives.
        await page.addInitScript(() => {
          window.localStorage.setItem("theme", "dark");
        });
      }

      await page.goto("/studio/interfaces");
      await page.waitForLoadState("load");

      // The populated state, not the empty one: the row, the selected detail
      // and the Mapping card are what the scan is for. If any is missing, the
      // scan would pass on a page that never rendered the defect.
      const main = page.locator("main[data-studio-main]");
      await expect(main.getByRole("heading", { name: "Interfaces", exact: true })).toBeVisible();
      await expect(main.getByText(`${IFC.solutionName} · own API`)).toBeVisible();
      await expect(main.getByRole("heading", { name: /^Mapping/ })).toBeVisible();
      if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);

      const results = await new AxeBuilder({ page })
        .include("main[data-studio-main]")
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const violations = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
      expect(report(violations)).toBe("");
    });
  }
});
