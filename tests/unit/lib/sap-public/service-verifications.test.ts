/**
 * service-verifications.ts — the per-binding record the write gate reads.
 *
 * A verify answers for the system that gave it. These pin that an entry only
 * counts for its own environment AND the binding that answered (connection,
 * SAP client, host), that two SAP clients of one environment are two entries
 * (review round 2), that anything malformed reads as "not verified", and that
 * what Studio displays never carries the connection id or host — but does say
 * when the connection that answered has changed since.
 */

import { describe, expect, it, vi } from "vitest";

// current-connections.ts loads connections through prisma; the helper under
// test here is pure and never touches it.
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import {
  verifiedEnvironmentsForCredentials,
  writesDisabledEnvironmentsForCredentials,
} from "@/lib/sap-public/current-connections";
import {
  isVerifiedForBinding,
  parseServiceVerifications,
  verificationKey,
  verifiedEnvironmentsForDisplay,
  withServiceVerification,
} from "@/lib/sap-public/service-verifications";

const DEV = { at: "2026-10-19T10:00:00.000Z", connectionId: "conn_dev", sapClient: "100", baseUrl: "https://dev" };
const BINDING = { environment: "DEV", connectionId: "conn_dev", sapClient: "100", baseUrl: "https://dev" };
/** A live DEV write credential bound to client 100: the binding above. */
const DEV_CREDENTIAL = { environment: "DEV", sapClient: "100" };

/** The stored shape, built the way the verify route builds it. */
function stored(...entries: Array<[string, typeof DEV | (Omit<typeof DEV, "sapClient"> & { sapClient: string | null })]>) {
  return entries.reduce<unknown>((json, [env, entry]) => withServiceVerification(json, env, entry), null);
}

describe("isVerifiedForBinding", () => {
  it("is true only for the environment's own entry, for the same binding", () => {
    const json = stored(["DEV", DEV]);
    expect(isVerifiedForBinding(json, BINDING)).toBe(true);
    expect(isVerifiedForBinding(json, { ...BINDING, environment: "PROD" })).toBe(false);
    expect(isVerifiedForBinding(json, { ...BINDING, connectionId: "conn_other" })).toBe(false);
    expect(isVerifiedForBinding(json, { ...BINDING, sapClient: "200" })).toBe(false);
    expect(isVerifiedForBinding(json, { ...BINDING, sapClient: null })).toBe(false);
    expect(isVerifiedForBinding(json, { ...BINDING, baseUrl: "https://elsewhere" })).toBe(false);
  });

  it("a SANDBOX entry never opens DEV", () => {
    expect(isVerifiedForBinding(stored(["SANDBOX", DEV]), BINDING)).toBe(false);
  });

  it("matches a null client to a null client", () => {
    expect(
      isVerifiedForBinding(stored(["DEV", { ...DEV, sapClient: null }]), { ...BINDING, sapClient: null }),
    ).toBe(true);
  });

  it("still reads an entry stored under a bare environment key (the first shape)", () => {
    expect(isVerifiedForBinding({ DEV }, BINDING)).toBe(true);
    expect(isVerifiedForBinding({ DEV }, { ...BINDING, environment: "PROD" })).toBe(false);
  });

  it("reads null, arrays, strings and malformed entries as not verified", () => {
    for (const json of [
      null,
      undefined,
      [],
      "DEV",
      1,
      { DEV: null },
      { DEV: { at: DEV.at } },
      { DEV: { ...DEV, connectionId: "" } },
      { "DEV::100": { ...DEV, environment: "" } },
      { "DEV::100": { ...DEV, environment: 7 } },
    ]) {
      expect(isVerifiedForBinding(json, BINDING)).toBe(false);
    }
  });

  it("an entry's own environment wins over its key: a PROD entry filed under DEV never opens DEV", () => {
    expect(isVerifiedForBinding({ "DEV::100": { ...DEV, environment: "PROD" } }, BINDING)).toBe(false);
  });
});

describe("two SAP clients in one environment (review round 2)", () => {
  const C100 = { ...DEV, connectionId: "conn-100", sapClient: "100", baseUrl: "https://prd" };
  const C200 = { ...DEV, connectionId: "conn-200", sapClient: "200", baseUrl: "https://prd" };
  const B100 = { environment: "PROD", connectionId: "conn-100", sapClient: "100", baseUrl: "https://prd" };
  const B200 = { environment: "PROD", connectionId: "conn-200", sapClient: "200", baseUrl: "https://prd" };

  it("verifying client 200 after client 100 keeps client 100 writable", () => {
    const json = stored(["PROD", C100], ["PROD", C200]);
    expect(isVerifiedForBinding(json, B100)).toBe(true);
    expect(isVerifiedForBinding(json, B200)).toBe(true);
  });

  it("re-verifying client 100 does not knock out client 200", () => {
    const json = stored(["PROD", C100], ["PROD", C200], ["PROD", { ...C100, at: "2026-10-20T00:00:00.000Z" }]);
    expect(isVerifiedForBinding(json, B100)).toBe(true);
    expect(isVerifiedForBinding(json, B200)).toBe(true);
    expect(Object.keys(parseServiceVerifications(json)).sort()).toEqual(["PROD::100", "PROD::200"]);
  });

  it("the display lists both clients", () => {
    expect(verifiedEnvironmentsForDisplay(stored(["PROD", C200], ["PROD", C100]))).toEqual([
      { environment: "PROD", at: DEV.at, sapClient: "100", connectionChanged: false },
      { environment: "PROD", at: DEV.at, sapClient: "200", connectionChanged: false },
    ]);
  });
});

describe("withServiceVerification", () => {
  it("adds a binding beside the others, and replaces only its own", () => {
    const prod = { ...DEV, connectionId: "conn_prd", baseUrl: "https://prd" };
    const merged = withServiceVerification(stored(["PROD", prod], ["DEV", { ...DEV, at: "old" }]), "DEV", DEV);
    expect(merged).toEqual({
      [verificationKey("PROD", "100")]: { environment: "PROD", ...prod },
      [verificationKey("DEV", "100")]: { environment: "DEV", ...DEV },
    });
  });

  it("re-keys a first-shape entry rather than keeping a duplicate", () => {
    expect(withServiceVerification({ DEV: { ...DEV, at: "old" } }, "DEV", DEV)).toEqual({
      "DEV::100": { environment: "DEV", ...DEV },
    });
  });

  it("drops malformed entries rather than carrying them forward", () => {
    expect(withServiceVerification({ TEST: { junk: true } }, "DEV", DEV)).toEqual({
      "DEV::100": { environment: "DEV", ...DEV },
    });
    expect(parseServiceVerifications({ TEST: { junk: true } })).toEqual({});
  });
});

describe("verifiedEnvironmentsForDisplay", () => {
  it("lists environment, time and client in landscape order — never a host or connection id", () => {
    const rows = verifiedEnvironmentsForDisplay(
      stored(["PROD", { ...DEV, sapClient: "300" }], ["SANDBOX", { ...DEV, sapClient: null }], ["DEV", DEV]),
    );
    expect(rows).toEqual([
      { environment: "SANDBOX", at: DEV.at, sapClient: null, connectionChanged: false },
      { environment: "DEV", at: DEV.at, sapClient: "100", connectionChanged: false },
      { environment: "PROD", at: DEV.at, sapClient: "300", connectionChanged: false },
    ]);
    expect(JSON.stringify(rows)).not.toContain("https://");
    expect(JSON.stringify(rows)).not.toContain("conn_");
  });
});

describe("a connection edited after the verify (review round 2)", () => {
  const LIVE = { id: "conn_dev", environment: "DEV", client: "100", baseUrl: "https://dev/" };

  it("an unchanged connection is current (trailing slashes normalized as the resolver does)", () => {
    const json = stored(["DEV", DEV]);
    expect(verifiedEnvironmentsForDisplay(json, [LIVE])[0]?.connectionChanged).toBe(false);
    expect(verifiedEnvironmentsForCredentials(json, [LIVE], [DEV_CREDENTIAL])).toEqual(["DEV"]);
  });

  it.each([
    ["its host changed", { ...LIVE, baseUrl: "https://dev-new" }],
    ["its SAP client changed", { ...LIVE, client: "200" }],
    ["it now declares another environment", { ...LIVE, environment: "TEST" }],
    ["it is gone (deactivated or deleted)", { ...LIVE, id: "conn_other" }],
  ])("when %s, the entry is marked changed and opens no environment", (_label, conn) => {
    const json = stored(["DEV", DEV]);
    expect(verifiedEnvironmentsForDisplay(json, [conn])[0]?.connectionChanged).toBe(true);
    expect(verifiedEnvironmentsForCredentials(json, [conn], [DEV_CREDENTIAL])).toEqual([]);
  });
});

describe("verifiedEnvironmentsForCredentials — the write gate's question, per credential (review round 3)", () => {
  /** One PROD system serving two SAP clients, set up as two PROD connections on one host. */
  const P100 = { id: "conn_p100", environment: "PROD", client: "100", baseUrl: "https://x5m" };
  const P200 = { id: "conn_p200", environment: "PROD", client: "200", baseUrl: "https://x5m" };
  const VERIFIED_P100 = { at: DEV.at, connectionId: "conn_p100", sapClient: "100", baseUrl: "https://x5m" };

  it("a verify of client 100 does not make PROD ready for a credential bound to client 200", () => {
    const json = stored(["PROD", VERIFIED_P100]);
    expect(verifiedEnvironmentsForCredentials(json, [P100, P200], [{ environment: "PROD", sapClient: "200" }])).toEqual([]);
    // ...and the write gate agrees: that credential's binding has no entry.
    expect(
      isVerifiedForBinding(json, { environment: "PROD", connectionId: "conn_p200", sapClient: "200", baseUrl: "https://x5m" }),
    ).toBe(false);
  });

  it("the same verify does make PROD ready for a credential bound to client 100", () => {
    const json = stored(["PROD", VERIFIED_P100]);
    expect(verifiedEnvironmentsForCredentials(json, [P100, P200], [{ environment: "PROD", sapClient: "100" }])).toEqual([
      "PROD",
    ]);
  });

  it("a credential naming no client cannot bind between two PROD clients (AMBIGUOUS), so it is ready nowhere", () => {
    const json = stored(["PROD", VERIFIED_P100]);
    expect(verifiedEnvironmentsForCredentials(json, [P100, P200], [{ environment: "PROD", sapClient: null }])).toEqual([]);
  });

  it("a single-client environment selects its one connection for a client-less credential", () => {
    const json = stored(["PROD", VERIFIED_P100]);
    expect(verifiedEnvironmentsForCredentials(json, [P100], [{ environment: "PROD", sapClient: null }])).toEqual(["PROD"]);
  });

  it("a READ-ONLY credential's environment is judged by its own binding — its write key will be sealed on that row (review round 5)", () => {
    const json = stored(["PROD", VERIFIED_P100]);
    expect(
      verifiedEnvironmentsForCredentials(json, [P100, P200], [{ environment: "PROD", sapClient: "200", hasWriteKey: false }]),
    ).toEqual([]);
    expect(
      verifiedEnvironmentsForCredentials(json, [P100, P200], [{ environment: "PROD", sapClient: "100", hasWriteKey: false }]),
    ).toEqual(["PROD"]);
  });

  it("where a write-key holder exists, only its binding decides (review round 4 still holds)", () => {
    const json = stored(["PROD", VERIFIED_P100]);
    const writerOn200 = { environment: "PROD", sapClient: "200", hasWriteKey: true };
    const readerOn100 = { environment: "PROD", sapClient: "100", hasWriteKey: false };
    expect(verifiedEnvironmentsForCredentials(json, [P100, P200], [writerOn200, readerOn100])).toEqual([]);
    expect(
      verifiedEnvironmentsForCredentials(json, [P100, P200], [{ ...writerOn200, sapClient: "100" }, { ...readerOn100, sapClient: "200" }]),
    ).toEqual(["PROD"]);
  });

  it("an environment with no credential counts on any current entry (a display hint; readiness still needs a credential)", () => {
    const json = stored(["PROD", VERIFIED_P100], ["DEV", DEV]);
    const devConnection = { id: "conn_dev", environment: "DEV", client: "100", baseUrl: "https://dev" };
    expect(verifiedEnvironmentsForCredentials(json, [P100, devConnection], []).sort()).toEqual(["DEV", "PROD"]);
    // An entry whose connection has changed is no hint either.
    expect(verifiedEnvironmentsForCredentials(json, [P100], [])).toEqual(["PROD"]);
  });
});

describe("writesDisabledEnvironmentsForCredentials — the write route's per-connection veto (review round 5)", () => {
  const P100 = { id: "conn_p100", environment: "PROD", client: "100", baseUrl: "https://x5m", writeEnabled: false };
  const P200 = { id: "conn_p200", environment: "PROD", client: "200", baseUrl: "https://x5m", writeEnabled: true };

  it("names an environment whose credential binds to a connection with writes disabled", () => {
    expect(writesDisabledEnvironmentsForCredentials([P100, P200], [{ environment: "PROD", sapClient: "100" }])).toEqual([
      "PROD",
    ]);
    expect(writesDisabledEnvironmentsForCredentials([P100, P200], [{ environment: "PROD", sapClient: "200" }])).toEqual([]);
  });

  it("names nothing where the binding fails or there is no credential (other halves say so)", () => {
    expect(writesDisabledEnvironmentsForCredentials([P100, P200], [{ environment: "PROD", sapClient: null }])).toEqual([]);
    expect(writesDisabledEnvironmentsForCredentials([P100], [])).toEqual([]);
  });

  it("asks the write-key holder's binding when there is one", () => {
    expect(
      writesDisabledEnvironmentsForCredentials(
        [P100, P200],
        [
          { environment: "PROD", sapClient: "200", hasWriteKey: true },
          { environment: "PROD", sapClient: "100", hasWriteKey: false },
        ],
      ),
    ).toEqual([]);
  });
});
