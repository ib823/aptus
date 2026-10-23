// @vitest-environment node
/**
 * The sealed paging cursor (P1.4, 3.9.2-3.9.4).
 *
 * Round trip; every single-byte change, truncation and extension refused as
 * CURSOR_INVALID, never a throw; another organisation, client, interface or
 * API version in the AAD refused the same way; an unknown kid; both clocks;
 * each binding checked after authorisation and after the connection is bound;
 * rotation (an old kid opens, the active kid seals); the 1,024-character
 * bound; no host anywhere in the plaintext. And a seeded fuzz: random strings
 * and mutations of real cursors give only CURSOR_INVALID or CURSOR_STALE.
 */

import { createDecipheriv } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { QueryAstV1 } from "@/lib/odata/ast";
import { queryBind } from "@/lib/odata/ast";
import { QUERY_REFUSAL_STATUS, type QueryRefusal } from "@/lib/odata/rules";
import {
  checkCursorAfterAuthorise,
  checkCursorConnection,
  checkCursorQuery,
  CURSOR_TTL_SECONDS,
  grantTag,
  grantTags,
  lastKeyTag,
  MAX_CURSOR_LENGTH,
  newChainId,
  openCursor,
  sealCursor,
  type CursorBinding,
  type CursorPayloadV1,
} from "@/lib/northbound/query/cursor";
import { deriveTokenKey, readTokenRing, TOKEN_PURPOSES, type TokenRing } from "@/lib/security/token-ring";

const K1 = "11".repeat(32);
const K2 = "22".repeat(32);
const ring = (keys: string, active: string): TokenRing => readTokenRing({ COREEDGE_TOKEN_KEYS: keys, COREEDGE_TOKEN_ACTIVE_KEY: active, NODE_ENV: "production" });
const RING = ring(`t1:${K1}`, "t1");

const BINDING: CursorBinding = { organizationId: "org_a", clientId: "cli_a", interfaceId: "if_a", apiVersion: "2026-10" };
const NOW = new Date("2026-10-27T10:00:00.000Z");
const T = Math.floor(NOW.getTime() / 1000);

const AST: QueryAstV1 = {
  v: 1,
  kind: "LIST",
  select: null,
  filter: [{ f: "Customer", op: "eq", v: { t: "S", v: "17100001" } }],
  orderby: [],
  key: null,
  count: false,
  pageSize: 100,
};

function payload(over: Partial<CursorPayloadV1> = {}): CursorPayloadV1 {
  return {
    v: 1,
    ch: newChainId(),
    pi: 1,
    off: 100,
    rs: 100,
    iv: 3,
    pr: "qp1:AbCdEfGhIjKlMnOpQrStUv",
    qb: queryBind(AST).toString("base64url"),
    g: grantTags(["grant_1", "grant_2"]),
    cn: "conn_1",
    cr: 4,
    lk: lastKeyTag(RING, "t1", '["1000123"]'),
    rb: 420,
    iat: T,
    exp: T + CURSOR_TTL_SECONDS,
    cx: T + 7200,
    ...over,
  };
}

function open(text: unknown, binding = BINDING, now = NOW, r = RING) {
  return openCursor(text, binding, now, r);
}

function refusal(r: ReturnType<typeof open>): QueryRefusal {
  if (r.ok) throw new Error("opened");
  return r;
}

describe("sealing and opening", () => {
  it("round trips, under the active kid, in the cursor format", () => {
    const p = payload();
    const text = sealCursor(p, BINDING, RING);
    expect(text).toMatch(/^cec1\.t1\.[A-Za-z0-9_-]{40,1000}$/);
    expect(text.length).toBeLessThan(600);
    const r = open(text);
    expect(r.ok && r.payload).toEqual(p);
    expect(r.ok && r.kid).toBe("t1");
    // A fresh IV each time.
    expect(sealCursor(p, BINDING, RING)).not.toBe(text);
  });

  it("refuses to seal a payload it would not open", () => {
    expect(() => sealCursor({ ...payload(), pi: 0 }, BINDING, RING)).toThrow();
    expect(() => sealCursor({ ...payload(), g: [] }, BINDING, RING)).toThrow();
    expect(() => sealCursor({ ...payload(), pr: "nope" }, BINDING, RING)).toThrow();
    expect(() => sealCursor(payload(), { ...BINDING, clientId: "a|b" }, RING)).toThrow();
  });

  it("stays within 1,024 characters at the largest payload", () => {
    const big = payload({
      pi: 10_000,
      off: 101_000,
      rs: 99_999,
      iv: Number.MAX_SAFE_INTEGER,
      cr: Number.MAX_SAFE_INTEGER,
      cn: "c".repeat(64),
      g: grantTags(Array.from({ length: 20 }, (_, i) => `grant_${i}`)),
      rb: 4_000_000,
    });
    expect(big.g).toHaveLength(8);
    const text = sealCursor(big, BINDING, ring(`t999999:${K1}`, "t999999"));
    expect(text.length).toBeLessThanOrEqual(MAX_CURSOR_LENGTH);
  });

  it("carries no host, URL or SAP text in its plaintext", () => {
    const text = sealCursor(payload(), BINDING, RING);
    const sealed = Buffer.from(text.split(".")[2]!, "base64url");
    const d = createDecipheriv("aes-256-gcm", deriveTokenKey(RING, "t1", TOKEN_PURPOSES.cursor), sealed.subarray(0, 12));
    d.setAAD(Buffer.from(`cec1|t1|${BINDING.organizationId}|${BINDING.clientId}|${BINDING.interfaceId}|${BINDING.apiVersion}`));
    d.setAuthTag(sealed.subarray(sealed.length - 16));
    const plaintext = Buffer.concat([d.update(sealed.subarray(12, sealed.length - 16)), d.final()]).toString("utf8");
    expect(Object.keys(JSON.parse(plaintext) as object)).toEqual(["v", "ch", "pi", "off", "rs", "iv", "pr", "qb", "g", "cn", "cr", "lk", "rb", "iat", "exp", "cx"]);
    expect(plaintext).not.toMatch(/:\/\/|example|sap-client|grant_1/);
  });
});

describe("what does not open", () => {
  const text = sealCursor(payload(), BINDING, RING);

  it("every single-byte change of the sealed bytes, and of the text", () => {
    const [prefix, kid, body] = text.split(".") as [string, string, string];
    const sealed = Buffer.from(body, "base64url");
    for (let i = 0; i < sealed.length; i++) {
      const copy = Buffer.from(sealed);
      copy[i] = copy[i]! ^ 0x01;
      const r = refusal(open(`${prefix}.${kid}.${copy.toString("base64url")}`));
      expect(r.reason).toBe("CURSOR_INVALID");
    }
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.";
    for (let i = 0; i < text.length; i++) {
      const replacement = alphabet[(alphabet.indexOf(text[i]!) + 1) % alphabet.length]!;
      const mutated = text.slice(0, i) + replacement + text.slice(i + 1);
      if (mutated === text) continue;
      const r = open(mutated);
      expect(r.ok, `position ${i}`).toBe(false);
      expect(refusal(r).reason).toBe("CURSOR_INVALID");
    }
  });

  it("truncated or extended", () => {
    for (let n = 0; n < text.length; n += 7) expect(refusal(open(text.slice(0, n))).reason).toBe("CURSOR_INVALID");
    for (const tail of ["A", "AA", "AAAA", "=", ".", " "]) expect(refusal(open(text + tail)).reason).toBe("CURSOR_INVALID");
    expect(refusal(open("x".repeat(MAX_CURSOR_LENGTH + 1))).auditRule).toBe("CURSOR_MALFORMED");
    expect(refusal(open(`cec1.t1.${"A".repeat(1001)}`)).auditRule).toBe("CURSOR_MALFORMED");
  });

  it.each([
    ["another organisation", { organizationId: "org_b" }],
    ["another client", { clientId: "cli_b" }],
    ["another interface", { interfaceId: "if_b" }],
    ["another API version", { apiVersion: "2027-04" }],
  ])("bound to %s: CURSOR_INVALID, 400, the same message as a forgery", (_label, change) => {
    const r = refusal(open(text, { ...BINDING, ...change }));
    expect(r.reason).toBe("CURSOR_INVALID");
    expect(QUERY_REFUSAL_STATUS[r.reason]).toBe(400);
    expect(r.auditRule).toBe("CURSOR_UNOPENED");
    expect(r.message).toBe(refusal(open("cec1.t1.forged-forged-forged-forged-forged-forged")).message);
  });

  it("an unknown kid, and t0 in a production ring", () => {
    expect(refusal(open(text.replace("cec1.t1.", "cec1.t7."))).auditRule).toBe("CURSOR_KEY_UNKNOWN");
    const dev = readTokenRing({ NODE_ENV: "test" });
    const devCursor = sealCursor(payload(), BINDING, dev);
    expect(devCursor.startsWith("cec1.t0.")).toBe(true);
    expect(refusal(open(devCursor)).auditRule).toBe("CURSOR_KEY_UNKNOWN");
  });

  it("anything that is not a string", () => {
    for (const v of [undefined, null, 42, {}, ["cec1"]]) expect(refusal(open(v)).reason).toBe("CURSOR_INVALID");
  });
});

describe("the clocks", () => {
  it("a cursor expires after 15 minutes, a chain after 2 hours: CURSOR_STALE, 409, EXPIRED", () => {
    const text = sealCursor(payload(), BINDING, RING);
    expect(open(text, BINDING, new Date(NOW.getTime() + (CURSOR_TTL_SECONDS - 1) * 1000)).ok).toBe(true);
    const late = refusal(open(text, BINDING, new Date(NOW.getTime() + CURSOR_TTL_SECONDS * 1000)));
    expect([late.reason, late.detail.rule, late.auditRule, QUERY_REFUSAL_STATUS[late.reason]]).toEqual(["CURSOR_STALE", "EXPIRED", "CURSOR_EXPIRED", 409]);
    const chain = sealCursor(payload({ cx: T + 60 }), BINDING, RING);
    expect(refusal(open(chain, BINDING, new Date(NOW.getTime() + 60_000))).auditRule).toBe("CURSOR_CHAIN_EXPIRED");
  });
});

describe("the bindings checked against the live state", () => {
  const policy = { rev: "qp1:AbCdEfGhIjKlMnOpQrStUv", page: { defaultSize: 100, maxSize: 500, rowCap: 10_000, byteCap: 4_000_000 } };
  const live = { interfaceVersion: 3, policy, authorisingGrantIds: ["grant_2", "grant_9"] };

  it("pass when nothing changed, and while any of the chain's grants still authorises", () => {
    expect(checkCursorAfterAuthorise(payload(), live)).toBeNull();
  });

  it.each([
    ["the interface version", { interfaceVersion: 4 }, "CURSOR_INTERFACE_CHANGED"],
    ["the policy", { policy: { ...policy, rev: "qp1:ZZZZZZZZZZZZZZZZZZZZZZ" } }, "CURSOR_POLICY_CHANGED"],
    ["a lowered row cap", { policy: { ...policy, page: { ...policy.page, rowCap: 100 } } }, "CURSOR_POLICY_CHANGED"],
    ["the grants (revoked, or revoked and re-approved as a new row)", { authorisingGrantIds: ["grant_3"] }, "CURSOR_GRANT_CHANGED"],
  ])("refuse when %s changed: CURSOR_STALE, CHANGED", (_label, change, auditRule) => {
    const r = checkCursorAfterAuthorise(payload(), { ...live, ...change });
    expect(r).not.toBeNull();
    expect([r!.reason, r!.detail.rule, r!.auditRule]).toEqual(["CURSOR_STALE", "CHANGED", auditRule]);
  });

  it("the re-sent parameters must be the chain's query", () => {
    expect(checkCursorQuery(payload(), AST)).toBeNull();
    const r = checkCursorQuery(payload(), { ...AST, filter: [{ f: "Customer", op: "eq", v: { t: "S", v: "17100002" } }] });
    expect([r?.reason, r?.detail.rule]).toEqual(["QUERY_INVALID", "CURSOR_PARAMS_MISMATCH"]);
    expect(checkCursorQuery(payload(), { ...AST, pageSize: 50 })?.detail.rule).toBe("CURSOR_PARAMS_MISMATCH");
  });

  it("the connection, and its revision", () => {
    expect(checkCursorConnection(payload(), { id: "conn_1", revision: 4 })).toBeNull();
    expect(checkCursorConnection(payload(), { id: "conn_2", revision: 4 })?.auditRule).toBe("CURSOR_CONNECTION_CHANGED");
    expect(checkCursorConnection(payload(), { id: "conn_1", revision: 5 })?.auditRule).toBe("CURSOR_CONNECTION_CHANGED");
  });

  it("grant ids are carried as digests, sorted and at most 8", () => {
    expect(grantTag("grant_1")).toMatch(/^[A-Za-z0-9_-]{12}$/);
    const tags = grantTags(["b", "a", "a", "c"]);
    expect(tags).toEqual([...tags].sort());
    expect(tags).toHaveLength(3);
  });
});

describe("rotation", () => {
  it("an old kid opens; the active kid seals; a removed kid does not open", () => {
    const old = sealCursor(payload(), BINDING, ring(`t1:${K1}`, "t1"));
    const rotated = ring(`t1:${K1},t2:${K2}`, "t2");
    expect(open(old, BINDING, NOW, rotated).ok).toBe(true);
    expect(sealCursor(payload(), BINDING, rotated).startsWith("cec1.t2.")).toBe(true);
    const removed = ring(`t2:${K2}`, "t2");
    expect(refusal(open(old, BINDING, NOW, removed)).auditRule).toBe("CURSOR_KEY_UNKNOWN");
    // The same label with another key is another key.
    expect(refusal(open(old, BINDING, NOW, ring(`t1:${K2}`, "t1"))).auditRule).toBe("CURSOR_UNOPENED");
  });
});

describe("cursor fuzz", () => {
  class Rand {
    private a: number;
    constructor(seed: number) {
      this.a = seed >>> 0;
    }
    next(): number {
      this.a = (this.a + 0x6d2b79f5) >>> 0;
      let t = this.a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    int(lo: number, hi: number): number {
      return lo + Math.floor(this.next() * (hi - lo + 1));
    }
  }

  it("random strings and mutations of real cursors give only CURSOR_INVALID or CURSOR_STALE", () => {
    const rand = new Rand(Number(process.env.ODATA_FUZZ_SEED ?? 7));
    const real = Array.from({ length: 8 }, (_, i) => sealCursor(payload({ pi: i + 1 }), BINDING, RING));
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.=%+/ \u0000é";
    const reasons = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      let text: string;
      const mode = rand.int(0, 3);
      if (mode === 0) {
        text = Array.from({ length: rand.int(0, 1100) }, () => alphabet[rand.int(0, alphabet.length - 1)]).join("");
      } else if (mode === 1) {
        text = `cec1.t1.${Buffer.from(Array.from({ length: rand.int(20, 760) }, () => rand.int(0, 255))).toString("base64url")}`;
      } else {
        const base = real[rand.int(0, real.length - 1)]!;
        const chars = base.split("");
        for (let n = rand.int(1, 4); n > 0; n--) chars[rand.int(0, chars.length - 1)] = alphabet[rand.int(0, alphabet.length - 1)]!;
        text = mode === 2 ? chars.join("") : chars.join("").slice(0, rand.int(0, base.length));
      }
      const r = open(text);
      if (r.ok) {
        // Only an unchanged real cursor opens.
        expect(real).toContain(text);
        continue;
      }
      reasons.add(r.reason);
    }
    expect([...reasons].every((x) => x === "CURSOR_INVALID" || x === "CURSOR_STALE")).toBe(true);
  });
});
