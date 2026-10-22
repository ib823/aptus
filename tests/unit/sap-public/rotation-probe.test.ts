// @vitest-environment node
/**
 * The network half of probe-before-swap (P0.14, rotation-probe.ts): which step
 * a candidate secret fails at, against SAP stood in for by a fetch, and when
 * the probe runs at all.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { TOKEN_REQUEST_TIMEOUT_MS, type ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import { decideRotation } from "@/lib/sap-public/rotation";
import {
  carriedProof,
  probeRotation,
  proofFromProbe,
  rotationEvidence,
  rotationProbeApplies,
  rotationProbeEnabled,
  rotationProbeMayApply,
  ROTATION_PROBE_DEADLINE_MS,
  rotationRequirements,
  sameProbePath,
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

const PROVEN_AT = new Date("2026-10-21T08:00:00.000Z");
const READ = {
  interfaceId: "iface_1",
  interfaceVersion: 3,
  servicePath: "/sap/opu/odata/sap/API_X",
  entitySet: "A_X",
  provenAt: PROVEN_AT,
};

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
  const ZREAD = {
    interfaceId: "iface_z",
    interfaceVersion: 1,
    servicePath: "/sap/opu/odata/sap/ZORDERS_SRV",
    entitySet: "ZOrderSet",
    provenAt: PROVEN_AT,
  };

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
  /** Judged an hour after PROVEN_AT, well inside the lane TTL. */
  const NOW = new Date(PROVEN_AT.getTime() + 60 * 60 * 1000);
  const evidence = (status: string | null, read: typeof READ | null, carried: Parameters<typeof rotationEvidence>[2] = null) =>
    rotationEvidence({ lastValidationStatus: status }, read, carried, { now: NOW });

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
    const carriedMetadata = { metadata: true, metadataProvenAt: PROVEN_AT, read: null };
    expect(rotationProbeApplies({ isActive: true, lastValidationStatus: null }, evidence(null, null, carriedMetadata), {})).toBe(true);
    expect(evidence(null, null, carriedMetadata)).toEqual({ metadata: true, metadataProvenAt: PROVEN_AT, read: null });
    // A later status that says nothing about the credential keeps the proof
    // (wave 2 integration review round 2): SAP not answering, or a sealed set
    // this platform could not open (for the group marker, not even this row's).
    for (const status of ["TIMEOUT", "ERROR", "UNREADABLE", "GROUP_UNREADABLE"]) {
      expect(evidence(status, null, carriedMetadata).metadata).toBe(true);
      expect(rotationProbeApplies({ isActive: true, lastValidationStatus: status }, evidence(status, null, carriedMetadata), {})).toBe(true);
    }
    // One that says the working secret no longer reads the $metadata sets it aside:
    // demanding it of the new secret would refuse a correct rotation.
    expect(evidence("NOT_FOUND", null, carriedMetadata).metadata).toBe(false);
    expect(evidence("NO_PROBE_PATH", null, carriedMetadata).metadata).toBe(false);
    expect(evidence("UNAUTHORIZED", null, carriedMetadata).metadata).toBe(false);
    // A carried read counts like a lane's; a lane's own read is preferred.
    const carriedRead = { metadata: false, metadataProvenAt: null, read: { ...READ, interfaceId: "iface_carried" } };
    expect(evidence(null, null, carriedRead).read?.interfaceId).toBe("iface_carried");
    expect(evidence(null, READ, carriedRead).read).toBe(READ);
  });

  it("counts a probe that answered OK since the last save, whatever transient status came after", () => {
    const savedBefore = new Date(PROVEN_AT.getTime() - 60 * 1000);
    const sinceSave = (status: string | null) =>
      rotationEvidence({ lastValidationStatus: status, lastValidatedAt: PROVEN_AT }, null, null, { lastSavedAt: savedBefore, now: NOW });
    expect(sinceSave("TIMEOUT").metadata).toBe(true);
    expect(sinceSave("GROUP_UNREADABLE").metadata).toBe(true);
    expect(sinceSave("NOT_FOUND").metadata).toBe(false);
    // No OK since the save, and a TIMEOUT: nothing proven, as before.
    expect(rotationEvidence({ lastValidationStatus: "TIMEOUT", lastValidatedAt: null }, null, null, { now: NOW }).metadata).toBe(false);
  });

  /*
   * Wave 2 integration review round 3. The code before wave 2 never cleared
   * lastValidatedAt on a save, so it is a proof about the current settings
   * only when it is later than the last save on the record; and under ERROR
   * or TIMEOUT a proof stands for the lane TTL, not for ever.
   */
  it("counts lastValidatedAt only when it is later than the last save on the record", () => {
    const judge = (lastSavedAt: Date | null) =>
      rotationEvidence({ lastValidationStatus: "ERROR", lastValidatedAt: PROVEN_AT }, null, null, { lastSavedAt, now: NOW }).metadata;
    expect(judge(new Date(PROVEN_AT.getTime() - 1))).toBe(true);
    // An OK observed before the last save: about settings the row no longer has.
    expect(judge(new Date(PROVEN_AT.getTime() + 1))).toBe(false);
    expect(judge(PROVEN_AT)).toBe(false);
    // No save on the record: nothing says the OK is about these settings.
    expect(judge(null)).toBe(false);
    // The last probe OK is the proof when no save on the record came after it.
    expect(rotationEvidence({ lastValidationStatus: "OK", lastValidatedAt: PROVEN_AT }, null, null, { now: NOW }).metadata).toBe(true);
    const ok = (lastSavedAt: Date) =>
      rotationEvidence({ lastValidationStatus: "OK", lastValidatedAt: PROVEN_AT }, null, null, { lastSavedAt, now: NOW }).metadata;
    expect(ok(new Date(PROVEN_AT.getTime() - 1))).toBe(true);
    // Wave 2 final review round 2: an OK left on the row by a pre-deploy save
    // (which never cleared the status) is about settings it may no longer have.
    expect(ok(new Date(PROVEN_AT.getTime() + 1))).toBe(false);
  });

  it("a metadata proof held through ERROR or TIMEOUT lapses after the lane TTL", () => {
    const day = 24 * 60 * 60 * 1000;
    const savedBefore = new Date(PROVEN_AT.getTime() - 60 * 1000);
    for (const status of ["ERROR", "TIMEOUT"]) {
      const at = (now: Date) =>
        rotationEvidence({ lastValidationStatus: status, lastValidatedAt: PROVEN_AT }, null, null, { lastSavedAt: savedBefore, now });
      expect(at(new Date(PROVEN_AT.getTime() + day)).metadata).toBe(true);
      expect(at(new Date(PROVEN_AT.getTime() + day + 1)).metadata).toBe(false);
      // A carried proof ages by when it was made, not by when it was carried.
      const carried = { metadata: true, metadataProvenAt: PROVEN_AT, read: null };
      const late = new Date(PROVEN_AT.getTime() + day + 1);
      expect(rotationEvidence({ lastValidationStatus: status }, null, carried, { now: late }).metadata).toBe(false);
    }
  });

  it("asks the new secret to prove what the old one proved", () => {
    expect(rotationRequirements(evidence("OK", null))).toEqual({ metadataRequired: true, dataReadRequired: false });
    expect(rotationRequirements(evidence("OK", READ))).toEqual({ metadataRequired: true, dataReadRequired: true });
    expect(rotationRequirements(evidence("NOT_FOUND", READ))).toEqual({ metadataRequired: false, dataReadRequired: true });
  });

  it("demands the metadata only at the probe path it was proven at (wave 2 final review)", () => {
    expect(rotationRequirements(evidence("OK", READ), { probePathUnchanged: false })).toEqual({
      metadataRequired: false,
      dataReadRequired: true,
    });
    const zcustom = { product: "s4hana", apiPath: "/sap/opu/odata/sap/ZCUSTOM_SRV" };
    // The form re-saves without the path: S/4 falls back to its default service, ECC to none.
    expect(sameProbePath(zcustom, { product: "s4hana", apiPath: null })).toBe(false);
    expect(sameProbePath({ ...zcustom, product: "ecc" }, { product: "ecc", apiPath: null })).toBe(false);
    expect(sameProbePath(zcustom, { product: "s4hana", apiPath: " /sap/opu/odata/sap/ZCUSTOM_SRV " })).toBe(true);
    expect(sameProbePath({ product: "s4hana", apiPath: null }, { product: "s4hana", apiPath: "" })).toBe(true);
    // ECC with no probe path: no metadata request can be made, so a metadata
    // proof is never demanded of it (wave 2 final review round 2).
    expect(
      rotationRequirements(evidence("OK", READ), { probePathUnchanged: true, candidateProbePath: null }).metadataRequired,
    ).toBe(false);
    expect(
      rotationRequirements(evidence("OK", READ), { probePathUnchanged: true, candidateProbePath: "/sap/x" }).metadataRequired,
    ).toBe(true);
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
    const now = new Date("2026-10-21T09:30:00.000Z");
    // The read is recorded as what it was, proven now by this probe.
    const provenNow = {
      interfaceId: "iface_1",
      interfaceVersion: 3,
      servicePath: "/sap/opu/odata/sap/API_X",
      entitySet: "A_X",
      provenAt: now.toISOString(),
    };
    const metadataProvenAt = now.toISOString();
    expect(proofFromProbe(4, passed, READ, now)).toEqual({ revision: 4, metadata: true, metadataProvenAt, read: provenNow });
    expect(proofFromProbe(4, { ...passed, dataRead: null }, null, now)).toEqual({ revision: 4, metadata: true, metadataProvenAt, read: null });
    const readOnly = { ...passed, metadata: { step: "metadata", ok: false, detail: "404" } } as const;
    expect(proofFromProbe(4, readOnly, READ, now)).toEqual({ revision: 4, metadata: false, read: provenNow });
  });

  it("a save that kept the credentials carries the evidence; the metadata only at the same probe path", () => {
    const ev = rotationEvidence({ lastValidationStatus: "OK", lastValidatedAt: PROVEN_AT }, READ, null);
    // Carried with the time it was proven: a save that proves nothing new does not make an old read fresh.
    const carriedRead = { ...READ, provenAt: PROVEN_AT.toISOString() };
    expect(carriedProof(7, ev, { probePathUnchanged: true })).toEqual({
      revision: 7,
      metadata: true,
      metadataProvenAt: PROVEN_AT.toISOString(),
      read: carriedRead,
    });
    expect(carriedProof(7, ev, { probePathUnchanged: false })).toEqual({ revision: 7, metadata: false, read: carriedRead });
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

/*
 * THE PROBE HAS ONE DEADLINE (wave 2 integration review round 2). Sign-in,
 * $metadata and the one-row read run in series inside the connections route;
 * at their own timeouts that is up to about 70 s, and a platform that cuts the
 * function off first leaves the builder a bare 504 with no refusal audited.
 * The whole probe now stops at ROTATION_PROBE_DEADLINE_MS, and what SAP did
 * not answer by then is refused as SAP not answering. The route's
 * maxDuration covers the deadline, a token exchange and the database work.
 */
describe("the probe's deadline", () => {
  /** SAP that never answers: each request waits until it is aborted. */
  const silent = vi.fn(
    (_url: string | URL | Request, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
        signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      }),
  );

  it("stops a probe SAP does not answer at the deadline, refused as SAP not answering", async () => {
    const started = Date.now();
    const probe = await probeRotation(candidate({ timeoutMs: 30_000 }), READ, silent as unknown as typeof fetch, {
      deadlineMs: 50,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(probe.metadata).toMatchObject({ ok: false, unavailable: true });
    const d = decideRotation(probe);
    expect(d.swap).toBe(false);
    if (!d.swap) expect(d.reason).toContain("SAP did not answer");
  }, 4_000);

  /*
   * Wave 2 final review round 2. A metadata step that is not required (the
   * save moved the probe path) with no proven read to run: when SAP did not
   * answer it, nothing judged the new credential, so it is refused rather
   * than swapped in on a sign-in SAP never judged.
   */
  it("refuses when the only step that reached SAP went unanswered, even when it was not required", async () => {
    const probe = await probeRotation(candidate(), null, sap(503, 200), { metadataRequired: false });
    expect(probe.metadata).toMatchObject({ ok: false, unavailable: true });
    const d = decideRotation(probe, new Date(), { metadataRequired: false, dataReadRequired: false });
    expect(d.swap).toBe(false);
    if (!d.swap) {
      expect(d.failedAt).toBe("metadata");
      expect(d.reason).toContain("SAP did not answer");
    }
    // An answered refusal (403 at a service the arrangement does not release)
    // still stands in for the sign-in, as before.
    const answered = await probeRotation(candidate(), null, sap(403, 200), { metadataRequired: false });
    expect(decideRotation(answered, new Date(), { metadataRequired: false, dataReadRequired: false }).swap).toBe(true);
  });

  it("stops the data read at the deadline too, with no probe path", async () => {
    const probe = await probeRotation(candidate({ product: "ecc", apiPath: null, timeoutMs: 30_000 }), READ, silent as unknown as typeof fetch, {
      metadataRequired: false,
      deadlineMs: 50,
    });
    expect(probe.dataRead).toMatchObject({ ok: false, unavailable: true });
  }, 4_000);

  it("the connections route allows the whole probe, a token exchange and the save to finish", () => {
    const route = readFileSync(join(process.cwd(), "src/app/api/studio/connections/route.ts"), "utf8");
    const declared = /^export const maxDuration = (\d+);$/m.exec(route);
    expect(declared).not.toBeNull();
    const seconds = Number(declared![1]);
    // The deadline, plus one token exchange begun just before it, plus 30 s for step-up, judgement and the write.
    expect(seconds * 1000).toBeGreaterThanOrEqual(ROTATION_PROBE_DEADLINE_MS + TOKEN_REQUEST_TIMEOUT_MS + 30_000);
    // Under the longest duration this project already declares (the crons' 300 s).
    expect(seconds).toBeLessThanOrEqual(300);
  });
});
