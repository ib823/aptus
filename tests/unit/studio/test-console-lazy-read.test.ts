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

/**
 * WHAT THIS BLOCK USED TO DO, AND WHY IT IS DIFFERENT NOW.
 *
 * It was titled "honest status is preserved, not re-invented" and it asserted
 * that the source text of `doRun` CONTAINED the strings "ACTIVATED", "no
 * records" and "not an error". Those words were present, so it passed — for as
 * long as the handler set `status: "ACTIVATED"` and `httpStatus: 200` as
 * literals on every path, including when the tenant had answered 403 or 404.
 *
 * A test that greps for the vocabulary cannot tell correct usage from incorrect
 * usage. It guarded the APPEARANCE of honest status while the behaviour was the
 * exact conflation the doctrine forbids, and it would have gone on passing
 * indefinitely.
 *
 * The mapping is now a pure function and is tested as behaviour, over the real
 * observed payloads, in tests/unit/studio/preview-honest-status.test.ts. What
 * remains here is the part a source scan is genuinely the right tool for: that
 * the component DELEGATES rather than keeping a second copy of the rule — which
 * is what the block's title claimed all along.
 */
describe("honest status is delegated, not re-invented here", () => {
  const runHandler = CLIENT.slice(CLIENT.indexOf("const doRun"), CLIENT.indexOf("const saveCase"));

  it("hands the preview response to the shared mapping", () => {
    expect(runHandler).toContain("previewOutcome(");
    // Both layers must reach the mapping: the transport result AND the body.
    // Passing only one is how the original defect read the wrong one.
    expect(runHandler).toMatch(/previewOutcome\(\s*\{\s*ok:\s*\w+\.ok,\s*status:\s*\w+\.status\s*\}/);
  });

  it("keeps no second copy of the status rule in the component", () => {
    // The literals are the tell. If a status word or one of the phrases comes
    // back into this handler, someone has started deciding here again, and the
    // two copies will diverge exactly as they did before.
    const rowsSection = runHandler.slice(runHandler.indexOf("/api/sap/tdd/preview"));
    for (const literal of ['"ACTIVATED"', '"NOT_FOUND"', "no records", "not an error"]) {
      expect(
        rowsSection.toLowerCase(),
        `"${literal}" is back in doRun — the mapping belongs in previewOutcome`,
      ).not.toContain(literal.toLowerCase());
    }
  });

  it("still maps a transport 401/403 on the SCHEMA call to NEEDS_SETUP", () => {
    // The schema call is a separate branch and legitimately reads its own
    // transport status: /entities does not wrap an upstream refusal in a 200.
    const schemaSection = runHandler.slice(0, runHandler.indexOf("/api/sap/tdd/preview"));
    expect(schemaSection).toContain("NEEDS_SETUP");
    expect(schemaSection).toMatch(/status === 401 \|\| \w+\.status === 403/);
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

/**
 * ONLY A SUCCESSFUL READ MAY CLAIM EMPTINESS.
 *
 * The honest-status fix made the badge, the HTTP figure and the detail line
 * outcome-aware, and missed a fourth thing in the same card: an explanatory
 * sentence keyed on `rows.length === 0` alone. A refusal returns no rows either,
 * so a tenant answering 403 rendered
 *
 *     Needs setup · HTTP 403 · "The tenant refused this read..."
 *
 * and then, thirty pixels below, in grey:
 *
 *     "This is an empty resource, not a failure. Your application should treat
 *      it as data."
 *
 * The same false sentence the original defect was raised for, surviving in the
 * same card, because the fix corrected three of the four places that spoke.
 *
 * Worse, the fix CREATED the trigger: the old failure branches never set `rows`
 * at all, so the line could not render on them. Introducing a uniform
 * `rows: []` return made `run.rows` truthy on every failure. A change that
 * makes a shape consistent can switch on code that was relying on the
 * inconsistency.
 *
 * Emptiness is a property of a successful read and of nothing else.
 */
describe("emptiness is claimed only by a successful read", () => {
  const render = CLIENT.slice(CLIENT.indexOf("return ("));

  it("gates the empty-resource note on ACTIVATED, not on the row count", () => {
    const idx = render.indexOf("This is an empty resource");
    expect(idx, "the empty-resource note should still exist").toBeGreaterThan(-1);

    // The condition immediately preceding it must test the outcome.
    const condition = render.slice(Math.max(0, idx - 260), idx);
    expect(
      condition,
      'the empty-resource note must be guarded by run.status === "ACTIVATED" — ' +
        "a refusal has zero rows too, and may not be described as empty",
    ).toContain('run.status === "ACTIVATED"');
  });

  it("has no other unconditional success language in the result card", () => {
    // The detail strings live in previewOutcome and are chosen per outcome. Any
    // success phrasing hardcoded into the render is by definition unconditional.
    for (const phrase of ["answered successfully", "not an error"]) {
      expect(
        render,
        `"${phrase}" is hardcoded in the render, so it shows under every outcome`,
      ).not.toContain(phrase);
    }
  });
});
