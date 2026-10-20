/**
 * service-verifications.ts — the per-environment record the write gate reads.
 *
 * A verify answers for the system that gave it. These pin that an entry only
 * counts for its own environment AND the binding that answered (connection,
 * SAP client, host), that anything malformed reads as "not verified", and
 * that what Studio displays never carries the connection id or host.
 */

import { describe, expect, it } from "vitest";

import {
  isVerifiedForBinding,
  parseServiceVerifications,
  verifiedEnvironmentsForDisplay,
  withServiceVerification,
} from "@/lib/sap-public/service-verifications";

const DEV = { at: "2026-10-19T10:00:00.000Z", connectionId: "conn_dev", sapClient: "100", baseUrl: "https://dev" };
const BINDING = { environment: "DEV", connectionId: "conn_dev", sapClient: "100", baseUrl: "https://dev" };

describe("isVerifiedForBinding", () => {
  it("is true only for the environment's own entry, for the same binding", () => {
    expect(isVerifiedForBinding({ DEV }, BINDING)).toBe(true);
    expect(isVerifiedForBinding({ DEV }, { ...BINDING, environment: "PROD" })).toBe(false);
    expect(isVerifiedForBinding({ DEV }, { ...BINDING, connectionId: "conn_other" })).toBe(false);
    expect(isVerifiedForBinding({ DEV }, { ...BINDING, sapClient: "200" })).toBe(false);
    expect(isVerifiedForBinding({ DEV }, { ...BINDING, sapClient: null })).toBe(false);
    expect(isVerifiedForBinding({ DEV }, { ...BINDING, baseUrl: "https://elsewhere" })).toBe(false);
  });

  it("a SANDBOX entry never opens DEV", () => {
    expect(isVerifiedForBinding({ SANDBOX: { ...DEV } }, BINDING)).toBe(false);
  });

  it("matches a null client to a null client", () => {
    expect(
      isVerifiedForBinding({ DEV: { ...DEV, sapClient: null } }, { ...BINDING, sapClient: null }),
    ).toBe(true);
  });

  it("reads null, arrays, strings and malformed entries as not verified", () => {
    for (const json of [null, undefined, [], "DEV", 1, { DEV: null }, { DEV: { at: DEV.at } }, { DEV: { ...DEV, connectionId: "" } }]) {
      expect(isVerifiedForBinding(json, BINDING)).toBe(false);
    }
  });
});

describe("withServiceVerification", () => {
  it("adds an environment beside the others, and replaces only its own", () => {
    const prod = { ...DEV, connectionId: "conn_prd", baseUrl: "https://prd" };
    const merged = withServiceVerification({ PROD: prod, DEV: { ...DEV, at: "old" } }, "DEV", DEV);
    expect(merged).toEqual({ PROD: prod, DEV });
  });

  it("drops malformed entries rather than carrying them forward", () => {
    expect(withServiceVerification({ TEST: { junk: true } }, "DEV", DEV)).toEqual({ DEV });
    expect(parseServiceVerifications({ TEST: { junk: true } })).toEqual({});
  });
});

describe("verifiedEnvironmentsForDisplay", () => {
  it("lists environment, time and client in landscape order — never a host or connection id", () => {
    const rows = verifiedEnvironmentsForDisplay({
      PROD: { ...DEV, sapClient: "300" },
      SANDBOX: { ...DEV, sapClient: null },
      DEV,
    });
    expect(rows).toEqual([
      { environment: "SANDBOX", at: DEV.at, sapClient: null },
      { environment: "DEV", at: DEV.at, sapClient: "100" },
      { environment: "PROD", at: DEV.at, sapClient: "300" },
    ]);
    expect(JSON.stringify(rows)).not.toContain("https://");
    expect(JSON.stringify(rows)).not.toContain("conn_");
  });
});
