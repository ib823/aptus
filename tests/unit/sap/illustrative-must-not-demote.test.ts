/**
 * An illustrative row must never replace a real one.
 *
 * THE DEFECT. The illustrative seed and real Hub exports upsert into the same
 * table on the same key `(contentType, externalId)`, so whichever import ran
 * last won. The seed carries placeholder titles and descriptions for ids that
 * are genuinely published — on a populated catalogue, ten of them collide,
 * including `API_BUSINESS_PARTNER`, an API this tenant has actually activated.
 *
 * Running the seed after a real import therefore replaced activated content
 * with demo text and stamped it `illustrative`, so the console showed a
 * placeholder badge on real data. Which is the exact inversion of what the
 * flag was added for in the first place: it exists to stop placeholders being
 * mistaken for real content, and unguarded it made real content look fake.
 *
 * It also depended on invisible ordering — nothing in either import said which
 * had to run first, so the same two commands in the other order produced a
 * different catalogue. The rule is direction-based instead: real is never
 * demoted, and a real import overwriting a placeholder still works, because
 * that is the whole point of importing.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { normalizeHubRow, parseHubJson } from "@/lib/sap-public/hub-import";

/**
 * The decision both import paths make, extracted so the rule can be tested
 * without a database. Mirrors scripts/import-sap-hub-content.ts and the admin
 * Rebuild route — a test that asserted only one of them would leave the other
 * free to demote.
 */
function wouldWrite(incomingIllustrative: boolean, existingIllustrative: boolean | null): boolean {
  return !(incomingIllustrative && existingIllustrative === false);
}

describe("the demotion rule", () => {
  it("REFUSES an illustrative row over a known-real one", () => {
    expect(wouldWrite(true, false)).toBe(false);
  });

  it("allows a real row to overwrite a placeholder — that is what importing is for", () => {
    expect(wouldWrite(false, true)).toBe(true);
  });

  it("allows an illustrative row where provenance is unrecorded (NULL)", () => {
    // NULL means "imported before the column existed", not "known real".
    // Refusing here would freeze pre-column rows permanently.
    expect(wouldWrite(true, null)).toBe(true);
  });

  it("allows illustrative over illustrative, and real over real", () => {
    expect(wouldWrite(true, true)).toBe(true);
    expect(wouldWrite(false, false)).toBe(true);
  });
});

describe("the collision is real, not hypothetical", () => {
  it("the seed claims ids that a real catalogue also publishes", () => {
    /*
     * Reads the committed seed. These ids are why the rule is needed: every
     * one of them is a genuine SAP API or event that a real import also
     * writes, so on any populated catalogue the seed had something to demote.
     */
    const file = resolve(__dirname, "../../../sap-references/hub-content-seed.json");
    const rows = parseHubJson(readFileSync(file, "utf8"));

    const illustrativeIds = rows
      .map((r) => normalizeHubRow(r))
      .filter((n): n is NonNullable<typeof n> => n !== null && n.illustrative)
      .map((n) => n.externalId);

    // Real, published SAP ids that the seed also carries — verified against a
    // populated catalogue on 2026-07-31 (10 collisions).
    expect(illustrativeIds).toContain("API_BUSINESS_PARTNER");
    expect(illustrativeIds).toContain("API_SALES_ORDER_SRV");
    expect(illustrativeIds).toContain("CE_BUSINESSPARTNEREVENTS");
  });
});

describe("both import paths carry the guard", () => {
  it.each([
    ["scripts/import-sap-hub-content.ts", "scripts/import-sap-hub-content.ts"],
    ["the admin Rebuild route", "src/app/api/sap/tdd/hub-content/seed/route.ts"],
  ])("%s refuses the demotion", (_label, file) => {
    /*
     * A source sweep, because the two paths are separate code writing the same
     * table: fixing one and not the other leaves the defect reachable through
     * the surface that was not fixed. This repository has shipped that shape
     * before — one fact in N places.
     */
    const src = readFileSync(resolve(__dirname, "../../..", file), "utf8");
    expect(src).toMatch(/norm\.illustrative\s*&&\s*existing\.illustrative === false/);
  });
});
