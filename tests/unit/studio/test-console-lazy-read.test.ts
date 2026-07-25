/**
 * The lazy-read rule, and the test-case write path.
 *
 * A console that fanned out live reads on render could quietly hammer a client's
 * production SAP tenant for as long as someone left a tab open. So "nothing
 * touches SAP until Run" is asserted structurally: the server page must contain
 * no live call at all, and the client's calls must sit inside the Run handler.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(path.resolve(ROOT, p), "utf8");

const PAGE = read("src/app/(studio)/studio/test/page.tsx");
const CLIENT = read("src/components/studio/TestConsoleClient.tsx");

describe("no live SAP read happens on render", () => {
  it("the server page calls neither /entities nor /preview", () => {
    expect(PAGE).not.toContain("/api/sap/tdd/entities");
    expect(PAGE).not.toContain("/api/sap/tdd/preview");
  });

  it("the client's live calls live inside the Run handler, not an effect", () => {
    // useEffect + fetch would fire on mount or on every selection change — the
    // exact fan-out this rule exists to prevent.
    expect(CLIENT).not.toMatch(/useEffect\([\s\S]{0,400}?\/api\/sap\/tdd\//);
    const runHandler = CLIENT.slice(CLIENT.indexOf("const doRun"), CLIENT.indexOf("const saveCase"));
    expect(runHandler).toContain("/api/sap/tdd/entities");
    expect(runHandler).toContain("/api/sap/tdd/preview");
  });

  it("reads rows only after the schema call succeeds", () => {
    // The preview call must sit after the 401/403 and !ok branches, so a
    // needs-setup service never triggers a second live call.
    const runHandler = CLIENT.slice(CLIENT.indexOf("const doRun"), CLIENT.indexOf("const saveCase"));
    expect(runHandler.indexOf("/api/sap/tdd/entities")).toBeLessThan(
      runHandler.indexOf("/api/sap/tdd/preview"),
    );
  });
});

describe("honest status is preserved, not re-invented", () => {
  const runHandler = CLIENT.slice(CLIENT.indexOf("const doRun"), CLIENT.indexOf("const saveCase"));

  it("maps 401/403 to NEEDS_SETUP rather than a generic failure", () => {
    expect(runHandler).toContain("NEEDS_SETUP");
    expect(runHandler).toMatch(/status === 401 \|\| \w+\.status === 403/);
  });

  it("treats a 200 with zero rows as ACTIVATED — an empty resource, not a fault", () => {
    expect(runHandler).toContain("ACTIVATED");
    expect(runHandler.toLowerCase()).toContain("no records");
    expect(runHandler.toLowerCase()).toContain("not an error");
  });
});

/* ── the save path ─────────────────────────────────────────────────────────── */

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findFirstInterface: vi.fn(),
  createTestCase: vi.fn(),
  createAudit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    interface: { findFirst: mocks.findFirstInterface },
    testCase: { create: mocks.createTestCase, findMany: vi.fn().mockResolvedValue([]) },
    configAudit: { create: mocks.createAudit },
  },
}));

const { POST } = await import("@/app/api/studio/test-cases/route");

const BUILDER = { id: "u1", email: "d@abeam.com", role: "consultant", organizationId: "org_a" };

function req(body: unknown) {
  return new Request("http://localhost:3003/api/studio/test-cases", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;
}

const VALID = {
  interfaceId: "if_1",
  name: "BP read — 10 rows",
  request: { entity: "A_BusinessPartner", limit: 10 },
  lastOutcome: "PASS",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUser.mockResolvedValue(BUILDER);
  mocks.findFirstInterface.mockResolvedValue({ id: "if_1", name: "BP read" });
  mocks.createTestCase.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: "tc_1", ...data }),
  );
  mocks.createAudit.mockResolvedValue({ id: "a1" });
});

describe("saving a test case", () => {
  it("scopes the interface lookup to the caller's organization", async () => {
    await POST(req(VALID));
    expect(mocks.findFirstInterface).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "if_1", organizationId: "org_a" } }),
    );
  });

  it("404s an interface in another tenant", async () => {
    mocks.findFirstInterface.mockResolvedValue(null);
    expect((await POST(req(VALID))).status).toBe(404);
    expect(mocks.createTestCase).not.toHaveBeenCalled();
  });

  it("stamps a run time when an outcome was observed", async () => {
    await POST(req(VALID));
    const data = mocks.createTestCase.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data.lastOutcome).toBe("PASS");
    expect(data.lastRunAt).toBeInstanceOf(Date);
  });

  it("does NOT stamp a run time for NOT_RUN", async () => {
    // A case saved without running must not look like it was executed.
    await POST(req({ ...VALID, lastOutcome: "NOT_RUN" }));
    const data = mocks.createTestCase.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(data).not.toHaveProperty("lastRunAt");
  });

  it("rejects an outcome outside the honest set", async () => {
    expect((await POST(req({ ...VALID, lastOutcome: "PROBABLY_FINE" }))).status).toBe(400);
  });

  it("403s an oversight role", async () => {
    mocks.getCurrentUser.mockResolvedValue({ ...BUILDER, role: "platform_admin" });
    expect((await POST(req(VALID))).status).toBe(403);
  });

  it("writes a ConfigAudit entry", async () => {
    await POST(req(VALID));
    expect(mocks.createAudit).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entityType: "TestCase" }) }),
    );
  });
});
