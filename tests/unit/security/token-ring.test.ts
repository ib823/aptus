// @vitest-environment node
/**
 * CoreEdge's token ring (P1.4, 3.9.3).
 *
 * Parsed like the SAP ring (labelled entries, an active label, a malformed or
 * duplicate entry throws naming the variable and never a key), read on every
 * call; a derived `t0` outside production only; one HKDF key per purpose, none
 * equal to another or to the ring key. And the deploy gate: the ring is
 * required, parseable and distinct from the other secrets only once
 * COREEDGE_QUERY_SURFACE is on.
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEV_RING_LABEL,
  deriveTokenKey,
  readTokenRing,
  TOKEN_PURPOSES,
  tokenRingReadable,
  TokenRingConfigError,
} from "@/lib/security/token-ring";

const hex = () => randomBytes(32).toString("hex");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parsing", () => {
  it("reads labelled keys and the active label", () => {
    const k1 = hex();
    const k2 = hex();
    const ring = readTokenRing({ COREEDGE_TOKEN_KEYS: ` t1:${k1} , t2:${k2.toUpperCase()} `, COREEDGE_TOKEN_ACTIVE_KEY: "t2", NODE_ENV: "production" });
    expect(ring.active).toBe("t2");
    expect(ring.derived).toBe(false);
    expect(ring.keys.get("t1")).toEqual(Buffer.from(k1, "hex"));
    expect(ring.keys.get("t2")).toEqual(Buffer.from(k2, "hex"));
  });

  it.each([
    ["a bad label", `x1:${"ab".repeat(32)}`, "t1", "label"],
    ["the reserved t0 label", `t0:${"ab".repeat(32)}`, "t0", "label"],
    ["a short key", `t1:${"ab".repeat(31)}`, "t1", "64-character"],
    ["no separator", `t1${"ab".repeat(32)}`, "t1", "label"],
    ["a duplicate", `t1:${"ab".repeat(32)},t1:${"cd".repeat(32)}`, "t1", "twice"],
    ["an active label not in the ring", `t1:${"ab".repeat(32)}`, "t2", "not a key in"],
    ["no active label", `t1:${"ab".repeat(32)}`, "", "COREEDGE_TOKEN_ACTIVE_KEY is not"],
  ])("throws on %s, naming the variable and never the key", (_label, keys, active, inMessage) => {
    let caught: unknown;
    try {
      readTokenRing({ COREEDGE_TOKEN_KEYS: keys, COREEDGE_TOKEN_ACTIVE_KEY: active, NODE_ENV: "production" });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(TokenRingConfigError);
    const message = (caught as Error).message;
    expect(message).toContain(inMessage);
    expect(message).toMatch(/COREEDGE_TOKEN_(KEYS|ACTIVE_KEY)/);
    expect(message).not.toMatch(/(ab){8}|(cd){8}/);
  });

  it("an active label with no ring is refused, not quietly derived", () => {
    expect(() => readTokenRing({ COREEDGE_TOKEN_ACTIVE_KEY: "t1", NODE_ENV: "test" })).toThrow(TokenRingConfigError);
  });

  it("is read on every call, never cached", () => {
    vi.stubEnv("COREEDGE_TOKEN_KEYS", `t1:${hex()}`);
    vi.stubEnv("COREEDGE_TOKEN_ACTIVE_KEY", "t1");
    const first = readTokenRing();
    const k3 = hex();
    vi.stubEnv("COREEDGE_TOKEN_KEYS", `t3:${k3}`);
    vi.stubEnv("COREEDGE_TOKEN_ACTIVE_KEY", "t3");
    const second = readTokenRing();
    expect(first.active).toBe("t1");
    expect(second.active).toBe("t3");
    expect(second.keys.get("t3")).toEqual(Buffer.from(k3, "hex"));
  });
});

describe("the derived development ring", () => {
  it("is t0 from NEXTAUTH_SECRET under development and test", () => {
    const dev = readTokenRing({ NODE_ENV: "development", NEXTAUTH_SECRET: "s".repeat(32) });
    expect(dev.active).toBe(DEV_RING_LABEL);
    expect(dev.derived).toBe(true);
    expect(readTokenRing({ NODE_ENV: "test", NEXTAUTH_SECRET: "s".repeat(32) }).keys.get("t0")).toEqual(dev.keys.get("t0"));
    expect(readTokenRing({ NODE_ENV: "development", NEXTAUTH_SECRET: "t".repeat(32) }).keys.get("t0")).not.toEqual(dev.keys.get("t0"));
    // The derived key is not the secret itself.
    expect(dev.keys.get("t0")?.toString("utf8")).not.toContain("ssss");
  });

  it("is never accepted under production, or with no NODE_ENV", () => {
    for (const env of [{ NODE_ENV: "production", NEXTAUTH_SECRET: "s".repeat(32) }, { NEXTAUTH_SECRET: "s".repeat(32) }]) {
      expect(() => readTokenRing(env)).toThrow(TokenRingConfigError);
      expect(tokenRingReadable(env)).toBe(false);
    }
  });

  it("needs a secret in development; test falls back to a fixed test-only one", () => {
    expect(() => readTokenRing({ NODE_ENV: "development" })).toThrow(TokenRingConfigError);
    expect(readTokenRing({ NODE_ENV: "test" }).active).toBe("t0");
  });

  it("is not used once a ring is configured", () => {
    const ring = readTokenRing({ NODE_ENV: "development", NEXTAUTH_SECRET: "s".repeat(32), COREEDGE_TOKEN_KEYS: `t1:${hex()}`, COREEDGE_TOKEN_ACTIVE_KEY: "t1" });
    expect([...ring.keys.keys()]).toEqual(["t1"]);
  });
});

describe("purpose keys", () => {
  it("separate every purpose, and none equals the ring key", () => {
    const k = hex();
    const ring = readTokenRing({ COREEDGE_TOKEN_KEYS: `t1:${k}`, COREEDGE_TOKEN_ACTIVE_KEY: "t1", NODE_ENV: "production" });
    const cursor = deriveTokenKey(ring, "t1", TOKEN_PURPOSES.cursor);
    const lastKey = deriveTokenKey(ring, "t1", TOKEN_PURPOSES.cursorLastKey);
    const audit = deriveTokenKey(ring, "t1", TOKEN_PURPOSES.auditQueryHash, "org_a");
    const auditB = deriveTokenKey(ring, "t1", TOKEN_PURPOSES.auditQueryHash, "org_b");
    const all = [cursor, lastKey, audit, auditB].map((b) => b.toString("hex"));
    expect(new Set(all).size).toBe(4);
    for (const key of all) {
      expect(key).toHaveLength(64);
      expect(key).not.toBe(k.toLowerCase());
    }
    expect(deriveTokenKey(ring, "t1", TOKEN_PURPOSES.cursor)).toEqual(cursor);
  });

  it("refuses a label the ring does not hold", () => {
    const ring = readTokenRing({ COREEDGE_TOKEN_KEYS: `t1:${hex()}`, COREEDGE_TOKEN_ACTIVE_KEY: "t1", NODE_ENV: "production" });
    expect(() => deriveTokenKey(ring, "t9", TOKEN_PURPOSES.cursor)).toThrow(TokenRingConfigError);
  });
});

describe("the deploy gate (scripts/check-production-env.js)", () => {
  const SCRIPT = path.resolve(process.cwd(), "scripts/check-production-env.js");
  const NEXTAUTH = "n".repeat(32);
  const BASE: Record<string, string> = {
    VERCEL_ENV: "production",
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://u:p@h:5432/d",
    NEXTAUTH_SECRET: NEXTAUTH,
    NEXTAUTH_URL: "https://example.test",
    CRON_SECRET: "y".repeat(32),
    UPSTASH_REDIS_REST_URL: "https://redis.test",
    UPSTASH_REDIS_REST_TOKEN: "z".repeat(32),
    PRESALES_CSRF_SECRET: "c".repeat(32),
  };
  function run(env: Record<string, string>): { code: number; out: string } {
    const childEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "", NODE_ENV: "production", ...env };
    const r = spawnSync("node", [SCRIPT], { env: childEnv, encoding: "utf8" });
    return { code: r.status ?? 1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
  }

  it("asks nothing of the ring while the query surface is off", () => {
    const r = run(BASE);
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toContain("COREEDGE_TOKEN");
    expect(run({ ...BASE, COREEDGE_QUERY_SURFACE: "off" }).code).toBe(0);
  });

  it("requires both variables once it is on", () => {
    const r = run({ ...BASE, COREEDGE_QUERY_SURFACE: "on" });
    expect(r.code).toBe(1);
    expect(r.out).toContain("COREEDGE_TOKEN_KEYS");
  });

  it("passes a well-formed ring with its active key, on preview deployments too", () => {
    const env = { ...BASE, COREEDGE_QUERY_SURFACE: "on", COREEDGE_TOKEN_KEYS: `t1:${hex()},t2:${hex()}`, COREEDGE_TOKEN_ACTIVE_KEY: "t2" };
    expect(run(env).code, run(env).out).toBe(0);
    const preview = run({ ...env, VERCEL_ENV: "preview" });
    expect(preview.code, preview.out).toBe(0);
    expect(run({ ...BASE, VERCEL_ENV: "preview", COREEDGE_QUERY_SURFACE: "on" }).code).toBe(1);
  });

  it("fails a malformed entry or a missing active key without printing a key", () => {
    const bad = "q".repeat(64);
    const malformed = run({ ...BASE, COREEDGE_QUERY_SURFACE: "on", COREEDGE_TOKEN_KEYS: `t1:${bad}`, COREEDGE_TOKEN_ACTIVE_KEY: "t1" });
    expect(malformed.code).toBe(1);
    expect(malformed.out).not.toContain(bad);
    const k = hex();
    const absent = run({ ...BASE, COREEDGE_QUERY_SURFACE: "on", COREEDGE_TOKEN_KEYS: `t1:${k}`, COREEDGE_TOKEN_ACTIVE_KEY: "t2" });
    expect(absent.code).toBe(1);
    expect(absent.out).not.toContain(k);
  });

  it("fails a ring key equal to NEXTAUTH_SECRET or to a SAP connection key", () => {
    const sap = hex();
    const reuseSap = run({
      ...BASE,
      COREEDGE_QUERY_SURFACE: "on",
      SAP_CONNECTION_ENCRYPTION_KEYS: `v1:${sap}`,
      COREEDGE_TOKEN_KEYS: `t1:${sap.toUpperCase()}`,
      COREEDGE_TOKEN_ACTIVE_KEY: "t1",
    });
    expect(reuseSap.code).toBe(1);
    expect(reuseSap.out).toContain("distinct");
    const legacy = hex();
    const reuseLegacy = run({ ...BASE, COREEDGE_QUERY_SURFACE: "on", SAP_CONNECTION_ENCRYPTION_KEY: legacy, COREEDGE_TOKEN_KEYS: `t1:${legacy}`, COREEDGE_TOKEN_ACTIVE_KEY: "t1" });
    expect(reuseLegacy.code).toBe(1);
    const nextauth = hex();
    const reuseNextauth = run({ ...BASE, NEXTAUTH_SECRET: nextauth, COREEDGE_QUERY_SURFACE: "on", COREEDGE_TOKEN_KEYS: `t1:${nextauth}`, COREEDGE_TOKEN_ACTIVE_KEY: "t1" });
    expect(reuseNextauth.code).toBe(1);
  });
});
