/**
 * Phase 5 — pass-data helper module shape test.
 *
 * Validates the public API of the pass-data helpers. DB-backed integration
 * tests live in tests/integration/ (run separately, need TEST_DATABASE_URL).
 */

import { describe, it, expect } from "vitest";

describe("Phase 5 — pass-data module shape", () => {
  it("exports the documented surface", async () => {
    const mod = await import("@/lib/classification/pass-data");
    expect(typeof mod.listPasses).toBe("function");
    expect(typeof mod.getModuleRollup).toBe("function");
    expect(typeof mod.getModuleSample).toBe("function");
    expect(typeof mod.getPassDiff).toBe("function");
  });
});

describe("Phase 5 — Classification Workspace API routes exist at expected paths", () => {
  // Snapshot the route paths so any restructure is loud.
  it("POST/GET /api/assessments/[id]/passes", async () => {
    const mod = await import("@/app/api/assessments/[id]/passes/route");
    expect(typeof mod.GET).toBe("function");
    expect(typeof mod.POST).toBe("function");
  });

  it("GET /api/assessments/[id]/passes/[passId]/modules", async () => {
    const mod = await import("@/app/api/assessments/[id]/passes/[passId]/modules/route");
    expect(typeof mod.GET).toBe("function");
  });

  it("GET /api/assessments/[id]/passes/[passId]/modules/[module]/sample", async () => {
    const mod = await import("@/app/api/assessments/[id]/passes/[passId]/modules/[module]/sample/route");
    expect(typeof mod.GET).toBe("function");
  });

  it("POST /api/assessments/[id]/passes/[passId]/modules/[module]/approve", async () => {
    const mod = await import("@/app/api/assessments/[id]/passes/[passId]/modules/[module]/approve/route");
    expect(typeof mod.POST).toBe("function");
  });

  it("GET /api/assessments/[id]/passes/[passId]/diff/[priorPassId]", async () => {
    const mod = await import("@/app/api/assessments/[id]/passes/[passId]/diff/[priorPassId]/route");
    expect(typeof mod.GET).toBe("function");
  });
});
