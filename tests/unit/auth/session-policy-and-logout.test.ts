/**
 * The enforcement-equals-declaration batch: controls that existed as settings
 * or conventions and were not enforced, now asserted as behavior.
 *
 * 1. LOGOUT MUTATES ONLY ON POST. A GET that revokes a session is CSRF-able —
 *    any page on the internet could sign a user out with an <img src>. The GET
 *    handler survives as a compat redirect and must touch nothing.
 * 2. THE ORG'S SESSION LIMIT IS HONORED. The org form has offered
 *    maxConcurrentSessions since it shipped; createSession ignored it and
 *    revoked everything on every login. Now the newest (limit - 1) sessions
 *    survive a new login, and an org-less user keeps the strict single-session
 *    behavior.
 * 3. THE PORTAL-HOST REDIRECT IS DERIVED. The middleware's inline page list
 *    drifted (Studio/Operations/Control Tower missing); isWorkbenchOnlyPage
 *    derives from the one allow-list the Workbench host enforces.
 * 4. A CONNECTION baseUrl CANNOT AIM AT THE DEPLOYMENT'S OWN NETWORK. The
 *    broker calls it server-side with credentials attached.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  revokeSession: vi.fn(),
  sessionFindMany: vi.fn(),
  sessionUpdateMany: vi.fn(),
  sessionCreate: vi.fn(),
  userFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    session: {
      findMany: mocks.sessionFindMany,
      updateMany: mocks.sessionUpdateMany,
      create: mocks.sessionCreate,
    },
    user: { findUnique: mocks.userFindUnique, update: mocks.userUpdate },
    $transaction: mocks.transaction,
  },
}));

describe("logout is POST-only for the mutation", () => {
  beforeEach(() => vi.clearAllMocks());

  it("GET revokes nothing and only redirects", async () => {
    vi.doMock("@/lib/auth/session", async (importOriginal) => ({
      ...(await importOriginal<Record<string, unknown>>()),
      revokeSession: mocks.revokeSession,
    }));
    const { GET } = await import("@/app/api/auth/logout/route");
    const req = new NextRequest("https://portal.test/api/auth/logout", {
      headers: { cookie: "abeam-session=tok" },
    });
    const res = GET(req);
    expect(res.status).toBeGreaterThanOrEqual(300);
    expect(res.status).toBeLessThan(400);
    expect(mocks.revokeSession).not.toHaveBeenCalled();
    vi.doUnmock("@/lib/auth/session");
  });

  it("POST redirects with 303 so the browser GETs the login page", async () => {
    vi.resetModules();
    const { POST } = await import("@/app/api/auth/logout/route");
    const req = new NextRequest("https://portal.test/api/auth/logout", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("/login");
  });
});

describe("createSession honors the organization's concurrent-session limit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mocks.sessionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.mockResolvedValue([]);
  });

  async function createSession() {
    const mod = await import("@/lib/auth/session");
    return mod.createSession;
  }

  it("keeps the newest (limit - 1) sessions and displaces only the excess", async () => {
    mocks.userFindUnique.mockResolvedValue({ organization: { maxConcurrentSessions: 3 } });
    // Three live sessions, newest first — with limit 3, exactly the oldest one
    // must go to make room for the session being minted.
    mocks.sessionFindMany.mockResolvedValue([{ id: "s-new" }, { id: "s-mid" }, { id: "s-old" }]);

    const fn = await createSession();
    const result = await fn("user-1", "1.2.3.4", "ua");

    expect(mocks.sessionUpdateMany).toHaveBeenCalledTimes(1);
    const arg = mocks.sessionUpdateMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] } };
    };
    expect(arg.where.id.in).toEqual(["s-old"]);
    expect(result.hadExistingSession).toBe(true);
  });

  it("displaces nothing while under the limit", async () => {
    mocks.userFindUnique.mockResolvedValue({ organization: { maxConcurrentSessions: 3 } });
    mocks.sessionFindMany.mockResolvedValue([{ id: "s-only" }]);

    const fn = await createSession();
    const result = await fn("user-1", null, null);

    expect(mocks.sessionUpdateMany).not.toHaveBeenCalled();
    expect(result.hadExistingSession).toBe(false);
  });

  it("keeps strict single-session for an org-less user — no setting to honor", async () => {
    mocks.userFindUnique.mockResolvedValue({ organization: null });
    mocks.sessionFindMany.mockResolvedValue([{ id: "s-a" }, { id: "s-b" }]);

    const fn = await createSession();
    await fn("user-1", null, null);

    const arg = mocks.sessionUpdateMany.mock.calls[0]?.[0] as {
      where: { id: { in: string[] } };
    };
    expect(arg.where.id.in).toEqual(["s-a", "s-b"]);
  });
});

describe("isWorkbenchOnlyPage derives from the one allow-list", () => {
  it("converges console pages the inline copy used to miss", async () => {
    const { isWorkbenchOnlyPage } = await import("@/lib/routing/workbench-paths");
    for (const p of ["/studio", "/operations/connections", "/control-tower/grants", "/presales/login", "/c", "/a/x"]) {
      expect(isWorkbenchOnlyPage(p), p).toBe(true);
    }
  });

  it("keeps shared marketing/legal pages and APIs on their host", async () => {
    const { isWorkbenchOnlyPage } = await import("@/lib/routing/workbench-paths");
    for (const p of ["/signup", "/pricing", "/terms", "/privacy", "/api/studio/solutions", "/login", "/dashboard"]) {
      expect(isWorkbenchOnlyPage(p), p).toBe(false);
    }
  });
});

describe("a stored connection baseUrl cannot aim at the deployment's own network", () => {
  it("refuses localhost, internal names, IP literals and private ranges", async () => {
    const { isForbiddenBaseUrlHost } = await import("@/lib/studio/connection-url-guard");
    for (const u of [
      "https://localhost/sap",
      "https://foo.localhost/",
      "https://db.internal/",
      "https://printer.local/",
      "https://127.0.0.1/",
      "https://10.0.0.8/",
      "https://172.16.9.1/",
      "https://192.168.1.1/",
      "https://169.254.169.254/latest/meta-data", // cloud metadata service
      "https://100.64.0.1/",
      "https://[::1]/",
      "https://8.8.8.8/", // even public IP literals — a real SAP tenant has a hostname
    ]) {
      expect(isForbiddenBaseUrlHost(u), u).toBe(true);
    }
  });

  it("accepts real SAP tenant hostnames", async () => {
    const { isForbiddenBaseUrlHost } = await import("@/lib/studio/connection-url-guard");
    for (const u of [
      "https://my1234-api.s4hana.cloud.sap/sap/opu/odata",
      "https://api44.sapsf.com/odata/v2",
    ]) {
      expect(isForbiddenBaseUrlHost(u), u).toBe(false);
    }
  });
});
