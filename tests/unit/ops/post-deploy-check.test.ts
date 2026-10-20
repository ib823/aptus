// @vitest-environment node
/**
 * The post-deploy check (P0.17, docs/runbooks/coreedge-release.md step 5),
 * against a fake deployment: one SAP-standard read, one Z* read, one refused
 * call, and the audit row of each, as a pass/fail checklist that never prints
 * a key, the bypass secret, a database URL or an SAP record.
 *
 * tests/integration/post-deploy-check.test.ts runs the same check against
 * the real broker routes and PostgreSQL.
 */

import { describe, expect, it, vi } from "vitest";

import {
  type AuditRow,
  formatMarkdown,
  formatText,
  type PostDeployConfig,
  readPostDeployConfig,
  runPostDeployCheck,
  UNKNOWN_INTERFACE_ID,
} from "../../../scripts/lib/post-deploy-check";
import { redactSecrets } from "../../../scripts/lib/redact";

const KEY = `ce_live_${"A".repeat(20)}${"b".repeat(23)}`;
const OTHER_KEY = `ce_test_${"C".repeat(43)}`;
const DB = "postgresql://release_reader:s3cret-db-pass@ep-example.neon.tech:5432/aptus?sslmode=require";
const BYPASS = "bypass-secret-0123456789";
const RECORD = "SECRET-SAP-RECORD-VALUE";

const CONFIG: PostDeployConfig = {
  baseUrl: "https://ab-workbench.vercel.app",
  key: KEY,
  customKey: KEY,
  standardInterfaceId: "if_std",
  customInterfaceId: "if_z",
  refusedInterfaceId: "if_nogrant",
  expectCommit: null,
  protectionBypass: null,
  auditDatabaseUrl: DB,
  timeoutMs: 1_000,
};

interface Answer {
  status: number;
  body: unknown;
  /** Leave the audit row out, or write it with another status. */
  audit?: "none" | { status: number };
}

/** A deployment that answers like the real routes, and records audit rows the same way. */
function fakeDeployment(over: Partial<Record<string, Answer | ((headers: Headers) => Answer)>> = {}) {
  const audit: AuditRow[] = [];
  const requests: { path: string; headers: Headers }[] = [];
  let n = 0;
  const listed = (id: string, source: string, callable: boolean) => ({
    id,
    callable,
    refusal: callable ? null : "NO_GRANT",
    service: { source, odataVersion: source === "custom" ? "V2" : null },
  });
  const defaults: Record<string, Answer> = {
    "/api/build": { status: 200, body: { commit: "0123456789abcdef0123456789abcdef01234567", ref: "main", deployment: "dpl_1", environment: "production" } },
    "/api/health": { status: 200, body: { status: "healthy", timestamp: "now" } },
    "/api/northbound/interfaces": {
      status: 200,
      body: { data: { environment: "DEV", interfaces: [listed("if_std", "catalogue", true), listed("if_z", "custom", true), listed("if_nogrant", "catalogue", false)] } },
    },
    "/api/northbound/interfaces/if_std/data": { status: 200, body: { data: { records: [{ v: RECORD }], count: 1, empty: false } } },
    "/api/northbound/interfaces/if_z/data": { status: 200, body: { data: { records: [], count: 0, empty: true } } },
    "/api/northbound/interfaces/if_nogrant/data": { status: 403, body: { error: { code: "FORBIDDEN", message: "No approved grant." } } },
    [`/api/northbound/interfaces/${UNKNOWN_INTERFACE_ID}/data`]: { status: 404, body: { error: { code: "NOT_FOUND", message: "Not found." } } },
  };
  const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    requests.push({ path: url.pathname, headers });
    const o = over[url.pathname];
    const answer = typeof o === "function" ? o(headers) : (o ?? defaults[url.pathname] ?? { status: 404, body: null });
    const governed = url.pathname.startsWith("/api/northbound/");
    // Only the broker hands out correlation ids.
    const correlationId = governed ? `corr-${++n}` : "";
    if (governed && answer.audit !== "none") {
      const m = /^\/api\/northbound\/interfaces\/([^/]+)\/data$/.exec(url.pathname);
      audit.push({
        correlationId,
        status: answer.audit?.status ?? answer.status,
        interfaceId: m ? decodeURIComponent(m[1]!) : null,
      });
    }
    const body = answer.body && governed && typeof answer.body === "object" && "error" in answer.body
      ? { error: { ...(answer.body as { error: object }).error, correlationId } }
      : answer.body;
    return new Response(JSON.stringify(body), {
      status: answer.status,
      headers: governed ? { "x-correlation-id": correlationId, "content-type": "application/json" } : { "content-type": "application/json" },
    });
  });
  return {
    fetch: fetchImpl as unknown as typeof fetch,
    requests,
    audit,
    findAuditRows: async (ids: readonly string[]) => audit.filter((r) => ids.includes(r.correlationId)),
  };
}

const run = (config: Partial<PostDeployConfig> = {}, dep = fakeDeployment()) =>
  runPostDeployCheck({ ...CONFIG, ...config }, { fetch: dep.fetch, findAuditRows: dep.findAuditRows, sleep: async () => {}, now: () => new Date("2026-10-20T12:00:00Z") });

const line = (r: Awaited<ReturnType<typeof run>>, id: string) => r.lines.find((l) => l.id === id)!;

describe("a healthy deployment", () => {
  it("passes all seven checks, in the order of the runbook", async () => {
    const r = await run();
    expect(r.lines.map((l) => [l.id, l.status])).toEqual([
      ["build", "PASS"],
      ["health", "PASS"],
      ["discovery", "PASS"],
      ["standard-read", "PASS"],
      ["custom-read", "PASS"],
      ["refused", "PASS"],
      ["audit", "PASS"],
    ]);
    expect(r.ok).toBe(true);
    expect(r.commit).toBe("0123456789abcdef0123456789abcdef01234567");
    expect(line(r, "standard-read").detail).toBe("HTTP 200, 1 record [correlation corr-2]");
    expect(line(r, "custom-read").detail).toBe("HTTP 200, 0 records (an empty resource) [correlation corr-3]");
    expect(line(r, "refused").detail).toBe("HTTP 403 FORBIDDEN [correlation corr-4]");
    expect(line(r, "audit").detail).toBe("4 rows found by correlation id, statuses match");
    expect(formatText(r)).toMatch(/RESULT: PASS \(7\/7\)$/);
  });

  it("reads one record of each interface, and never prints one", async () => {
    const dep = fakeDeployment();
    const r = await run({}, dep);
    const reads = dep.requests.filter((q) => q.path.endsWith("/data"));
    expect(reads.map((q) => q.path)).toEqual([
      "/api/northbound/interfaces/if_std/data",
      "/api/northbound/interfaces/if_z/data",
      "/api/northbound/interfaces/if_nogrant/data",
    ]);
    expect(dep.fetch).toHaveBeenCalledWith(expect.stringMatching(/\/if_std\/data\?limit=1$/), expect.anything());
    for (const out of [formatText(r), formatMarkdown(r), JSON.stringify(r)]) expect(out).not.toContain(RECORD);
  });

  it("sends the key only to the broker, and the bypass secret only when configured", async () => {
    const dep = fakeDeployment();
    await run({}, dep);
    for (const q of dep.requests) {
      expect(q.headers.get("authorization")).toBe(q.path.startsWith("/api/northbound/") ? `Bearer ${KEY}` : null);
      expect(q.headers.get("x-vercel-protection-bypass")).toBeNull();
    }
    const protectedDep = fakeDeployment();
    await run({ protectionBypass: BYPASS }, protectedDep);
    expect(protectedDep.requests.every((q) => q.headers.get("x-vercel-protection-bypass") === BYPASS)).toBe(true);
  });

  it("uses the custom key for the Z* interface when it belongs to another app", async () => {
    const dep = fakeDeployment();
    const r = await run({ customKey: OTHER_KEY }, dep);
    expect(r.ok).toBe(true);
    expect(dep.requests.filter((q) => q.path === "/api/northbound/interfaces")).toHaveLength(2);
    expect(dep.requests.find((q) => q.path.endsWith("/if_z/data"))!.headers.get("authorization")).toBe(`Bearer ${OTHER_KEY}`);
    expect(dep.requests.find((q) => q.path.endsWith("/if_std/data"))!.headers.get("authorization")).toBe(`Bearer ${KEY}`);
  });

  it("refuses with an unknown interface id (404) when no ungranted interface is named", async () => {
    const dep = fakeDeployment();
    const r = await run({ refusedInterfaceId: null }, dep);
    expect(line(r, "refused")).toMatchObject({ status: "PASS", title: "A call for another app's interface is refused", detail: expect.stringMatching(/^HTTP 404 NOT_FOUND/) });
    expect(dep.requests.some((q) => q.path === `/api/northbound/interfaces/${UNKNOWN_INTERFACE_ID}/data`)).toBe(true);
  });
});

describe("each failure fails its own line, and the run", () => {
  it("a refused call that is served", async () => {
    const r = await run({}, fakeDeployment({ "/api/northbound/interfaces/if_nogrant/data": { status: 200, body: { data: { records: [], count: 0 } } } }));
    expect(r.ok).toBe(false);
    expect(line(r, "refused")).toMatchObject({ status: "FAIL", detail: expect.stringMatching(/HTTP 200.*expected HTTP 403 FORBIDDEN/) });
  });

  it("a refusal for the wrong reason (no connection is not a missing grant)", async () => {
    const r = await run(
      {},
      fakeDeployment({ "/api/northbound/interfaces/if_nogrant/data": { status: 403, body: { error: { code: "CONNECTION_NOT_CONFIGURED", message: "x" } } } }),
    );
    expect(line(r, "refused").status).toBe("FAIL");
  });

  it("an upstream error on a read", async () => {
    const r = await run({}, fakeDeployment({ "/api/northbound/interfaces/if_z/data": { status: 502, body: { error: { code: "UPSTREAM_ERROR", message: "SAP answered 500." } } } }));
    expect(line(r, "custom-read")).toMatchObject({ status: "FAIL", detail: "HTTP 502 UPSTREAM_ERROR: SAP answered 500. [correlation corr-3]" });
    expect(line(r, "standard-read").status).toBe("PASS");
    expect(formatText(r)).toMatch(/RESULT: FAIL \(1 of 7 failed\)/);
  });

  it("a call that left no audit row, or a row that disagrees with what the caller got", async () => {
    const missing = await run({}, fakeDeployment({ "/api/northbound/interfaces/if_std/data": { status: 200, body: { data: { records: [], count: 0 } }, audit: "none" } }));
    expect(line(missing, "audit")).toMatchObject({ status: "FAIL", detail: "standard-read: no audit row for corr-2" });

    const wrong = await run({}, fakeDeployment({ "/api/northbound/interfaces/if_nogrant/data": { status: 403, body: { error: { code: "FORBIDDEN", message: "x" } }, audit: { status: 200 } } }));
    expect(line(wrong, "audit")).toMatchObject({ status: "FAIL", detail: "refused: audited 200, the caller got 403" });
  });

  it("an audit lookup that cannot reach the database, without printing its URL", async () => {
    const dep = fakeDeployment();
    const r = await runPostDeployCheck(CONFIG, {
      fetch: dep.fetch,
      findAuditRows: async () => {
        throw new Error(`Can't reach database server at ${DB}`);
      },
      sleep: async () => {},
    });
    expect(line(r, "audit")).toMatchObject({ status: "FAIL", detail: expect.stringMatching(/the audit lookup failed/) });
    expect(JSON.stringify(r)).not.toContain("s3cret-db-pass");
  });

  it("another commit serving than the one expected", async () => {
    const r = await run({ expectCommit: "fedcba9" });
    expect(line(r, "build")).toMatchObject({ status: "FAIL", detail: "serving 0123456789abcdef0123456789abcdef01234567, expected fedcba9" });
    expect((await run({ expectCommit: "0123456" })).ok).toBe(true);
  });

  it("a Z* interface the deployment calls a catalogue service, or one that is not callable", async () => {
    const asCatalogue = fakeDeployment({
      "/api/northbound/interfaces": {
        status: 200,
        body: { data: { interfaces: [{ id: "if_std", callable: true, service: { source: "catalogue" } }, { id: "if_z", callable: true, service: { source: "catalogue" } }, { id: "if_nogrant", callable: false, refusal: "NO_GRANT", service: { source: "catalogue" } }] } },
      },
    });
    const r = await run({}, asCatalogue);
    expect(line(r, "discovery")).toMatchObject({ status: "FAIL", detail: "the Z* interface if_z is a catalogue service, expected custom" });

    const grantedRefusal = fakeDeployment({
      "/api/northbound/interfaces": {
        status: 200,
        body: { data: { interfaces: [{ id: "if_std", callable: true, service: { source: "catalogue" } }, { id: "if_z", callable: true, service: { source: "custom" } }, { id: "if_nogrant", callable: true, service: { source: "catalogue" } }] } },
      },
    });
    expect(line(await run({}, grantedRefusal), "discovery").detail).toMatch(/if_nogrant is callable: it has a grant, so it proves no refusal/);
  });

  it("a protected preview without the bypass secret (a redirect, not the app)", async () => {
    const r = await run({}, fakeDeployment({ "/api/build": { status: 307, body: null } }));
    expect(line(r, "build")).toMatchObject({ status: "FAIL", detail: expect.stringMatching(/redirect: deployment protection/) });
  });

  it("a deployment that does not answer", async () => {
    const r = await runPostDeployCheck(CONFIG, {
      fetch: (async () => {
        throw new Error("getaddrinfo ENOTFOUND ab-workbench.vercel.app");
      }) as unknown as typeof fetch,
      findAuditRows: async () => [],
      sleep: async () => {},
    });
    expect(r.ok).toBe(false);
    expect(r.lines.every((l) => l.status === "FAIL")).toBe(true);
    expect(line(r, "standard-read").detail).toMatch(/^no answer \(getaddrinfo ENOTFOUND/);
    expect(line(r, "audit").detail).toBe("no call returned a correlation id to look up");
  });
});

describe("secrets never reach the output", () => {
  it("even when the deployment echoes them back", async () => {
    const echo = (headers: Headers): Answer => ({
      status: 500,
      body: { error: { code: "INTERNAL", message: `failed for ${headers.get("authorization")} key=${KEY} db=${DB} bypass=${BYPASS}` } },
    });
    const r = await run({ protectionBypass: BYPASS }, fakeDeployment({ "/api/northbound/interfaces/if_std/data": echo }));
    for (const out of [formatText(r), formatMarkdown(r), JSON.stringify(r)]) {
      expect(out).not.toContain(KEY);
      expect(out).not.toContain("s3cret-db-pass");
      expect(out).not.toContain(BYPASS);
    }
    expect(line(r, "standard-read").detail).toContain("[redacted]");
  });

  it("redactSecrets covers known values, URL passwords, bearer values and every CoreEdge credential shape", () => {
    const write = `cew_${"w".repeat(43)}`;
    const legacy = `ce_${"L".repeat(43)}`;
    const text = `a ${KEY} b ${write} c ${legacy} d Bearer abc.def e postgresql://u:pw-123@h/db f custom-secret-value`;
    const out = redactSecrets(text, ["custom-secret-value", "", null, "abc"]);
    expect(out).toBe(
      "a ce_live_[redacted] b cew_[redacted] c ce_[redacted] d Bearer [redacted] e postgresql://u:[redacted]@h/db f [redacted]",
    );
  });
});

describe("the deploy record", () => {
  it("is Markdown with a checkbox per line, the commit and every correlation id", async () => {
    const md = formatMarkdown(await run());
    expect(md).toContain("### CoreEdge post-deploy check: PASS");
    expect(md).toContain("- Commit: 0123456789abcdef0123456789abcdef01234567 (production environment)");
    expect(md).toContain("- [x] **One Z* (customer-built) read through the broker**: HTTP 200, 0 records (an empty resource) [correlation corr-3]");
    expect(md).toContain("- refused: corr-4 (HTTP 403)");
    expect(md).toContain("- Checked at: 2026-10-20T12:00:00.000Z");
  });
});

describe("readPostDeployConfig", () => {
  const ENV = {
    COREEDGE_CHECK_BASE_URL: "https://ab-workbench.vercel.app/",
    COREEDGE_CHECK_KEY: KEY,
    COREEDGE_CHECK_STANDARD_INTERFACE: "if_std",
    COREEDGE_CHECK_CUSTOM_INTERFACE: "if_z",
    COREEDGE_CHECK_AUDIT_DATABASE_URL: DB,
  };

  it("needs the target, the key, both interfaces and the audit database; the rest is optional", () => {
    const r = readPostDeployConfig(ENV);
    expect(r).toEqual({
      ok: true,
      config: {
        baseUrl: "https://ab-workbench.vercel.app",
        key: KEY,
        customKey: KEY,
        standardInterfaceId: "if_std",
        customInterfaceId: "if_z",
        refusedInterfaceId: null,
        expectCommit: null,
        protectionBypass: null,
        auditDatabaseUrl: DB,
        timeoutMs: 20_000,
      },
    });
    const empty = readPostDeployConfig({});
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.problems.map((p) => p.split(" ")[0])).toEqual([
        "COREEDGE_CHECK_BASE_URL",
        "COREEDGE_CHECK_KEY",
        "COREEDGE_CHECK_STANDARD_INTERFACE",
        "COREEDGE_CHECK_CUSTOM_INTERFACE",
        "COREEDGE_CHECK_AUDIT_DATABASE_URL",
      ]);
      // Problems name settings, never values.
      expect(JSON.stringify(empty.problems)).not.toContain(KEY);
    }
  });

  it.each([
    [{ COREEDGE_CHECK_BASE_URL: "http://ab-workbench.vercel.app" }, /must be https/],
    [{ COREEDGE_CHECK_BASE_URL: "https://u:p@ab-workbench.vercel.app" }, /must not carry credentials/],
    [{ COREEDGE_CHECK_BASE_URL: "https://ab-workbench.vercel.app/api" }, /origin only/],
    [{ COREEDGE_CHECK_KEY: "sk-not-a-coreedge-key" }, /not a CoreEdge runtime key/],
    [{ COREEDGE_CHECK_CUSTOM_INTERFACE: "if_std" }, /same interface/],
    [{ COREEDGE_CHECK_REFUSED_INTERFACE: "if_z" }, /no grant, not one of the two reads/],
    [{ COREEDGE_CHECK_EXPECT_COMMIT: "main" }, /not a commit SHA/],
  ])("refuses %o", (over, problem) => {
    const r = readPostDeployConfig({ ...ENV, ...over });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problems.join("\n")).toMatch(problem);
  });

  it("allows http for a local deployment", () => {
    expect(readPostDeployConfig({ ...ENV, COREEDGE_CHECK_BASE_URL: "http://localhost:3003" }).ok).toBe(true);
  });
});
