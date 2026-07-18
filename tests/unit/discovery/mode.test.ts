/**
 * ABeam Workbench — mode parsing + persistence contract (brief §6/22).
 *
 * The cookie is read server-side so the first paint is already in the right mode.
 * That makes `parseMode` a trust boundary of sorts: the value is client-settable,
 * so it must fail safe rather than throw or render an undefined mode.
 */

import { describe, expect, it } from "vitest";

import {
  DISCOVERY_MODES,
  DISCOVERY_MODE_COOKIE,
  DISCOVERY_MODE_COOKIE_PATH,
  MODE_KEYS,
  MODE_LABELS,
  isDiscoveryMode,
  parseMode,
} from "@/lib/discovery/mode";

describe("mode vocabulary", () => {
  it("is exactly the brief's three", () => {
    expect([...DISCOVERY_MODES].sort()).toEqual(["explore", "export", "present"]);
  });

  it("labels match §6/22", () => {
    expect(MODE_LABELS).toEqual({ present: "Present", explore: "Explore", export: "Export" });
  });

  it("keys are P / E / X", () => {
    expect(MODE_KEYS).toEqual({ present: "p", explore: "e", export: "x" });
  });
});

describe("parseMode fails safe", () => {
  it("reads each valid mode", () => {
    for (const m of DISCOVERY_MODES) expect(parseMode(m)).toBe(m);
  });

  it("defaults to explore when unset", () => {
    // §8: "Explore — the default mode."
    expect(parseMode(undefined)).toBe("explore");
    expect(parseMode(null)).toBe("explore");
    expect(parseMode("")).toBe("explore");
  });

  it("defaults to explore on a forged or stale value", () => {
    // The cookie is not httpOnly — it is UI state, and a forged value must
    // degrade to the default rather than throw or render nothing.
    expect(parseMode("PRESENT")).toBe("explore");
    expect(parseMode("workbench")).toBe("explore");
    expect(parseMode("../../etc/passwd")).toBe("explore");
    expect(parseMode("<script>")).toBe("explore");
  });

  it("isDiscoveryMode is a real narrow", () => {
    expect(isDiscoveryMode("present")).toBe(true);
    expect(isDiscoveryMode("nope")).toBe(false);
  });
});

describe("cookie scope", () => {
  it("is scoped to /d, alongside the guest session cookie", () => {
    // A wider path would attach the mode to unrelated surfaces; it is /d's UI
    // state, not the app's.
    expect(DISCOVERY_MODE_COOKIE_PATH).toBe("/d");
    expect(DISCOVERY_MODE_COOKIE).toBe("discovery-mode");
  });

  it("does not collide with the guest session cookie name", async () => {
    const { DISCOVERY_GUEST_COOKIE_NAME } = await import("@/lib/discovery/external/cookies");
    expect(DISCOVERY_MODE_COOKIE).not.toBe(DISCOVERY_GUEST_COOKIE_NAME);
  });
});
