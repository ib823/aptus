/**
 * Discover's business-domain lens, and the lazy-read contract.
 *
 * THE LENS BUG THIS PINS: line-of-business is persisted on `packageId` (written
 * by resolveLineOfBusiness at seed time, and what the grouped list is grouped
 * by). `rawMetadataJson.raw.domain` is a DIFFERENT field carrying SAP's own
 * vocabulary ("AI"). A lens that filtered LoB names through the `domain` facet
 * would silently return nothing — the feature would look built and be useless.
 * These tests keep the two facets attached to the right fields.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");

const hubRoute = read("src/app/api/sap/tdd/hub-content/route.ts");
const catalogue = read("src/components/sap/SapCapabilityCatalogue.tsx");
const discoverClient = read("src/components/studio/DiscoverClient.tsx");
const discoverPage = read("src/app/(studio)/studio/discover/page.tsx");

describe("the lob facet filters the field LoB actually lives in", () => {
  it("hub-content maps ?lob= onto packageId", () => {
    expect(hubRoute).toMatch(/lobFilter\s*=\s*params\.get\("lob"\)/);
    expect(hubRoute).toMatch(/if\s*\(lobFilter\)\s*\{\s*\n?\s*and\.push\(\{\s*packageId:\s*lobFilter\s*\}\)/);
  });

  it("keeps ?domain= on SAP's own raw.domain — the two facets stay distinct", () => {
    expect(hubRoute).toMatch(/if\s*\(domainFilter\)\s*\{[\s\S]{0,120}?path:\s*\["raw",\s*"domain"\]/);
  });

  it("reports byLob counts so the lens can offer domains that exist", () => {
    expect(hubRoute).toContain('by: ["packageId"]');
    expect(hubRoute).toMatch(/counts:\s*\{[^}]*byLob/);
  });

  it("the catalogue sends lob (not domain) for the lens", () => {
    expect(catalogue).toMatch(/if\s*\(lob\)\s*sp\.set\("lob",\s*lob\)/);
  });

  it("builds the lens options from the reported counts, not a hardcoded taxonomy", () => {
    // A fixed list would drift into empty buckets (or hide real ones) as the
    // catalogue changes — and an empty lens option is a small lie.
    expect(catalogue).toMatch(/lobOptions\s*=\s*Object\.keys\(byLob\)/);
    for (const invented of ["Finance", "Procurement", "Sales", "Supply Chain"]) {
      expect(
        catalogue.includes(`"${invented}"`),
        `${invented} must not be hardcoded as a lens option`,
      ).toBe(false);
    }
  });
});

describe("the reused catalogue stays reused", () => {
  it("Discover renders SapCapabilityCatalogue rather than reimplementing it", () => {
    // Forking the catalogue would mean forking honest-status, and two answers to
    // "is this activated?" is one too many.
    expect(discoverClient).toContain("<SapCapabilityCatalogue");
  });

  it("adds the Studio affordances through optional props only", () => {
    expect(discoverClient).toContain("domainLens");
    expect(discoverClient).toContain("onAddToInterface");
    // Both props default off, so the existing SAP Operations surface is untouched.
    expect(catalogue).toContain("domainLens = false");
  });
});

describe("no live SAP read happens just because a list rendered", () => {
  it("neither the Discover page nor its client calls /preview or /entities", () => {
    // Rows load only when a row is opened, inside CapabilityDetail, through the
    // isLiveSapTenantRoute throttle. A list render must never fan out onto the
    // tenant.
    for (const [name, src] of [
      ["discover page", discoverPage],
      ["discover client", discoverClient],
    ] as const) {
      expect(src, `${name} must not call /preview`).not.toContain("/api/sap/tdd/preview");
      expect(src, `${name} must not call /entities`).not.toContain("/api/sap/tdd/entities");
    }
  });

  it("the catalogue's own list fetch is hub-content only", () => {
    const loadBody = catalogue.slice(catalogue.indexOf("const load = useCallback"), catalogue.indexOf("useEffect(() => {\n    void load();"));
    expect(loadBody).toContain("/api/sap/tdd/hub-content?");
    expect(loadBody).not.toContain("/api/sap/tdd/preview");
    expect(loadBody).not.toContain("/api/sap/tdd/entities");
  });
});
