/**
 * P0.2: the lane board answers from the broker's own functions. One
 * regression per audit finding (A14-A19, A50, A60), each written against the
 * case the finding describes; the property test
 * (tests/property/northbound-governance.property.test.ts) proves the general
 * claim — "Live" implies "the broker would serve" — over every generated case.
 *
 * Pure: the facts are built by `laneAuthorisation` and `laneEvidence` from
 * plain rows, exactly as `listLanes` and the sweep build them.
 */

import { describe, expect, it } from "vitest";

import { CONNECTION_PROOF_TTL_MS, connectionHealthVerdict, describeLastProbe } from "@/lib/coreedge/freshness";
import {
  laneAuthorisation,
  laneEvidence,
  narrowReadOutcome,
  type LaneCheckRow,
  type LaneConnection,
  type LaneCredentialRow,
  type LaneGrantRow,
} from "@/lib/coreedge/lane-authorisation";
import { deriveLaneStatus, LEDGER_READ_STATUSES, type LaneEnvironment, type LaneFacts } from "@/lib/coreedge/lanes";
import { readableServices, serviceHealthFactsOf } from "@/lib/coreedge/service-health";
import type { AuthorisableInterface, BindingEstate } from "@/lib/northbound/authorisation";
import { ledgerReadStatus, planLaneCheck } from "@/lib/ops/lane-check-sweep";
import { deriveConnection } from "@/lib/ops/topology";
import type { GrantBindingMode } from "@/lib/studio/grant-binding";

const NOW = new Date("2026-10-21T12:00:00Z");
const HOUR = 3_600_000;
const RECENT = new Date(NOW.getTime() - HOUR);

function feed(patch: Partial<AuthorisableInterface> = {}): AuthorisableInterface {
  return {
    id: "if_1",
    name: "Business partners",
    solutionId: "sol_1",
    externalId: "API_BUSINESS_PARTNER",
    sapProduct: "s4hana",
    operation: "READ",
    mode: "READ",
    status: "ACTIVE",
    entitySet: "A_BusinessPartner",
    version: 4,
    servicePath: null,
    odataVersion: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    grantMatchChangedAt: null,
    ...patch,
  };
}

function grant(patch: Partial<LaneGrantRow> = {}): LaneGrantRow {
  return {
    id: "g_1",
    decision: "APPROVED",
    expiresAt: new Date(NOW.getTime() + 30 * 24 * HOUR),
    revokedAt: null,
    operation: "READ",
    externalId: "API_BUSINESS_PARTNER",
    environment: "PROD",
    interfaceId: "if_1",
    sapProduct: "s4hana",
    createdAt: new Date("2026-02-01T00:00:00Z"),
    unboundCutoffAt: null,
    ...patch,
  };
}

function credential(patch: Partial<LaneCredentialRow> = {}): LaneCredentialRow {
  return {
    environment: "PROD",
    sapClient: null,
    isActive: true,
    revokedAt: null,
    expiresAt: new Date(NOW.getTime() + 30 * 24 * HOUR),
    writeKeyIssued: true,
    ...patch,
  };
}

function connection(patch: Partial<LaneConnection> = {}): LaneConnection {
  return {
    id: "conn_prod",
    label: "S/4 PROD",
    environment: "PROD",
    client: null,
    baseUrl: "https://my1.s4hana.ondemand.com",
    writeEnabled: true,
    ...patch,
  };
}

const FRESH_CHECK: LaneCheckRow = {
  connectionId: "conn_prod",
  entitySet: "A_BusinessPartner",
  interfaceVersion: 4,
  probeStatus: "OK",
  probeAt: RECENT,
  readStatus: "OK",
  readAt: RECENT,
  readRowCount: 1,
};

/** A lane drawn the way listLanes draws it, from rows. */
function laneFrom(input: {
  iface?: AuthorisableInterface;
  environment?: LaneEnvironment;
  grants?: LaneGrantRow[];
  credential?: LaneCredentialRow | null;
  estate?: BindingEstate<LaneConnection>;
  check?: LaneCheckRow | undefined;
  bindingMode?: GrantBindingMode;
}) {
  const iface = input.iface ?? feed();
  const auth = laneAuthorisation({
    iface,
    solutionId: "sol_1",
    environment: input.environment ?? "PROD",
    grants: input.grants ?? [grant()],
    credential: input.credential === undefined ? credential() : input.credential,
    estate: input.estate ?? { kind: "connections", connections: [connection()] },
    now: NOW,
    bindingMode: input.bindingMode ?? "legacy",
  });
  // As listLanes judges it: against the connection the sweep reads through.
  const evidence = laneEvidence("check" in input ? input.check : FRESH_CHECK, auth.bound, iface);
  const facts: LaneFacts = {
    lane: { operation: iface.operation as "READ", environment: input.environment ?? "PROD", route: auth.route },
    appRetired: false,
    key: auth.key,
    access: auth.access,
    binding: auth.binding,
    probe: evidence.probe,
    read: evidence.read,
    evidenceSuperseded: evidence.superseded,
    evidencePredatesKey: evidence.predatesKey,
    sweep: { appIsActive: true, feedHasDataset: true, feedServiceResolves: true },
    now: NOW,
  };
  return { auth, verdict: deriveLaneStatus(facts) };
}

describe("the healthy lane the regressions spoil", () => {
  it("is Live", () => {
    expect(laneFrom({}).verdict.status).toBe("live");
  });
});

describe("A14: the access hop applies the broker's grant and interface rules", () => {
  it("SANDBOX_ONLY does not authorise a PROD lane, and the sweep does not read it", () => {
    const g = grant({ decision: "SANDBOX_ONLY" });
    expect(laneFrom({ grants: [g] }).verdict).toMatchObject({ status: "noAccess", brokenHop: "access" });
    const plan = planLaneCheck({
      solutionStatus: "ACTIVE",
      feed: feed(),
      environment: "PROD",
      grants: [g],
      credential: credential(),
      estate: { kind: "connections", connections: [connection()] },
      now: NOW,
    });
    expect(plan).toEqual({ ok: false, skipped: "accessRefused" });
  });

  it("a DEPRECATED feed is refused at access", () => {
    const v = laneFrom({ iface: feed({ status: "DEPRECATED" }) }).verdict;
    expect(v.status).toBe("noAccess");
    expect(v.because).toContain("deprecated");
  });

  it("READ_ONLY does not authorise a CREATE lane", () => {
    const iface = feed({ operation: "CREATE", mode: "WRITE" });
    const v = laneFrom({ iface, grants: [grant({ decision: "READ_ONLY", operation: "CREATE" })] }).verdict;
    expect(v).toMatchObject({ status: "noAccess", brokenHop: "access" });
  });

  it("a legacy unbound grant is honoured under legacy and refused under strict, as the broker does (wave 1a)", () => {
    const unbound = grant({ interfaceId: null, sapProduct: null, unboundCutoffAt: new Date("2026-03-01T00:00:00Z") });
    expect(laneFrom({ grants: [unbound], bindingMode: "legacy" }).verdict.status).toBe("live");
    const strict = laneFrom({ grants: [unbound], bindingMode: "strict" }).verdict;
    expect(strict.status).toBe("noAccess");
    expect(strict.because).toContain("approving again");
  });

  it("a grant bound to the same service on ANOTHER product authorises nothing here (A47)", () => {
    const v = laneFrom({ grants: [grant({ sapProduct: "s4hana-onprem" })] }).verdict;
    expect(v.status).toBe("noAccess");
  });

  it("a pending renewal beside a live approval is live access, not In review", () => {
    // The newest grant used to decide; the broker asks whether ANY grant authorises.
    const pending = grant({ id: "g_2", decision: "REQUESTED", createdAt: new Date("2026-10-01T00:00:00Z") });
    expect(laneFrom({ grants: [pending, grant()] }).verdict.status).toBe("live");
  });

  it("a write lane whose sealed write key will not open is refused at the key, as the write route refuses it", () => {
    // P0.2 review: the board asked only whether a blob existed; the write
    // route opens it on every call and refuses the write when it will not.
    const iface = feed({ operation: "CREATE", mode: "WRITE" });
    const v = laneFrom({
      iface,
      grants: [grant({ operation: "CREATE" })],
      credential: credential({ writeKeyUnopenable: true }),
    }).verdict;
    expect(v).toMatchObject({ status: "keyNotValid", brokenHop: "key" });
    expect(v.because).toContain("cannot open");
    // A read lane on the same credential does not ask for the write key.
    expect(laneFrom({ credential: credential({ writeKeyUnopenable: true }) }).verdict.status).toBe("live");
  });

  it("a write lane with no write key issued is refused at the key", () => {
    const iface = feed({ operation: "CREATE", mode: "WRITE" });
    const v = laneFrom({
      iface,
      grants: [grant({ operation: "CREATE" })],
      credential: credential({ writeKeyIssued: false }),
    }).verdict;
    expect(v).toMatchObject({ status: "noKey", brokenHop: "key" });
  });
});

describe("A15: binding is the broker's, on product and SAP client", () => {
  // Two products in one environment, through listLanes itself:
  // tests/unit/ops/lane-check-custom-service.test.ts ("binds on the feed's product").

  it("a credential bound to client 080 with only a client-100 connection is refused, never Live on 100's proof", () => {
    const v = laneFrom({
      credential: credential({ sapClient: "080" }),
      estate: { kind: "connections", connections: [connection({ client: "100" })] },
      check: { ...FRESH_CHECK },
    }).verdict;
    expect(v).toMatchObject({ status: "noSapSystem", brokenHop: "binding" });
    expect(v.because).toContain("SAP client");
  });

  it("the sweep binds the same way, so it never reads through the other client's row", () => {
    const plan = planLaneCheck({
      solutionStatus: "ACTIVE",
      feed: feed(),
      environment: "PROD",
      grants: [grant()],
      credential: credential({ sapClient: "080" }),
      estate: {
        kind: "connections",
        connections: [connection({ id: "c100", client: "100" }), connection({ id: "c080", client: "080" })],
      },
      now: NOW,
    });
    expect(plan.ok && plan.connection.id).toBe("c080");
  });

  it("a connection that will not open is drawn as the broker refuses it", () => {
    expect(laneFrom({ estate: { kind: "unreadable" } }).verdict.status).toBe("secretUnreadable");
  });

  it("writes switched off on the bound connection draw the write lane System off", () => {
    const iface = feed({ operation: "CREATE", mode: "WRITE" });
    const v = laneFrom({
      iface,
      grants: [grant({ operation: "CREATE" })],
      estate: { kind: "connections", connections: [connection({ writeEnabled: false })] },
    }).verdict;
    expect(v).toMatchObject({ status: "systemOff", brokenHop: "binding" });
  });
});

describe("a write gate is a setting, not a change (P0.2 review)", () => {
  const iface = feed({ operation: "CREATE", mode: "WRITE" });
  const grants = [grant({ operation: "CREATE" })];

  it("writes off, with a fresh check through the bound connection: refused by a setting, never 'changed since check'", () => {
    const { auth, verdict } = laneFrom({
      iface,
      grants,
      estate: { kind: "connections", connections: [connection({ writeEnabled: false })] },
    });
    // The sweep reads through the bound connection, so its check is not superseded.
    expect(auth.connection).toBeNull();
    expect(auth.bound?.id).toBe("conn_prod");
    expect(laneEvidence(FRESH_CHECK, auth.bound, iface).superseded).toBe(false);
    expect(verdict).toMatchObject({ status: "systemOff", brokenHop: "binding", unchecked: "refusedBySetting" });
  });

  it("a custom service not verified through the bound connection: refused by a setting too", () => {
    const custom = feed({
      operation: "CREATE",
      mode: "WRITE",
      externalId: "custom:/sap/opu/odata/sap/ZUI_TRAVEL_O2",
      servicePath: "/sap/opu/odata/sap/ZUI_TRAVEL_O2",
      odataVersion: "V2",
    });
    const { auth, verdict } = laneFrom({
      iface: custom,
      grants: [grant({ operation: "CREATE", externalId: custom.externalId })],
    });
    expect(auth.binding.refusal).toBe("CUSTOM_SERVICE_UNVERIFIED");
    expect(verdict.unchecked).toBe("refusedBySetting");
  });
});

describe("A16: an unproven hop is drawn unproven", () => {
  it("no check at all: access, key and binding passed, the rest not checked", () => {
    const { verdict } = laneFrom({ check: undefined });
    expect(verdict.status).toBe("unknown");
    const state = (hop: string) => verdict.hops.find((h) => h.hop === hop)?.state;
    expect([state("access"), state("key"), state("binding")]).toEqual(["ok", "ok", "ok"]);
    expect([state("sapMetadata"), state("sapDataRead"), state("app")]).toEqual(["unknown", "unknown", "unknown"]);
  });

  it("metadata proven but no read: the read hop and the app are not checked", () => {
    const { verdict } = laneFrom({ check: { ...FRESH_CHECK, readStatus: null, readAt: null, readRowCount: null } });
    const state = (hop: string) => verdict.hops.find((h) => h.hop === hop)?.state;
    expect(state("sapMetadata")).toBe("ok");
    expect(state("sapDataRead")).toBe("unknown");
    expect(state("app")).toBe("unknown");
  });
});

describe("A17: the reader keeps every status the ledger writes", () => {
  it("every status ledgerReadStatus can emit narrows to itself", () => {
    const emitted = new Set([
      ledgerReadStatus("OK", 200),
      ledgerReadStatus("EMPTY", 200),
      ledgerReadStatus("NOT_FOUND", 404),
      ledgerReadStatus("TIMEOUT", null),
      ledgerReadStatus("ERROR", 403),
      ledgerReadStatus("ERROR", 401),
      ledgerReadStatus("ERROR", 500),
    ]);
    for (const s of emitted) {
      expect(LEDGER_READ_STATUSES).toContain(s);
      expect(narrowReadOutcome(s)).toBe(s);
    }
  });

  it("a 401 read is a refused sign-in, not 'no read has been proven'", () => {
    const v = laneFrom({ check: { ...FRESH_CHECK, readStatus: "UNAUTHORIZED" } }).verdict;
    expect(v).toMatchObject({ status: "signInRefused", brokenHop: "sapDataRead" });
  });

  it("a 404 read says the dataset was not found", () => {
    const v = laneFrom({ check: { ...FRESH_CHECK, readStatus: "NOT_FOUND" } }).verdict;
    expect(v.status).not.toBe("live");
    expect(v.because).toContain("404");
    expect(v.because).not.toContain("no read has been proven");
  });

  it("a 404 read is drawn failed at the read hop, not 'not checked' (P0.2 review)", () => {
    // The strip said the read was never checked, beside a sentence saying it
    // was checked and SAP answered 404. The chip stays Unknown (no status for
    // a 404 yet); the strip draws what was observed.
    const v = laneFrom({ check: { ...FRESH_CHECK, readStatus: "NOT_FOUND" } }).verdict;
    const state = (hop: string) => v.hops.find((h) => h.hop === hop)?.state;
    expect(v.status).toBe("unknown");
    expect(v.checkedAt).not.toBeNull();
    expect(state("sapMetadata")).toBe("ok");
    expect(state("sapDataRead")).toBe("broken");
    expect(state("app")).toBe("unreached");
  });
});

describe("A18: evidence is tied to the connection, dataset and feed version that produced it", () => {
  it("a check made through a replaced connection is set aside", () => {
    const v = laneFrom({
      estate: { kind: "connections", connections: [connection({ id: "conn_new" })] },
    }).verdict;
    expect(v).toMatchObject({ status: "unknown", unchecked: "changedSinceCheck" });
  });

  it("a check against another entity set, or an earlier version of the feed, is set aside", () => {
    expect(laneFrom({ check: { ...FRESH_CHECK, entitySet: "A_Other" } }).verdict).toMatchObject({
      status: "unknown",
      unchecked: "changedSinceCheck",
    });
    expect(laneFrom({ check: { ...FRESH_CHECK, interfaceVersion: 3 } }).verdict).toMatchObject({
      status: "unknown",
      unchecked: "changedSinceCheck",
    });
  });

  it("a row written before checks were keyed is set aside without claiming anything changed (P0.2 review)", () => {
    // Every LaneCheck row on the day of the migration: entitySet and
    // interfaceVersion NULL. Nothing changed; we only do not know what it proved.
    const v = laneFrom({ check: { ...FRESH_CHECK, entitySet: null, interfaceVersion: null } }).verdict;
    expect(v).toMatchObject({ status: "unknown", unchecked: "checkPredatesEvidenceKey" });
    expect(v.because).not.toMatch(/changed after/);
    expect(laneEvidence({ ...FRESH_CHECK, interfaceVersion: null }, connection(), feed())).toMatchObject({
      superseded: true,
      predatesKey: true,
    });
  });
});

describe("A19: 'Never checked' is decided by the probe status, not by the last success", () => {
  it("a connection failing every night is not 'Never'", () => {
    const cell = describeLastProbe({ lastValidationStatus: "UNAUTHORIZED", lastValidatedAt: null }, NOW);
    expect(cell.headline).toBe("UNAUTHORIZED");
    expect(cell.detail).toBe("last succeeded never");
  });

  it("only a connection with no recorded status reads Never checked", () => {
    expect(describeLastProbe({ lastValidationStatus: null, lastValidatedAt: null }, NOW).headline).toBe("Never checked");
  });
});

describe("A50: connection health decays", () => {
  const old = new Date(NOW.getTime() - CONNECTION_PROOF_TTL_MS - HOUR);

  it("an OK older than the TTL is stale, not healthy", () => {
    expect(connectionHealthVerdict({ lastValidationStatus: "OK", lastValidatedAt: RECENT }, NOW)).toBe("healthy");
    expect(connectionHealthVerdict({ lastValidationStatus: "OK", lastValidatedAt: old }, NOW)).toBe("stale");
    expect(connectionHealthVerdict({ lastValidationStatus: "UNREADABLE", lastValidatedAt: RECENT }, NOW)).toBe(
      "unreadable",
    );
  });

  it("a sibling of an unopenable connection is unreadable too, and says the fault is elsewhere (P0.2 review)", () => {
    const sibling = { lastValidationStatus: "GROUP_UNREADABLE", lastValidatedAt: RECENT };
    expect(connectionHealthVerdict(sibling, NOW)).toBe("unreadable");
    expect(describeLastProbe(sibling, NOW).headline).toBe(
      "GROUP_UNREADABLE · another connection for this product will not open",
    );
    expect(describeLastProbe({ lastValidationStatus: "UNREADABLE", lastValidatedAt: RECENT }, NOW).headline).toBe(
      "UNREADABLE · the secret would not open",
    );
  });

  it("the topology lens no longer draws a stale OK as observed-good", () => {
    const d = deriveConnection(
      { environment: "PROD", lastValidationStatus: "OK", lastValidatedAt: old, isActive: true },
      NOW,
    );
    expect(d.state).toBe("never-observed");
    expect(d.badge).toBe("STALE");
  });

  /*
   * P0.2 review round 7. Clearing UNREADABLE / GROUP_UNREADABLE once the set
   * opens writes a null status and keeps the last success time. Topology
   * decided "never observed" from `lastValidatedAt` alone, so that row — no
   * probe since the clear, its last success 30 days old — was drawn green
   * while every other screen said "never tested".
   */
  it("a cleared status beside an old last success is not drawn observed-good (round 7)", () => {
    for (const at of [RECENT, old, new Date(NOW.getTime() - 30 * 24 * HOUR)]) {
      const cleared = { environment: "PROD", lastValidationStatus: null, lastValidatedAt: at, isActive: true };
      expect(connectionHealthVerdict(cleared, NOW)).toBe("neverTested");
      expect(deriveConnection(cleared, NOW).state).toBe("never-observed");
    }
  });

  it("topology draws observed-good exactly when the shared verdict is healthy (round 7)", () => {
    const statuses = [null, "OK", "UNREADABLE", "GROUP_UNREADABLE", "UNAUTHORIZED", "TIMEOUT", "NO_PROBE_PATH"];
    const dates = [null, RECENT, old, new Date(NOW.getTime() - 30 * 24 * HOUR)];
    for (const lastValidationStatus of statuses) {
      for (const lastValidatedAt of dates) {
        const c = { environment: "PROD", lastValidationStatus, lastValidatedAt, isActive: true };
        const verdict = connectionHealthVerdict(c, NOW);
        expect({ lastValidationStatus, lastValidatedAt, good: deriveConnection(c, NOW).state === "observed-good" }).toEqual({
          lastValidationStatus,
          lastValidatedAt,
          good: verdict === "healthy",
        });
      }
    }
  });

  it("SAP systems does not say 'Never checked' for a cleared status with a probe history (round 7)", () => {
    const cell = describeLastProbe({ lastValidationStatus: null, lastValidatedAt: old }, NOW);
    expect(cell.headline).not.toBe("Never checked");
    expect(cell.detail).toMatch(/^last succeeded /);
    expect(cell.detail).not.toBe("last succeeded never");
  });
});

describe("A60: 'Services readable' counts only fresh proof", () => {
  it("a read proven months ago is not readable", () => {
    const months = new Date(NOW.getTime() - 120 * 24 * HOUR);
    const rows = [
      { metadataStatus: "OK", metadataAt: RECENT, readStatus: "OK", readAt: RECENT, readRowCount: 1 },
      { metadataStatus: "OK", metadataAt: months, readStatus: "OK", readAt: months, readRowCount: 1 },
      { metadataStatus: "OK", metadataAt: RECENT, readStatus: "EMPTY", readAt: RECENT, readRowCount: 0 },
    ];
    expect(readableServices(rows, NOW)).toEqual({ readable: 2, unproven: 1 });
  });

  it("an observed 401 on a read is failing, not 'not proven' (round 3: the A17 drop, in the A60 reader)", () => {
    // The metadata probe asked the connection's default service and signed
    // in; the read asked this feed's service and SAP answered 401. The sweep
    // writes exactly what ledgerReadStatus returns, so that is the input.
    const readStatus = ledgerReadStatus("ERROR", 401);
    expect(readStatus).toBe("UNAUTHORIZED");
    const rows = [{ metadataStatus: "OK", metadataAt: RECENT, readStatus, readAt: RECENT, readRowCount: null }];
    expect(readableServices(rows, NOW)).toEqual({ readable: 0, unproven: 0 });
  });

  it("every read status the sweep writes is one the reader keeps", () => {
    for (const readStatus of LEDGER_READ_STATUSES) {
      const row = { metadataStatus: "OK", metadataAt: RECENT, readStatus, readAt: RECENT, readRowCount: 1 };
      expect(serviceHealthFactsOf(row).readStatus, readStatus).toBe(readStatus);
    }
  });
});
