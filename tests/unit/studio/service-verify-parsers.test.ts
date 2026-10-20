// @vitest-environment node
/**
 * The two scans Verify runs over a service description — the EDMX root's
 * version and the entity-set names — must stay LINEAR on hostile input.
 *
 * A verify reads up to VERIFY_MAX_METADATA_BYTES (8 MB) from a host the
 * builder's connection names. With `[^>]*` attribute runs, a body of
 * `<Edmx <Edmx …` or `<EntitySet <EntitySet …` with no `>` made every tag
 * start scan to the end of the input: quadratic, about 10 s at 256 KB and
 * hours at 8 MB, on the shared event loop (review round 2). These pin that a
 * megabyte of either finishes in well under a frame budget, and that the
 * bounded patterns still read real documents.
 */

import { describe, expect, it } from "vitest";

import { parseEntityCapabilities, parseEntitySets } from "@/lib/sap-public/tdd-connector";
import { edmxODataVersion } from "@/lib/studio/service-verify";

const ONE_MB = 1024 * 1024;

function timed(fn: () => unknown): number {
  const t = performance.now();
  fn();
  return performance.now() - t;
}

describe("hostile descriptions are scanned in linear time", () => {
  it("1 MB of `<Edmx ` with no `>`", () => {
    const body = "<Edmx ".repeat(Math.ceil(ONE_MB / 6));
    let out: unknown;
    expect(timed(() => (out = edmxODataVersion(body)))).toBeLessThan(100);
    expect(out).toBeNull();
  });

  it("1 MB of `<edmx:Edmx ` with no `>`", () => {
    const body = "<edmx:Edmx ".repeat(Math.ceil(ONE_MB / 11));
    expect(timed(() => edmxODataVersion(body))).toBeLessThan(100);
  });

  it("1 MB of `<EntitySet ` with no `>`", () => {
    const body = "<EntitySet ".repeat(Math.ceil(ONE_MB / 11));
    let out: unknown;
    expect(timed(() => (out = parseEntitySets(body)))).toBeLessThan(100);
    expect(out).toEqual([]);
  });

  it("1 MB of `<EntitySet ` through the capability parser (the second copy)", () => {
    const body = "<EntitySet ".repeat(Math.ceil(ONE_MB / 11));
    expect(timed(() => parseEntityCapabilities(body))).toBeLessThan(100);
  });

  it("an Edmx root behind 1 MB of padding is not looked for past the sniff window", () => {
    const body = " ".repeat(ONE_MB) + '<edmx:Edmx Version="1.0">';
    expect(edmxODataVersion(body)).toBeNull();
  });
});

describe("real documents still read the same", () => {
  it("V2 and V4 roots", () => {
    expect(edmxODataVersion('<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:edmx="x">')).toBe("V2");
    expect(edmxODataVersion('<edmx:Edmx xmlns:edmx="x" Version="4.0">')).toBe("V4");
    expect(edmxODataVersion('<Edmx Version="4.01">')).toBe("V4");
  });

  it("self-closing and open entity sets, with SAP attributes", () => {
    const xml =
      '<EntitySet Name="A_Travel" EntityType="Z.Travel" sap:creatable="true"/>' +
      '<EntitySet Name="Booking" EntityType="Z.Booking"><NavigationPropertyBinding Path="x" Target="y"/></EntitySet>';
    expect(parseEntitySets(xml).map((e) => e.name)).toEqual(["A_Travel", "Booking"]);
    expect(parseEntityCapabilities(xml).map((e) => e.name)).toEqual(["A_Travel", "Booking"]);
  });
});
