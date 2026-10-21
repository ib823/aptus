/**
 * P0.19: bookkeeping after the response — scheduled with Next's `after()`
 * inside a request, run at once outside one, and never a failure of the call.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ inRequest: true, scheduled: [] as (() => unknown)[] }));

vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    if (!h.inRequest) throw new Error("`after` was called outside a request scope");
    h.scheduled.push(fn);
  },
}));

import { afterResponse } from "@/lib/governed/after-response";

beforeEach(() => {
  h.inRequest = true;
  h.scheduled = [];
});

describe("afterResponse", () => {
  it("inside a request, leaves the work for after the response", async () => {
    const work = vi.fn(async () => undefined);
    await afterResponse(work);
    expect(work).not.toHaveBeenCalled();
    expect(h.scheduled).toHaveLength(1);
    await h.scheduled[0]!();
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("outside a request, runs the work and lets the caller await it, as before", async () => {
    h.inRequest = false;
    let done = false;
    await afterResponse(async () => {
      await new Promise((r) => setTimeout(r, 5));
      done = true;
    });
    expect(done).toBe(true);
  });

  it("never rejects: a bookkeeping failure is logged, the call stands", async () => {
    h.inRequest = false;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(afterResponse(async () => Promise.reject(new Error("db down")))).resolves.toBeUndefined();
    h.inRequest = true;
    await afterResponse(async () => Promise.reject(new Error("db down")));
    await expect(h.scheduled[0]!()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
