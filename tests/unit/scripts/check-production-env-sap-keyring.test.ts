/**
 * The deploy gate's check of the SAP master-key ring (P0.10).
 *
 * A ring the application cannot read would fail every connection save on the
 * first request after going live; the gate fails the build instead, so the
 * running deployment keeps serving. A deployment that sets none of the new
 * variables must see exactly what it saw before.
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SCRIPT = path.resolve(process.cwd(), "scripts/check-production-env.js");

const BASE_PROD_ENV: Record<string, string> = {
  VERCEL_ENV: "production",
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@h:5432/d",
  NEXTAUTH_SECRET: "x".repeat(32),
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

const hex = () => randomBytes(32).toString("hex");

describe("the SAP key ring at deploy time", () => {
  it("is unchanged for a deployment with only the legacy key", () => {
    const r = run({ ...BASE_PROD_ENV, SAP_CONNECTION_ENCRYPTION_KEY: hex() });
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toContain("SAP_CONNECTION_ENCRYPTION");
  });

  it("still warns when no SAP key is configured at all", () => {
    const r = run(BASE_PROD_ENV);
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain("Missing recommended env var: SAP_CONNECTION_ENCRYPTION_KEY");
  });

  it("passes a well-formed ring, and stops asking for the legacy variable", () => {
    const r = run({
      ...BASE_PROD_ENV,
      SAP_CONNECTION_ENCRYPTION_KEYS: `v1:${hex()},v2:${hex()}`,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v2",
    });
    expect(r.code, r.out).toBe(0);
    expect(r.out).not.toContain("SAP_CONNECTION_ENCRYPTION_KEY");
  });

  it("passes the legacy key as v1 beside a ring", () => {
    const r = run({
      ...BASE_PROD_ENV,
      SAP_CONNECTION_ENCRYPTION_KEY: hex(),
      SAP_CONNECTION_ENCRYPTION_KEYS: `v2:${hex()}`,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v1",
    });
    expect(r.code, r.out).toBe(0);
  });

  it("fails an active key the ring does not hold", () => {
    const r = run({
      ...BASE_PROD_ENV,
      SAP_CONNECTION_ENCRYPTION_KEYS: `v1:${hex()}`,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v2",
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY");
  });

  it("fails a malformed entry without printing it", () => {
    const bad = "q".repeat(64);
    const r = run({ ...BASE_PROD_ENV, SAP_CONNECTION_ENCRYPTION_KEYS: `v1:${bad}` });
    expect(r.code).toBe(1);
    expect(r.out).toContain("malformed");
    expect(r.out).not.toContain(bad);
  });

  it("fails a legacy key that disagrees with the ring's v1", () => {
    const r = run({
      ...BASE_PROD_ENV,
      SAP_CONNECTION_ENCRYPTION_KEY: hex(),
      SAP_CONNECTION_ENCRYPTION_KEYS: `v1:${hex()}`,
    });
    expect(r.code).toBe(1);
    expect(r.out).toContain("different keys");
  });

  it("is checked on a preview deploy too — a broken ring breaks any deploy", () => {
    const r = run({
      ...BASE_PROD_ENV,
      VERCEL_ENV: "preview",
      SAP_CONNECTION_ENCRYPTION_KEYS: `v1:${hex()}`,
      SAP_CONNECTION_ENCRYPTION_ACTIVE_KEY: "v9",
    });
    expect(r.code).toBe(1);
  });
});
