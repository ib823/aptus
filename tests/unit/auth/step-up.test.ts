// @vitest-environment node
/**
 * The step-up gate itself (lib/auth/step-up.ts): the mode, the window, the
 * refusals, the warn-mode record, the token rule and the banner.
 *
 * The routes that call it are driven end to end, against real PostgreSQL, in
 * step-up-governance-routes.test.ts. This file pins the decisions those runs
 * rely on, including the ones a route test cannot reach — the default mode,
 * the edges of the five-minute window and a caller with no tenant.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ writeConfigAudit: vi.fn(), writePlatformGovernanceAudit: vi.fn() }));
vi.mock("@/lib/studio/audit", () => ({
  writeConfigAudit: mocks.writeConfigAudit,
  writePlatformGovernanceAudit: mocks.writePlatformGovernanceAudit,
}));

import {
  canPerformGovernanceActions,
  checkStepUp,
  hasFreshStepUp,
  recordStepUpMissing,
  requireStepUp,
  STEP_UP_MAX_AGE_SECONDS,
  stepUpBannerState,
  stepUpMode,
} from "@/lib/auth/step-up";
import type { SessionUser } from "@/types/assessment";

const NOW = new Date("2026-10-21T09:00:00Z");
const secondsAgo = (s: number) => new Date(NOW.getTime() - s * 1000);

const USER: SessionUser = {
  id: "u1",
  email: "approver@abeam.test",
  name: "Approver",
  role: "consultant",
  organizationId: "org1",
  organizationMfaPolicy: null,
  mfaEnabled: false,
  mfaVerified: false,
  hasWebAuthn: true,
  passkeyAssertedAt: null,
  authMethod: "session",
};

const CONTEXT = { action: "grant.decide", targetId: "g1", now: NOW } as const;

beforeEach(() => {
  mocks.writeConfigAudit.mockReset();
  mocks.writeConfigAudit.mockResolvedValue(undefined);
  mocks.writePlatformGovernanceAudit.mockReset();
  mocks.writePlatformGovernanceAudit.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("stepUpMode", () => {
  const mode = (value?: string) =>
    stepUpMode((value === undefined ? {} : { COREEDGE_STEP_UP: value }) as unknown as NodeJS.ProcessEnv);

  it("defaults to warn, so a deploy without the setting locks nobody out", () => {
    expect(mode(undefined)).toBe("warn");
    expect(mode("")).toBe("warn");
  });

  it("reads the three modes, forgiving case and spaces", () => {
    expect(mode("off")).toBe("off");
    expect(mode(" Enforce ")).toBe("enforce");
    expect(mode("WARN")).toBe("warn");
  });

  it("reads a typo as warn: neither a lock-out nor a silent stop", () => {
    expect(mode("enforced")).toBe("warn");
    expect(mode("true")).toBe("warn");
  });

  it("reads COREEDGE_STEP_UP when given nothing", () => {
    vi.stubEnv("COREEDGE_STEP_UP", "enforce");
    expect(stepUpMode()).toBe("enforce");
  });
});

describe("hasFreshStepUp — the five-minute window", () => {
  it("is five minutes", () => {
    expect(STEP_UP_MAX_AGE_SECONDS).toBe(300);
  });

  it("counts an assertion up to and including the limit", () => {
    expect(hasFreshStepUp({ passkeyAssertedAt: secondsAgo(0) }, 300, NOW)).toBe(true);
    expect(hasFreshStepUp({ passkeyAssertedAt: secondsAgo(300) }, 300, NOW)).toBe(true);
  });

  it("does not count one a second past it, or none at all", () => {
    expect(hasFreshStepUp({ passkeyAssertedAt: secondsAgo(301) }, 300, NOW)).toBe(false);
    expect(hasFreshStepUp({ passkeyAssertedAt: null }, 300, NOW)).toBe(false);
    expect(hasFreshStepUp({}, 300, NOW)).toBe(false);
  });

  it("tolerates a few seconds of clock skew, and nothing more", () => {
    expect(hasFreshStepUp({ passkeyAssertedAt: secondsAgo(-10) }, 300, NOW)).toBe(true);
    expect(hasFreshStepUp({ passkeyAssertedAt: secondsAgo(-120) }, 300, NOW)).toBe(false);
  });
});

describe("requireStepUp", () => {
  it("off: allows without checking or recording", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    const result = await requireStepUp(USER, 300, CONTEXT);
    expect(result).toEqual({ ok: true, outcome: "off" });
    expect(mocks.writeConfigAudit).not.toHaveBeenCalled();
  });

  it("a fresh assertion passes in warn and enforce, and records nothing", async () => {
    for (const mode of ["warn", "enforce"]) {
      vi.stubEnv("COREEDGE_STEP_UP", mode);
      const result = await requireStepUp({ ...USER, passkeyAssertedAt: secondsAgo(60) }, 300, CONTEXT);
      expect(result).toEqual({ ok: true, outcome: "fresh" });
    }
    expect(mocks.writeConfigAudit).not.toHaveBeenCalled();
  });

  it("enforce: refuses a passkey holder with STEP_UP_REQUIRED, in the shared envelope", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "enforce");
    const result = await requireStepUp({ ...USER, passkeyAssertedAt: secondsAgo(900) }, 300, CONTEXT);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("STEP_UP_REQUIRED");
    expect(result.response.status).toBe(403);
    const body = (await result.response.json()) as { error: Record<string, unknown> };
    expect(body.error).toMatchObject({
      code: "STEP_UP_REQUIRED",
      stepUp: { action: "grant.decide", maxAgeSeconds: 300 },
    });
    expect(String(body.error.message)).toMatch(/Nothing has changed/);
    expect(result.response.headers.get("x-correlation-id")).toBe(body.error.correlationId);
    expect(mocks.writeConfigAudit).not.toHaveBeenCalled();
  });

  it("enforce: asks someone with no passkey to enrol instead", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "enforce");
    const result = await requireStepUp({ ...USER, hasWebAuthn: false }, 300, CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("STEP_UP_ENROLMENT_REQUIRED");
  });

  it("warn: allows, and records who, what, on which row and why", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "warn");
    const stale = secondsAgo(900);
    const result = await requireStepUp({ ...USER, passkeyAssertedAt: stale }, 300, CONTEXT);

    expect(result).toEqual({ ok: true, outcome: "warned" });
    expect(mocks.writeConfigAudit).toHaveBeenCalledWith({
      organizationId: "org1",
      actorId: "u1",
      // Under the grant itself: the trail returns entity and action, never
      // `after`, so this is what lets a reviewer tie the row to the grant.
      entityType: "ApiAccessGrant",
      entityId: "g1",
      action: "STEP_UP_MISSING",
      after: {
        event: "step_up_missing",
        governanceAction: "grant.decide",
        targetId: "g1",
        mode: "warn",
        reason: "stale",
        passkeyAssertedAt: stale.toISOString(),
        maxAgeSeconds: 300,
      },
    });
  });

  it("warn: names the reason — no passkey, never asserted, or stale", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "warn");
    await requireStepUp({ ...USER, hasWebAuthn: false }, 300, CONTEXT);
    await requireStepUp(USER, 300, CONTEXT);
    const reasons = mocks.writeConfigAudit.mock.calls.map((c) => (c[0] as { after: { reason: string } }).after.reason);
    expect(reasons).toEqual(["no_passkey", "never_asserted"]);
  });

  it("warn: files the row under the acted-on tenant when the route names one", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "warn");
    await requireStepUp({ ...USER, role: "platform_admin", organizationId: null }, 300, {
      ...CONTEXT,
      organizationId: "org-of-the-grant",
    });
    expect(mocks.writeConfigAudit).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: "org-of-the-grant" }),
    );
  });

  it("warn: with no tenant at all, writes the platform-level trail rather than only the log", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "warn");
    const result = await requireStepUp({ ...USER, organizationId: null }, 300, CONTEXT);
    expect(result.ok).toBe(true);
    expect(mocks.writeConfigAudit).not.toHaveBeenCalled();
    expect(mocks.writePlatformGovernanceAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "u1",
        entityType: "ApiAccessGrant",
        entityId: "g1",
        action: "STEP_UP_MISSING",
        after: expect.objectContaining({ governanceAction: "grant.decide" }),
      }),
    );
  });

  it("warn: with no row acted on yet, files the record under the action's name", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "warn");
    await requireStepUp(USER, 300, { action: "passkey.add", now: NOW });
    expect(mocks.writeConfigAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: "StepUp", entityId: "passkey.add", action: "STEP_UP_MISSING" }),
    );
  });

  it.each(["off", "warn", "enforce"])(
    "a personal or CI token is refused with COREEDGE_STEP_UP=%s, even holding a fresh assertion",
    async (mode) => {
      vi.stubEnv("COREEDGE_STEP_UP", mode);
      for (const authMethod of ["personal_token", "ci_token"] as const) {
        const result = await requireStepUp({ ...USER, authMethod, passkeyAssertedAt: NOW }, 300, CONTEXT);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.code).toBe("STEP_UP_TOKEN_REFUSED");
          expect(result.response.status).toBe(403);
        }
      }
      expect(mocks.writeConfigAudit).not.toHaveBeenCalled();
    },
  );

  it.each(["off", "warn", "enforce"])(
    "fails closed: a SessionUser that does not say how it authenticated is refused with COREEDGE_STEP_UP=%s",
    async (mode) => {
      vi.stubEnv("COREEDGE_STEP_UP", mode);
      // A token resolver that spread a user row and forgot the field, its
      // value cast past the compiler.
      const { authMethod: _omitted, ...unstated } = { ...USER, passkeyAssertedAt: secondsAgo(5) };
      const result = await requireStepUp(unstated as SessionUser, 300, CONTEXT);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("STEP_UP_TOKEN_REFUSED");
      expect(mocks.writeConfigAudit).not.toHaveBeenCalled();
    },
  );
});

describe("checkStepUp and recordStepUpMissing — the transaction-safe halves", () => {
  it("checkStepUp writes nothing, even in warn, and hands back what to record", () => {
    vi.stubEnv("COREEDGE_STEP_UP", "warn");
    const result = checkStepUp(USER, 300, CONTEXT);
    expect(result).toMatchObject({ ok: true, outcome: "warned", missing: { user: USER, maxAgeSeconds: 300 } });
    expect(mocks.writeConfigAudit).not.toHaveBeenCalled();
  });

  it("recordStepUpMissing writes the row requireStepUp would have", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "warn");
    const result = checkStepUp(USER, 300, CONTEXT);
    if (!result.ok || result.outcome !== "warned") throw new Error("expected a warned admission");
    await recordStepUpMissing(result.missing);
    await requireStepUp(USER, 300, CONTEXT);
    const [recorded, required] = mocks.writeConfigAudit.mock.calls.map((c) => c[0] as unknown);
    expect(recorded).toEqual(required);
  });

  it("checkStepUp refuses and passes exactly as requireStepUp does", async () => {
    vi.stubEnv("COREEDGE_STEP_UP", "enforce");
    expect(checkStepUp(USER, 300, CONTEXT)).toMatchObject({ ok: false, code: "STEP_UP_REQUIRED" });
    expect(checkStepUp({ ...USER, passkeyAssertedAt: secondsAgo(5) }, 300, CONTEXT)).toEqual({
      ok: true,
      outcome: "fresh",
    });
    vi.stubEnv("COREEDGE_STEP_UP", "off");
    expect(checkStepUp(USER, 300, CONTEXT)).toEqual({ ok: true, outcome: "off" });
  });
});

describe("who is told", () => {
  it("only roles that can take a governance action", () => {
    expect(canPerformGovernanceActions("consultant")).toBe(true);
    expect(canPerformGovernanceActions("platform_admin")).toBe(true);
    expect(canPerformGovernanceActions("support")).toBe(false);
    expect(canPerformGovernanceActions("viewer")).toBe(false);
    expect(canPerformGovernanceActions(null)).toBe(false);
  });

  it("warn tells everyone who can act; enforce only those without a passkey; off nobody", () => {
    const withKey = { role: "consultant" as const, hasWebAuthn: true };
    const without = { role: "consultant" as const, hasWebAuthn: false };
    expect(stepUpBannerState(withKey, "warn")).toEqual({ mode: "warn", hasPasskey: true });
    expect(stepUpBannerState(without, "warn")).toEqual({ mode: "warn", hasPasskey: false });
    expect(stepUpBannerState(withKey, "enforce")).toBeNull();
    expect(stepUpBannerState(without, "enforce")).toEqual({ mode: "enforce", hasPasskey: false });
    expect(stepUpBannerState(without, "off")).toBeNull();
    expect(stepUpBannerState({ role: "viewer", hasWebAuthn: false }, "warn")).toBeNull();
  });
});
