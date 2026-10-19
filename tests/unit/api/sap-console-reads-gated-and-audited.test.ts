/**
 * The three console read routes are gated AND recorded (audit E15, P0).
 *
 * `/api/sap/tdd/preview`, `/entities` and `/operations` each open a live
 * connection to a client's SAP system. The audit found all three role-gated and
 * nothing more: no grant, no environment ceiling, no audit row — while the
 * broker's own comment, written when the Test Console was moved off them, named
 * exactly those three gaps.
 *
 * The per-route wiring is asserted at the source level because the property is
 * structural: every one of these routes must reach the shared guard, and the most
 * likely way for that to regress is a fourth route being added beside them (the
 * probe guard's own header records that happening once already: "the omission is
 * never in the route you were told about"). The DECISION itself is tested
 * behaviourally in console-read-guard.test.ts.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { isLiveSapTenantRoute } from "@/lib/security/rate-limit";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}
const flat = (src: string) => code(src).replace(/\s+/g, " ");

const ROUTES = {
  preview: "src/app/api/sap/tdd/preview/route.ts",
  entities: "src/app/api/sap/tdd/entities/route.ts",
  operations: "src/app/api/sap/tdd/operations/route.ts",
} as const;

describe.each(Object.entries(ROUTES))("%s", (name, file) => {
  const src = flat(read(file));

  it("keeps the role gate", () => {
    expect(src).toContain("refuseUnlessMayProbeTenant");
  });

  it("applies the environment ceiling to a stored connection", () => {
    expect(src).toContain("decideConsoleRead");
  });

  it("records the read", () => {
    expect(src).toContain("recordConsoleRead");
  });

  it("refuses a read it could not attribute to a person", () => {
    // The audit row cannot be written without an actor, and a read nobody is
    // accountable for is the one case the probe guard's own header says must not
    // happen. A null viewer is unreachable behind the role gate; the check is
    // what makes that a guarantee rather than an assumption.
    expect(src).toContain("if (!viewer)");
  });

  it("hands the caller a correlation id it can quote", () => {
    expect(src).toContain("correlationId");
  });

  it("audits the refusal, not only the success", () => {
    // A refusal is the interesting row: repeated 403s from one actor against one
    // landscape is the pattern worth seeing.
    expect(src).toMatch(/await audit\([^)]*403|audit\(403/);
  });

  it("stays in the tight sapLive throttle bucket", () => {
    expect(isLiveSapTenantRoute(`/api/sap/tdd/${name}`)).toBe(true);
  });
});

describe("the probe fan-out is recorded as its own load", () => {
  const src = flat(read(ROUTES.entities));

  it("records the fan-out separately from the metadata read", () => {
    // `?probe=1` is not one read, it is one read per entity set the service
    // exposes — the most amplifying thing this console can do to a tenant, and
    // the thing that previously left no trace at all.
    expect(src).toContain("-probe-fanout-");
  });

  it("counts how many probes were actually made", () => {
    expect(src).toContain("probes.length");
  });

  it("does not audit a cache hit, which reached no tenant", () => {
    // A row for a cache hit would claim load the request did not cause.
    const withComments = read(ROUTES.entities);
    const hit = withComments.indexOf("fromCache: true");
    const before = withComments.slice(Math.max(0, hit - 600), hit);
    expect(before).toMatch(/reached no tenant/i);
  });
});

/*
 * THE OTHER FOUR LIVE READS OF A STORED CONNECTION (audit A24).
 *
 * The three routes above were the ones the E15 audit named, and they were the
 * only ones fixed. Four more resolve the caller's stored connection through the
 * same resolveReadTenant and send live OData to it: /capabilities (up to sixty
 * $metadata probes), the hub-content list's ?dataProbe=1 overlay (the same,
 * plus a $top=1 data GET each), the hub-content detail (one live probe per
 * expansion) and Probe all (six hundred-odd). An organization refused 403
 * NO_APPROVED_GRANT on /entities for its PROD connection got the same system's
 * service list and CRUD map from the first, and none of the four left a row —
 * exactly "the omission is never in the route you were told about".
 *
 * A TABLE OF ITS OWN, because two of the shapes above do not hold here and
 * should not: the catalogue routes serve a browse that needs no session, so they
 * cannot refuse an unattributable reader outright (only the LIVE part needs an
 * actor), and Probe all has its own builder/admin gate rather than the shared
 * probe guard. What every one of them must have is asserted below, and the scan
 * after it makes sure a further route cannot join them without landing here.
 */
const OTHER_LIVE_READS = {
  capabilities: "src/app/api/sap/tdd/capabilities/route.ts",
  "hub-content": "src/app/api/sap/tdd/hub-content/route.ts",
  "hub-content/[id]": "src/app/api/sap/tdd/hub-content/[id]/route.ts",
  "hub-content/probe-all": "src/app/api/sap/tdd/hub-content/probe-all/route.ts",
} as const;

describe.each(Object.entries(OTHER_LIVE_READS))("%s (A24)", (name, file) => {
  const src = flat(read(file));

  it("applies the environment ceiling to a stored connection, under its real organization", () => {
    expect(src).toContain("decideConsoleRead");
    // Same two-part condition as the three routes above, whatever the actor
    // variable is called in this route.
    const cap = src.match(/if \(conn && (\w+)\.organizationId\) \{/);
    expect(cap, "caps only a stored connection, and names its organization").not.toBeNull();
    expect(src).toContain(`organizationId: ${cap![1]}.organizationId,`);
  });

  it("records the read", () => {
    expect(src).toContain("recordConsoleRead");
  });

  it("hands the row a correlation id", () => {
    expect(src).toContain("newCorrelationId()");
  });

  it("audits the refusal, not only the success", () => {
    expect(src).toMatch(/await audit\(403/);
  });

  it("stays in the tight sapLive throttle bucket", () => {
    expect(isLiveSapTenantRoute(`/api/sap/tdd/${name}`)).toBe(true);
  });
});

describe("a fan-out is one row with a scope sentinel, as /entities records -probe-fanout-", () => {
  it.each([
    ["capabilities", "-capabilities-"],
    ["hub-content", "-hub-overlay-"],
    ["hub-content/probe-all", "-probe-all-"],
  ] as const)("%s records under %s", (name, sentinel) => {
    expect(flat(read(OTHER_LIVE_READS[name]))).toContain(`externalId: "${sentinel}"`);
  });
});

describe("no route resolves a stored connection for a live read without the guard", () => {
  function routeFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) return routeFiles(p);
      return entry.isFile() && entry.name === "route.ts" ? [p] : [];
    });
  }

  it("every route.ts that calls resolveReadTenant is in one of the two tables, and uses the guard", () => {
    // resolveReadTenant is how a console route reaches a caller's STORED
    // connection — the only kind of system with a landscape to cap. A fifth
    // route that calls it fails here until it is added above, which is where
    // it is held to the ceiling and the row.
    const callers = routeFiles(path.resolve(ROOT, "src/app/api"))
      .filter((f) => code(readFileSync(f, "utf8")).includes("resolveReadTenant("))
      .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
      .sort();
    expect(callers).toEqual([...Object.values(ROUTES), ...Object.values(OTHER_LIVE_READS)].sort());
    for (const file of callers) {
      const src = flat(read(file));
      expect(src, file).toContain("decideConsoleRead(");
      expect(src, file).toContain("recordConsoleRead(");
    }
  });
});

describe("the deployment tenant is exempt from the grant gate, and said to be", () => {
  it("all three routes only cap a stored connection, and name its organization", () => {
    // A `{PREFIX}_*` tenant is the deployment's own demo system: no organization
    // owns it, so no grant could ever be written for it, and requiring one would
    // close the catalogue to everybody while protecting a system no customer has.
    //
    // The second half of the condition is not defensive padding. `conn` is only
    // set when a STORED connection resolved, and resolveReadTenant will not look
    // for one without an organization — so a connection implies an organization,
    // and naming it is what lets the guard receive a real id. A grant query
    // against a fallback would return nothing and refuse, which reads like a
    // policy decision and is actually a missing value.
    for (const file of Object.values(ROUTES)) {
      expect(flat(read(file)), file).toContain("if (conn && viewer.organizationId) {");
      expect(flat(read(file)), file).toContain("organizationId: viewer.organizationId,");
    }
  });
});
