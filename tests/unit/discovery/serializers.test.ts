/**
 * ABeam Workbench — Neutral Process Discovery loaders + serializer allowlist.
 *
 * The walker test mirrors the Affirm serializers-walker pattern: it descends the
 * whole serialized payload and asserts no consultant-only key appears at any
 * depth. PR-6's client export pack reuses these mappers, so this is what makes
 * "the client pack cannot contain the product map" true by construction.
 */

import { describe, expect, it } from "vitest";

import {
  SYSTEM_LANE,
  allClientProcesses,
  clientValueStreams,
  coverageCounts,
  findClientProcess,
  lanesForFlow,
  laneForRole,
  noFlowProcesses,
  withFlowProcesses,
} from "@/lib/discovery/client-library";
import {
  allConsultantProcessesWithCompleteness,
  completenessFor,
} from "@/lib/discovery/consultant-library";
import { toDiscoveryProcess, toDiscoveryValueStream } from "@/lib/discovery/serializers";

/** Keys that must never reach a /d/* surface. */
const CONSULTANT_ONLY_KEYS = ["origin", "apqc", "provenance", "parked", "scope_id", "meta"];

function collectKeys(value: unknown, out: Set<string>): void {
  if (Array.isArray(value)) {
    for (const v of value) collectKeys(v, out);
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      collectKeys(v, out);
    }
  }
}

describe("client library loads and validates", () => {
  it("parses the frozen dataset without throwing", () => {
    expect(allClientProcesses().length).toBe(742);
  });

  it("exposes 10 value streams", () => {
    expect(clientValueStreams().length).toBe(10);
  });

  it("finds a known process by id", () => {
    const p = findClientProcess("31G");
    expect(p?.name).toBe("Chemical Compliance Approval for Purchased Material and Supplier");
  });

  it("returns null for an unknown id rather than throwing", () => {
    expect(findClientProcess("nope")).toBeNull();
  });
});

describe("D3 — blank-role steps fall into the System / Automatic lane", () => {
  it("maps an empty role to the system lane", () => {
    expect(laneForRole("")).toBe(SYSTEM_LANE);
    expect(laneForRole("   ")).toBe(SYSTEM_LANE);
  });

  it("passes a real role through untouched", () => {
    expect(laneForRole("Master Data Specialist")).toBe("Master Data Specialist");
  });

  it("never produces an empty lane label anywhere in the dataset", () => {
    // 1400 of 3035 steps have a blank role. An empty lane header is the exact
    // honesty failure the brief's fallback exists to prevent.
    const empty = allClientProcesses()
      .flatMap((p) => p.flow ?? [])
      .map((s) => laneForRole(s.role))
      .filter((lane) => lane.trim().length === 0);
    expect(empty).toEqual([]);
  });

  it("de-duplicates lanes in flow order", () => {
    expect(
      lanesForFlow([
        { step: "a", role: "Buyer" },
        { step: "b", role: "" },
        { step: "c", role: "Buyer" },
      ]),
    ).toEqual(["Buyer", SYSTEM_LANE]);
  });
});

/**
 * D6 — these assertions were WRONG in PR-1 and passed anyway.
 *
 * PR-1 asserted "exactly 16 processes have no flow" and "every process with a
 * flow carries a completeness badge". Both were green, because the 181 sentinel
 * processes had a one-step fake flow AND an `outline` badge — so they counted as
 * "with a flow" and satisfied the badge rule. The tests encoded the bug rather
 * than catching it.
 *
 * Post-re-emission the honest split is 545 with a real flow / 197 without, and
 * the no-flow set carries no completeness claim at all.
 */
describe("honesty rules — the 197 no-flow processes", () => {
  it("exactly 197 processes have no flow (16 original + 181 de-sentinelled)", () => {
    expect(noFlowProcesses().length).toBe(197);
  });

  it("exactly 545 processes have a real flow", () => {
    expect(withFlowProcesses().length).toBe(545);
  });

  it("with-flow and no-flow together account for all 742", () => {
    expect(withFlowProcesses().length + noFlowProcesses().length).toBe(742);
  });

  it("no no-flow process claims a completeness badge (never a guess)", () => {
    expect(noFlowProcesses().every((p) => p.completeness === null)).toBe(true);
  });

  it("every process WITH a flow carries a completeness badge", () => {
    // Invariant 4: completeness badges everywhere a process renders.
    expect(withFlowProcesses().every((p) => p.completeness !== null)).toBe(true);
  });

  it("completeness distribution matches the corrected data", () => {
    const dist = allClientProcesses().reduce<Record<string, number>>((acc, p) => {
      const k = p.completeness ?? "none";
      acc[k] = (acc[k] ?? 0) + 1;
      return acc;
    }, {});
    expect(dist).toEqual({ detailed: 223, "detailed+variants": 177, outline: 145, none: 197 });
  });
});

describe("coverage counts — what V1's stat row must read from", () => {
  it("computes from the data, not from meta or MANIFEST", () => {
    expect(coverageCounts()).toEqual({
      processes: 742,
      withFlow: 545,
      noFlow: 197,
      workflows: 85,
      valueStreams: 10,
      industrySpecific: 60,
    });
  });

  it("never reports the pre-fix 726 (the sentinel-inflated figure)", () => {
    // Showing 726 would overstate real flow coverage to the client by a third.
    expect(coverageCounts().withFlow).not.toBe(726);
  });
});

describe("D2 — consultant completeness is derived across the join", () => {
  it("resolves completeness for a consultant process the dataset does not carry", () => {
    expect(completenessFor("31G")).toBe("detailed");
  });

  it("joins all 742 consultant processes", () => {
    const joined = allConsultantProcessesWithCompleteness();
    expect(joined.length).toBe(742);
  });

  it("leaves exactly 197 with null completeness (the no-flow set)", () => {
    const joined = allConsultantProcessesWithCompleteness();
    expect(joined.filter((p) => p.completeness === null).length).toBe(197);
  });

  it("returns null for an unknown scope id rather than guessing", () => {
    expect(completenessFor("nope")).toBeNull();
  });
});

describe("serializer allowlist — the leak boundary", () => {
  it("serializes a process to the allowed shape only", () => {
    const p = findClientProcess("31G")!;
    const out = toDiscoveryProcess(p);
    expect(Object.keys(out).sort()).toEqual(
      ["completeness", "description", "flow", "hasFlow", "id", "industry", "name", "tier"].sort(),
    );
  });

  it("applies the System / Automatic lane through the serializer", () => {
    const out = toDiscoveryProcess(findClientProcess("31G")!);
    expect(out.flow[0]!.lane).toBe(SYSTEM_LANE);
  });

  it("no consultant-only key appears at any depth of a serialized process", () => {
    const keys = new Set<string>();
    for (const p of allClientProcesses()) collectKeys(toDiscoveryProcess(p), keys);
    const leaked = CONSULTANT_ONLY_KEYS.filter((k) => keys.has(k));
    expect(leaked, `Consultant-only keys leaked into the client payload: ${leaked}`).toEqual([]);
  });

  it("no consultant-only key appears at any depth of a serialized value stream", () => {
    const keys = new Set<string>();
    for (const vs of clientValueStreams()) collectKeys(toDiscoveryValueStream(vs), keys);
    const leaked = CONSULTANT_ONLY_KEYS.filter((k) => keys.has(k));
    expect(leaked).toEqual([]);
  });

  it("drops a field added upstream rather than passing it through", () => {
    // Mappers copy field-by-field, never spread — a new upstream field must not
    // ride along silently into a client payload.
    const withExtra = {
      ...findClientProcess("31G")!,
      sapScopeItem: "18J",
    } as Parameters<typeof toDiscoveryProcess>[0];
    expect(toDiscoveryProcess(withExtra)).not.toHaveProperty("sapScopeItem");
  });
});
