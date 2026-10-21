/**
 * A connection screen must not say "nothing is connected" while SAP Explorer is
 * reaching the tenant on the next screen — nor say the broker is served by a
 * tenant it never uses (P0.3, A59).
 *
 * THE FIRST DEFECT THIS FILE EXISTS FOR. Two mechanisms reach SAP: stored
 * `SapConnection` rows, and the deployment's `{PREFIX}_*` env tenants. Both
 * connection screens counted only the rows, so on an env-only deployment they
 * reported "No active SAP connection" and "No SAP connection in the estate"
 * while the TDD tenant was serving Explore perfectly well.
 *
 * THE SECOND, the fix's own overreach. The screens then said the env tenant
 * was "serving" this organization's traffic whenever it had no connection —
 * "the broker falls back to the deployment's configured tenant". The broker
 * does not: the northbound routes bind only through the organization's own
 * connections and refuse with CONNECTION_NOT_CONFIGURED without one. The env
 * tenant serves console and explorer reads, for every organization, whatever
 * connections it has. So the screens now carry two facts: whether the broker
 * can reach SAP for this organization's apps, and what the env tenant serves.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ConnectionsHealthClient } from "@/components/ops/ConnectionsHealthClient";
import { ConnectionRegisterClient } from "@/components/control-tower/RegistersClient";
import { BROKER_UNREACHABLE, DEPLOYMENT_TENANT_SCOPE } from "@/lib/ops/deployment-tenant";

function serve(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: body }) })),
  );
}

const TDD = { key: "s4_tdd", label: "ABeam S/4 TDD", product: "s4hana", environment: null };

const OPS_ENV_ONLY = {
  counts: { total: 0, healthy: 0, needsAttention: 0, unknown: 0, neverTested: 0, byStatus: {} },
  brokerReachable: false,
  deploymentTenant: { configured: true, servesBroker: false, tenants: [TDD] },
  provenance: {
    activeOnly: true,
    excludedInactive: 0,
    why: "A deactivated connection serves no traffic.",
    deploymentTenantScope: DEPLOYMENT_TENANT_SCOPE,
    brokerReachability: BROKER_UNREACHABLE,
    noHealthForDeploymentTenant:
      "Probe health is recorded per stored connection. The deployment's tenant has no row, so there is no health record for it.",
  },
  bindingBacklog: { undeclaredEnvironment: 0, remediation: "x", consequence: "y" },
  prodConnections: 0,
  connections: [],
};

const CT_ENV_ONLY = {
  brokerReachable: false,
  deploymentTenant: { configured: true, servesBroker: false, tenants: [TDD] },
  counts: { total: 0, active: 0, inactive: 0, writeEnabled: 0, prod: 0, undeclaredEnvironment: 0 },
  delegatedActions: [
    { id: "a", label: "Enable or revoke write", availableTo: "consultant", where: "Developer Studio", why: "z" },
  ],
  provenance: {
    deploymentTenantScope: DEPLOYMENT_TENANT_SCOPE,
    brokerReachability: BROKER_UNREACHABLE,
    includesInactive: "Deactivated connections ARE listed here.",
    everyConnectionIsSealed: "secretsCiphertext is a required column.",
    secretsAreNeverRead: "The ciphertext is not selected.",
    environmentGatesWrites: "An undeclared connection refuses writes.",
    countsAreComplete: "Every connection in scope is listed.",
  },
  connections: [],
};

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Operations · an env-only deployment", () => {
  it("does not claim nothing is connected", async () => {
    serve(OPS_ENV_ONLY);
    render(<ConnectionsHealthClient />);

    await screen.findByText("This organization has no stored SAP connection");
    expect(screen.queryByText("No active SAP connection")).toBeNull();
  });

  it("names the env tenant, for console reads only — never as serving the broker", async () => {
    serve(OPS_ENV_ONLY);
    render(<ConnectionsHealthClient />);

    await screen.findByText("ABeam S/4 TDD");
    expect(screen.getByText(/The deployment.s tenant: console reads only/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/Serving through the deployment/);
    expect(document.body.textContent).not.toMatch(/falls back/i);
  });

  it("says the organization's apps are refused until it declares a connection", async () => {
    serve(OPS_ENV_ONLY);
    render(<ConnectionsHealthClient />);

    await screen.findByText(BROKER_UNREACHABLE);
    expect(document.body.textContent).toContain("CONNECTION_NOT_CONFIGURED");
  });

  it("marks it shared, never as this client's SAP", async () => {
    serve(OPS_ENV_ONLY);
    render(<ConnectionsHealthClient />);

    const chip = await screen.findByLabelText(/not for this organization/);
    expect(chip.textContent).toContain("shared");
    expect(document.body.textContent).toContain("shared by every organization here");
  });

  it("claims no health for it — an absence, not a pass", async () => {
    serve(OPS_ENV_ONLY);
    render(<ConnectionsHealthClient />);

    const pill = await screen.findByLabelText(/no row to record one against/);
    expect(pill.textContent).toContain("no health record");
  });

  it("says so plainly when there is no env tenant either", async () => {
    serve({ ...OPS_ENV_ONLY, deploymentTenant: { configured: false, servesBroker: false, tenants: [] } });
    render(<ConnectionsHealthClient />);

    await screen.findByText(/the deployment has no tenant of its own for console reads either/);
    expect(screen.queryByText(/console reads only/)).toBeNull();
  });

  it("still lists the env tenant beside the organization's own connection: console reads use it", async () => {
    serve({
      ...OPS_ENV_ONLY,
      brokerReachable: true,
      provenance: { ...OPS_ENV_ONLY.provenance, brokerReachability: null },
      counts: { ...OPS_ENV_ONLY.counts, total: 1, healthy: 1 },
      connections: [
        {
          id: "c1", product: "s4hana", key: "prod", label: "Acme S/4", environment: "PROD",
          writeEnabled: false, status: "OK", lastValidatedAt: new Date().toISOString(), neverTested: false,
        },
      ],
    });
    render(<ConnectionsHealthClient />);

    await screen.findByText("Acme S/4");
    expect(screen.getByText(/The deployment.s tenant: console reads only/)).toBeTruthy();
    expect(screen.queryByText(BROKER_UNREACHABLE)).toBeNull();
  });
});

describe("Control Tower · the register says whose estate is empty", () => {
  it("does not claim the estate has no connection at all", async () => {
    serve(CT_ENV_ONLY);
    render(<ConnectionRegisterClient />);

    await screen.findByText("This organization has registered no SAP connection");
    expect(screen.queryByText("No SAP connection in the estate")).toBeNull();
  });

  it("notes the shared tenant, what it serves, and that the broker never uses it", async () => {
    serve(CT_ENV_ONLY);
    render(<ConnectionRegisterClient />);

    await screen.findByLabelText(/the broker never uses it/);
    expect(document.body.textContent).toContain("governed at the deployment level");
    expect(document.body.textContent).toContain(BROKER_UNREACHABLE);
    expect(document.body.textContent).not.toMatch(/falls back/i);
    /*
     * The NAME, not the key: the tenant key stays (it IS an identifier, and
     * what someone would type), the raw product key does not.
     */
    expect(document.body.textContent).toContain("SAP Cloud ERP");
    expect(document.body.textContent).toContain("s4_tdd");
    expect(document.body.textContent).not.toContain("s4hana ·");
  });

  it("says nothing is registered and the deployment has no tenant either, when that is true", async () => {
    serve({ ...CT_ENV_ONLY, deploymentTenant: { configured: false, servesBroker: false, tenants: [] } });
    render(<ConnectionRegisterClient />);

    await screen.findByText(/the deployment has no tenant of its own either/);
  });
});
