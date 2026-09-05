/**
 * 2608 WS6 — /api/tobe/[bundleId]/generate and /export: flag, session, role,
 * ownership, in that order; export serves the stored pack, never regenerates.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { generateTobePack } from "@/lib/tobe/engine";

import { fixtureInput } from "./fixtures";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  requireAffirmBundleAccess: vi.fn(),
  generateAndSavePack: vi.fn(),
  latestPack: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/affirm/authz", () => ({ requireAffirmBundleAccess: mocks.requireAffirmBundleAccess }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { affirmBundle: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/tobe/inputs", () => ({ generateAndSavePack: mocks.generateAndSavePack, latestPack: mocks.latestPack }));

const { POST } = await import("@/app/api/tobe/[bundleId]/generate/route");
const { GET } = await import("@/app/api/tobe/[bundleId]/export/route");

const ctx = { params: Promise.resolve({ bundleId: "b1" }) };
const consultant = { id: "u1", email: "c@x.test", role: "consultant" };
const doc = generateTobePack(fixtureInput());

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TOBE_PACK_ENABLED", "true");
  mocks.getCurrentUser.mockResolvedValue(consultant);
  mocks.requireAffirmBundleAccess.mockResolvedValue({ ok: true });
  mocks.generateAndSavePack.mockResolvedValue({
    pack: { id: "p1", generatedAt: new Date("2026-09-05T00:00:00Z") },
    doc,
  });
  mocks.latestPack.mockResolvedValue({
    id: "p1",
    generatedAt: new Date("2026-09-05T00:00:00Z"),
    inputsHash: doc.hashes.inputs,
    doc,
  });
  mocks.findUnique.mockResolvedValue({ client: "Pilot · Client" });
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/tobe/[bundleId]/generate", () => {
  it("404 when the flag is off, before touching the session", async () => {
    vi.stubEnv("TOBE_PACK_ENABLED", "false");
    const res = await POST(new Request("http://x/api/tobe/b1/generate", { method: "POST" }), ctx);
    expect(res.status).toBe(404);
    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
  });
  it("401 without a session", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    const res = await POST(new Request("http://x", { method: "POST" }), ctx);
    expect(res.status).toBe(401);
    expect(mocks.generateAndSavePack).not.toHaveBeenCalled();
  });
  it("403 for a read-only affirm role", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...consultant, role: "executive_sponsor" });
    const res = await POST(new Request("http://x", { method: "POST" }), ctx);
    expect(res.status).toBe(403);
    expect(mocks.requireAffirmBundleAccess).not.toHaveBeenCalled();
  });
  it("returns the ownership guard's 404 untouched", async () => {
    mocks.requireAffirmBundleAccess.mockResolvedValue({
      ok: false,
      response: Response.json({ error: "not_found" }, { status: 404 }),
    });
    const res = await POST(new Request("http://x", { method: "POST" }), ctx);
    expect(res.status).toBe(404);
    expect(mocks.generateAndSavePack).not.toHaveBeenCalled();
  });
  it("201 with the pack id, hashes and summary; the generator is called as the user", async () => {
    const res = await POST(new Request("http://x", { method: "POST" }), ctx);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { packId: string; hashes: { inputs: string }; summary: { steps: number } };
    expect(body.packId).toBe("p1");
    expect(body.hashes.inputs).toBe(doc.hashes.inputs);
    expect(body.summary.steps).toBe(7);
    expect(mocks.generateAndSavePack).toHaveBeenCalledWith(expect.anything(), "b1", "u1");
  });
});

describe("GET /api/tobe/[bundleId]/export", () => {
  const get = (qs: string) => GET(new Request(`http://x/api/tobe/b1/export${qs}`), ctx);
  it("404 when the flag is off; 401 without a session; guard 404 passes through", async () => {
    vi.stubEnv("TOBE_PACK_ENABLED", "");
    expect((await get("?format=svg")).status).toBe(404);
    vi.stubEnv("TOBE_PACK_ENABLED", "true");
    mocks.getCurrentUser.mockResolvedValueOnce(null);
    expect((await get("?format=svg")).status).toBe(401);
    mocks.requireAffirmBundleAccess.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ error: "not_found" }, { status: 404 }),
    });
    expect((await get("?format=svg")).status).toBe(404);
  });
  it("a read-only affirm role may export (read) the stored pack; a role outside affirm may not", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...consultant, role: "executive_sponsor" });
    expect((await get("?format=svg")).status).toBe(200);
    mocks.getCurrentUser.mockResolvedValue({ ...consultant, role: "process_owner" });
    expect((await get("?format=svg")).status).toBe(403);
  });
  it("400 on an unknown format; 404 when no pack has been generated", async () => {
    expect((await get("?format=docx")).status).toBe(400);
    mocks.latestPack.mockResolvedValueOnce(null);
    const res = await get("?format=svg");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "no_pack" });
  });
  it("serves the L1 and L2 SVG of the STORED pack with the inputs hash, and never regenerates", async () => {
    const l1 = await get("?format=svg");
    expect(l1.headers.get("content-type")).toContain("image/svg+xml");
    expect(l1.headers.get("x-tobe-inputs-hash")).toBe(doc.hashes.inputs);
    expect(l1.headers.get("content-disposition")).toContain("tobe-process-pack-Pilot-Client-2608-L1.svg");
    expect(await l1.text()).toContain('data-scope="AAA"');
    const l2 = await get("?format=svg&level=l2&code=BBB");
    expect(l2.status).toBe(200);
    expect(await l2.text()).toContain("Create Delivery");
    expect((await get("?format=svg&level=l2&code=NOPE")).status).toBe(400);
    expect(mocks.generateAndSavePack).not.toHaveBeenCalled();
  });
});
