/**
 * ABeam Workbench — fit vocabulary + V1 view-model arithmetic.
 *
 * The DB-backed half of getDiscoveryHome is covered by the e2e journey; this
 * pins the pure logic that drives V1's states and the heatmap.
 */

import { describe, expect, it } from "vitest";

import { clientValueStreams } from "@/lib/discovery/client-library";
import {
  FIT_LABELS,
  FIT_STATUSES,
  dominantFit,
  emptyFitMix,
  fitMixDecided,
  fitMixTotal,
  isFitStatus,
  type FitMix,
} from "@/lib/discovery/fit";

function mix(p: Partial<FitMix>): FitMix {
  return { ...emptyFitMix(), ...p };
}

describe("fit vocabulary", () => {
  it("has exactly the four storable statuses", () => {
    expect([...FIT_STATUSES]).toEqual(["standard", "differ", "discuss", "na"]);
  });

  it("rejects an unknown status (the DB column is a String, not an enum)", () => {
    expect(isFitStatus("standard")).toBe(true);
    expect(isFitStatus("banana")).toBe(false);
    expect(isFitStatus("")).toBe(false);
  });

  it("labels every state, including undecided — never colour alone", () => {
    for (const s of [...FIT_STATUSES, "open"] as const) {
      expect(FIT_LABELS[s].length).toBeGreaterThan(0);
    }
    expect(FIT_LABELS.differ).toBe("We differ");
    expect(FIT_LABELS.open).toBe("Undecided");
  });
});

describe("fit mix arithmetic", () => {
  it("totals and decided exclude/include open correctly", () => {
    const m = mix({ standard: 3, differ: 1, open: 6 });
    expect(fitMixTotal(m)).toBe(10);
    expect(fitMixDecided(m)).toBe(4);
  });

  it("an untouched stream is 0 decided", () => {
    expect(fitMixDecided(mix({ open: 61 }))).toBe(0);
  });
});

describe("dominantFit", () => {
  it("returns open when nothing is decided", () => {
    expect(dominantFit(mix({ open: 12 }))).toBe("open");
  });

  it("returns the majority state", () => {
    expect(dominantFit(mix({ standard: 5, differ: 2, open: 3 }))).toBe("standard");
    expect(dominantFit(mix({ standard: 1, differ: 7 }))).toBe("differ");
  });

  it("ignores open even when open is the largest bucket", () => {
    // A workflow with 1 differ and 40 undecided is a differ cell, not a gray
    // one — otherwise the heatmap would hide the very thing it exists to show.
    expect(dominantFit(mix({ differ: 1, open: 40 }))).toBe("differ");
  });

  it("breaks ties deterministically in FIT_STATUSES order", () => {
    // Not dependent on object key order.
    expect(dominantFit(mix({ standard: 2, differ: 2 }))).toBe("standard");
    expect(dominantFit(mix({ differ: 2, discuss: 2 }))).toBe("differ");
  });
});

describe("dataset structure the V1 view model relies on", () => {
  it("every stream's declared process_count matches its actual processes", () => {
    // The view model derives counts from the actual arrays (D6: compute, never
    // trust a declared field). This asserts the two agree, so a future
    // re-emission that desyncs them fails here rather than silently skewing V1.
    const bad = clientValueStreams()
      .map((vs) => ({
        id: vs.id,
        declared: vs.process_count,
        actual: vs.workflows.reduce((n, wf) => n + wf.processes.length, 0),
      }))
      .filter((x) => x.declared !== x.actual);
    expect(bad).toEqual([]);
  });

  it("every stream's declared workflow_count matches its actual workflows", () => {
    const bad = clientValueStreams()
      .map((vs) => ({ id: vs.id, declared: vs.workflow_count, actual: vs.workflows.length }))
      .filter((x) => x.declared !== x.actual);
    expect(bad).toEqual([]);
  });

  it("all 10 streams are present — V1 renders every one, not the .dc's 8", () => {
    expect(clientValueStreams()).toHaveLength(10);
  });
});
