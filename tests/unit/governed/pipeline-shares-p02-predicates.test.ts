// @vitest-environment node
/**
 * The governed pipeline's authorise and bind steps ARE P0.2's predicates
 * (wave 2 integration of P0.2 with P0.14/P0.19/P0.14b).
 *
 * P0.2 made authorisation.ts `authorisesHere` and `bindingFor` the one answer
 * the broker, the lane board and the lane sweep all ask, so the board can never
 * call a lane live that the broker refuses. P0.14 extracted the broker's steps
 * into governed/pipeline.ts and P0.19 fed its bind step from rows read in the
 * interface's statement (`bindStoredConnections`). A second copy of the
 * binding rule on that path, or an unknown product refused by hand, is the
 * drift P0.2 removed. These tests watch the two predicates and drive the
 * pipeline's steps: each step must reach them.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as CallLoadsModule from "@/lib/governed/call-loads";
import type * as AuthorisationModule from "@/lib/northbound/authorisation";

const spies = vi.hoisted(() => ({
  authorisesHere: vi.fn(),
  bindingFor: vi.fn(),
  load: vi.fn(),
}));

vi.mock("@/lib/northbound/authorisation", async (importOriginal) => {
  const actual = await importOriginal<typeof AuthorisationModule>();
  spies.authorisesHere.mockImplementation(actual.authorisesHere);
  spies.bindingFor.mockImplementation(actual.bindingFor);
  return { ...actual, authorisesHere: spies.authorisesHere, bindingFor: spies.bindingFor };
});

vi.mock("@/lib/governed/call-loads", async (importOriginal) => ({
  ...(await importOriginal<typeof CallLoadsModule>()),
  loadInterfaceAccess: spies.load,
}));

import { authorise, bindConnection } from "@/lib/governed/pipeline";
import type { StoredConnectionRow } from "@/lib/governed/call-loads";
import { bindStoredConnections } from "@/lib/sap-public/connection-resolver";
import { tenantScopeOf } from "@/lib/studio/tenant-scope";

const ORG = "org_pipeline_p02";
const SOLUTION = "sol_pipeline_p02";
const NOW = new Date("2026-10-21T10:00:00.000Z");

const iface = {
  id: "if_1",
  name: "Business partners",
  externalId: "API_BUSINESS_PARTNER",
  sapProduct: "s4hana",
  entitySet: "A_BusinessPartner",
  operation: "READ",
  mode: "READ",
  version: 1,
  status: "ACTIVE",
  solutionId: SOLUTION,
  servicePath: null,
  odataVersion: null,
  serviceVerifiedAt: null,
  serviceVerifications: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  grantMatchChangedAt: null,
};

/** Bound to the interface on its product, so no legacy-use stamp is written. */
const grant = {
  id: "g_1",
  decision: "APPROVED",
  expiresAt: null,
  operation: "READ",
  revokedAt: null,
  interfaceId: iface.id,
  sapProduct: iface.sapProduct,
  unboundLastUsedAt: null,
  createdAt: new Date("2026-09-02T00:00:00.000Z"),
  unboundCutoffAt: null,
};

/** A stored row whose secret cannot be opened: an auth type outside the vocabulary. */
const unopenable: StoredConnectionRow = {
  id: "conn_1",
  organizationId: ORG,
  product: iface.sapProduct,
  key: "dev",
  label: "DEV",
  baseUrl: "https://dev.example.invalid",
  authType: "not-an-auth-type",
  environment: "DEV",
  oauthTokenUrl: null,
  secretsCiphertext: "sealed",
  client: null,
  writeEnabled: false,
  apiPath: null,
  timeoutMs: null,
  transport: "DIRECT",
  revision: 1,
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
};

beforeEach(() => {
  spies.authorisesHere.mockClear();
  spies.bindingFor.mockClear();
  spies.load.mockReset();
});

describe("the pipeline's authorise step is authorisesHere", () => {
  it("judges the interface and grants read in the one statement with P0.2's predicate", async () => {
    spies.load.mockResolvedValue({ iface, grants: [grant], connections: [unopenable] });

    const access = await authorise("READ", tenantScopeOf(ORG), SOLUTION, iface.id, "DEV", NOW);

    expect(access.ok).toBe(true);
    expect(spies.authorisesHere).toHaveBeenCalledTimes(1);
    expect(spies.authorisesHere.mock.calls[0]![0]).toMatchObject({
      solutionId: SOLUTION,
      environment: "DEV",
      route: "read",
      grants: [grant],
      now: NOW,
    });
  });

  it("asks it for the write route on a write", async () => {
    spies.load.mockResolvedValue({ iface: { ...iface, mode: "WRITE", operation: "CREATE" }, grants: [], connections: [] });

    const access = await authorise("WRITE", tenantScopeOf(ORG), SOLUTION, iface.id, "DEV", NOW);

    expect(access.ok).toBe(false);
    expect(spies.authorisesHere.mock.calls[0]![0]).toMatchObject({ route: "write" });
  });
});

describe("the pipeline's bind step is bindingFor", () => {
  it("binds the rows authorise prefetched through bindingFor, failing closed on the set", async () => {
    const bound = await bindConnection(ORG, iface.sapProduct, "DEV", "READ", null, {
      organizationId: ORG,
      product: iface.sapProduct,
      rows: [unopenable],
    });

    expect(bound.ok).toBe(false);
    if (!bound.ok) expect(bound.refusal.reason).toBe("CONNECTION_UNREADABLE");
    expect(spies.bindingFor).toHaveBeenCalledWith({ kind: "unreadable" }, "DEV", "read", null);
  });

  it("refuses an unknown product through bindingFor's own estate", async () => {
    const bound = await bindConnection(ORG, "no-such-product", "DEV", "WRITE", "100");

    expect(bound.ok).toBe(false);
    if (!bound.ok) expect(bound.refusal.reason).toBe("UNKNOWN_PRODUCT");
    expect(spies.bindingFor).toHaveBeenCalledWith({ kind: "unknownProduct" }, "DEV", "write", "100");
  });

  it("bindStoredConnections hands its opened estate to bindingFor", async () => {
    const binding = await bindStoredConnections([], "TEST", "WRITE", "080");

    expect(binding).toEqual({ ok: false, reason: "NO_CONNECTION" });
    expect(spies.bindingFor).toHaveBeenCalledWith({ kind: "connections", connections: [] }, "TEST", "write", "080");
  });
});
