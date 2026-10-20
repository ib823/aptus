/**
 * Mock fixtures — the recorded truth a developer tests against offline.
 *
 * WHY THIS MATTERS MORE THAN IT LOOKS. A developer can build against the OpenAPI
 * contract, but their CI cannot call a customer's SAP tenant — it should not
 * even try. Without recorded responses, their tests either hit the real system
 * (unacceptable) or run against hand-written stubs that drift from reality and
 * quietly stop proving anything.
 *
 * EVERY HONEST STATE, NOT JUST THE HAPPY ONE. A mock that only serves data
 * lets a developer prove their code works when everything is fine — which is
 * precisely when it does not matter. The states that break integrations are
 * "empty", "not set up", "no such dataset" and "upstream failed", so those are
 * recordable too and the generated mock serves them on demand.
 *
 * ONE SCENARIO PER BROKER OUTCOME, WITH THE BROKER'S STATUS AND CODE (P0.4,
 * A57). The scenarios were four, and a run the broker answers 404 NOT_FOUND
 * ("the requested entity set does not exist") was recorded as `error` and
 * served by the mock as 502 UPSTREAM_ERROR "The tenant could not be reached":
 * the developer's suite then tested a retry path for what is a configuration
 * fault, and the real 404 met an untested branch in production. A timeout and
 * a 5xx could not be recorded at all. Now each read outcome
 * (NorthboundReadStatus) maps to exactly one scenario, and the status and code
 * come from the broker's own tables (read.ts: httpStatusFor,
 * northboundErrorCodeFor), so the mock cannot answer differently from the
 * broker. tests/unit/studio/mock-broker-status-parity.test.ts drives every
 * failure reason through both.
 */

import {
  httpStatusFor,
  northboundErrorCodeFor,
  type NorthboundReadStatus,
} from "@/lib/northbound/read-status";
import { stripODataEnvelope } from "@/lib/sap-public/odata-envelope";

export const FIXTURE_SCENARIOS = ["data", "empty", "needs_setup", "not_found", "timeout", "error"] as const;
export type FixtureScenario = (typeof FIXTURE_SCENARIOS)[number];

export function isFixtureScenario(value: string): value is FixtureScenario {
  return (FIXTURE_SCENARIOS as readonly string[]).includes(value);
}

/** Every broker read outcome, for code that must cover them all. */
export const READ_STATUSES: readonly NorthboundReadStatus[] = [
  "OK",
  "EMPTY",
  "NEEDS_SETUP",
  "NOT_FOUND",
  "TIMEOUT",
  "ERROR",
];

export function isReadStatus(value: string): value is NorthboundReadStatus {
  return (READ_STATUSES as readonly string[]).includes(value);
}

/**
 * The scenario a broker read outcome demonstrates. Exhaustive over the
 * broker's statuses: adding one is a compile error here until it has a
 * scenario, which is the point.
 */
export function scenarioForReadStatus(status: NorthboundReadStatus, rowCount: number): FixtureScenario {
  switch (status) {
    case "OK":
    case "EMPTY":
      // By the rows, as the broker's own classification is: an OK carries rows.
      return rowCount > 0 ? "data" : "empty";
    case "NEEDS_SETUP":
      return "needs_setup";
    case "NOT_FOUND":
      return "not_found";
    case "TIMEOUT":
      return "timeout";
    case "ERROR":
      return "error";
  }
}

/** The broker read outcome each scenario stands for — the inverse of the above. */
const SCENARIO_READ_STATUS: Record<FixtureScenario, NorthboundReadStatus> = {
  data: "OK",
  empty: "EMPTY",
  needs_setup: "NEEDS_SETUP",
  not_found: "NOT_FOUND",
  timeout: "TIMEOUT",
  error: "ERROR",
};

/**
 * Map a Test Console outcome, in the console's HONEST-STATUS vocabulary, to the
 * scenario it demonstrates — for a capture sent by a console that predates
 * `readStatus` (a browser tab open across the deploy).
 *
 * `null` means "nothing worth recording". NOT_FOUND is `not_found` now, not
 * `error` (A57). PROBE_FAILED (a TIMEOUT or an ERROR, which the old console
 * folded together) is told apart by the broker status it carried.
 */
export function scenarioForOutcome(
  honestStatus: string,
  rowCount: number,
  brokerHttpStatus?: number | null,
): FixtureScenario | null {
  switch (honestStatus) {
    case "ACTIVATED":
      return rowCount > 0 ? "data" : "empty";
    case "NEEDS_SETUP":
      return "needs_setup";
    case "NOT_FOUND":
      return "not_found";
    case "PROBE_FAILED":
      return brokerHttpStatus === 504 ? "timeout" : brokerHttpStatus === 502 ? "error" : null;
    case "NOT_PROBEABLE":
      return "error";
    default:
      return null;
  }
}

/** The HTTP status the northbound broker returns for each scenario — its own table. */
export const SCENARIO_STATUS: Record<FixtureScenario, number> = {
  // An empty resource is a SUCCESSFUL read. The mock must teach that, or every
  // consumer learns to treat "no records" as a fault.
  data: httpStatusFor("OK"),
  empty: httpStatusFor("EMPTY"),
  needs_setup: httpStatusFor("NEEDS_SETUP"),
  not_found: httpStatusFor("NOT_FOUND"),
  timeout: httpStatusFor("TIMEOUT"),
  error: httpStatusFor("ERROR"),
};

/**
 * What the mock says when the run carries no sentence of its own — the
 * broker's sentence for the commonest cause of each outcome. A capture that
 * carries the run's `detail` uses that instead: it is the sentence the broker
 * sent for this run.
 */
const DEFAULT_FAILURE_MESSAGE: Record<Exclude<FixtureScenario, "data" | "empty">, string> = {
  needs_setup:
    "The tenant refused this read (HTTP 403): the communication arrangement is not set up, or this entity is not released to the connected user.",
  not_found: "The requested entity set does not exist on this tenant.",
  timeout: "The tenant did not respond in time.",
  error: "The read could not be completed.",
};

/** The longest run sentence a fixture keeps; the broker's own are far shorter. */
export const MAX_FIXTURE_MESSAGE_LENGTH = 500;

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
 *
 * `message` is the run's own sentence (the broker's `detail`) when the capture
 * carried one; the error CODE is never the caller's to choose — it is the
 * broker's code for the scenario.
 */
export const MAX_FIXTURE_ROWS = 25;

export function buildFixtureBody(
  scenario: FixtureScenario,
  records: readonly Record<string, unknown>[],
  message?: string | null,
): FixtureBody {
  switch (scenario) {
    case "data": {
      // Stripped as well as truncated: see stripFixtureEnvelope.
      const kept = records.slice(0, MAX_FIXTURE_ROWS).map(stripODataEnvelope);
      return {
        records: kept,
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
    case "not_found":
    case "timeout":
    case "error": {
      const said = message?.trim().slice(0, MAX_FIXTURE_MESSAGE_LENGTH);
      return {
        error: {
          code: northboundErrorCodeFor(SCENARIO_READ_STATUS[scenario] as Exclude<NorthboundReadStatus, "OK" | "EMPTY">),
          message: said ? said : DEFAULT_FAILURE_MESSAGE[scenario],
          correlationId: `fixture-${scenario.replace(/_/g, "-")}`,
        },
      };
    }
  }
}

/** A stored fixture, as the kit reads it. */
export interface StoredFixture {
  scenario: string;
  status: number;
  body: unknown;
  sourceStatus?: number | null;
  capturedAt?: string | null;
}

/**
 * A stored fixture as the broker would answer the run it recorded.
 *
 * Fixtures captured before `not_found` existed recorded a 404 run as `error`,
 * with status 502 and an UPSTREAM_ERROR body — beside the 404 the run returned
 * (`sourceStatus`). That is A57 in stored data: it is corrected on the way
 * out, like stripFixtureEnvelope, so the next download is right without anyone
 * re-recording. Anything else is returned as it is.
 */
export function servedFixture<F extends StoredFixture>(fixture: F): F {
  if (fixture.scenario !== "error" || fixture.sourceStatus !== SCENARIO_STATUS.not_found) return fixture;
  return { ...fixture, scenario: "not_found", status: SCENARIO_STATUS.not_found, body: buildFixtureBody("not_found", []) };
}

/**
 * Every stored fixture as served, one per scenario. A legacy 404 `error` row
 * becomes `not_found` (servedFixture), and may then meet a real `not_found`
 * recording: the later capture wins, as a re-capture replaces.
 */
export function servedFixtures<F extends StoredFixture>(fixtures: readonly F[]): F[] {
  const byScenario = new Map<string, F>();
  for (const f of fixtures.map(servedFixture)) {
    const held = byScenario.get(f.scenario);
    if (!held || (f.capturedAt ?? "") > (held.capturedAt ?? "")) byScenario.set(f.scenario, f);
  }
  return [...byScenario.values()];
}

/**
 * A stored fixture body with SAP's OData envelope removed from its records.
 *
 * A fixture is the one sink of tenant rows that leaves the product: it is
 * written into the starter kit's fixtures.json and served by its mock. Rows
 * captured from a V2 service carried `__metadata.uri` and a `__deferred.uri`
 * per navigation — absolute URLs on the tenant's host — so every kit handed
 * the developer the hostname the broker exists to keep from them, and the mock
 * taught their code that records come with direct SAP addresses. Schema
 * capture, fed the same rows, had always dropped them.
 *
 * Applied at capture AND when the kit is built, because fixtures recorded
 * before capture stripped them are still stored; cleaning them on the way out
 * means the next download is clean without anyone re-recording. Anything that
 * is not a records-bearing body is returned as it is.
 */
export function stripFixtureEnvelope(body: unknown): unknown {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return body;
  const { records } = body as { records?: unknown };
  if (!Array.isArray(records)) return body;
  return {
    ...body,
    records: records.map((row: unknown) =>
      row !== null && typeof row === "object" && !Array.isArray(row)
        ? stripODataEnvelope(row as Record<string, unknown>)
        : row,
    ),
  };
}
