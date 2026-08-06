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

  it("the client's live call lives inside the Run handler, not an effect", () => {
    // useEffect + a live-run fetch would fire on mount or on every selection
    // change — the exact fan-out this rule exists to prevent. (The saved-cases
    // list IS loaded in an effect, deliberately: it is a Postgres read of this
    // org's own rows, not a tenant read.) A proximity regex cannot tell "an
    // effect that fetches" from "an effect NEAR a fetch", so the assertion is
    // exact: the component has one effect, and its body only loads cases.
    const effects = CLIENT.match(/useEffect\(/g) ?? [];
    expect(effects.length).toBe(1);
    expect(CLIENT).toMatch(/useEffect\(\(\) => \{\s*void loadCases\(\);\s*\}, \[loadCases\]\)/);
    const runHandler = CLIENT.slice(CLIENT.indexOf("const doRun"), CLIENT.indexOf("const saveCase"));
    expect(runHandler).toContain("/api/studio/test/broker-run");
  });

  it("the run goes THROUGH THE BROKER, not the env-tenant explorer routes", () => {
    /*
     * The console used to call /api/sap/tdd/entities and /preview — role-gated
     * env-tenant reads with no grant check, no environment binding, no
     * northbound audit. A green console proved nothing about the deployed
     * app's call, and the manual claimed otherwise. The run handler must not
     * reach for those routes again.
     */
    const runHandler = CLIENT.slice(CLIENT.indexOf("const doRun"), CLIENT.indexOf("const saveCase"));
    expect(runHandler).not.toContain("/api/sap/tdd/entities");
    expect(runHandler).not.toContain("/api/sap/tdd/preview");
  });
});

/**
 * WHAT THIS BLOCK USED TO GUARD, AND WHAT IT GUARDS NOW.
 *
 * Two eras of the same lesson. First a grep-for-vocabulary test passed while
 * the handler set ACTIVATED unconditionally; it was replaced by a delegation
 * check on `previewOutcome`. Then the run moved to the broker dry-run, whose
 * server-side statuses (OK/EMPTY/NEEDS_SETUP/NOT_FOUND/TIMEOUT/ERROR) come
 * from the same `classify` the runtime uses — the delegation now lives on the
 * server, and the client's only job is a 1:1 mapping onto the chip vocabulary
 * plus the rule that a GOVERNANCE refusal renders no chip at all.
 */
describe("broker outcomes are mapped, refusals render no chip", () => {
  const runHandler = CLIENT.slice(CLIENT.indexOf("const doRun"), CLIENT.indexOf("const saveCase"));

  it("a refusal sets no status — the chip vocabulary is tenant facts only", () => {
    const refusalArm = runHandler.slice(
      runHandler.indexOf('outcome === "refused"'),
      runHandler.indexOf("const d = json.data"),
    );
    expect(refusalArm).toContain("refusal: json.data.refusal");
    expect(refusalArm).not.toContain("status:");
  });

  it("OK and EMPTY both map to ACTIVATED — emptiness is a successful read", () => {
    expect(runHandler).toMatch(/d\.status === "OK" \|\| d\.status === "EMPTY"/);
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
