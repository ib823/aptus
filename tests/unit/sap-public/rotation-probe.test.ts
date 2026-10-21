// @vitest-environment node
/**
 * The network half of probe-before-swap (P0.14, rotation-probe.ts): which step
 * a candidate secret fails at, against SAP stood in for by a fetch, and when
 * the probe runs at all.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import type { ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import { decideRotation } from "@/lib/sap-public/rotation";
import { probeRotation, rotationProbeApplies, rotationProbeEnabled } from "@/lib/sap-public/rotation-probe";

const EDMX =
  '<?xml version="1.0"?><edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx"></edmx:Edmx>';

const candidate = (overrides: Partial<ResolvedSapConnection> = {}): ResolvedSapConnection => ({
  source: "db",
  id: "conn_1",
  organizationId: "org_a",
  product: "s4hana",
  key: "dev",
  label: "DEV",
  baseUrl: "https://my000001-api.s4hana.cloud.sap",
  authType: "basic",
  secrets: { username: "COMM_USER", password: "new" },
  oauthTokenUrl: null,
  writeEnabled: false,
  apiPath: "/sap/opu/odata/sap/API_X",
  timeoutMs: null,
  environment: "DEV",
  client: null,
  ...overrides,
});

const READ = { servicePath: "/sap/opu/odata/sap/API_X", entitySet: "A_X" };

/** SAP: metadata and the data read each answer as told. */
function sap(metadata: number, data: number): typeof fetch {
  return (async (url: string | URL | Request) =>
    String(url).includes("$metadata")
      ? new Response(metadata === 200 ? EDMX : "", { status: metadata, headers: { "content-type": "application/xml" } })
      : new Response(data === 200 ? JSON.stringify({ d: { results: [{ X: 1 }] } }) : "{}", {
          status: data,
          headers: { "content-type": "application/json" },
        })) as typeof fetch;
}

describe("the probe", () => {
  it("passes all three steps against a system that accepts the secret", async () => {
    const probe = await probeRotation(candidate(), READ, sap(200, 200));
    expect(probe).toEqual({
      signIn: { step: "sign-in", ok: true },
      metadata: { step: "metadata", ok: true },
      dataRead: { step: "data-read", ok: true },
    });
    expect(decideRotation(probe).swap).toBe(true);
  });

  it("calls a 401 a sign-in failure, and runs nothing after it", async () => {
    const probe = await probeRotation(candidate(), READ, sap(401, 200));
    expect(probe.signIn.ok).toBe(false);
    expect(probe.metadata).toBeNull();
    expect(probe.dataRead).toBeNull();
    const d = decideRotation(probe);
    expect(d.swap).toBe(false);
    if (!d.swap) expect(d.failedAt).toBe("sign-in");
  });

  it("calls a credential that cannot be used at all a sign-in failure", async () => {
    const fetchImpl = vi.fn();
    const probe = await probeRotation(
      candidate({ authType: "oauth-client-credentials", secrets: {}, oauthTokenUrl: null }),
      READ,
      fetchImpl as unknown as typeof fetch,
    );
    expect(probe.signIn.ok).toBe(false);
    // Nothing was sent to SAP.
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a secret that signs in but cannot read the dataset the old one could", async () => {
    const probe = await probeRotation(candidate(), READ, sap(200, 403));
    expect(probe.metadata?.ok).toBe(true);
    expect(probe.dataRead?.ok).toBe(false);
    const d = decideRotation(probe, new Date(), { dataReadRequired: true });
    expect(d.swap).toBe(false);
    if (!d.swap) expect(d.failedAt).toBe("data-read");
  });

  it("does not ask for a read the working secret never proved", async () => {
    const probe = await probeRotation(candidate(), null, sap(200, 403));
    expect(probe.dataRead).toBeNull();
    expect(decideRotation(probe, new Date(), { dataReadRequired: false }).swap).toBe(true);
    // The pure decision's own default still requires it.
    expect(decideRotation(probe).swap).toBe(false);
  });

  it("refuses when the metadata is not a service description", async () => {
    const probe = await probeRotation(candidate(), READ, sap(500, 200));
    expect(probe.signIn.ok).toBe(true);
    expect(probe.metadata?.ok).toBe(false);
    expect(decideRotation(probe, new Date(), { dataReadRequired: false }).swap).toBe(false);
  });
});

describe("when the probe runs", () => {
  it("only when replacing an active connection whose last probe was OK", () => {
    expect(rotationProbeApplies(null, {})).toBe(false);
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: "OK" }, {})).toBe(true);
    expect(rotationProbeApplies({ isActive: false, lastValidationStatus: "OK" }, {})).toBe(false);
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: null }, {})).toBe(false);
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: "UNAUTHORIZED" }, {})).toBe(false);
  });

  it("COREEDGE_ROTATION_PROBE=off turns it off; anything else leaves it on", () => {
    expect(rotationProbeEnabled({})).toBe(true);
    expect(rotationProbeEnabled({ COREEDGE_ROTATION_PROBE: "of" })).toBe(true);
    expect(rotationProbeEnabled({ COREEDGE_ROTATION_PROBE: "OFF" })).toBe(false);
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: "OK" }, { COREEDGE_ROTATION_PROBE: "off" })).toBe(false);
  });
});
