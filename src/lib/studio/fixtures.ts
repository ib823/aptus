/**
 * Mock fixtures — the recorded truth a developer tests against offline.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. A developer can build against the OpenAPI
 * contract, but their CI cannot call a customer's SAP tenant — it should not
 * even try. Without recorded responses, their tests either hit the real system
 * (unacceptable) or run against hand-written stubs that drift from reality and
 * quietly stop proving anything.
 *
 * ALL FOUR HONEST STATES, NOT JUST THE HAPPY ONE. A mock that only serves data
 * lets a developer prove their code works when everything is fine — which is
 * precisely when it does not matter. The states that break integrations are
 * "empty", "not set up" and "upstream failed", so those are recordable too and
 * the generated mock serves them on demand.
 */

export const FIXTURE_SCENARIOS = ["data", "empty", "needs_setup", "error"] as const;
export type FixtureScenario = (typeof FIXTURE_SCENARIOS)[number];

export function isFixtureScenario(value: string): value is FixtureScenario {
  return (FIXTURE_SCENARIOS as readonly string[]).includes(value);
}

/**
 * Map a Test Console outcome to the scenario it demonstrates.
 *
 * `null` means "nothing worth recording": a run that failed for a local reason
 * teaches a consumer nothing about how the tenant behaves.
 */
export function scenarioForOutcome(
  honestStatus: string,
  rowCount: number,
): FixtureScenario | null {
  switch (honestStatus) {
    case "ACTIVATED":
      return rowCount > 0 ? "data" : "empty";
    case "NEEDS_SETUP":
      return "needs_setup";
    case "NOT_PROBEABLE":
    case "NOT_FOUND":
      return "error";
    default:
      return null;
  }
}

/** The HTTP status the northbound broker returns for each scenario. */
export const SCENARIO_STATUS: Record<FixtureScenario, number> = {
  // An empty resource is a SUCCESSFUL read. The mock must teach that, or every
  // consumer learns to treat "no records" as a fault.
  data: 200,
  empty: 200,
  needs_setup: 403,
  error: 502,
};

export interface FixtureBody {
  /** Present for the 2xx scenarios. */
  records?: Record<string, unknown>[];
  count?: number;
  empty?: boolean;
  note?: string;
  /** Present for the failure scenarios, mirroring the real error envelope. */
  error?: { code: string; message: string; correlationId: string };
}

/**
 * Build the body the mock will serve, in exactly the shape the real broker
 * returns — so code that works against the mock works against the tenant.
 *
 * Records are truncated: a fixture is an example, not a data export, and
 * shipping a thousand rows of a client's business data inside a starter kit
 * would be a leak dressed up as a convenience.
 */
export const MAX_FIXTURE_ROWS = 25;

export function buildFixtureBody(
  scenario: FixtureScenario,
  records: readonly Record<string, unknown>[],
): FixtureBody {
  switch (scenario) {
    case "data": {
      const kept = records.slice(0, MAX_FIXTURE_ROWS);
      return {
        records: kept as Record<string, unknown>[],
        count: kept.length,
        empty: false,
        note: `${kept.length} record${kept.length === 1 ? "" : "s"}.`,
      };
    }
    case "empty":
      return {
        records: [],
        count: 0,
        empty: true,
        note: "No records. The service answered successfully and has nothing to return.",
      };
    case "needs_setup":
      return {
        error: {
          code: "FORBIDDEN",
          message:
            "The tenant rejected the request: the communication arrangement is not set up, or this entity is not released to the connected user.",
          correlationId: "fixture-needs-setup",
        },
      };
    case "error":
      return {
        error: {
          code: "UPSTREAM_ERROR",
          message: "The tenant could not be reached.",
          correlationId: "fixture-error",
        },
      };
  }
}
