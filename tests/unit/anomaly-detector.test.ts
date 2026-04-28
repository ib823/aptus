/**
 * Phase 6 — anomaly-detector tests + QA route presence.
 */

import { describe, it, expect } from "vitest";
import { summariseAnomalies, type Anomaly } from "@/lib/classification/anomaly-detector";

describe("Phase 6 — summariseAnomalies()", () => {
  it("returns zero counts on empty input", () => {
    const s = summariseAnomalies([]);
    expect(s.total).toBe(0);
    expect(s.bySeverity).toEqual({ low: 0, medium: 0, high: 0 });
    expect(Object.values(s.byKind).every((v) => v === 0)).toBe(true);
  });

  it("counts by kind + severity correctly", () => {
    const inputs: Anomaly[] = [
      { kind: "OOTB_REMARKS_REFERENCE_NON_2602_PRODUCT", requirementId: "r1", module: "M", code: "1", severity: "high", detail: "" },
      { kind: "OOTB_REMARKS_REFERENCE_NON_2602_PRODUCT", requirementId: "r2", module: "M", code: "2", severity: "high", detail: "" },
      { kind: "LOW_CONFIDENCE_UNREVIEWED", requirementId: "r3", module: "M", code: "3", severity: "low", detail: "" },
      { kind: "VENDOR_DISAGREEMENT", requirementId: "r4", module: "M", code: "4", severity: "low", detail: "" },
      { kind: "OC_VERDICT_NO_CITATIONS", requirementId: "r5", module: "M", code: "5", severity: "medium", detail: "" },
    ];
    const s = summariseAnomalies(inputs);
    expect(s.total).toBe(5);
    expect(s.byKind.OOTB_REMARKS_REFERENCE_NON_2602_PRODUCT).toBe(2);
    expect(s.byKind.LOW_CONFIDENCE_UNREVIEWED).toBe(1);
    expect(s.byKind.VENDOR_DISAGREEMENT).toBe(1);
    expect(s.byKind.OC_VERDICT_NO_CITATIONS).toBe(1);
    expect(s.bySeverity).toEqual({ low: 2, medium: 1, high: 2 });
  });
});

describe("Phase 6 — anomaly-detector module shape", () => {
  it("exports the documented surface", async () => {
    const mod = await import("@/lib/classification/anomaly-detector");
    expect(typeof mod.detectAnomalies).toBe("function");
    expect(typeof mod.summariseAnomalies).toBe("function");
  });
});

describe("Phase 6 — API routes exist at expected paths", () => {
  it("GET /api/assessments/[id]/qa/anomalies", async () => {
    const mod = await import("@/app/api/assessments/[id]/qa/anomalies/route");
    expect(typeof mod.GET).toBe("function");
  });

  it("GET /api/assessments/[id]/requirements/[reqId]/provenance", async () => {
    const mod = await import("@/app/api/assessments/[id]/requirements/[reqId]/provenance/route");
    expect(typeof mod.GET).toBe("function");
  });
});
