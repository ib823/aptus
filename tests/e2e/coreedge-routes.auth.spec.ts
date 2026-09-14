import { test, expect } from "@playwright/test";

/**
 * Every /coreedge route returns 200 for a signed-in user WITH an organization.
 *
 * THE BUG THIS EXISTS FOR. DecisionBar spread an onClick onto a host <button>
 * without "use client". React cannot serialize a function onto a host element
 * from a Server Component, so five routes returned HTTP 500 in production:
 * sap-systems, sap-systems/:id, requests/:id, apps/:app/settings and
 * apps/:app/add-feed. Nothing in CI went red.
 *
 * WHY NOT — and why this file asserts a STATUS CODE rather than a heading:
 *
 *   1. /coreedge/design-system renders DecisionBar from a client component, so
 *      the reference page exercised the exact broken component and could not
 *      fail.
 *   2. Unit tests render in jsdom, which never performs RSC serialization. A
 *      mount test cannot see this class of bug and never will.
 *   3. accessibility.coreedge.auth.spec.ts DOES visit /coreedge/sap-systems as
 *      an authenticated user and asserts its heading — and passed throughout,
 *      because every seeded user had organizationId = NULL. The page took its
 *      "not attached to an organization" early return, which renders the same
 *      heading and no DecisionBar. Coverage that reads the right title off the
 *      wrong page.
 *
 * So: the fixture now gives users an organization (global-setup.ts), and this
 * asserts the HTTP status of the document response. A 500 cannot hide behind a
 * heading assertion.
 */

/** Deterministic ids from seedCoreEdgeFixture in tests/e2e/global-setup.ts. */
const APP = "e2e-coreedge-app";
const FEED = "e2e-coreedge-interface";
const CONNECTION = "e2e-coreedge-connection";
const REQUEST = "e2e-coreedge-grant";

const ROUTES: readonly string[] = [
  "/coreedge",
  "/coreedge/catalogue",
  "/coreedge/requests",
  `/coreedge/requests/${REQUEST}`,
  "/coreedge/operations",
  "/coreedge/operations/keys",
  "/coreedge/sap-systems",
  `/coreedge/sap-systems/${CONNECTION}`,
  "/coreedge/passport",
  "/coreedge/design-system",
  `/coreedge/apps/${APP}`,
  `/coreedge/apps/${APP}/${FEED}/DEV`,
  `/coreedge/apps/${APP}/add-feed`,
  `/coreedge/apps/${APP}/add-feed?feed=${FEED}`,
  `/coreedge/apps/${APP}/settings`,
];

test.describe("CoreEdge · every route renders", () => {
  for (const route of ROUTES) {
    test(`${route} returns 200`, async ({ page }) => {
      const response = await page.goto(route);

      expect(response, `no response for ${route}`).not.toBeNull();
      expect(
        response?.status(),
        `${route} did not return 200. A 500 here is usually a Server Component ` +
          `rendering something only a Client Component may render — an event ` +
          `handler on a host element is the one that has bitten this repo.`,
      ).toBe(200);

      /*
       * Session-gated, so an unauthenticated run would land on the sign-in page
       * — which is itself a 200 and would pass the assertion above for entirely
       * the wrong reason. The rail only renders inside the console.
       *
       * `.first()` because the count is not one everywhere, and both cases are
       * correct. CoreEdgeShell renders the rail twice — a sidebar and a tab bar
       * — and at this viewport the tab bar is `sm:hidden`, so `display: none`
       * keeps it out of the accessibility tree and exactly one matches. But
       * /coreedge/design-system uses no shell at all: it is a showcase, and it
       * renders BOTH Rail variants as visible demos. Asserting a count of one
       * would fail there for being a design system, which is not a defect.
       * Presence is what this assertion is for.
       */
      await expect(
        page.getByRole("navigation", { name: "CoreEdge" }).first(),
      ).toBeAttached();

      /*
       * And the organization must be attached, or we are reading the early
       * return again: the exact hollow-coverage failure this file exists to
       * prevent. Assert the page is NOT the "no organization" branch.
       */
      await expect(
        page.getByText(/not attached to an organization/i),
      ).toHaveCount(0);
    });
  }
});
