// @vitest-environment node
/**
 * P0.19: the load test's arithmetic (scripts/coreedge/load-test.ts). The run
 * itself needs a database and is recorded in docs/runbooks/coreedge-db-budget.md.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { percentile } from "../../../scripts/coreedge/load-test";

describe("percentile", () => {
  it("is the nearest-rank percentile", () => {
    const sorted = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(sorted, 50)).toBe(50);
    expect(percentile(sorted, 95)).toBe(95);
    expect(percentile(sorted, 99)).toBe(99);
    expect(percentile(sorted, 100)).toBe(100);
    expect(percentile([7], 95)).toBe(7);
    expect(percentile([], 95)).toBe(0);
  });
});

describe("the harness's safety", () => {
  const source = readFileSync(path.join(process.cwd(), "scripts/coreedge/load-test.ts"), "utf8");

  it("reads only LOAD_TEST_DATABASE_URL, never the deployment's DATABASE_URL", () => {
    expect(source).toContain("process.env.LOAD_TEST_DATABASE_URL");
    expect(source).not.toMatch(/process\.env\.(?:DIRECT_)?DATABASE_URL\b/);
  });

  it("refuses production and deletes what it seeded", () => {
    expect(source).toContain('process.env.NODE_ENV === "production"');
    expect(source).toContain("organization.delete({ where: { id: org } })");
  });

  it("never reaches SAP: fetch is the stub", () => {
    expect(source).toMatch(/globalThis\.fetch = \(async/);
  });
});
