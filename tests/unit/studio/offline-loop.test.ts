/**
 * The offline loop.
 *
 * These artifacts run on someone else's machine, so "it rendered" is not the
 * bar. The mock must be parseable JavaScript, the fixtures must serve the same
 * shape the real broker returns, and the kit must tell the truth about which
 * scenarios it can and cannot reproduce.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Validate generated source with Node's real parser.
 *
 * `node --check` is the same parse the developer's runtime will do, so a file
 * that passes here cannot fail with a syntax error on their machine — which is
 * the entire point of testing generated code as an artifact rather than a string.
 */
function nodeCheck(source: string, filename: string): void {
  const dir = mkdtempSync(join(tmpdir(), "coreedge-scaffold-"));
  try {
    const file = join(dir, filename);
    writeFileSync(file, source, "utf8");
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

import {
  buildFixtureBody,
  isFixtureScenario,
  MAX_FIXTURE_ROWS,
  SCENARIO_STATUS,
  scenarioForOutcome,
} from "@/lib/studio/fixtures";
import {
  buildDemo,
  buildMockServer,
  buildPackageJson,
  buildReadme,
  buildScaffold,
  type ScaffoldFixture,
  type ScaffoldInterface,
} from "@/lib/studio/scaffold";

const IFACE: ScaffoldInterface = {
  id: "if_abc",
  name: "Business Partner read",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  operation: "READ",
  entitySet: "A_BusinessPartner",
  version: 1,
  solutionName: "Finance Accelerator",
};

const ALL_FIXTURES: ScaffoldFixture[] = [
  { scenario: "data", status: 200, body: { records: [{ a: 1 }], count: 1, empty: false } },
  { scenario: "empty", status: 200, body: { records: [], count: 0, empty: true } },
  { scenario: "needs_setup", status: 403, body: { error: { code: "FORBIDDEN", message: "x", correlationId: "y" } } },
  { scenario: "error", status: 502, body: { error: { code: "UPSTREAM_ERROR", message: "x", correlationId: "y" } } },
];

describe("scenario mapping", () => {
  it("splits a successful read into data vs empty by row count", () => {
    expect(scenarioForOutcome("ACTIVATED", 3)).toBe("data");
    expect(scenarioForOutcome("ACTIVATED", 0)).toBe("empty");
  });

  it("maps needs-setup and the failures to their own scenarios", () => {
    expect(scenarioForOutcome("NEEDS_SETUP", 0)).toBe("needs_setup");
    expect(scenarioForOutcome("NOT_PROBEABLE", 0)).toBe("error");
    expect(scenarioForOutcome("NOT_FOUND", 0)).toBe("error");
  });

  it("declines to record an outcome that teaches nothing", () => {
    expect(scenarioForOutcome("NOT_CHECKED", 0)).toBeNull();
    expect(scenarioForOutcome("REFERENCE", 0)).toBeNull();
  });

  it("keeps EMPTY on a 200 — the mock must teach that too", () => {
    // If the mock returned 404 for empty, every consumer built against it would
    // learn to treat "no records" as a fault.
    expect(SCENARIO_STATUS.empty).toBe(200);
    expect(SCENARIO_STATUS.data).toBe(200);
    expect(SCENARIO_STATUS.needs_setup).toBe(403);
    expect(SCENARIO_STATUS.error).toBe(502);
  });

  it("validates scenario names", () => {
    expect(isFixtureScenario("data")).toBe(true);
    expect(isFixtureScenario("whatever")).toBe(false);
  });
});

describe("fixture bodies mirror the real broker", () => {
  it("marks an empty result as empty, with a note saying it is not an error", () => {
    const body = buildFixtureBody("empty", []);
    expect(body.empty).toBe(true);
    expect(body.count).toBe(0);
    expect(body.note?.toLowerCase()).toContain("no records");
  });

  it("carries the error envelope shape for failures", () => {
    for (const scenario of ["needs_setup", "error"] as const) {
      const body = buildFixtureBody(scenario, []);
      expect(body.error?.code).toBeTruthy();
      expect(body.error?.correlationId).toBeTruthy();
    }
  });

  it("truncates rows — a fixture is an example, not a data export", () => {
    // Shipping a thousand rows of a client's business data inside a starter kit
    // would be a leak dressed up as a convenience.
    const many = Array.from({ length: 500 }, (_, i) => ({ i }));
    const body = buildFixtureBody("data", many);
    expect(body.records).toHaveLength(MAX_FIXTURE_ROWS);
    expect(body.count).toBe(MAX_FIXTURE_ROWS);
  });
});

describe("the generated mock is real, runnable JavaScript", () => {
  const src = buildMockServer(IFACE);

  it("parses under Node's own parser", () => {
    // Checked with `node --check` rather than a regex or `new Function`, because
    // this file runs in the DEVELOPER's repo: a syntax error would surface on
    // their machine, which is exactly the failure a generator must never ship.
    expect(() => nodeCheck(src, "mock.mjs")).not.toThrow();
  });

  it("has no third-party dependencies", () => {
    // A fixture server that needs installing is one that does not get used.
    const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.every((i) => i?.startsWith("node:"))).toBe(true);
  });

  it("serves only this interface's path", () => {
    expect(src).toContain(`INTERFACE_ID = "${IFACE.id}"`);
  });

  it("requires a bearer token, so code that forgets it fails locally not in prod", () => {
    expect(src).toContain("UNAUTHENTICATED");
    expect(src.toLowerCase()).toContain("bearer ");
  });

  it("fails loudly for a scenario nobody captured", () => {
    // Silently substituting a different scenario would be worse than an error.
    expect(src).toContain("FIXTURE_NOT_CAPTURED");
  });

  it("wraps 2xx bodies in `data` exactly as the broker does", () => {
    expect(src).toContain("fixture.status < 400 ? { data: fixture.body } : fixture.body");
  });
});

describe("the demo teaches the honest-status distinction", () => {
  const src = buildDemo(IFACE);

  it("treats empty as data, not as an error", () => {
    expect(src).toContain("empty");
    expect(src.toLowerCase()).toContain("answered successfully");
  });

  it("explains that 403 is an access problem rather than an outage", () => {
    expect(src.toLowerCase()).toContain("not set up");
  });

  it("prints the correlationId, so a failure can be traced back", () => {
    expect(src).toContain("correlationId");
  });

  it("parses under Node's own parser", () => {
    // demo.mjs uses top-level await, which is legal in an ES module — worth
    // proving rather than assuming.
    expect(() => nodeCheck(src, "demo.mjs")).not.toThrow();
  });
});

describe("the kit is honest about what it can reproduce", () => {
  it("names the captured scenarios", () => {
    const readme = buildReadme(IFACE, ALL_FIXTURES);
    expect(readme).toContain("data, empty, needs_setup, error");
    expect(readme).toContain("All four honest states are recorded");
  });

  it("names the MISSING ones instead of implying the mock is complete", () => {
    const readme = buildReadme(IFACE, [ALL_FIXTURES[0]!]);
    expect(readme).toContain("Not captured yet");
    expect(readme).toContain("empty");
    expect(readme.toLowerCase()).toContain("proving the easy half");
  });

  it("says plainly when nothing has been captured", () => {
    const readme = buildReadme(IFACE, []);
    expect(readme.toLowerCase()).toContain("nothing captured yet");
    expect(readme.toLowerCase()).toContain("cannot run offline");
  });

  it("still states that the app code lives in the developer's own repo", () => {
    expect(buildReadme(IFACE, ALL_FIXTURES)).toContain("YOUR repository");
  });
});

describe("the bundle", () => {
  const files = buildScaffold(IFACE, undefined, ALL_FIXTURES);
  const names = files.map((f) => f.path).sort();

  it("ships everything needed to run offline", () => {
    expect(names).toEqual([
      ".env.example",
      "README.md",
      "client.ts",
      "demo.mjs",
      "fixtures.json",
      "mock.mjs",
      "openapi.json",
      "package.json",
    ]);
  });

  it("wires mock and demo as npm scripts", () => {
    const pkg = JSON.parse(buildPackageJson(IFACE)) as { scripts: Record<string, string> };
    expect(pkg.scripts.mock).toBe("node mock.mjs");
    expect(pkg.scripts.demo).toBe("node demo.mjs");
  });

  it("embeds the captured fixtures as valid JSON", () => {
    const raw = files.find((f) => f.path === "fixtures.json")!.contents;
    const parsed = JSON.parse(raw) as { fixtures: ScaffoldFixture[] };
    expect(parsed.fixtures).toHaveLength(4);
  });

  it("makes COREEDGE_BASE_URL the single switch between mock and live", () => {
    // The whole promise of the offline loop.
    const readme = files.find((f) => f.path === "README.md")!.contents;
    expect(readme).toContain("COREEDGE_BASE_URL");
    expect(buildDemo(IFACE)).toContain("COREEDGE_BASE_URL");
  });
});
