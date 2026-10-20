/**
 * Credential hygiene (P0.11): the rules every key mint applies, and the one
 * predicate every screen uses to say whether a key is live.
 *
 * The rules are pure functions of the environment, the request, the clock and
 * the settings, so they are pinned here once; the routes and the key writes
 * are tested for calling them (clients-route, issue, claim-link-lifecycle and
 * the integration test credential-hygiene).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultKeyExpiry,
  expiryOnRenewal,
  isKeyLive,
  keyDefaultTtlDays,
  keyExpiryMode,
  keyMaxTtlDays,
  keyState,
  lacksRequiredExpiry,
  LEGACY_TOKEN_PREFIX,
  LIVE_TOKEN_PREFIX,
  NO_OVERLAP,
  overlapFields,
  overlapIsOpen,
  overlapStillBound,
  requiresExpiry,
  resolveKeyExpiry,
  rotationOverlapHours,
  storedTokenPrefix,
  TEST_TOKEN_PREFIX,
  tokenPrefixFor,
} from "@/lib/northbound/key-policy";

const NOW = new Date("2026-10-20T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const days = (n: number) => new Date(NOW.getTime() + n * DAY);

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("prefixes", () => {
  it("are ce_live_ for PROD and ce_test_ for every other environment", () => {
    expect(tokenPrefixFor("PROD")).toBe(LIVE_TOKEN_PREFIX);
    expect(tokenPrefixFor("prod")).toBe(LIVE_TOKEN_PREFIX);
    for (const env of ["SANDBOX", "DEV", "TEST"]) expect(tokenPrefixFor(env)).toBe(TEST_TOKEN_PREFIX);
  });

  it("all begin with the legacy ce_, so anything that greps for ce_ still finds them", () => {
    for (const p of [LIVE_TOKEN_PREFIX, TEST_TOKEN_PREFIX]) expect(p.startsWith(LEGACY_TOKEN_PREFIX)).toBe(true);
  });

  it("read anything unrecognised in the column as legacy, never as live", () => {
    expect(storedTokenPrefix("ce_live_")).toBe("ce_live_");
    expect(storedTokenPrefix("ce_test_")).toBe("ce_test_");
    expect(storedTokenPrefix("ce_")).toBe("ce_");
    expect(storedTokenPrefix("weird")).toBe("ce_");
    expect(storedTokenPrefix(null)).toBe("ce_");
  });
});

describe("settings, with safe defaults", () => {
  it("defaults to enforce, 90-day maximum and default, and a 24-hour overlap", () => {
    expect(keyExpiryMode()).toBe("enforce");
    expect(keyMaxTtlDays()).toBe(90);
    expect(keyDefaultTtlDays()).toBe(90);
    expect(rotationOverlapHours()).toBe(24);
  });

  it("reads each setting, and only `off` switches enforcement off", () => {
    vi.stubEnv("COREEDGE_KEY_EXPIRY", "OFF");
    expect(keyExpiryMode()).toBe("off");
    vi.stubEnv("COREEDGE_KEY_EXPIRY", "warn");
    expect(keyExpiryMode()).toBe("enforce");
    vi.stubEnv("COREEDGE_KEY_MAX_TTL_DAYS", "30");
    vi.stubEnv("COREEDGE_KEY_DEFAULT_TTL_DAYS", "14");
    vi.stubEnv("COREEDGE_KEY_ROTATION_OVERLAP_HOURS", "0");
    expect(keyMaxTtlDays()).toBe(30);
    expect(keyDefaultTtlDays()).toBe(14);
    expect(rotationOverlapHours()).toBe(0);
  });

  it("never lets the default exceed the maximum", () => {
    vi.stubEnv("COREEDGE_KEY_MAX_TTL_DAYS", "30");
    vi.stubEnv("COREEDGE_KEY_DEFAULT_TTL_DAYS", "60");
    expect(keyDefaultTtlDays()).toBe(30);
  });

  it("falls back to the default, with a warning, for a value that does not parse or is out of range", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const bad of ["ninety", "0", "-5", "1.5", "4000"]) {
      vi.stubEnv("COREEDGE_KEY_MAX_TTL_DAYS", bad);
      expect(keyMaxTtlDays(), bad).toBe(90);
    }
    vi.stubEnv("COREEDGE_KEY_ROTATION_OVERLAP_HOURS", "1000");
    expect(rotationOverlapHours()).toBe(24);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("mandatory expiry at issue", () => {
  it("is required only for TEST and PROD", () => {
    expect(requiresExpiry("PROD")).toBe(true);
    expect(requiresExpiry("TEST")).toBe(true);
    expect(requiresExpiry("DEV")).toBe(false);
    expect(requiresExpiry("SANDBOX")).toBe(false);
  });

  it("refuses a PROD issue without an expiry, naming the limit", () => {
    const r = resolveKeyExpiry({ environment: "PROD", requested: undefined, now: NOW, purpose: "issue" });
    expect(r).toMatchObject({ ok: false, refusal: "missingExpiry" });
    if (!r.ok) expect(r.message).toContain("90 days");
  });

  it("gives a TEST issue without an expiry the default lifetime", () => {
    expect(resolveKeyExpiry({ environment: "TEST", requested: null, now: NOW, purpose: "issue" })).toEqual({
      ok: true,
      expiresAt: days(90),
    });
  });

  it("leaves SANDBOX and DEV free to have none", () => {
    for (const environment of ["SANDBOX", "DEV"]) {
      expect(resolveKeyExpiry({ environment, requested: undefined, now: NOW, purpose: "issue" })).toEqual({
        ok: true,
        expiresAt: null,
      });
    }
  });

  it("accepts an expiry up to the maximum and refuses one past it, for TEST and PROD", () => {
    for (const environment of ["TEST", "PROD"]) {
      expect(resolveKeyExpiry({ environment, requested: days(90), now: NOW, purpose: "issue" })).toEqual({
        ok: true,
        expiresAt: days(90),
      });
      expect(
        resolveKeyExpiry({ environment, requested: new Date(days(90).getTime() + 1), now: NOW, purpose: "issue" }),
      ).toMatchObject({ ok: false, refusal: "expiryTooFar" });
    }
  });

  it("does not cap DEV — expiry is not mandatory there, so neither is its maximum", () => {
    expect(resolveKeyExpiry({ environment: "DEV", requested: days(400), now: NOW, purpose: "issue" }).ok).toBe(true);
  });

  it("refuses an expiry that has already passed, in every environment", () => {
    for (const environment of ["SANDBOX", "DEV", "TEST", "PROD"]) {
      expect(resolveKeyExpiry({ environment, requested: NOW, now: NOW, purpose: "issue" })).toMatchObject({
        ok: false,
        refusal: "expiryInPast",
      });
    }
  });

  it("restores the old behaviour under COREEDGE_KEY_EXPIRY=off", () => {
    vi.stubEnv("COREEDGE_KEY_EXPIRY", "off");
    expect(resolveKeyExpiry({ environment: "PROD", requested: undefined, now: NOW, purpose: "issue" })).toEqual({
      ok: true,
      expiresAt: null,
    });
    expect(resolveKeyExpiry({ environment: "PROD", requested: days(500), now: NOW, purpose: "issue" })).toEqual({
      ok: true,
      expiresAt: days(500),
    });
  });
});

describe("expiry on renewal (rotation, claim)", () => {
  it("gives TEST and PROD a fresh default lifetime when nobody chose one — including a key issued with none", () => {
    for (const current of [null, days(-1), days(10), days(80)]) {
      expect(expiryOnRenewal({ environment: "PROD", requested: undefined, current, now: NOW })).toEqual({
        ok: true,
        expiresAt: defaultKeyExpiry(NOW),
      });
    }
  });

  it("keeps a future DEV expiry and drops a lapsed one (A48)", () => {
    expect(expiryOnRenewal({ environment: "DEV", requested: undefined, current: days(10), now: NOW })).toEqual({
      ok: true,
      expiresAt: days(10),
    });
    expect(expiryOnRenewal({ environment: "DEV", requested: undefined, current: days(-1), now: NOW })).toEqual({
      ok: true,
      expiresAt: null,
    });
  });

  it("applies the maximum to a chosen renewal expiry", () => {
    expect(expiryOnRenewal({ environment: "TEST", requested: days(91), current: null, now: NOW })).toMatchObject({
      ok: false,
      refusal: "expiryTooFar",
    });
  });
});

describe("the rotation overlap", () => {
  const live = { tokenHash: "old", isActive: true, revokedAt: null, expiresAt: null };

  it("keeps a live replaced key for 24 hours by default", () => {
    expect(overlapFields(live, NOW, days(90), "new")).toEqual({
      previousTokenHash: "old",
      previousValidUntil: new Date(NOW.getTime() + 24 * HOUR),
      overlapForTokenHash: "new",
    });
  });

  // Review round 1: a build from before P0.11 changes tokenHash without
  // touching the overlap, so the window must not survive that change.
  it("is bound to the key that opened it: any later change of tokenHash ends it", () => {
    const opened = overlapFields(live, NOW, days(90), "new");
    expect(overlapStillBound({ tokenHash: "new", overlapForTokenHash: opened.overlapForTokenHash })).toBe(true);
    expect(overlapStillBound({ tokenHash: "changed-elsewhere", overlapForTokenHash: opened.overlapForTokenHash })).toBe(false);
    expect(overlapStillBound({ tokenHash: "new", overlapForTokenHash: null })).toBe(false);
  });

  it("never outlives the replaced key's own expiry, nor the new key's", () => {
    expect(overlapFields({ ...live, expiresAt: new Date(NOW.getTime() + 2 * HOUR) }, NOW, null, "new").previousValidUntil).toEqual(
      new Date(NOW.getTime() + 2 * HOUR),
    );
    expect(overlapFields(live, NOW, new Date(NOW.getTime() + 3 * HOUR), "new").previousValidUntil).toEqual(
      new Date(NOW.getTime() + 3 * HOUR),
    );
  });

  it("gives an ended key none: revoked, deactivated or expired keys never come back", () => {
    expect(overlapFields({ ...live, revokedAt: days(-1) }, NOW, null, "new")).toEqual(NO_OVERLAP);
    expect(overlapFields({ ...live, isActive: false }, NOW, null, "new")).toEqual(NO_OVERLAP);
    expect(overlapFields({ ...live, expiresAt: NOW }, NOW, null, "new")).toEqual(NO_OVERLAP);
    expect(overlapFields(null, NOW, null, "new")).toEqual(NO_OVERLAP);
  });

  it("is switched off by COREEDGE_KEY_ROTATION_OVERLAP_HOURS=0, and follows any other value", () => {
    vi.stubEnv("COREEDGE_KEY_ROTATION_OVERLAP_HOURS", "0");
    expect(overlapFields(live, NOW, null, "new")).toEqual(NO_OVERLAP);
    vi.stubEnv("COREEDGE_KEY_ROTATION_OVERLAP_HOURS", "6");
    expect(overlapFields(live, NOW, null, "new").previousValidUntil).toEqual(new Date(NOW.getTime() + 6 * HOUR));
  });

  it("is open strictly before its end", () => {
    expect(overlapIsOpen(new Date(NOW.getTime() + 1), NOW)).toBe(true);
    expect(overlapIsOpen(NOW, NOW)).toBe(false);
    expect(overlapIsOpen(null, NOW)).toBe(false);
  });
});

describe("is it live? — one answer for every screen", () => {
  const base = { environment: "PROD", isActive: true, revokedAt: null, expiresAt: days(30) };

  it("an expired key is never live", () => {
    expect(isKeyLive({ ...base, expiresAt: NOW }, NOW)).toBe(false);
    expect(keyState({ ...base, expiresAt: days(-1) }, NOW)).toBe("expired");
  });

  it("revoked beats every other state, as in authentication", () => {
    expect(keyState({ ...base, revokedAt: days(-1), isActive: false, expiresAt: days(-2) }, NOW)).toBe("revoked");
    expect(keyState({ ...base, isActive: false }, NOW)).toBe("inactive");
  });

  it("a live TEST or PROD key with no expiry is live and flagged; SANDBOX and DEV are not flagged", () => {
    for (const environment of ["TEST", "PROD"]) {
      const k = { ...base, environment, expiresAt: null };
      expect(isKeyLive(k, NOW)).toBe(true);
      expect(lacksRequiredExpiry(k, NOW)).toBe(true);
      expect(keyState(k, NOW)).toBe("noExpiry");
    }
    for (const environment of ["SANDBOX", "DEV"]) {
      expect(keyState({ ...base, environment, expiresAt: null }, NOW)).toBe("active");
    }
  });

  it("a key inside its expiry is active", () => {
    expect(keyState(base, NOW)).toBe("active");
  });
});
