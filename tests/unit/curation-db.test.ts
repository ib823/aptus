/**
 * Phase 9 — AD-10: curation table schema invariants.
 *
 * Validates the seed-curation.ts script structure + ensures the new
 * Prisma models have the documented public surface.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

describe("Phase 9 — seed-curation.ts structure", () => {
  const seedSrc = readFileSync(
    join(__dirname, "..", "..", "scripts", "seed-curation.ts"),
    "utf8",
  );

  it("seeds all four curation tables", () => {
    expect(seedSrc).toMatch(/seedScopeItemCuration/);
    expect(seedSrc).toMatch(/seedProcessChains/);
    expect(seedSrc).toMatch(/seedPresets/);
    expect(seedSrc).toMatch(/seedGapProneAreas/);
  });

  it("imports source-of-truth constants from /src/constants", () => {
    expect(seedSrc).toMatch(/from "\.\.\/src\/constants\/scope-item-metadata"/);
    expect(seedSrc).toMatch(/from "\.\.\/src\/constants\/process-chains"/);
    expect(seedSrc).toMatch(/from "\.\.\/src\/constants\/presets"/);
  });

  it("uses upsert for idempotency", () => {
    expect(seedSrc.match(/\.upsert\(/g)?.length, "seeders should use upsert").toBeGreaterThanOrEqual(3);
  });
});

describe("Phase 9 — schema models exist with expected fields", () => {
  const schema = readFileSync(
    join(__dirname, "..", "..", "prisma", "schema.prisma"),
    "utf8",
  );

  it("ScopeItemCuration model present with FK to ScopeItem", () => {
    const m = schema.match(/model ScopeItemCuration \{[\s\S]*?\n\}/);
    expect(m, "ScopeItemCuration model missing").not.toBeNull();
    expect(m![0]).toMatch(/scopeItemId\s+String\s+@unique/);
    expect(m![0]).toMatch(/scopeItem ScopeItem @relation/);
  });

  it("ProcessChain model present with (area, name) unique", () => {
    const m = schema.match(/model ProcessChain \{[\s\S]*?\n\}/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/@@unique\(\[area, name\]\)/);
  });

  it("ScopePreset model present with key unique", () => {
    const m = schema.match(/model ScopePreset \{[\s\S]*?\n\}/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/key\s+String\s+@unique/);
  });

  it("GapProneArea model present with isActive index", () => {
    const m = schema.match(/model GapProneArea \{[\s\S]*?\n\}/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/@@index\(\[isActive\]\)/);
  });
});
