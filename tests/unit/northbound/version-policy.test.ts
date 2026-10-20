/**
 * The northbound version policy (roadmap P1.10), as pure functions.
 *
 * What a caller is promised: an unpinned request is served the OLDEST
 * supported version, so code written before versions existed keeps what it
 * was written against; a pinned version is served exactly; an unknown or
 * retired one is refused, naming what is supported; and a version is never
 * retired with less than six months' notice or overlap. The registry the
 * product ships is held to those rules here, and so is the changelog a
 * developer reads.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  addMonthsUtc,
  checkRegistry,
  defaultVersion,
  edgeVersionHeaders,
  isNorthboundPath,
  NORTHBOUND_API_VERSIONS,
  northboundBasePathOf,
  resolveRequestedVersion,
  supportedVersions,
  unsupportedVersionMessage,
  utcDay,
  VERSION_HEADER,
  versionResponseHeaders,
  versionStatus,
  type NorthboundApiVersion,
} from "@/lib/northbound/version-policy";

const v = (version: string, releasedOn: string, deprecatedOn: string | null = null, sunsetOn: string | null = null): NorthboundApiVersion => ({
  version,
  releasedOn,
  deprecatedOn,
  sunsetOn,
  summary: `Version ${version}.`,
  changes: [],
});

/** A history with a deprecated 2026-10 and its successor, 2027-04. */
const HISTORY = [
  v("2026-10", "2026-10-24", "2027-04-01", "2027-10-01"),
  v("2027-04", "2027-04-01"),
];
const BEFORE_SUNSET = new Date("2027-09-30T23:59:59Z");
const AT_SUNSET = new Date("2027-10-01T00:00:00Z");

describe("the registry the product ships", () => {
  it("keeps every rule of the deprecation policy", () => {
    expect(checkRegistry(NORTHBOUND_API_VERSIONS)).toEqual([]);
  });

  it("serves 2026-10, today's routes unchanged, by default", () => {
    const now = new Date();
    expect(supportedVersions(now).map((x) => x.version)).toContain("2026-10");
    expect(defaultVersion(now)?.version).toBe("2026-10");
  });
});

describe("checkRegistry refuses a history that breaks the promise", () => {
  it("a sunset less than six months after the deprecation is announced", () => {
    const problems = checkRegistry([v("2026-10", "2026-10-24", "2027-04-01", "2027-09-30"), v("2027-04", "2027-04-01")]);
    expect(problems.join("\n")).toMatch(/less than 6 months after its deprecation/);
  });

  it("a sunset less than six months after the replacement is released", () => {
    const problems = checkRegistry([v("2026-10", "2026-10-24", "2027-05-01", "2027-11-01"), v("2027-04", "2027-06-01")]);
    expect(problems.join("\n")).toMatch(/deprecated before 2027-04, its replacement, is released/);
    const late = checkRegistry([v("2026-10", "2026-10-24", "2027-04-01", "2027-10-01"), v("2027-05", "2027-05-01")]);
    expect(late.join("\n")).toMatch(/overlaps 2027-05 .* by less than 6 months/);
  });

  it("deprecating the newest version, which leaves nowhere to go", () => {
    expect(checkRegistry([v("2026-10", "2026-10-24", "2027-04-01", "2027-10-01")]).join("\n")).toMatch(
      /newest version cannot be deprecated/,
    );
  });

  it("a sunset with no deprecation announced", () => {
    expect(checkRegistry([v("2026-10", "2026-10-24", null, "2027-10-01"), v("2027-04", "2027-04-01")]).join("\n")).toMatch(
      /sunset needs a deprecation/,
    );
  });

  it("versions out of order, misnamed, or dated with a day that does not exist", () => {
    expect(checkRegistry([v("2027-04", "2027-04-01"), v("2026-10", "2026-10-24")]).join("\n")).toMatch(/oldest first/);
    expect(checkRegistry([v("2026-13", "2026-10-24")]).join("\n")).toMatch(/named YYYY-MM/);
    expect(checkRegistry([v("2026-10", "2026-02-31")]).join("\n")).toMatch(/is not a date/);
    expect(checkRegistry([])).toEqual(["There must be at least one version."]);
  });

  it("accepts exactly six months, the minimum", () => {
    expect(checkRegistry(HISTORY)).toEqual([]);
  });
});

describe("what a request is served", () => {
  it("no header, or a blank one, is the OLDEST supported version, not the newest", () => {
    for (const header of [null, undefined, "", "   "]) {
      const r = resolveRequestedVersion(header, BEFORE_SUNSET, HISTORY);
      expect(r).toMatchObject({ ok: true, pinned: false, version: { version: "2026-10" } });
    }
  });

  it("a pinned supported version is served exactly, deprecated or not", () => {
    expect(resolveRequestedVersion("2027-04", BEFORE_SUNSET, HISTORY)).toMatchObject({ ok: true, pinned: true, version: { version: "2027-04" } });
    expect(resolveRequestedVersion(" 2026-10 ", BEFORE_SUNSET, HISTORY)).toMatchObject({ ok: true, pinned: true, version: { version: "2026-10" } });
  });

  it("an unknown version is refused, naming the supported ones", () => {
    for (const header of ["2025-01", "v1", "latest", "2026-10, 2027-04", "2026-10-24"]) {
      const r = resolveRequestedVersion(header, BEFORE_SUNSET, HISTORY);
      expect(r).toMatchObject({ ok: false, reason: "UNKNOWN", supported: ["2026-10", "2027-04"] });
    }
  });

  it("a retired version is refused from the first instant of its sunset day, and the default moves on", () => {
    expect(versionStatus(HISTORY[0]!, BEFORE_SUNSET)).toBe("deprecated");
    expect(versionStatus(HISTORY[0]!, AT_SUNSET)).toBe("retired");
    const r = resolveRequestedVersion("2026-10", AT_SUNSET, HISTORY);
    expect(r).toMatchObject({ ok: false, reason: "RETIRED", retiredOn: "2027-10-01", supported: ["2027-04"] });
    expect(resolveRequestedVersion(null, AT_SUNSET, HISTORY)).toMatchObject({ ok: true, version: { version: "2027-04" } });
  });

  it("the refusal sentence names the header, what is supported, the default and the changelog", () => {
    const r = resolveRequestedVersion("2026-10", AT_SUNSET, HISTORY);
    if (r.ok) throw new Error("expected a refusal");
    expect(unsupportedVersionMessage(r)).toBe(
      'CoreEdge-Version "2026-10" was retired on 2027-10-01. Supported versions: 2027-04. Send one of these, or omit the header to be served the default (2027-04). See /api/northbound/versions.',
    );
  });

  it("echoes at most 64 characters of what the caller sent", () => {
    const r = resolveRequestedVersion("x".repeat(500), BEFORE_SUNSET, HISTORY);
    expect(r.ok ? "" : r.requested).toHaveLength(64);
  });
});

describe("what a response says", () => {
  it("a supported version states itself and nothing else", () => {
    expect(versionResponseHeaders(v("2026-10", "2026-10-24"))).toEqual({ [VERSION_HEADER]: "2026-10" });
  });

  it("a deprecated version carries Deprecation (RFC 9745), Sunset (RFC 8594) and both links", () => {
    expect(versionResponseHeaders(HISTORY[0]!)).toEqual({
      "CoreEdge-Version": "2026-10",
      // @<unix seconds> of 2027-04-01T00:00:00Z: a Structured Field Date.
      Deprecation: "@1806537600",
      // IMF-fixdate.
      Sunset: "Fri, 01 Oct 2027 00:00:00 GMT",
      Link: '</api/northbound/versions>; rel="deprecation"; type="application/json", </api/northbound/versions>; rel="sunset"; type="application/json"',
    });
  });

  it("the edge states the version it would be served, and none for one the route will refuse", () => {
    expect(edgeVersionHeaders(null)).toEqual({ "CoreEdge-Version": "2026-10" });
    expect(edgeVersionHeaders("2026-10")).toEqual({ "CoreEdge-Version": "2026-10" });
    expect(edgeVersionHeaders("1999-01")).toEqual({});
  });
});

describe("dates and paths", () => {
  it("reads calendar dates strictly, in UTC", () => {
    expect(utcDay("2026-10-24")).toBe(Date.UTC(2026, 9, 24));
    expect(utcDay("2026-02-29")).toBeNaN();
    expect(utcDay("24/10/2026")).toBeNaN();
    expect(addMonthsUtc("2027-04-01", 6)).toBe(Date.UTC(2027, 9, 1));
  });

  it("tells the two base paths apart on whole segments", () => {
    expect(northboundBasePathOf("/api/northbound/v1/interfaces")).toBe("/api/northbound/v1");
    expect(northboundBasePathOf("/api/northbound/v1")).toBe("/api/northbound/v1");
    expect(northboundBasePathOf("/api/northbound/interfaces")).toBe("/api/northbound");
    expect(northboundBasePathOf("/api/northbound/v10/interfaces")).toBe("/api/northbound");
    expect(isNorthboundPath("/api/northbound/v1/versions")).toBe(true);
    expect(isNorthboundPath("/api/northboundx")).toBe(false);
  });
});

describe("the changelog a developer reads agrees with the registry", () => {
  const doc = readFileSync(path.join(process.cwd(), "docs/coreedge/api-changelog.md"), "utf8");
  const field = (section: string, name: string) => new RegExp(`^- ${name}: (.+)$`, "m").exec(section)?.[1]?.trim();
  const sections = new Map(
    [...doc.matchAll(/^## (\d{4}-\d{2})\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)].map((m) => [m[1]!, m[2]!]),
  );

  it("has one section per version, newest first, and no other", () => {
    expect([...sections.keys()]).toEqual([...NORTHBOUND_API_VERSIONS].reverse().map((x) => x.version));
  });

  it.each(NORTHBOUND_API_VERSIONS.map((x) => [x.version, x] as const))("states %s's dates as the registry does", (_, version) => {
    const section = sections.get(version.version)!;
    const dash = (d: string | null) => d ?? "—";
    expect(field(section, "Released")).toBe(version.releasedOn);
    expect(field(section, "Deprecated")).toBe(dash(version.deprecatedOn));
    expect(field(section, "Sunset")).toBe(dash(version.sunsetOn));
  });

  it("is linked from the developer guide, which states the policy", () => {
    const guide = readFileSync(path.join(process.cwd(), "docs/coreedge-developer-guide.md"), "utf8");
    expect(guide).toContain("docs/coreedge/api-changelog.md");
    expect(guide).toContain("## API versions and deprecation");
    expect(guide).toMatch(/at least 6 months/);
  });
});
