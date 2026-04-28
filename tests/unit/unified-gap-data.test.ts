/**
 * Phase 7 — unified-gap-data module shape test.
 */

import { describe, it, expect } from "vitest";

describe("Phase 7 — unified gap data module", () => {
  it("exports getGapWorkspaceData", async () => {
    const mod = await import("@/lib/gap-workspace/unified-gap-data");
    expect(typeof mod.getGapWorkspaceData).toBe("function");
  });
});

describe("Phase 7 — gap workspace API route exists", () => {
  it("GET /api/assessments/[id]/gap-workspace", async () => {
    const mod = await import("@/app/api/assessments/[id]/gap-workspace/route");
    expect(typeof mod.GET).toBe("function");
  });
});
