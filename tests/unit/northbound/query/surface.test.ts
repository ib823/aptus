// @vitest-environment node
/**
 * The query surface's switch (P1.4, 3.17): off by default, and off refuses
 * rather than ignores; on, the ring must be readable or every query-surface
 * call is refused 500 before authorisation.
 */

import { describe, expect, it } from "vitest";

import { QUERY_REFUSAL_STATUS } from "@/lib/odata/rules";
import { querySurfaceEnabled, querySurfaceGate, querySurfaceMode } from "@/lib/northbound/query/surface";

const RING = { COREEDGE_TOKEN_KEYS: `t1:${"ab".repeat(32)}`, COREEDGE_TOKEN_ACTIVE_KEY: "t1" };

describe("COREEDGE_QUERY_SURFACE", () => {
  it.each([undefined, "", "off", "OFF", "true", "1", "enabled", "o n"])("%j is off", (value) => {
    expect(querySurfaceMode({ COREEDGE_QUERY_SURFACE: value })).toBe("off");
    expect(querySurfaceEnabled({ COREEDGE_QUERY_SURFACE: value })).toBe(false);
  });

  it.each(["on", "ON", " on "])("%j is on", (value) => {
    expect(querySurfaceMode({ COREEDGE_QUERY_SURFACE: value })).toBe("on");
  });

  it("off refuses QUERY_NOT_AVAILABLE / NOT_ENABLED, 400", () => {
    const r = querySurfaceGate({ ...RING, NODE_ENV: "production" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect([r.reason, r.detail.rule, QUERY_REFUSAL_STATUS[r.reason]]).toEqual(["QUERY_NOT_AVAILABLE", "NOT_ENABLED", 400]);
    expect(r.message).toBe("This deployment does not serve query parameters yet.");
  });

  it("on with a readable ring passes it on", () => {
    const r = querySurfaceGate({ ...RING, COREEDGE_QUERY_SURFACE: "on", NODE_ENV: "production" });
    expect(r.ok && r.ring.active).toBe("t1");
  });

  it("on without a ring in production is QUERY_SURFACE_MISCONFIGURED, 500, naming no key", () => {
    for (const env of [
      { COREEDGE_QUERY_SURFACE: "on", NODE_ENV: "production" },
      { COREEDGE_QUERY_SURFACE: "on", NODE_ENV: "production", COREEDGE_TOKEN_KEYS: "t1:short", COREEDGE_TOKEN_ACTIVE_KEY: "t1" },
    ]) {
      const r = querySurfaceGate(env);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect([r.reason, r.detail.rule, QUERY_REFUSAL_STATUS[r.reason]]).toEqual(["QUERY_SURFACE_MISCONFIGURED", "TOKEN_RING_UNAVAILABLE", 500]);
      expect(r.message).not.toContain("short");
    }
  });

  it("on in development falls back to the derived ring", () => {
    const r = querySurfaceGate({ COREEDGE_QUERY_SURFACE: "on", NODE_ENV: "development", NEXTAUTH_SECRET: "s".repeat(32) });
    expect(r.ok && r.ring.active).toBe("t0");
  });
});
