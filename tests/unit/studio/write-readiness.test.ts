/**
 * The write chain, per environment — the pure part behind the Mark ACTIVE
 * gate and the Contract card. Predicates mirror resolveWritableInterface, in
 * its order (granting → revoked → expired), so what this says is what a call
 * in that environment would get.
 */

import { describe, expect, it } from "vitest";

import {
  describeWriteReadiness,
  readyEnvironments,
  writeReadinessByEnvironment,
  writeReadinessRefusal,
} from "@/lib/studio/write-readiness";

const NOW = new Date("2026-09-11T00:00:00Z");
const approved = (environment: string, over: Partial<{ decision: string; expiresAt: string | null; revokedAt: string | null }> = {}) => ({
  environment,
  decision: "APPROVED",
  expiresAt: null,
  revokedAt: null,
  ...over,
});

describe("writeReadinessByEnvironment", () => {
  it("is ready only where a credential with a write key AND an approved grant coincide", () => {
    const rows = writeReadinessByEnvironment({
      credentials: [{ environment: "DEV", hasWriteKey: true }, { environment: "PROD", hasWriteKey: false }],
      grants: [approved("PROD")],
      now: NOW,
    });
    expect(readyEnvironments(rows)).toEqual([]);
    expect(rows.find((r) => r.environment === "DEV")).toMatchObject({ credential: "ready", grant: "none", ready: false });
    expect(rows.find((r) => r.environment === "PROD")).toMatchObject({ credential: "no-write-key", grant: "approved", ready: false });

    const fixed = writeReadinessByEnvironment({
      credentials: [{ environment: "PROD", hasWriteKey: true }],
      grants: [approved("PROD")],
      now: NOW,
    });
    expect(readyEnvironments(fixed)).toEqual(["PROD"]);
  });

  it("always answers all four environments, in trust order", () => {
    const rows = writeReadinessByEnvironment({ credentials: [], grants: [], now: NOW });
    expect(rows.map((r) => r.environment)).toEqual(["SANDBOX", "DEV", "TEST", "PROD"]);
    expect(rows.every((r) => r.credential === "none" && r.grant === "none" && !r.ready)).toBe(true);
  });

  it("applies the broker's grant predicates in the broker's order", () => {
    const at = (grants: Parameters<typeof writeReadinessByEnvironment>[0]["grants"]) =>
      writeReadinessByEnvironment({ credentials: [{ environment: "TEST", hasWriteKey: true }], grants, now: NOW })
        .find((r) => r.environment === "TEST")!;

    expect(at([approved("TEST", { decision: "READ_ONLY" })]).grant).toBe("not-granting");
    expect(at([approved("TEST", { decision: "REQUESTED" })]).grant).toBe("not-granting");
    // SANDBOX_ONLY grants a write in SANDBOX and nowhere else.
    expect(at([approved("TEST", { decision: "SANDBOX_ONLY" })]).grant).toBe("not-granting");
    expect(
      writeReadinessByEnvironment({
        credentials: [{ environment: "SANDBOX", hasWriteKey: true }],
        grants: [approved("SANDBOX", { decision: "SANDBOX_ONLY" })],
        now: NOW,
      }).find((r) => r.environment === "SANDBOX")!.ready,
    ).toBe(true);
    // Revoked before expired: a revoked grant with a future expiry says "revoked".
    expect(at([approved("TEST", { revokedAt: "2026-09-01T00:00:00Z", expiresAt: "2027-01-01T00:00:00Z" })]).grant).toBe("revoked");
    expect(at([approved("TEST", { expiresAt: "2026-09-10T23:59:59Z" })]).grant).toBe("expired");
    expect(at([approved("TEST", { expiresAt: "2026-09-11T00:00:01Z" })]).grant).toBe("approved");
    // One live grant beside a dead one is enough — the broker filters, it does not average.
    expect(at([approved("TEST", { revokedAt: "2026-09-01T00:00:00Z" }), approved("TEST")]).grant).toBe("approved");
  });
});

describe("the sentences", () => {
  it("describe a row in the words the card and the refusal share", () => {
    expect(describeWriteReadiness({ environment: "TEST", credential: "ready", grant: "approved", ready: true })).toBe(
      "TEST: credential with write key · write grant approved → ready",
    );
    expect(describeWriteReadiness({ environment: "DEV", credential: "no-write-key", grant: "expired", ready: false })).toBe(
      "DEV: credential without a write key · write grant expired",
    );
  });

  it("the refusal lists only the environments where something was started", () => {
    const rows = writeReadinessByEnvironment({
      credentials: [{ environment: "DEV", hasWriteKey: true }],
      grants: [approved("PROD")],
      now: NOW,
    });
    const msg = writeReadinessRefusal("CREATE", rows);
    expect(msg).toMatch(/^A CREATE interface cannot be activated until some environment holds the full write chain/);
    expect(msg).toContain("DEV: credential with write key · no write grant requested");
    expect(msg).toContain("PROD: no live credential · write grant approved");
    expect(msg).not.toMatch(/SANDBOX:|TEST:/);
    expect(msg).toMatch(/issue the write credential for that environment under API Access, then activate\.$/);
  });

  it("…and says so plainly when nothing has been started anywhere", () => {
    const msg = writeReadinessRefusal("UPDATE", writeReadinessByEnvironment({ credentials: [], grants: [], now: NOW }));
    expect(msg).toContain("No environment has a credential or a write grant yet.");
  });
});
