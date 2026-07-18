/**
 * ABeam Workbench — decision persistence + the differ-reason completeness gate.
 *
 * The e2e journey cannot run here (no Postgres), so this covers the write path's
 * logic against a mocked Prisma client. It proves the SHAPE of what we persist —
 * the upsert key, the reason-clearing rule, the completeness gate — not that
 * Postgres accepts it. The round-trip against a real database remains preview-env
 * debt, alongside the migration.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn();

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    discoveryDecision: {
      upsert: (...args: unknown[]) => upsert(...args),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

const { saveDecision } = await import("@/lib/discovery/external/journey");
const { isDecisionComplete } = await import("@/lib/discovery/fit");

beforeEach(() => upsert.mockReset());

const BASE = { engagementId: "eng1", grantId: "grant1", processId: "31G" } as const;

describe("the differ-reason completeness gate (brief §9)", () => {
  it("a differ WITH a reason is complete", () => {
    expect(isDecisionComplete("differ", "We invoice in stages.")).toBe(true);
  });

  it("a differ WITHOUT a reason is incomplete", () => {
    expect(isDecisionComplete("differ", null)).toBe(false);
    expect(isDecisionComplete("differ", "")).toBe(false);
  });

  it("whitespace is not a reason", () => {
    expect(isDecisionComplete("differ", "   \n  ")).toBe(false);
  });

  it("the other three states are complete without a reason", () => {
    expect(isDecisionComplete("standard", null)).toBe(true);
    expect(isDecisionComplete("discuss", null)).toBe(true);
    expect(isDecisionComplete("na", null)).toBe(true);
  });
});

describe("saveDecision", () => {
  it("upserts on [engagementId, processId] — the reviewer edits in place", async () => {
    await saveDecision({ ...BASE, status: "standard", reason: null });
    const arg = upsert.mock.calls[0]![0] as {
      where: { engagementId_processId: { engagementId: string; processId: string } };
    };
    expect(arg.where.engagementId_processId).toEqual({ engagementId: "eng1", processId: "31G" });
  });

  it("stores a differ reason, trimmed", async () => {
    await saveDecision({ ...BASE, status: "differ", reason: "  We invoice in stages.  " });
    const arg = upsert.mock.calls[0]![0] as { create: { reason: string | null } };
    expect(arg.create.reason).toBe("We invoice in stages.");
  });

  it("stores a differ with NO reason rather than refusing it", async () => {
    // Brief §9's reason rule is about completeness, not validation. Refusing the
    // write would throw away the reviewer's selection — worse than an honestly
    // incomplete record, which V4 reports.
    await saveDecision({ ...BASE, status: "differ", reason: "" });
    expect(upsert).toHaveBeenCalledOnce();
    const arg = upsert.mock.calls[0]![0] as { create: { status: string; reason: string | null } };
    expect(arg.create.status).toBe("differ");
    expect(arg.create.reason).toBeNull();
  });

  it("clears the reason when the state is not differ", async () => {
    // Otherwise a reviewer who picks differ, types a reason, then switches to
    // standard leaves an orphan reason that would resurface in the export.
    await saveDecision({ ...BASE, status: "standard", reason: "leftover text" });
    const arg = upsert.mock.calls[0]![0] as {
      create: { reason: string | null };
      update: { reason: string | null };
    };
    expect(arg.create.reason).toBeNull();
    expect(arg.update.reason).toBeNull();
  });

  it("clears the reason on na and discuss too", async () => {
    for (const status of ["na", "discuss"] as const) {
      upsert.mockReset();
      await saveDecision({ ...BASE, status, reason: "leftover" });
      const arg = upsert.mock.calls[0]![0] as { update: { reason: string | null } };
      expect(arg.update.reason).toBeNull();
    }
  });

  it("re-stamps grantId on update so we know who last decided", async () => {
    await saveDecision({ ...BASE, grantId: "grant2", status: "discuss", reason: null });
    const arg = upsert.mock.calls[0]![0] as { update: { grantId: string } };
    expect(arg.update.grantId).toBe("grant2");
  });
});
