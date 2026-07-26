/**
 * Discover is genuinely tenant-specific. Everything else in Studio is not.
 *
 * The page's own heading claims to show "what this tenant actually exposes", and
 * probe results are stored per tenant key in SapHubContent.rawMetadataJson.probes
 * — so a mismatch is not cosmetic. Discover previously hardcoded
 * product="s4hana" and sent no tenant at all, which meant it reported the
 * deployment's FIRST configured tenant's probe results under whatever tenant name
 * the switcher happened to be showing. Two tenants, one set of badges, no way to
 * tell which you were looking at.
 *
 * The routes always accepted `tenant` (hub-content reads it, probe-all takes it
 * in the body and writes results under that key). Only the client never sent it.
 *
 * THE OTHER PAGES ARE NOT TENANT-SCOPED, and that is a schema fact, not an
 * omission: Solution keys on organizationId, Interface on organizationId +
 * sapProduct, ApiAccessGrant on a free-text environment. None reference a tenant.
 * Filtering them by tenant would invent a relationship the data model does not
 * have. So the switcher says where it applies instead.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");

/** Line comments before block comments — see home-tenant-honesty.test.ts. */
function code(src: string): string {
  return src
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
}

const DISCOVER_PAGE = "src/app/(studio)/studio/discover/page.tsx";
const DISCOVER_CLIENT = "src/components/studio/DiscoverClient.tsx";
const CATALOGUE = "src/components/sap/SapCapabilityCatalogue.tsx";
const TOPBAR = "src/components/studio/StudioTopBar.tsx";

describe("Discover resolves and forwards the selected tenant", () => {
  it("the page resolves the active tenant like Test Console does", () => {
    const src = code(read(DISCOVER_PAGE));
    expect(src).toMatch(/resolveStudioTenants\s*\(/);
    expect(src).toMatch(/pickActiveTenant\s*\(/);
  });

  it("the page no longer hardcodes the product", () => {
    // product="s4hana" was passed regardless of which tenant was selected, so a
    // SuccessFactors tenant would have been catalogued as S/4HANA.
    const src = code(read(DISCOVER_CLIENT));
    expect(src).not.toMatch(/product="s4hana"/);
    expect(src).toContain("product={product}");
  });

  it("DiscoverClient takes the tenant and passes it down", () => {
    const src = code(read(DISCOVER_CLIENT));
    expect(src).toMatch(/tenant:\s*string\s*\|\s*null/);
    expect(src).toMatch(/tenant\s*\?\s*\{\s*tenant\s*\}/);
  });

  it("the catalogue sends the tenant when it has one", () => {
    const src = code(read(CATALOGUE));
    expect(src).toMatch(/sp\.set\("tenant"/);
  });

  it("probe-all writes against the tenant on screen", () => {
    // probe-all stores results under the tenant key it is given. Omitting it
    // wrote the default tenant's results while the page named another — the
    // quiet version of this bug, since the badges still looked plausible.
    const src = code(read(CATALOGUE));
    const body = src.match(/PROBE ALL SAP SERVICES[^}]*\}/)?.[0] ?? "";
    expect(body, "probe-all body must carry the tenant").toContain("tenant");
  });

  it("keeps the tenant optional so /sap-explorer is unchanged", () => {
    // The existing SAP Operations surface passes no tenant and must keep falling
    // back to the first configured one, exactly as before.
    const src = code(read(CATALOGUE));
    expect(src).toMatch(/tenant\?:\s*string/);
    expect(src).toMatch(/if\s*\(tenant\)\s*sp\.set/);
  });

  it("re-fetches when the tenant changes", () => {
    // Without `tenant` in the dependency array the catalogue would keep showing
    // the previous tenant's rows after a switch — the bug wearing a disguise.
    const src = code(read(CATALOGUE));
    const deps = src.match(/\}, \[product, tenant,[^\]]*\]\)/);
    expect(deps, "the loader must depend on tenant").not.toBeNull();
  });
});

describe("the switcher states where it applies", () => {
  it("names the tenant-scoped surfaces and disclaims the rest", () => {
    // A control that appears to govern seven pages while governing two is a lie
    // told by omission, even when every page behind it is individually correct.
    const src = read(TOPBAR);
    expect(src).toContain("Discover and Test Console");
    expect(src).toMatch(/scoped to your organization/);
  });
});

describe("org-scoped pages are left alone, deliberately", () => {
  const schema = read("prisma/schema.prisma");

  function modelBody(name: string): string {
    const m = schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`));
    return m?.[0] ?? "";
  }

  it("no Studio governance model references a tenant", () => {
    // The justification for NOT filtering Solutions/Interfaces/grants by tenant.
    // If a tenant field is ever added to one of these, this test fails and the
    // decision gets revisited on purpose rather than forgotten.
    for (const model of ["Solution", "Interface", "ApiAccessGrant"]) {
      const body = modelBody(model);
      expect(body, `${model} not found in schema`).not.toBe("");
      expect(
        /\n\s*(tenantKey|tenantId|sapConnectionId)\s/.test(body),
        `${model} gained a tenant reference — revisit whether its page should filter by tenant`,
      ).toBe(false);
    }
  });

  it("those pages still do not filter by tenant", () => {
    for (const page of [
      "src/app/(studio)/studio/solutions/page.tsx",
      "src/app/(studio)/studio/interfaces/page.tsx",
      "src/app/(studio)/studio/access/page.tsx",
    ]) {
      expect(code(read(page)), `${page} filters by tenant without a tenant field`).not.toMatch(
        /pickActiveTenant\s*\(/,
      );
    }
  });
});
