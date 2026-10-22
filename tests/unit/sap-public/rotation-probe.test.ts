// @vitest-environment node
/**
 * The network half of probe-before-swap (P0.14, rotation-probe.ts): when a
 * save is probed, what the one request is sent with, how SAP's answer is
 * classified, and when enforce refuses (wave 2 final review round 3).
 *
 * The rule every case here holds: no save is refused, and no record says a
 * probe ran, without a request to SAP; and enforce refuses only SAP's own
 * 401 or 403 to the new secret while the stored one is known to work.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as ConnectionResolver from "@/lib/sap-public/connection-resolver";

const db = vi.hoisted(() => ({ laneRead: false, stored: null as unknown, storedThrows: false }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { laneCheck: { findFirst: async () => (db.laneRead ? { id: "lc_1" } : null) } },
}));
vi.mock("@/lib/sap-public/connection-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof ConnectionResolver>();
  return {
    ...actual,
    resolveSapConnection: async () => {
      if (db.storedThrows) throw new Error("the stored secret will not open");
      return db.stored;
    },
  };
});

import { TOKEN_REQUEST_TIMEOUT_MS, type ResolvedSapConnection } from "@/lib/sap-public/connection-resolver";
import type { RotationProbeMode } from "@/lib/sap-public/rotation";
import {
  probeForSave,
  probeRotation,
  probeTarget,
  ROTATION_PROBE_DEADLINE_MS,
  rotationProbeSkip,
  sameSignInCredentials,
  type RotationProbeExisting,
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

const existing = (overrides: Partial<RotationProbeExisting> = {}): RotationProbeExisting => ({
  id: "conn_1",
  revision: 4,
  isActive: true,
  lastValidationStatus: "OK",
  transport: "DIRECT",
  environment: "DEV",
  baseUrl: "https://my000001-api.s4hana.cloud.sap",
  client: null,
  apiPath: "/sap/opu/odata/sap/API_X",
  timeoutMs: null,
  ...overrides,
});

/** The stored row, opened: the working password. */
const storedRow = (overrides: Partial<ResolvedSapConnection> = {}) =>
  ({ ...candidate({ secrets: { username: "COMM_USER", password: "old" } }), revision: 4, ...overrides }) as ResolvedSapConnection;

/** SAP that answers the $metadata with `status` (a metadata document on 200), and records what it was asked. */
function sap(status: number) {
  return vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
    new Response(status === 200 ? EDMX : "", { status, headers: { "content-type": "application/xml" } }),
  );
}

/** SAP that never answers: each request waits until it is aborted. */
const silent = vi.fn(
  (_url: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
      signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }),
);

const run = (
  mode: RotationProbeMode,
  fetchImpl: typeof fetch,
  over: { existing?: RotationProbeExisting | null; candidate?: ResolvedSapConnection } = {},
) =>
  probeForSave({
    organizationId: "org_a",
    mode,
    existing: over.existing === undefined ? existing() : over.existing,
    candidate: over.candidate ?? candidate(),
    fetchImpl,
  });

beforeEach(() => {
  db.laneRead = false;
  db.stored = storedRow();
  db.storedThrows = false;
  silent.mockClear();
});

describe("when a save is not probed: nothing is sent, and the record says why", () => {
  it.each([
    ["off", existing(), "probe_off"],
    ["observe", null, "new_connection"],
    ["observe", existing({ isActive: false }), "deactivated"],
    ["enforce", existing({ transport: "TWIN" }), "tenant_twin"],
    ["enforce", existing({ lastValidationStatus: "UNAUTHORIZED" }), "last_probe_refused"],
    ["enforce", existing({ lastValidationStatus: null }), "not_known_working"],
    ["enforce", existing({ lastValidationStatus: "TIMEOUT" }), "not_known_working"],
    ["enforce", existing({ environment: "PROD" }), "repointed"],
    ["enforce", existing({ baseUrl: "https://my000002-api.s4hana.cloud.sap" }), "repointed"],
  ] as const)("%s, %#: skipped as %s", async (mode, row, reason) => {
    const fetchImpl = sap(401);
    const probe = await run(mode, fetchImpl as unknown as typeof fetch, { existing: row });
    expect(probe.record).toEqual({ mode, ran: false, outcome: "skipped", reason });
    expect(probe.refused).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a save that keeps the sign-in credentials sends nothing (a label fix, Allow writes)", async () => {
    db.stored = storedRow({ secrets: { username: "COMM_USER", password: "new" } });
    const fetchImpl = sap(503);
    const probe = await run("enforce", fetchImpl as unknown as typeof fetch);
    expect(probe.record).toMatchObject({ ran: false, outcome: "skipped", reason: "credentials_unchanged" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  /*
   * Wave 2 final review round 3 (high). An ECC row with no probe path
   * anywhere: no request can be made. It was saved with `rotationProbed:
   * true`; it is now skipped, saved, and says why, under either mode.
   */
  it.each(["observe", "enforce"] as const)("%s: ECC with no probe path stored or sent is skipped, never refused", async (mode) => {
    const fetchImpl = sap(401);
    const probe = await run(mode, fetchImpl as unknown as typeof fetch, {
      existing: existing({ apiPath: null }),
      candidate: candidate({ product: "ecc", apiPath: null }),
    });
    expect(probe.record).toEqual({ mode, ran: false, outcome: "skipped", reason: "no_probe_path" });
    expect(probe.refused).toBe(false);
    expect(probe.detail).toMatch(/no probe path/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  /*
   * Wave 2 rotation probe validation (medium). A key or token pasted with a
   * zero-width space or a typographic apostrophe cannot go in a header: fetch
   * throws before it opens a connection. The record said ran:true and
   * noAnswer, and enforce saved it. It is now skipped, before any request.
   */
  it.each([
    ["observe", "api-key", { apiKey: "KEY-1​", apiKeyHeader: "x-api-key" }],
    ["enforce", "api-key", { apiKey: "KEY-1​", apiKeyHeader: "x-api-key" }],
    ["observe", "bearer", { bearerToken: "TOK’s" }],
    ["enforce", "bearer", { bearerToken: "TOK’s" }],
  ] as const)("%s: a %s secret no header can carry is skipped, and nothing is sent", async (mode, authType, secrets) => {
    db.stored = storedRow({ authType, secrets: { ...secrets, apiKey: "KEY-1", bearerToken: "TOK-1" } });
    // What undici does with the request's headers before anything leaves the process.
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      new Headers(init?.headers);
      return new Response(EDMX, { status: 200, headers: { "content-type": "application/xml" } });
    });
    const probe = await run(mode, fetchImpl as unknown as typeof fetch, { candidate: candidate({ authType, secrets }) });
    expect(probe.record).toEqual({ mode, ran: false, outcome: "skipped", reason: "credentials_unusable" });
    expect(probe.refused).toBe(false);
    expect(probe.detail).toMatch(/cannot carry/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("a Latin-1 character a header can carry is still sent and checked", async () => {
    db.stored = storedRow({ authType: "api-key", secrets: { apiKey: "OLD", apiKeyHeader: "x-api-key" } });
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      new Headers(init?.headers);
      return new Response(EDMX, { status: 200, headers: { "content-type": "application/xml" } });
    });
    const probe = await run("enforce", fetchImpl as unknown as typeof fetch, {
      candidate: candidate({ authType: "api-key", secrets: { apiKey: "café", apiKeyHeader: "x-api-key" } }),
    });
    expect(probe.record).toEqual({ mode: "enforce", ran: true, outcome: "passed", reason: "metadata_ok" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("a lane's fresh proven read counts as the stored secret working, without an OK probe", async () => {
    db.laneRead = true;
    const fetchImpl = sap(401);
    const probe = await run("enforce", fetchImpl as unknown as typeof fetch, { existing: existing({ lastValidationStatus: null }) });
    expect(probe.record).toMatchObject({ ran: true, outcome: "rejected", reason: "sap_http_401" });
    expect(probe.refused).toBe(true);
  });
});

describe("what SAP answered, and what each mode does with it", () => {
  it.each(["observe", "enforce"] as const)("%s: a correct secret passes and saves", async (mode) => {
    const probe = await run(mode, sap(200) as unknown as typeof fetch);
    expect(probe.record).toEqual({ mode, ran: true, outcome: "passed", reason: "metadata_ok" });
    expect(probe.refused).toBe(false);
  });

  it("SAP's 401 to the new secret: rejected; refused under enforce only", async () => {
    const observed = await run("observe", sap(401) as unknown as typeof fetch);
    expect(observed.record).toEqual({ mode: "observe", ran: true, outcome: "rejected", reason: "sap_http_401" });
    expect(observed.refused).toBe(false);
    const enforced = await run("enforce", sap(401) as unknown as typeof fetch);
    expect(enforced.record.outcome).toBe("rejected");
    expect(enforced.refused).toBe(true);
  });

  it.each([
    [503, "sap_http_503"],
    [500, "sap_http_500"],
    [404, "sap_http_404"],
    // A service the arrangement does not release answers a correct secret 403 (wave 2 final review round 1).
    [403, "sap_http_403"],
  ])("SAP's %i says nothing about the secret: noAnswer, saved under enforce", async (status, reason) => {
    const probe = await run("enforce", sap(status) as unknown as typeof fetch);
    expect(probe.record).toEqual({ mode: "enforce", ran: true, outcome: "noAnswer", reason });
    expect(probe.refused).toBe(false);
  });

  it("a page that is not a metadata document is not a verdict either", async () => {
    const html = vi.fn(async () => new Response("<html>login</html>", { status: 200, headers: { "content-type": "text/html" } }));
    const probe = await run("enforce", html as unknown as typeof fetch);
    expect(probe.record).toMatchObject({ ran: true, outcome: "noAnswer" });
    expect(probe.refused).toBe(false);
  });

  /*
   * A STORED ROW THAT WILL NOT OPEN (wave 2 final review round 2). The broker
   * cannot use it either, so it is not known to work: a correct secret
   * passes, and even a rejected one is saved, with the truth recorded.
   */
  it.each(["observe", "enforce"] as const)("%s: a stored row that will not open is probed, never refused", async (mode) => {
    db.storedThrows = true;
    expect((await run(mode, sap(200) as unknown as typeof fetch)).record.outcome).toBe("passed");
    const rejected = await run(mode, sap(401) as unknown as typeof fetch);
    expect(rejected.record.outcome).toBe("rejected");
    expect(rejected.refused).toBe(false);
  });

  it("a stored row that changed since it was judged is not the one known to work", async () => {
    db.stored = storedRow({ revision: 5 } as Partial<ResolvedSapConnection>);
    const probe = await run("enforce", sap(401) as unknown as typeof fetch);
    expect(probe.record.outcome).toBe("rejected");
    expect(probe.refused).toBe(false);
  });

  it("an OAuth token endpoint's 401 is a rejection; its 503 is not", async () => {
    const oauth = (secret: string) =>
      candidate({ authType: "oauth-client-credentials", oauthTokenUrl: "https://auth.example.com/oauth/token", secrets: { clientId: "c", clientSecret: secret } });
    db.stored = storedRow({ authType: "oauth-client-credentials", oauthTokenUrl: "https://auth.example.com/oauth/token", secrets: { clientId: "c", clientSecret: "old" } });
    const token = (status: number) =>
      vi.fn(async (url: string | URL | Request) =>
        String(url).includes("/oauth/token")
          ? new Response(status === 200 ? JSON.stringify({ access_token: "t", expires_in: 60 }) : "{}", { status, headers: { "content-type": "application/json" } })
          : new Response(EDMX, { status: 200, headers: { "content-type": "application/xml" } }),
      );
    // The token exchange uses the global fetch.
    vi.stubGlobal("fetch", token(401));
    try {
      const refused = await run("enforce", token(401) as unknown as typeof fetch, { candidate: oauth("typo") });
      expect(refused.record).toMatchObject({ ran: true, outcome: "rejected", reason: "token_http_401" });
      expect(refused.refused).toBe(true);
      vi.stubGlobal("fetch", token(503));
      const unanswered = await run("enforce", token(503) as unknown as typeof fetch, { candidate: oauth("new") });
      expect(unanswered.record).toMatchObject({ ran: true, outcome: "noAnswer", reason: "token_http_503" });
      expect(unanswered.refused).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("the request is sent as the row will be, or as it is stored", () => {
  it("a save that leaves out the probe path and the timeout is probed with the stored ones", () => {
    const target = probeTarget(candidate({ apiPath: null, timeoutMs: null }), { apiPath: "/odata/v2/User", timeoutMs: 30_000 });
    expect(target).toMatchObject({ apiPath: "/odata/v2/User", timeoutMs: 30_000 });
  });

  it("a save that sends its own is probed with those", () => {
    const target = probeTarget(candidate({ apiPath: "/sap/opu/odata/sap/API_Y", timeoutMs: 5_000 }), { apiPath: "/x", timeoutMs: 30_000 });
    expect(target).toMatchObject({ apiPath: "/sap/opu/odata/sap/API_Y", timeoutMs: 5_000 });
  });

  it("probes at the stored path when an API caller leaves it out", async () => {
    const fetchImpl = sap(200);
    await run("observe", fetchImpl as unknown as typeof fetch, {
      existing: existing({ apiPath: "/sap/opu/odata/sap/ZCUSTOM_SRV" }),
      candidate: candidate({ apiPath: null }),
    });
    expect(String(fetchImpl.mock.calls[0]![0])).toContain("/sap/opu/odata/sap/ZCUSTOM_SRV/$metadata");
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

  it("rotationProbeSkip reads the row alone", () => {
    expect(rotationProbeSkip(existing(), "observe")).toBeNull();
    expect(rotationProbeSkip(existing(), "off")).toBe("probe_off");
  });
});

/*
 * THE PROBE HAS ONE DEADLINE (wave 2 integration review round 2). What SAP
 * has not answered by then is `noAnswer`: saved, under either mode, with the
 * warning that it could not be checked (wave 2 final review round 3: a slow
 * tenant, or SuccessFactors' whole-API $metadata, refused correct saves).
 */
describe("the probe's deadline", () => {
  it("stops a probe SAP does not answer at the deadline: noAnswer, not a refusal", async () => {
    const started = Date.now();
    const probe = await probeRotation(candidate({ timeoutMs: 30_000 }), "/sap/opu/odata/sap/API_X", silent as unknown as typeof fetch, {
      deadlineMs: 50,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(probe.answer).toEqual({ ran: true, outcome: "noAnswer", reason: "sap_timeout" });
  }, 4_000);

  it.each(["observe", "enforce"] as const)("%s: a slow default service (SuccessFactors /odata/v2) saves", async (mode) => {
    const slow = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          // The probe's own timeout (1 s here) passes long before SAP answers.
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const probe = await run(mode, slow as unknown as typeof fetch, {
      existing: existing({ apiPath: null, baseUrl: "https://api17.sapsf.com" }),
      candidate: candidate({ product: "successfactors", apiPath: null, timeoutMs: 1_000, baseUrl: "https://api17.sapsf.com" }),
    });
    expect(String(slow.mock.calls[0]![0])).toContain("/odata/v2/$metadata");
    expect(probe.record).toMatchObject({ ran: true, outcome: "noAnswer", reason: "sap_timeout" });
    expect(probe.refused).toBe(false);
  }, 6_000);

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
