// @vitest-environment node
/**
 * The middleware keeps the governance step-up out of the shared per-IP
 * sign-in bucket (roadmap P0.12). Every /api/auth/* request from one address
 * shares `auth:<ip>` at 30 a minute; under enforce, approvers behind one office
 * egress address step up every few minutes and would spend sign-in's allowance
 * and each other's. The step-up routes need a session and limit each person
 * themselves (step-up-rate-limit.test.ts).
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type * as RateLimitModule from "@/lib/security/rate-limit";

const keys = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/security/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof RateLimitModule>()),
  checkRateLimit: async (key: string) => {
    keys.push(key);
    return { allowed: true, remaining: 99, resetMs: 0 };
  },
}));

import { middleware } from "@/middleware";

const post = (path: string) =>
  new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "x-real-ip": "10.1.2.3" } });

describe("middleware rate-limit bucket for the step-up", () => {
  beforeEach(() => {
    keys.length = 0;
  });

  it.each(["/api/auth/webauthn/step-up/options", "/api/auth/webauthn/step-up/verify"])(
    "%s is not in the shared sign-in bucket",
    async (path) => {
      await middleware(post(path));
      expect(keys).not.toContain("auth:10.1.2.3");
      expect(keys).toContain("api:POST:10.1.2.3");
    },
  );

  it("a passkey sign-in still is", async () => {
    await middleware(post("/api/auth/webauthn/authenticate/verify"));
    expect(keys).toContain("auth:10.1.2.3");
  });
});
