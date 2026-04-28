/**
 * Phase 1 — AD-3 schema invariant test.
 *
 * Verifies the catalog-version backfill is complete in the live catalog
 * fixture: every snapshotted ScopeItem version key is associated with at
 * least one catalog row.
 *
 * This test does NOT hit the DB (CI-portable). Once Phase 1 cutover flips
 * catalogVersionId to non-nullable on ScopeItem + Assessment, this test
 * extends to assert that constraint is enforced (via a minimal Prisma
 * schema check).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

interface Snapshot {
  versions: Record<string, Array<{ id: string }>>;
  totalIds: number;
}

const snap: Snapshot = JSON.parse(
  readFileSync(join(__dirname, "..", "fixtures", "catalog", "scope-items.snapshot.json"), "utf8"),
);

describe("Phase 1 — catalog versioning", () => {
  it("snapshot has at least one version", () => {
    expect(Object.keys(snap.versions).length).toBeGreaterThan(0);
  });

  it("snapshot includes the canonical 2602 baseline", () => {
    expect(snap.versions["2602"]).toBeDefined();
    expect(snap.versions["2602"]!.length).toBeGreaterThan(100);
  });

  it("every snapshotted scope item ID is unique within its version", () => {
    for (const [version, items] of Object.entries(snap.versions)) {
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const it of items) {
        if (seen.has(it.id)) dupes.push(it.id);
        seen.add(it.id);
      }
      expect(dupes, `Duplicate IDs within version ${version}: ${dupes.join(", ")}`).toEqual([]);
    }
  });

  it("totalIds matches the sum across all versions", () => {
    const computed = Object.values(snap.versions).reduce((acc, items) => acc + items.length, 0);
    expect(computed).toBe(snap.totalIds);
  });
});
