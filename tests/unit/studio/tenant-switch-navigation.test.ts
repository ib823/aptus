/**
 * Switching tenant is a NAVIGATION, not a click handler.
 *
 * THE DEFECT. The switcher wrote `document.cookie` in the browser and called
 * `router.refresh()`. A user reported the selection simply never changing — they
 * clicked "Development X5M/080" and the tick stayed on "Customizing X5M/100".
 *
 * That design chains three fragile client behaviours, and every one of them is
 * consistent with what they saw:
 *   1. the `document.cookie` write must succeed,
 *   2. the click must land after hydration — an agent testing this product
 *      separately reported clicks that issue zero network requests,
 *   3. `router.refresh()` must re-read the cookie rather than serve a cached
 *      segment.
 * Three candidate causes, indistinguishable from outside the browser.
 *
 * THE SERVER WAS NEVER AT FAULT, and that was established before changing
 * anything: requesting /studio/discover with the cookie set by hand rendered the
 * other tenant, and the RSC payloads differed. So the cookie contract worked and
 * only the path to setting it did not.
 *
 * A link cannot half-work. No hydration to wait for, no silent write failure, no
 * stale segment — and it works with JavaScript disabled, which the old one did
 * not. This test pins the shape so nobody restores the handler for tidiness.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { stripSource } from "../../helpers/source";

// COMMENTS STRIPPED. Both files explain the defect they replaced, and those
// explanations name `document.cookie` and `router.refresh` — so a scan over raw
// text fails on its own documentation. The assertion is about what the code
// DOES, and prose is not code.
const BAR = stripSource(readFileSync(
  resolve(__dirname, "../../../src/components/studio/StudioTopBar.tsx"),
  "utf8",
), "comments");
const ROUTE = stripSource(readFileSync(
  resolve(__dirname, "../../../src/app/api/studio/tenant/route.ts"),
  "utf8",
), "comments");

describe("the tenant switcher navigates", () => {
  it("renders each tenant as a link to the switch route", () => {
    expect(BAR).toContain("/api/studio/tenant?key=");
    expect(BAR).toContain("next=");
  });

  it("no longer writes the cookie from the browser", () => {
    expect(
      BAR,
      "a client-side cookie write is one of the three failure modes this " +
        "replaced — the server sets it now",
    ).not.toContain("document.cookie");
  });

  it("does not depend on router.refresh to pick the change up", () => {
    expect(BAR).not.toContain("router.refresh");
  });
});

describe("the switch route refuses what it should", () => {
  it("validates the key against the caller's OWN authorized tenants", () => {
    // A cookie is a view preference only for as long as nothing trusts it. This
    // refuses a key that is not the caller's, and the layouts still run their
    // own pickActiveTenant check — two refusals for one decision, because the
    // cost of being wrong is another organization's SAP system.
    expect(ROUTE).toContain("resolveStudioTenants");
    expect(ROUTE).toMatch(/allowed\.some\(/);
  });

  it("refuses a protocol-relative next, which would be an open redirect", () => {
    // `//evil.example` is a valid URL to a browser. On a console holding SAP
    // credentials that is not a theoretical concern.
    expect(ROUTE).toContain('startsWith("//")');
  });

  it("only accepts a relative next", () => {
    expect(ROUTE).toContain('startsWith("/")');
  });

  it("sets the cookie server-side, scoped to the whole console", () => {
    expect(ROUTE).toMatch(/cookies\.set\(\s*STUDIO_TENANT_COOKIE/);
    expect(ROUTE).toContain('path: "/"');
  });
});
