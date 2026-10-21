// @vitest-environment node
/**
 * P0.19 review round 1: a key's `lastUsedAt` stamp is written once, by
 * whichever comes first: a statement the call sends anyway (the write
 * route's Idempotency-Key claim, via carryLastUsedStamp), or its own UPDATE
 * after the response. Never both, never neither when it is due.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  deferred: [] as (() => unknown)[],
  lastUsedAt: null as Date | null,
  touch: vi.fn(async () => undefined),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  after: (fn: () => unknown) => {
    h.deferred.push(fn);
  },
}));
vi.mock("@/lib/northbound/auth", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  authenticateClientToken: async () => ({
    ok: true,
    client: { clientId: "client_1", organizationId: "org_a", solutionId: "sol_1", environment: "DEV", sapClient: null },
    lastUsedAt: h.lastUsedAt,
  }),
  touchClientLastUsed: h.touch,
}));
vi.mock("@/lib/northbound/auth-failures", () => ({ noteFailedCredential: async () => undefined }));

import { authenticate, carryLastUsedStamp } from "@/lib/governed/pipeline";

const headers = new Headers({ authorization: "Bearer ce_dev_x" });

async function signIn() {
  const r = await authenticate(headers, "corr", "test");
  if (!r.ok) throw new Error("not authenticated");
  return r.value;
}

async function afterTheResponse() {
  for (const fn of h.deferred.splice(0)) await fn();
}

beforeEach(() => {
  h.deferred = [];
  h.touch.mockClear();
});

describe("the key's lastUsedAt stamp", () => {
  it("is carried by a statement the call sends, and then not written again after the response", async () => {
    h.lastUsedAt = new Date(Date.now() - 120_000);
    const client = await signIn();
    const now = new Date();
    expect(carryLastUsedStamp(client, now)).toEqual({ clientId: "client_1", at: now, staleBefore: new Date(now.getTime() - 60_000) });
    // Carried once.
    expect(carryLastUsedStamp(client, now)).toBeNull();
    await afterTheResponse();
    expect(h.touch).not.toHaveBeenCalled();
  });

  it("is written after the response when nothing carried it", async () => {
    h.lastUsedAt = new Date(Date.now() - 120_000);
    await signIn();
    await afterTheResponse();
    expect(h.touch).toHaveBeenCalledTimes(1);
    expect(h.touch).toHaveBeenCalledWith("client_1", "org_a", h.lastUsedAt);
  });

  it("is not carried once written, nor when it is not due", async () => {
    h.lastUsedAt = new Date(Date.now() - 120_000);
    const written = await signIn();
    await afterTheResponse();
    expect(carryLastUsedStamp(written)).toBeNull();

    h.lastUsedAt = new Date(Date.now() - 1_000);
    const recent = await signIn();
    expect(carryLastUsedStamp(recent)).toBeNull();
  });

  it("is carried for a key never stamped", async () => {
    h.lastUsedAt = null;
    const client = await signIn();
    expect(carryLastUsedStamp(client)).not.toBeNull();
  });
});
