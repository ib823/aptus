/**
 * /dev-login says which gate will refuse you, and says it without leaking.
 *
 * THE DEFECT. `isDevLoginEnabled` checks three env gates; the endpoint checks
 * two more before it compares the secret — the production minimum length, and
 * the IP allow-list, which fails CLOSED in production when neither
 * TEST_LOGIN_ALLOWED_IPS nor ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST is set. So
 * the page rendered a working-looking form whose every button returned a bare
 * `404 Not available`, three characters of which sit under a password box and
 * read as "wrong secret". On the live deployment that is exactly how it was
 * read: three attempts, all `outcome=denied:ip`, none of which reached the
 * comparison.
 *
 * Two properties matter and both are pinned here: the page must name the SAME
 * gate the endpoint would (first-to-fire, same order), and it must do so
 * without disclosing the secret or other people's addresses.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { devLoginBlocker, isDevLoginEnabled } from "@/lib/auth/dev-login";
import { stripSource } from "../../helpers/source";

const ROOT = resolve(__dirname, "../../..");
const read = (p: string) => stripSource(readFileSync(resolve(ROOT, p), "utf8"), "comments");

const SECRET = "a-perfectly-long-e2e-secret-value";
const CALLER_IP = "211.25.16.114";

/** Vercel's trusted header — the one getClientIp prefers and a client cannot forge. */
function callerHeaders(ip: string = CALLER_IP): Headers {
  return new Headers({ "x-vercel-forwarded-for": ip });
}

/** The shape of a deployment that has knowingly enabled the backdoor in prod. */
function enabledInProduction(overrides: Record<string, string> = {}): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ENABLE_TEST_LOGIN_ENDPOINT", "true");
  vi.stubEnv("ALLOW_TEST_LOGIN_IN_PROD", "true");
  vi.stubEnv("E2E_TEST_SECRET", SECRET);
  vi.stubEnv("TEST_LOGIN_ALLOWED_IPS", "");
  vi.stubEnv("ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST", "");
  for (const [k, v] of Object.entries(overrides)) vi.stubEnv(k, v);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the page's own gates still pass — this is the gap beneath them", () => {
  it("isDevLoginEnabled says yes on exactly the deployment that then 404s", () => {
    enabledInProduction();
    // The page renders...
    expect(isDevLoginEnabled()).toBe(true);
    // ...and the endpoint would refuse anyway. That gap is the whole bug.
    expect(devLoginBlocker(callerHeaders())).not.toBeNull();
  });
});

describe("it names the gate the endpoint will actually fire", () => {
  it("reports the fail-closed allow-list when none is configured", () => {
    enabledInProduction();
    const blocker = devLoginBlocker(callerHeaders());
    expect(blocker?.code).toBe("IP_ALLOWLIST_FAILS_CLOSED");
    expect(blocker?.callerIp).toBe(CALLER_IP);
    // The two ways out are both named, because they are a real choice.
    expect(blocker?.fix).toContain("TEST_LOGIN_ALLOWED_IPS");
    expect(blocker?.fix).toContain("ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST");
  });

  it("distinguishes 'no list' from 'you are not on the list'", () => {
    // A configured list that omits this caller is a different fix: add one
    // address, rather than decide whether to drop the lock entirely.
    enabledInProduction({ TEST_LOGIN_ALLOWED_IPS: "203.0.113.7" });
    const blocker = devLoginBlocker(callerHeaders());
    expect(blocker?.code).toBe("IP_NOT_ON_ALLOWLIST");
    expect(blocker?.fix).toContain(CALLER_IP);
  });

  it("reports the short secret FIRST, matching the route's gate order", () => {
    // Both gates would refuse. The route checks length (2.5) before the IP
    // (2.6), so naming the IP here would send an operator to fix the gate
    // they would never have reached.
    enabledInProduction({ E2E_TEST_SECRET: "too-short" });
    expect(devLoginBlocker(callerHeaders())?.code).toBe("SECRET_TOO_SHORT");
  });

  it("clears once the caller is allow-listed", () => {
    enabledInProduction({ TEST_LOGIN_ALLOWED_IPS: `203.0.113.7,${CALLER_IP}` });
    expect(devLoginBlocker(callerHeaders())).toBeNull();
  });

  it("clears under the explicit secret-only opt-in", () => {
    enabledInProduction({ ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST: "true" });
    expect(devLoginBlocker(callerHeaders())).toBeNull();
  });

  it("does not fire in development, where the IP gate stays open", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_TEST_LOGIN_ENDPOINT", "true");
    vi.stubEnv("E2E_TEST_SECRET", "short-is-fine-in-dev");
    vi.stubEnv("TEST_LOGIN_ALLOWED_IPS", "");
    expect(devLoginBlocker(callerHeaders())).toBeNull();
  });
});

describe("it discloses nothing a caller could not already get", () => {
  const rendered = (b: ReturnType<typeof devLoginBlocker>) =>
    `${b?.title ?? ""} ${b?.detail ?? ""} ${b?.fix ?? ""}`;

  it("never echoes the secret", () => {
    enabledInProduction();
    expect(rendered(devLoginBlocker(callerHeaders()))).not.toContain(SECRET);
  });

  it("never echoes the secret even when the secret is what is wrong", () => {
    const shortSecret = "abc123";
    enabledInProduction({ E2E_TEST_SECRET: shortSecret });
    const text = rendered(devLoginBlocker(callerHeaders()));
    expect(text).not.toContain(shortSecret);
  });

  it("never echoes the allow-list, which is other people's addresses", () => {
    const otherTester = "198.51.100.42";
    enabledInProduction({ TEST_LOGIN_ALLOWED_IPS: `${otherTester},203.0.113.7` });
    const text = rendered(devLoginBlocker(callerHeaders()));
    expect(text).not.toContain(otherTester);
    expect(text).not.toContain("203.0.113.7");
    // Only the caller's own address, which any what-is-my-ip page would tell them.
    expect(text).toContain(CALLER_IP);
  });
});

describe("the page and the endpoint cannot drift apart", () => {
  it("the blocker reuses the endpoint's own isIpAllowed rather than restating it", () => {
    /*
     * A second copy of the fail-closed rule would be a second rule. The page's
     * whole value is telling the truth about what the endpoint will do, so it
     * has to call the same function the endpoint calls.
     */
    const lib = read("src/lib/auth/dev-login.ts");
    expect(lib).toContain("isIpAllowed(headers,");
    expect(lib).toContain('"TEST_LOGIN_ALLOWED_IPS"');
  });

  it("reads the same env var names the route gates on", () => {
    const route = read("src/app/api/auth/test-login/route.ts");
    const lib = read("src/lib/auth/dev-login.ts");
    for (const v of ["E2E_TEST_SECRET", "TEST_LOGIN_ALLOWED_IPS"]) {
      expect(route, `route gates on ${v}`).toContain(v);
      expect(lib, `page explains ${v}`).toContain(v);
    }
  });

  it("keeps the production length minimum in step with the route", () => {
    const route = read("src/app/api/auth/test-login/route.ts");
    const lib = read("src/lib/auth/dev-login.ts");
    // Both sides express the same threshold; a change to one without the other
    // makes the page's explanation false.
    expect(route).toContain("secret.length < 24");
    expect(lib).toContain("secret.length < 24");
  });
});

describe("the form separates a rejected secret from a refused request", () => {
  const form = read("src/app/(auth)/dev-login/DevLoginForm.tsx");

  it("no longer renders the raw API error, which said 'Not available'", () => {
    // That string under a password box is why three sign-ins were retyped.
    expect(form).not.toContain("setError(data.error ??");
  });

  it("handles 404 and 403 as the different problems they are", () => {
    const fn = form.slice(form.indexOf("function explainFailure"));
    expect(fn.slice(0, 900)).toContain("status === 404");
    expect(fn.slice(0, 900)).toContain("status === 403");
  });
});
