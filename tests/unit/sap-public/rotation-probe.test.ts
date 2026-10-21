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
  carriedProof,
  probeRotation,
  proofFromProbe,
  rotationEvidence,
  rotationProbeApplies,
  rotationProbeEnabled,
  rotationProbeMayApply,
  rotationRequirements,
  sameSignInCredentials,
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

const READ = { interfaceId: "iface_1", servicePath: "/sap/opu/odata/sap/API_X", entitySet: "A_X" };

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

/*
 * NO PROBE PATH (wave 2 integration review round 1). ECC has no curated
 * service, so a connection without an apiPath has nothing to read $metadata
 * from. Its lane's proven read (a custom service path) is the proof, and
 * also the sign-in: the probe returned before running it, and every save of
 * such a connection, the correct secret included, was refused.
 */
describe("the probe with no probe path", () => {
  const ecc = () => candidate({ product: "ecc", apiPath: null });
  const ZREAD = { interfaceId: "iface_z", servicePath: "/sap/opu/odata/sap/ZORDERS_SRV", entitySet: "ZOrderSet" };

  it("judges a correct secret by the proven read, and swaps", async () => {
    const fetchImpl = vi.fn(sap(200, 200));
    const probe = await probeRotation(ecc(), ZREAD, fetchImpl as unknown as typeof fetch, { metadataRequired: false });
    expect(probe.signIn.ok).toBe(true);
    expect(probe.dataRead).toEqual({ step: "data-read", ok: true });
    // Nothing asked for a $metadata there is no path for.
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("$metadata"))).toBe(false);
    expect(decideRotation(probe, new Date(), { metadataRequired: false, dataReadRequired: true }).swap).toBe(true);
  });

  it("calls the read's 401 a sign-in failure", async () => {
    const probe = await probeRotation(ecc(), ZREAD, sap(200, 401), { metadataRequired: false });
    expect(probe.signIn.ok).toBe(false);
    const d = decideRotation(probe, new Date(), { metadataRequired: false, dataReadRequired: true });
    expect(d.swap).toBe(false);
    if (!d.swap) expect(d.failedAt).toBe("sign-in");
  });

  it("still refuses when the metadata is required, or there is no read to run", async () => {
    const fetchImpl = vi.fn(sap(200, 200));
    const required = await probeRotation(ecc(), ZREAD, fetchImpl as unknown as typeof fetch, { metadataRequired: true });
    expect(decideRotation(required, new Date(), { metadataRequired: true, dataReadRequired: true }).swap).toBe(false);
    const noRead = await probeRotation(ecc(), null, fetchImpl as unknown as typeof fetch, { metadataRequired: false });
    expect(noRead.dataRead).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("a step SAP did not answer", () => {
  it("is refused as SAP not answering, not as a bad credential", async () => {
    const metadata = decideRotation(await probeRotation(candidate(), READ, sap(503, 200)));
    expect(metadata.swap).toBe(false);
    if (!metadata.swap) {
      expect(metadata.reason).toContain("SAP did not answer the metadata request");
      expect(metadata.reason).not.toContain("could not read the service metadata");
    }
    const read = decideRotation(await probeRotation(candidate(), READ, sap(200, 504)));
    expect(read.swap).toBe(false);
    if (!read.swap) expect(read.reason).toContain("SAP did not answer the data read");
  });

  it("a 404 or 403 is still the credential's or the arrangement's, said as before", async () => {
    const d = decideRotation(await probeRotation(candidate(), READ, sap(404, 200)));
    if (!d.swap) expect(d.reason).toContain("could not read the service metadata");
    const r = decideRotation(await probeRotation(candidate(), READ, sap(200, 403)));
    if (!r.swap) expect(r.reason).toContain("SAP refused a data read");
  });
});

describe("when the probe runs", () => {
  const evidence = (status: string | null, read: typeof READ | null, carried: Parameters<typeof rotationEvidence>[2] = null) =>
    rotationEvidence({ lastValidationStatus: status }, read, carried);

  it("when replacing an active connection whose last probe was OK, or that a lane has proven a read through", () => {
    expect(rotationProbeApplies(null, evidence(null, null), {})).toBe(false);
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: "OK" }, evidence("OK", null), {})).toBe(true);
    expect(rotationProbeApplies({ isActive: false, lastValidationStatus: "OK" }, evidence("OK", READ), {})).toBe(false);
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: null }, evidence(null, null), {})).toBe(false);
    // A sweep's blip, or a probe path the arrangement does not release, while
    // the lanes read: the secret is working.
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: "TIMEOUT" }, evidence("TIMEOUT", READ), {})).toBe(true);
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: "NOT_FOUND" }, evidence("NOT_FOUND", READ), {})).toBe(true);
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: "TIMEOUT" }, evidence("TIMEOUT", null), {})).toBe(false);
    // SAP last refused the secret: it is broken, and rotating it must not be blocked.
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: "UNAUTHORIZED" }, evidence("UNAUTHORIZED", READ), {})).toBe(false);
    expect(rotationProbeMayApply({ isActive: true, lastValidationStatus: "UNAUTHORIZED" }, {})).toBe(false);
  });

  /*
   * A re-save clears the status and drops the lane checks (P0.2); what the
   * save proved is carried on its audit row, so the next save is still
   * probed (wave 2 integration review round 1).
   */
  it("counts what the save that stored the secret proved, until a probe writes a newer status", () => {
    const carriedMetadata = { metadata: true, read: null };
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: null }, evidence(null, null, carriedMetadata), {})).toBe(true);
    expect(evidence(null, null, carriedMetadata)).toEqual({ metadata: true, read: null });
    // A probe since then said the metadata did not read: that is newer.
    expect(evidence("TIMEOUT", null, carriedMetadata).metadata).toBe(false);
    // A carried read counts like a lane's; a lane's own read is preferred.
    const carriedRead = { metadata: false, read: { ...READ, interfaceId: "iface_carried" } };
    expect(evidence(null, null, carriedRead).read?.interfaceId).toBe("iface_carried");
    expect(evidence(null, READ, carriedRead).read).toBe(READ);
  });

  it("asks the new secret to prove what the old one proved", () => {
    expect(rotationRequirements(evidence("OK", null))).toEqual({ metadataRequired: true, dataReadRequired: false });
    expect(rotationRequirements(evidence("OK", READ))).toEqual({ metadataRequired: true, dataReadRequired: true });
    expect(rotationRequirements(evidence("NOT_FOUND", READ))).toEqual({ metadataRequired: false, dataReadRequired: true });
  });

  it("COREEDGE_ROTATION_PROBE=off turns it off; anything else leaves it on", () => {
    expect(rotationProbeEnabled({})).toBe(true);
    expect(rotationProbeEnabled({ COREEDGE_ROTATION_PROBE: "of" })).toBe(true);
    expect(rotationProbeEnabled({ COREEDGE_ROTATION_PROBE: "OFF" })).toBe(false);
    expect(
      rotationProbeApplies({ isActive: true, lastValidationStatus: "OK" }, evidence("OK", READ), { COREEDGE_ROTATION_PROBE: "off" }),
    ).toBe(false);
  });
});

describe("what a save proves, and what it carries", () => {
  const passed = {
    signIn: { step: "sign-in", ok: true },
    metadata: { step: "metadata", ok: true },
    dataRead: { step: "data-read", ok: true },
  } as const;

  it("records only what the probe proved, for the revision the save wrote", () => {
    expect(proofFromProbe(4, passed, READ)).toEqual({ revision: 4, metadata: true, readInterfaceId: "iface_1" });
    expect(proofFromProbe(4, { ...passed, dataRead: null }, null)).toEqual({ revision: 4, metadata: true, readInterfaceId: null });
    const readOnly = { ...passed, metadata: { step: "metadata", ok: false, detail: "404" } } as const;
    expect(proofFromProbe(4, readOnly, READ)).toEqual({ revision: 4, metadata: false, readInterfaceId: "iface_1" });
  });

  it("a save that kept the credentials carries the evidence; the metadata only at the same probe path", () => {
    const ev = rotationEvidence({ lastValidationStatus: "OK" }, READ, null);
    expect(carriedProof(7, ev, { probePathUnchanged: true })).toEqual({ revision: 7, metadata: true, readInterfaceId: "iface_1" });
    expect(carriedProof(7, ev, { probePathUnchanged: false })).toEqual({ revision: 7, metadata: false, readInterfaceId: "iface_1" });
    expect(carriedProof(7, rotationEvidence({ lastValidationStatus: "OK" }, null, null), { probePathUnchanged: false })).toBeNull();
  });

  it("compares the sign-in credentials, ignoring the write secret", () => {
    const stored = candidate({ secrets: { username: "COMM_USER", password: "pw" } });
    expect(sameSignInCredentials(stored, candidate({ secrets: { username: "COMM_USER", password: "pw", writeSecret: "w" } }))).toBe(true);
    expect(sameSignInCredentials(stored, candidate({ secrets: { username: "COMM_USER", password: "pw2" } }))).toBe(false);
    expect(sameSignInCredentials(stored, candidate({ secrets: { username: "OTHER", password: "pw" } }))).toBe(false);
    expect(sameSignInCredentials(stored, candidate({ authType: "bearer", secrets: { username: "COMM_USER", password: "pw" } }))).toBe(false);
    // A stored row that could not be opened is never "the same".
    expect(sameSignInCredentials(null, stored)).toBe(false);
  });
});
