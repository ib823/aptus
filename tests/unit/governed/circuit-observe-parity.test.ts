// @vitest-environment node
/**
 * Observe mode follows the enforce timeline (P0.14, containment.ts).
 *
 * The runbook's step to switch the breaker on is "count the `[circuit] would
 * refuse` lines". That only works if observe logs one line for every call
 * enforce would have refused. Under enforce a refused call never reaches SAP,
 * so its outcome is never recorded; under observe the call does reach SAP,
 * and if its outcome were recorded a single success inside the cooldown would
 * close the circuit and silence every later line. So under observe the
 * outcome of a call enforce would have refused is not recorded.
 *
 * The same scripted sequence — five failures, then a recovered system called
 * once a second — is driven through the contain step in both modes: the
 * number of would-refuse lines equals the number of refusals.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { __setGovernedCircuitStore } from "@/lib/governed/containment";
import { containKey } from "@/lib/governed/pipeline";
import { COOLDOWN_MS, FAILURE_THRESHOLD, MemoryCircuitStore, type CallOutcome } from "@/lib/northbound/circuit-breaker";

afterEach(() => {
  __setGovernedCircuitStore(null);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** One call per second: the first five fail, every later one succeeds. */
async function drive(mode: "observe" | "enforce"): Promise<{ refused: number; wouldRefuse: number; reachedSap: number }> {
  __setGovernedCircuitStore(new MemoryCircuitStore({ shared: true }));
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.useFakeTimers({ toFake: ["Date"] });
  const start = 1_700_000_000_000;
  let refused = 0;
  let reachedSap = 0;
  for (let second = 0; second < FAILURE_THRESHOLD + COOLDOWN_MS / 1000 + 10; second++) {
    vi.setSystemTime(start + second * 1000);
    const step = await containKey("connection:c", `corr-${second}`, mode);
    if (!step.ok) {
      refused++;
      continue;
    }
    reachedSap++;
    const outcome: CallOutcome = second < FAILURE_THRESHOLD ? "upstream-error" : "ok";
    await step.value.record(outcome);
  }
  const wouldRefuse = warn.mock.calls.filter(([m]) => m === "[circuit] would refuse").length;
  warn.mockRestore();
  vi.useRealTimers();
  return { refused, wouldRefuse, reachedSap };
}

describe("observe logs a would-refuse for exactly the calls enforce refuses", () => {
  it("through a full cooldown after the circuit opens on a system that has recovered", async () => {
    const enforce = await drive("enforce");
    const observe = await drive("observe");
    // Enforce refuses the whole cooldown, then one probe closes the circuit.
    expect(enforce.refused).toBeGreaterThan(20);
    expect(enforce.wouldRefuse).toBe(0);
    // Observe refuses nothing and says so the same number of times.
    expect(observe.refused).toBe(0);
    expect(observe.wouldRefuse).toBe(enforce.refused);
    expect(observe.reachedSap).toBe(enforce.reachedSap + enforce.refused);
  });
});
