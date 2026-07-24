import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isIpAllowed, logBackdoorAttempt } from "@/lib/auth/test-backdoor-guards";

const ENV = "TEST_LOGIN_ALLOWED_IPS";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function makeHeaders(forwardedFor: string | null): Headers {
  const h = new Headers();
  if (forwardedFor !== null) h.set("x-forwarded-for", forwardedFor);
  return h;
}

describe("isIpAllowed", () => {
  it("allows everything when the env var is unset (fail-open by design)", () => {
    vi.stubEnv(ENV, "");
    expect(isIpAllowed(makeHeaders("1.2.3.4"), ENV)).toBe(true);
    expect(isIpAllowed(makeHeaders(null), ENV)).toBe(true);
  });

  it("allows IPs that exactly match the allow-list", () => {
    vi.stubEnv(ENV, "1.2.3.4, 5.6.7.8");
    expect(isIpAllowed(makeHeaders("1.2.3.4"), ENV)).toBe(true);
    expect(isIpAllowed(makeHeaders("5.6.7.8"), ENV)).toBe(true);
  });

  it("rejects IPs not on the allow-list", () => {
    vi.stubEnv(ENV, "1.2.3.4");
    expect(isIpAllowed(makeHeaders("9.9.9.9"), ENV)).toBe(false);
  });

  it("uses the leftmost x-forwarded-for entry", () => {
    vi.stubEnv(ENV, "1.2.3.4");
    expect(isIpAllowed(makeHeaders("1.2.3.4, 10.0.0.1"), ENV)).toBe(true);
    expect(isIpAllowed(makeHeaders("10.0.0.1, 1.2.3.4"), ENV)).toBe(false);
  });

  it("treats the ip as 'unknown' when no forwarding headers are present", () => {
    vi.stubEnv(ENV, "1.2.3.4");
    expect(isIpAllowed(makeHeaders(null), ENV)).toBe(false);
    vi.stubEnv(ENV, "unknown");
    expect(isIpAllowed(makeHeaders(null), ENV)).toBe(true);
  });

  it("fails CLOSED in production when no allow-list is configured", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(ENV, "");
    expect(isIpAllowed(makeHeaders("1.2.3.4"), ENV)).toBe(false);
  });

  it("honours the explicit opt-out for secret-only production deployments", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(ENV, "");
    vi.stubEnv("ALLOW_BACKDOOR_WITHOUT_IP_ALLOWLIST", "true");
    expect(isIpAllowed(makeHeaders("1.2.3.4"), ENV)).toBe(true);
  });

  it("prefers the Vercel-trusted IP over a spoofed x-forwarded-for", () => {
    vi.stubEnv(ENV, "1.2.3.4");
    // Attacker spoofs XFF to an allow-listed value, but Vercel's header wins.
    const h = new Headers();
    h.set("x-forwarded-for", "1.2.3.4");
    h.set("x-vercel-forwarded-for", "9.9.9.9");
    expect(isIpAllowed(h, ENV)).toBe(false);

    const h2 = new Headers();
    h2.set("x-forwarded-for", "9.9.9.9");
    h2.set("x-vercel-forwarded-for", "1.2.3.4");
    expect(isIpAllowed(h2, ENV)).toBe(true);
  });
});

describe("logBackdoorAttempt", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("includes endpoint, outcome, ip, and ua in the log line", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4",
      "user-agent": "playwright/1.0",
    });
    logBackdoorAttempt({ endpoint: "/api/auth/test-login", outcome: "success", headers, email: "test@example.com" });
    expect(console.warn).toHaveBeenCalledOnce();
    const line = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(line).toContain("[backdoor]");
    expect(line).toContain("/api/auth/test-login");
    expect(line).toContain("outcome=success");
    expect(line).toContain("ip=1.2.3.4");
    expect(line).toContain("playwright");
    expect(line).toContain("email=test@example.com");
  });

  it("emits the log line for failed outcomes too", () => {
    logBackdoorAttempt({
      endpoint: "/api/auth/verify-izzat",
      outcome: "denied:secret",
      headers: new Headers({ "x-forwarded-for": "9.9.9.9" }),
    });
    expect(console.warn).toHaveBeenCalledOnce();
    const line = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(line).toContain("outcome=denied:secret");
    expect(line).toContain("ip=9.9.9.9");
  });
});
