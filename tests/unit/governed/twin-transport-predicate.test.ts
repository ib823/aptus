// @vitest-environment node
/**
 * The connection's transport is part of the one predicate (wave 2 integration
 * review round 3).
 *
 * A connection marked TWIN (SapConnection.transport) is refused by the
 * broker's binding step with 503 TRANSPORT_UNAVAILABLE while no twin engine
 * is registered, and is never sent anything by it once one is. The other
 * consumers did not see the column: the lane board drew such a lane Live,
 * discovery said `callable: true`, the lane sweep, the rotation probe and the
 * console kept sending the connection's stored credentials to its base URL.
 * Each now asks transport.ts (`transportRefusal`, `reachedDirectly`). The
 * property test holds the board to the broker with transport as a factor
 * (tests/property/northbound-governance.property.test.ts); the database-backed
 * consumers are tests/integration/twin-transport-consumers.test.ts.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import type * as ConnectionResolver from "@/lib/sap-public/connection-resolver";

const listed = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof ConnectionResolver>()),
  listBindableConnections: async () => listed.rows,
}));
// The definition step after the binding: the catalogue, not under test here.
vi.mock("@/lib/northbound/read-definition", () => ({
  resolveReadDefinition: async () => ({ ok: true, service: { path: "/sap/opu/odata/sap/API_BUSINESS_PARTNER" }, entitySet: "A_BusinessPartner" }),
}));

import { laneAuthorisation, type LaneConnection } from "@/lib/coreedge/lane-authorisation";
import { reachedDirectly, registerTwinEngine, transportRefusal } from "@/lib/governed/transport";
import type { AuthorisableInterface } from "@/lib/northbound/authorisation";
import { readVerdicts } from "@/lib/northbound/read-verdict";
import { planLaneCheck } from "@/lib/ops/lane-check-sweep";
import { rotationProbeMayApply } from "@/lib/sap-public/rotation-probe";

const NOW = new Date("2026-10-21T12:00:00Z");
const DAY = 24 * 3_600_000;

const feed: AuthorisableInterface = {
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
};
const grant = {
  id: "g_1",
  decision: "APPROVED",
  expiresAt: new Date(NOW.getTime() + 30 * DAY),
  revokedAt: null,
  operation: "READ",
  externalId: "API_BUSINESS_PARTNER",
  environment: "PROD",
  interfaceId: "if_1",
  sapProduct: "s4hana",
  createdAt: new Date("2026-02-01T00:00:00Z"),
  unboundCutoffAt: null,
};
const credential = {
  environment: "PROD",
  sapClient: null,
  isActive: true,
  revokedAt: null,
  expiresAt: new Date(NOW.getTime() + 30 * DAY),
  writeKeyIssued: true,
};
const connection = (transport?: string): LaneConnection => ({
  id: "conn_prod",
  label: "S/4 PROD",
  environment: "PROD",
  client: null,
  baseUrl: "https://my1.s4hana.ondemand.com",
  writeEnabled: true,
  ...(transport === undefined ? {} : { transport }),
});

const authorise = (conn: LaneConnection) =>
  laneAuthorisation({
    iface: feed,
    solutionId: "sol_1",
    environment: "PROD",
    grants: [grant],
    credential,
    estate: { kind: "connections", connections: [conn] },
    now: NOW,
  });

afterEach(() => registerTwinEngine(null));

describe("the transport half of the predicate", () => {
  it("refuses a TWIN connection while no twin engine is registered; DIRECT and absent are served", () => {
    expect(transportRefusal({ transport: "TWIN" })).toBe("TRANSPORT_UNAVAILABLE");
    expect(transportRefusal({ transport: "DIRECT" })).toBeNull();
    expect(transportRefusal({})).toBeNull();
    registerTwinEngine({ handle: async () => new Response("{}") });
    expect(transportRefusal({ transport: "TWIN" })).toBeNull();
  });

  it("lets only a DIRECT connection be reached with the platform's own fetch", () => {
    expect(reachedDirectly({ transport: "DIRECT" })).toBe(true);
    expect(reachedDirectly({})).toBe(true);
    expect(reachedDirectly({ transport: "TWIN" })).toBe(false);
  });
});

describe("the lane board draws the broker's transport refusal", () => {
  it("a lane bound to a TWIN connection is refused at binding, never Live, and no check speaks for it", () => {
    const auth = authorise(connection("TWIN"));
    expect(auth.binding.refusal).toBe("TRANSPORT_UNAVAILABLE");
    expect(auth.connection).toBeNull();
    expect(auth.bound).toBeNull();
    expect(auth.notDirect).toBe(true);
    // Drawn from these facts: tests/unit/coreedge/lane-broker-agreement.test.ts.
  });

  it("the same lane on a DIRECT connection binds it, as before", () => {
    const auth = authorise(connection("DIRECT"));
    expect(auth.binding.refusal).toBeNull();
    expect(auth.bound?.id).toBe("conn_prod");
    expect(auth.notDirect).toBe(false);
  });

  it("with a twin engine registered the broker would serve it, and still nothing reads SAP through it", () => {
    registerTwinEngine({ handle: async () => new Response("{}") });
    const auth = authorise(connection("TWIN"));
    expect(auth.binding.refusal).toBeNull();
    expect(auth.connection?.id).toBe("conn_prod");
    expect(auth.bound).toBeNull();
  });

  it("the lane sweep and Re-check skip a TWIN connection rather than read its customer's SAP", () => {
    const plan = planLaneCheck({
      solutionStatus: "ACTIVE",
      feed,
      environment: "PROD",
      grants: [grant],
      credential,
      estate: { kind: "connections", connections: [connection("TWIN")] },
      now: NOW,
    });
    expect(plan).toEqual({ ok: false, skipped: "servedByTwin" });
  });
});

describe("discovery's callable asks the same predicate", () => {
  it("a read bound to a TWIN connection is not callable: TRANSPORT_UNAVAILABLE, as the data route answers", async () => {
    listed.rows = [{ key: "prod", label: "PROD", product: "s4hana", environment: "PROD", client: null, transport: "TWIN" }];
    const input = {
      organizationId: "org_a",
      solutionId: "sol_1",
      environment: "PROD",
      sapClient: null,
      interfaces: [feed] as never,
      grants: [grant],
      now: NOW,
    };
    expect((await readVerdicts(input)).get("if_1")).toBe("TRANSPORT_UNAVAILABLE");
    listed.rows = [{ ...listed.rows[0], transport: "DIRECT" }];
    expect((await readVerdicts(input)).get("if_1")).toBeNull();
  });
});

describe("the rotation probe", () => {
  it("never probes a TWIN connection: its new credentials are not sent to the base URL", () => {
    expect(rotationProbeMayApply({ isActive: true, lastValidationStatus: "OK", transport: "DIRECT" }, {})).toBe(true);
    expect(rotationProbeMayApply({ isActive: true, lastValidationStatus: "OK", transport: "TWIN" }, {})).toBe(false);
  });
});
