/**
 * A connection screen must not say "nothing is connected" while SAP Explorer is
 * reaching the tenant on the next screen.
 *
 * THE DEFECT THIS FILE EXISTS FOR. Two mechanisms reach SAP: stored
 * `SapConnection` rows, and the deployment's `{PREFIX}_*` env tenants. The
 * broker prefers the first and falls back to the second — that is why
 * `resolveSapConnections` returns `[]` rather than throwing.
 *
 * Both connection screens counted only the rows. On an env-only deployment they
 * reported "No active SAP connection" and "No SAP connection in the estate"
 * while the TDD tenant was serving Explore perfectly well. Literally true about
 * a table, false about the world, and precisely the class of claim these
 * workspaces exist to refuse.
 *
 * It had happened before. `lib/studio/tenants.ts` exists because Studio made the
 * same mistake and disabled its own Test Console over it; its header says so.
 * The fix was never carried into the two new workspaces.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { ConnectionsHealthClient } from "@/components/ops/ConnectionsHealthClient";
import { ConnectionRegisterClient } from "@/components/control-tower/RegistersClient";

function serve(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: body }) })),
  );
}

const TDD = { key: "s4_tdd", label: "ABeam S/4 TDD", product: "s4hana", environment: null };

const OPS_ENV_ONLY = {
  counts: { total: 0, healthy: 0, needsAttention: 0, unknown: 0, neverTested: 0, byStatus: {} },
  deploymentFallback: { inUse: true, tenants: [TDD] },
  provenance: {
    activeOnly: true,
    excludedInactive: 0,
    why: "A deactivated connection serves no traffic.",
    fallbackIsShared:
      "This organization has no stored SAP connection, so the broker falls back to the deployment's configured tenant. That tenant is shared by every organization here.",
    noHealthForFallback:
      "Probe health is recorded per stored connection. A fallback tenant has no row, so there is no health record for it.",
  },
  bindingBacklog: { undeclaredEnvironment: 0, remediation: "x", consequence: "y" },
  prodConnections: 0,
  connections: [],
};

const CT_ENV_ONLY = {
  deploymentFallback: { inUse: true, tenants: [TDD] },
  counts: { total: 0, active: 0, inactive: 0, writeEnabled: 0, prod: 0, undeclaredEnvironment: 0 },
  delegatedActions: [
    { id: "a", label: "Enable or revoke write", availableTo: "consultant", where: "Developer Studio", why: "z" },
  ],
  provenance: {
    fallbackIsShared:
      "This organization has stored no SAP connection, so traffic falls back to the deployment's configured tenant.",
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

describe("Operations · an env-only deployment is connected", () => {
  it("does not claim nothing is connected", async () => {
    serve(OPS_ENV_ONLY);
    render(<ConnectionsHealthClient />);

    await screen.findByText("This organization has no stored SAP connection");
    // The sentence that was wrong. It asserted a fact about SAP; the screen only
    // ever knew a fact about a table.
    expect(screen.queryByText("No active SAP connection")).toBeNull();
  });

  it("names the tenant that is actually serving traffic", async () => {
    serve(OPS_ENV_ONLY);
    render(<ConnectionsHealthClient />);

    await screen.findByText("ABeam S/4 TDD");
    expect(screen.getByText(/Serving through the deployment/)).toBeTruthy();
  });

  it("marks it shared, never as this client's SAP", async () => {
    serve(OPS_ENV_ONLY);
    render(<ConnectionsHealthClient />);

    const chip = await screen.findByLabelText(/not for this organization/);
    expect(chip.textContent).toContain("shared");
    expect(document.body.textContent).toContain("shared by every organization here");
  });

  it("claims no health for it — an absence, not a pass", async () => {
    // There is no row to record a probe outcome against, so inventing one
    // would be the same defect in the opposite direction.
    serve(OPS_ENV_ONLY);
    render(<ConnectionsHealthClient />);

    const pill = await screen.findByLabelText(/no row to record one against/);
    expect(pill.textContent).toContain("no health record");
  });

  it("still says nothing is reaching SAP when there is genuinely nothing", async () => {
    // The honest version of the original sentence, reached only when BOTH
    // sources are empty.
    serve({ ...OPS_ENV_ONLY, deploymentFallback: { inUse: false, tenants: [] } });
    render(<ConnectionsHealthClient />);

    await screen.findByText(/the broker has nothing to reach/);
    expect(screen.queryByText(/Serving through the deployment/)).toBeNull();
  });

  it("does not show the fallback panel when the organization has its own", async () => {
    // Listing it beside real connections would show something not serving
    // anything — the broker uses stored rows in preference.
    serve({
      ...OPS_ENV_ONLY,
      counts: { ...OPS_ENV_ONLY.counts, total: 1, healthy: 1 },
      deploymentFallback: { inUse: false, tenants: [] },
      connections: [
        {
          id: "c1", product: "s4hana", key: "prod", label: "Acme S/4", environment: "PROD",
          writeEnabled: false, status: "OK", lastValidatedAt: new Date().toISOString(), neverTested: false,
        },
      ],
    });
    render(<ConnectionsHealthClient />);

    await screen.findByText("Acme S/4");
    expect(screen.queryByText(/Serving through the deployment/)).toBeNull();
  });
});

describe("Control Tower · the register says whose estate is empty", () => {
  it("does not claim the estate has no connection at all", async () => {
    serve(CT_ENV_ONLY);
    render(<ConnectionRegisterClient />);

    await screen.findByText("This organization has registered no SAP connection");
    expect(screen.queryByText("No SAP connection in the estate")).toBeNull();
  });

  it("notes the shared tenant and where it is governed", async () => {
    serve(CT_ENV_ONLY);
    render(<ConnectionRegisterClient />);

    await screen.findByLabelText(/falls back to a shared tenant/);
    expect(document.body.textContent).toContain("governed at the deployment level");
    expect(document.body.textContent).toContain("s4hana · s4_tdd");
  });

  it("says nothing is registered AND nothing falls back, when that is true", async () => {
    serve({ ...CT_ENV_ONLY, deploymentFallback: { inUse: false, tenants: [] } });
    render(<ConnectionRegisterClient />);

    await screen.findByText(/the deployment has no fallback tenant either/);
  });
});
