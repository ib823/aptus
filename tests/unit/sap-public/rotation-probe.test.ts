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
import {
  probeRotation,
  rotationProbeApplies,
  rotationProbeEnabled,
  rotationProbeMayApply,
  rotationRequirements,
} from "@/lib/sap-public/rotation-probe";

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

  /*
   * A $metadata the working secret never read (its probe path is not in the
   * arrangement: NOT_FOUND) is not held against the new one. Its proof is
   * the lane's read, so the read still runs, and decides.
   */
  it("judges by the proven read when the old secret never read the metadata", async () => {
    const right = await probeRotation(candidate(), READ, sap(404, 200), { metadataRequired: false });
    expect(right.metadata?.ok).toBe(false);
    expect(right.dataRead?.ok).toBe(true);
    expect(decideRotation(right, new Date(), { metadataRequired: false, dataReadRequired: true }).swap).toBe(true);

    const refused = await probeRotation(candidate(), READ, sap(404, 403), { metadataRequired: false });
    const d = decideRotation(refused, new Date(), { metadataRequired: false, dataReadRequired: true });
    expect(d.swap).toBe(false);
    if (!d.swap) expect(d.failedAt).toBe("data-read");

    // A 401 is still a sign-in failure, whatever the metadata requirement.
    const typo = await probeRotation(candidate(), READ, sap(401, 200), { metadataRequired: false });
    expect(decideRotation(typo, new Date(), { metadataRequired: false, dataReadRequired: true }).swap).toBe(false);
  });
});

describe("when the probe runs", () => {
  it("when replacing an active connection whose last probe was OK, or that a lane has proven a read through", () => {
    expect(rotationProbeApplies(null, null, {})).toBe(false);
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: "OK" }, null, {})).toBe(true);
    expect(rotationProbeApplies({ isActive: false, lastValidationStatus: "OK" }, READ, {})).toBe(false);
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: null }, null, {})).toBe(false);
    // A sweep's blip, or a probe path the arrangement does not release, while
    // the lanes read: the secret is working.
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: "TIMEOUT" }, READ, {})).toBe(true);
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: "NOT_FOUND" }, READ, {})).toBe(true);
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: "TIMEOUT" }, null, {})).toBe(false);
    // SAP last refused the secret: it is broken, and rotating it must not be blocked.
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: "UNAUTHORIZED" }, READ, {})).toBe(false);
    expect(rotationProbeMayApply({ isActive: true, lastValidationStatus: "UNAUTHORIZED" }, {})).toBe(false);
  });

  it("asks the new secret to prove what the old one proved", () => {
    expect(rotationRequirements({ lastValidationStatus: "OK" }, null)).toEqual({ metadataRequired: true, dataReadRequired: false });
    expect(rotationRequirements({ lastValidationStatus: "OK" }, READ)).toEqual({ metadataRequired: true, dataReadRequired: true });
    expect(rotationRequirements({ lastValidationStatus: "NOT_FOUND" }, READ)).toEqual({ metadataRequired: false, dataReadRequired: true });
  });

  it("COREEDGE_ROTATION_PROBE=off turns it off; anything else leaves it on", () => {
    expect(rotationProbeEnabled({})).toBe(true);
    expect(rotationProbeEnabled({ COREEDGE_ROTATION_PROBE: "of" })).toBe(true);
    expect(rotationProbeEnabled({ COREEDGE_ROTATION_PROBE: "OFF" })).toBe(false);
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: "OK" }, READ, { COREEDGE_ROTATION_PROBE: "off" })).toBe(false);
  });
});
