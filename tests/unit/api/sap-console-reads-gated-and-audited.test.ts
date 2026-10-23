/**
 * The console read routes are gated AND recorded (audit E15, A24; P0.14b).
 *
 * `/api/sap/tdd/preview`, `/entities` and `/operations` each open a live
 * connection to a client's SAP system. The audit found all three role-gated and
 * nothing more: no grant, no environment ceiling, no audit row — while the
 * broker's own comment, written when the Test Console was moved off them, named
 * exactly those three gaps. Four more (capabilities, the catalogue overlay, the
 * catalogue detail, Probe all) were found the same way later (A24).
 *
 * SINCE P0.14b the gates and the rows are not hand-copied into each route any
 * more: every one of them opens a console call on the governed pipeline
 * (src/lib/governed/console.ts) and runs its steps — `authorise()` (the
 * sandbox developer's ceiling, then the environment ceiling for a stored
 * connection), `bind()` (the deployment tenant's host against the allow-list),
 * `contain()` (the console circuit) — and reads SAP only inside `callSap`,
 * which writes the organization's console row and the platform-scope row.
 * So this test asserts two things at the source level: each route takes that
 * path, and the console module itself holds the ceiling and both rows. The
 * DECISIONS are tested behaviourally in console-read-guard.test.ts,
 * tests/unit/governed/console.test.ts and the golden rows
 * (tests/integration/console-pipeline-golden.test.ts); that no route reaches
 * SAP any other way is tests/unit/security/no-side-doors.test.ts.
 *
 * The property is structural because the most likely regression is a further
 * route being added beside these (the probe guard's own header records that
 * happening once already: "the omission is never in the route you were told
 * about").
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

const CONSOLE_MODULE = "src/lib/governed/console.ts";

const ROUTES = {
  preview: "src/app/api/sap/tdd/preview/route.ts",
  entities: "src/app/api/sap/tdd/entities/route.ts",
  operations: "src/app/api/sap/tdd/operations/route.ts",
} as const;

/*
 * THE OTHER FOUR LIVE READS OF A STORED CONNECTION (audit A24): /capabilities
 * (up to sixty $metadata probes), the hub-content list's ?dataProbe=1 overlay
 * (the same, plus a $top=1 data GET each), the hub-content detail (one live
 * probe per expansion) and Probe all (six hundred-odd). A TABLE OF ITS OWN
 * because the catalogue routes serve a browse that needs no session, so they
 * cannot refuse an unattributable reader outright (only the LIVE part needs an
 * actor), and Probe all has its own builder/admin gate rather than the shared
 * probe guard.
 */
const OTHER_LIVE_READS = {
  capabilities: "src/app/api/sap/tdd/capabilities/route.ts",
  "hub-content": "src/app/api/sap/tdd/hub-content/route.ts",
  "hub-content/[id]": "src/app/api/sap/tdd/hub-content/[id]/route.ts",
  "hub-content/probe-all": "src/app/api/sap/tdd/hub-content/probe-all/route.ts",
  // P1.2: the live listing of the tenant's own Gateway catalogue.
  "tenant-services": "src/app/api/sap/tdd/tenant-services/route.ts",
} as const;

const ALL = { ...ROUTES, ...OTHER_LIVE_READS };

describe("the console module holds the ceiling and both rows", () => {
  const src = flat(read(CONSOLE_MODULE));

  it("applies the sandbox developer's ceiling and the environment ceiling", () => {
    expect(src).toContain("decideSandboxDeveloperRead(");
    expect(src).toContain("decideConsoleRead(");
  });

  it("caps only a stored connection, under its real organization", () => {
    // A `{PREFIX}_*` tenant is the deployment's own system: no organization
    // owns it, so no grant could ever be written for it, and requiring one would
    // close the catalogue to everybody while protecting a system no customer has.
    // The second half of the condition is not defensive padding: a grant query
    // against a fallback would return nothing and refuse, which reads like a
    // policy decision and is actually a missing value.
    expect(src).toContain("if (conn && viewer.organizationId) {");
    expect(src).toContain("organizationId: viewer.organizationId,");
  });

  it("writes the organization's console row and the platform-scope row", () => {
    expect(src).toContain("recordConsoleRead(");
    expect(src).toContain("recordPlatformConsoleRead(");
  });

  it("records a refusal, not only a read", () => {
    // A refusal is the interesting row: repeated 403s from one actor against
    // one landscape is the pattern worth seeing.
    expect(src).toMatch(/private async refuse\(r: Refusal\)[^}]*this\.record\(/);
  });
});

describe.each(Object.entries(ALL))("%s", (name, file) => {
  const src = flat(read(file));

  it("runs on the console pipeline: authorise, bind, then a read inside callSap", () => {
    expect(src).toContain("openConsoleCall(");
    for (const step of [".authorise()", ".bind()", ".contain()", ".callSap("]) expect(src, step).toContain(step);
    expect(src.indexOf(".authorise()")).toBeLessThan(src.indexOf(".bind()"));
    expect(src.indexOf(".bind()")).toBeLessThan(src.indexOf(".callSap("));
  });

  it("no longer hand-copies the gates or the row", () => {
    for (const local of ["decideConsoleRead(", "recordConsoleRead(", "newCorrelationId("]) {
      expect(src, local).not.toContain(local);
    }
  });

  it("stays in the tight sapLive throttle bucket", () => {
    expect(isLiveSapTenantRoute(`/api/sap/tdd/${name}`)).toBe(true);
  });
});

describe.each(Object.entries(ROUTES))("%s keeps its own gate", (_name, file) => {
  const src = flat(read(file));

  it("keeps the role gate", () => {
    expect(src).toContain("refuseUnlessMayProbeTenant");
  });

  it("refuses a read it could not attribute to a person", () => {
    // The audit rows cannot be written without an actor, and a read nobody is
    // accountable for is the one case the probe guard's own header says must
    // not happen. A null viewer is unreachable behind the role gate; the check
    // is what makes that a guarantee rather than an assumption.
    expect(src).toContain("if (!viewer)");
  });

  it("hands the caller a correlation id it can quote", () => {
    expect(src).toContain("const correlationId = call.correlationId;");
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
    expect(src).toContain("rowCount: made.length");
  });

  it("does not audit a cache hit, which reached no tenant", () => {
    // A row for a cache hit would claim load the request did not cause.
    const withComments = read(ROUTES.entities);
    const hit = withComments.indexOf("fromCache: true");
    const before = withComments.slice(Math.max(0, hit - 600), hit);
    expect(before).toMatch(/reached no tenant/i);
    expect(withComments.indexOf("fromCache: true")).toBeLessThan(withComments.indexOf(".callSap("));
  });
});

describe("a fan-out is one row with a scope sentinel, as /entities records -probe-fanout-", () => {
  it.each([
    ["operations", ROUTES.operations, "-operations-"],
    ["capabilities", OTHER_LIVE_READS.capabilities, "-capabilities-"],
    ["hub-content", OTHER_LIVE_READS["hub-content"], "-hub-overlay-"],
    ["hub-content/probe-all", OTHER_LIVE_READS["hub-content/probe-all"], "-probe-all-"],
  ] as const)("%s records under %s", (_name, file, sentinel) => {
    expect(flat(read(file))).toContain(`externalId: "${sentinel}"`);
  });
});

describe("no route resolves a stored connection for a live read without the console pipeline", () => {
  function routeFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) return routeFiles(p);
      return entry.isFile() && entry.name === "route.ts" ? [p] : [];
    });
  }

  it("every route.ts that calls resolveReadTenant is in one of the two tables, and opens a console call", () => {
    // resolveReadTenant is how a console route reaches a caller's STORED
    // connection — the only kind of system with a landscape to cap. A further
    // route that calls it fails here until it is added above, which is where
    // it is held to the pipeline.
    const callers = routeFiles(path.resolve(ROOT, "src/app/api"))
      .filter((f) => code(readFileSync(f, "utf8")).includes("resolveReadTenant("))
      .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
      .sort();
    expect(callers).toEqual(Object.values(ALL).sort());
    for (const file of callers) expect(flat(read(file)), file).toContain("openConsoleCall(");
  });
});
