/**
 * ABeam Workbench — Neutral Process Discovery flag-off check.
 *
 * The deploy plan merges PR-1..6 to main with NEUTRAL_DISCOVERY_ENABLED UNSET,
 * and step 1 is "Verify /d/anything 404s in prod after each deploy". This is
 * that verification, automated.
 *
 * It runs in the DEFAULT suite on purpose — unlike the journey spec, which needs
 * the flag on. The default dev server boots without the flag, so "everything
 * under /d is 404" is the state CI should be holding us to continuously. If
 * someone ships a /d route that forgets its flag check, this fails.
 */

import { expect, test } from "@playwright/test";

// Every /d entry point. A new route added without a flag check should be added
// here too — and if it is not, the catch-all below still covers the shape.
const DISCOVERY_PATHS = [
  "/d/home",
  "/d/verify",
  "/d/expired",
  "/d/ended",
  "/d/anything",
  "/d/0123456789abcdef0123456789abcdef",
];

test.describe("discovery routes are invisible when the flag is unset", () => {
  test.skip(
    process.env.NEUTRAL_DISCOVERY_ENABLED === "true",
    "This asserts the flag-OFF contract; skip when the server booted with it on.",
  );

  for (const path of DISCOVERY_PATHS) {
    test(`${path} → 404`, async ({ page }) => {
      const res = await page.goto(path);
      expect(res?.status(), `${path} must 404 when the flag is unset`).toBe(404);
    });
  }

  test("POST /d/[token]/redeem → 404", async ({ request }) => {
    const res = await request.post("/d/0123456789abcdef0123456789abcdef/redeem", {
      form: { csrf: "x", acknowledge_legal: "1" },
    });
    expect(res.status()).toBe(404);
  });

  test("POST /d/verify/submit → 404", async ({ request }) => {
    const res = await request.post("/d/verify/submit", { form: { csrf: "x", otp: "123456" } });
    expect(res.status()).toBe(404);
  });

  test("POST /d/verify/resend → 404", async ({ request }) => {
    const res = await request.post("/d/verify/resend", { form: { csrf: "x" } });
    expect(res.status()).toBe(404);
  });
});
