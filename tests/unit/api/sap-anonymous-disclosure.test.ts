/**
 * AN ANONYMOUS CALLER GETS SAP'S PUBLISHED CATALOGUE — NEVER A TENANT.
 *
 * WHAT WAS WRONG, found by an unauthenticated curl during a browser-agent audit
 * of the deployed build.
 *
 *   1. GET /api/sap/tdd/hub-content answered anyone on the internet with HTTP
 *      200 and a body containing `tenant: "Customizing X5M/100"`, `tenantKey`,
 *      per-row probe `status`, `dataConfirmed`, `capability`, `probed` and
 *      `lastProbedAt`. Titles and descriptions are SAP-published and genuinely
 *      public; WHICH SERVICES ARE LIVE ON A NAMED CUSTOMER SYSTEM is not.
 *
 *   2. GET /api/sap/tdd/capabilities was worse. It returned the tenant label,
 *      exposed/notActivated counts and a per-entity CRUD map — AND ran
 *      `probeTenantCapabilities` before responding, so every anonymous request
 *      ISSUED LIVE OData CALLS to that tenant. Its header claimed "Guarded
 *      exactly like the other SAP read routes"; it was not guarded at all.
 *
 *   3. hub-content's `?dataProbe=1` overlay is also a live tenant read and
 *      took no guard, so an AUTHENTICATED role with no Studio entitlement could
 *      cause one with a query parameter.
 *
 * WHY THE FLAG IS NOT THE ANSWER. `PUBLIC_ACCESS` is explicitly enabled here and
 * means "this catalogue may be browsed without an account" — probe-guard.ts
 * says so in those words. Browsing is fine. The defect was carrying
 * tenant-derived facts across that line, and reaching a live SAP system from
 * behind it. That same file records an EARLIER incident where this flag made a
 * guard unreachable, and concludes "the rule now has no exception". It had one.
 *
 * These are source-shape assertions, not HTTP tests: the disclosure depended on
 * deployment env (PUBLIC_ACCESS + a configured tenant) that a unit test does not
 * have, so a request-level test would pass for the wrong reason — the most
 * dangerous kind of green.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** Comments explain these rules; scanning them would test the prose, not the code. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** Every SAP read route that touches a configured tenant. */
const TENANT_ROUTES = [
  "src/app/api/sap/tdd/capabilities/route.ts",
  "src/app/api/sap/tdd/entities/route.ts",
  "src/app/api/sap/tdd/operations/route.ts",
  "src/app/api/sap/tdd/preview/route.ts",
];

describe("every route that probes a tenant uses the guard", () => {
  it.each(TENANT_ROUTES)("%s calls refuseUnlessMayProbeTenant", (file) => {
    expect(code(read(file))).toMatch(/refuseUnlessMayProbeTenant\s*\(/);
  });

  it("capabilities does NOT gate on PUBLIC_ACCESS — that flag is enabled here", () => {
    /*
     * The precise failure: `if (!isSapTddPublicAccessEnabled(prefix) && !user)`
     * reads like an auth check and is one only while the flag is off. It is on,
     * so `!user` was never evaluated and the route was open to everyone.
     */
    expect(code(read("src/app/api/sap/tdd/capabilities/route.ts"))).not.toMatch(/isSapTddPublicAccessEnabled/);
  });

  it("the live overlay on hub-content is guarded too", () => {
    // Loading the catalogue is browsing; ?dataProbe=1 opens a connection to a
    // real SAP system. Different acts, different entitlement.
    const src = code(read("src/app/api/sap/tdd/hub-content/route.ts"));
    expect(src).toMatch(/dataProbe[\s\S]{0,400}refuseUnlessMayProbeTenant\s*\(/);
  });
});

describe("hub-content resolves no tenant without a session", () => {
  const src = code(read("src/app/api/sap/tdd/hub-content/route.ts"));

  it("tenantKey is gated on `user`", () => {
    /*
     * Enforced by NOT RESOLVING A TENANT rather than by redacting fields on the
     * way out. With tenantKey null nothing reads the stored probes, the live
     * overlay cannot fire, and resolveHubStatus falls back to each row's own
     * nature. A redaction pass would leave the probe running and sit one
     * forgotten field away from leaking again.
     */
    expect(src).toMatch(/const\s+tenantKey\s*=\s*user\s*\?/);
  });

  it("still reads the catalogue itself — browsing is the point of PUBLIC_ACCESS", () => {
    // The fix must not turn anonymous access off; that was the other option and
    // it would have removed a deliberate capability. The published-catalogue
    // read is now product-scoped through hubCatalogueScope (edition column /
    // product tag) rather than a hardcoded appliesToPublic filter — the
    // anonymous/tenant boundary is unchanged.
    expect(src).toMatch(/isSapTddPublicAccessEnabled/);
    expect(src).toMatch(/hubCatalogueScope\(product\)/);
  });
});

describe("the guard itself still refuses the two cases that matter", () => {
  const src = code(read("src/lib/sap-public/probe-guard.ts"));

  it("401 for no session", () => {
    expect(src).toMatch(/if\s*\(\s*!user\s*\)/);
    expect(src).toMatch(/status:\s*401/);
  });

  it("403 for a session with no Studio entitlement", () => {
    // A read nobody is accountable for is the case this exists to prevent, and
    // an authenticated viewer is still not an accountable reader of a tenant.
    expect(src).toMatch(/canAccessStudio/);
    expect(src).toMatch(/status:\s*403/);
  });

  it("PUBLIC_ACCESS grants no exemption anywhere in the guard", () => {
    expect(src).not.toMatch(/isSapTddPublicAccessEnabled/);
  });
});
