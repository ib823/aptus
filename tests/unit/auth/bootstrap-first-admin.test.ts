// @vitest-environment node
/**
 * A stranger cannot claim a fresh instance (roadmap P0.13).
 *
 * The sign-in adapter made the first account on an empty database
 * `platform_admin`, so whoever signed in first owned a fresh instance. Now
 * nobody becomes admin by arriving first; the first admin is claimed with the
 * operator's one-time bootstrap token (lib/auth/bootstrap.ts), through
 * POST /api/auth/bootstrap-admin.
 *
 * WHY AN IN-MEMORY DATABASE HERE. "Fresh instance" means "no platform admin
 * anywhere", and the shared test database is used by every suite in parallel,
 * some of which create platform admins of their own. A store this file owns is
 * the only way to make "no admin exists" true for the length of a test. The
 * route, the bootstrap module and the adapter's user creation are the shipped
 * code; only the client underneath is stood in.
 */

import { createHash } from "node:crypto";

import { Prisma } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SessionUser } from "@/types/assessment";

interface Row {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
  organizationId: string | null;
}
interface AuditRow {
  actorId: string;
  entityType: string;
  entityId: string;
  action: string;
  after: Record<string, unknown> | null;
}

const db = vi.hoisted(() => ({
  users: new Map<string, Row>(),
  audits: [] as AuditRow[],
  failNextTransactionWith: null as unknown,
}));

vi.mock("@/lib/db/prisma", () => {
  const user = {
    count: async ({ where }: { where: { role: { in: string[] }; isActive: boolean } }) =>
      [...db.users.values()].filter((u) => where.role.in.includes(u.role) && u.isActive === where.isActive).length,
    update: async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
      const row = db.users.get(where.id);
      if (!row) throw new Error("no such user");
      Object.assign(row, data);
      return { id: row.id };
    },
    create: async ({ data }: { data: Partial<Row> & { email: string } }) => {
      const row: Row = {
        id: `u${db.users.size + 1}`,
        role: "viewer",
        isActive: true,
        organizationId: null,
        ...data,
      } as Row;
      db.users.set(row.id, row);
      return row;
    },
    findUnique: async () => null,
  };
  const platformGovernanceAudit = {
    findFirst: async ({ where }: { where: { action: string; after: { path: string[]; equals: string } } }) =>
      db.audits.find(
        (a) => a.action === where.action && a.after?.[where.after.path[0] ?? ""] === where.after.equals,
      ) ?? null,
    create: async ({ data }: { data: AuditRow }) => {
      db.audits.push({ ...data, after: data.after ?? null });
      return data;
    },
  };
  // A developer workspace (sign-up open) writes one organization row.
  const organization = {
    findUnique: async () => null,
    create: async () => ({ id: "ws1" }),
  };
  const prisma = {
    user,
    organization,
    platformGovernanceAudit,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      if (db.failNextTransactionWith) {
        const err = db.failNextTransactionWith;
        db.failNextTransactionWith = null;
        throw err;
      }
      return fn({ user, organization, platformGovernanceAudit });
    },
  };
  return { prisma };
});

const session = vi.hoisted(() => ({ user: null as SessionUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => session.user }));

import { POST as claim } from "@/app/api/auth/bootstrap-admin/route";
import { createFirstSignInUser } from "@/lib/auth/auth-options";
import { bootstrapAvailability, bootstrapTokenMatches } from "@/lib/auth/bootstrap";

const TOKEN = "a-long-random-bootstrap-token-0123456789abcdef";

function sessionUser(row: Row, extra: Partial<SessionUser> = {}): SessionUser {
  return {
    id: row.id,
    email: row.email,
    name: row.email,
    image: null,
    role: row.role as SessionUser["role"],
    organizationId: row.organizationId,
    organizationMfaPolicy: null,
    mfaEnabled: false,
    mfaVerified: false,
    hasWebAuthn: false,
    passkeyAssertedAt: null,
    authMethod: "session",
    ...extra,
  };
}

async function signInFresh(email: string): Promise<Row> {
  // Exactly what NextAuth does after a magic-link click on an unknown address.
  const created = (await createFirstSignInUser({ email, emailVerified: new Date() })) as unknown as Row;
  const row = db.users.get(created.id)!;
  session.user = sessionUser(row);
  return row;
}

const post = (body: unknown) =>
  new Request("http://localhost/api/auth/bootstrap-admin", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  }) as never;

const roleOf = (row: Row) => db.users.get(row.id)?.role;

beforeEach(() => {
  db.users.clear();
  db.audits.length = 0;
  db.failNextTransactionWith = null;
  session.user = null;
  vi.stubEnv("COREEDGE_STEP_UP", "off");
  vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("nobody becomes admin by arriving first", () => {
  it("the first account on an empty database is an ordinary account", async () => {
    const first = await signInFresh("first@example.com");
    expect(first.role).toBe("consultant");
    expect(first.role).not.toBe("platform_admin");
  });

  it("with developer sign-up open, the first account is a sandbox developer in its own workspace", async () => {
    vi.stubEnv("COREEDGE_DEVELOPER_SIGNUP", "open");

    const first = await signInFresh("first@example.com");

    expect(first.role).toBe("sandbox_developer");
    expect(first.organizationId).toBe("ws1");
  });
});

describe("a stranger cannot claim a fresh instance without the token", () => {
  it("no token configured: nothing can be claimed, whatever is presented", async () => {
    const stranger = await signInFresh("stranger@example.com");

    const res = await claim(post({ token: TOKEN }));

    expect(res.status).toBe(404);
    expect(roleOf(stranger)).toBe("consultant");
    expect((await bootstrapAvailability()).open).toBe(false);
  });

  it("a token too short to be a secret counts as none", async () => {
    vi.stubEnv("COREEDGE_BOOTSTRAP_TOKEN", "short-token");
    const stranger = await signInFresh("stranger@example.com");

    const res = await claim(post({ token: "short-token" }));

    expect(res.status).toBe(404);
    expect(roleOf(stranger)).toBe("consultant");
  });

  it("the wrong token is refused, nothing changes, and the attempt is audited", async () => {
    vi.stubEnv("COREEDGE_BOOTSTRAP_TOKEN", TOKEN);
    const stranger = await signInFresh("stranger@example.com");

    const res = await claim(post({ token: `${TOKEN}x` }));

    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { refusal: string } }).error.refusal).toBe("INVALID_TOKEN");
    expect(roleOf(stranger)).toBe("consultant");
    expect(db.audits).toEqual([
      expect.objectContaining({ action: "BOOTSTRAP_REFUSED", actorId: stranger.id, after: expect.objectContaining({ refusal: "INVALID_TOKEN" }) }),
    ]);
  });

  it("no session, no claim — even with the token", async () => {
    vi.stubEnv("COREEDGE_BOOTSTRAP_TOKEN", TOKEN);

    const res = await claim(post({ token: TOKEN }));

    expect(res.status).toBe(401);
    expect(db.audits).toEqual([]);
  });

  it("a personal or CI token caller is refused even with the right token", async () => {
    vi.stubEnv("COREEDGE_BOOTSTRAP_TOKEN", TOKEN);
    const holder = await signInFresh("holder@example.com");
    session.user = sessionUser(holder, { authMethod: "personal_token" });

    const res = await claim(post({ token: TOKEN }));

    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("STEP_UP_TOKEN_REFUSED");
    expect(roleOf(holder)).toBe("consultant");
  });
});

describe("the token holder claims it, once", () => {
  it("becomes platform admin, recorded with the token's hash and never the token", async () => {
    vi.stubEnv("COREEDGE_BOOTSTRAP_TOKEN", TOKEN);
    const holder = await signInFresh("holder@example.com");
    expect((await bootstrapAvailability()).open).toBe(true);

    const res = await claim(post({ token: TOKEN }));

    expect(res.status).toBe(200);
    expect(roleOf(holder)).toBe("platform_admin");
    const row = db.audits.find((a) => a.action === "BOOTSTRAP_ADMIN");
    expect(row).toMatchObject({
      actorId: holder.id,
      entityType: "User",
      entityId: holder.id,
      after: { tokenSha256: createHash("sha256").update(TOKEN).digest("hex") },
    });
    expect(JSON.stringify(db.audits)).not.toContain(TOKEN);
    expect((await bootstrapAvailability()).open).toBe(false);
  });

  it("once an admin exists, the token claims nothing more", async () => {
    vi.stubEnv("COREEDGE_BOOTSTRAP_TOKEN", TOKEN);
    await signInFresh("holder@example.com");
    expect((await claim(post({ token: TOKEN }))).status).toBe(200);
    const second = await signInFresh("second@example.com");

    const res = await claim(post({ token: TOKEN }));

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { refusal: string } }).error.refusal).toBe("ADMIN_EXISTS");
    expect(roleOf(second)).toBe("consultant");
  });

  it("single use: the same token is refused even after every admin is gone", async () => {
    vi.stubEnv("COREEDGE_BOOTSTRAP_TOKEN", TOKEN);
    const holder = await signInFresh("holder@example.com");
    expect((await claim(post({ token: TOKEN }))).status).toBe(200);
    db.users.get(holder.id)!.isActive = false; // the only admin, deactivated
    const next = await signInFresh("next@example.com");

    const res = await claim(post({ token: TOKEN }));

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { refusal: string } }).error.refusal).toBe("TOKEN_USED");
    expect(roleOf(next)).toBe("consultant");
  });

  it("on an instance that already has an admin (production), the right token changes nothing", async () => {
    vi.stubEnv("COREEDGE_BOOTSTRAP_TOKEN", TOKEN);
    db.users.set("admin", { id: "admin", email: "ops@abeam.com", role: "platform_admin", isActive: true, organizationId: null });
    const someone = await signInFresh("someone@example.com");

    const res = await claim(post({ token: TOKEN }));

    expect(res.status).toBe(409);
    expect(roleOf(someone)).toBe("consultant");
  });

  it("a legacy 'admin' row counts as an admin", async () => {
    vi.stubEnv("COREEDGE_BOOTSTRAP_TOKEN", TOKEN);
    db.users.set("legacy", { id: "legacy", email: "old@abeam.com", role: "admin", isActive: true, organizationId: null });
    await signInFresh("someone@example.com");

    expect((await claim(post({ token: TOKEN }))).status).toBe(409);
  });

  it("two claims at once: the one Postgres aborts is a conflict, not a second admin", async () => {
    vi.stubEnv("COREEDGE_BOOTSTRAP_TOKEN", TOKEN);
    const loser = await signInFresh("loser@example.com");
    db.failNextTransactionWith = new Prisma.PrismaClientKnownRequestError("could not serialize access", {
      code: "P2034",
      clientVersion: "test",
    });

    const res = await claim(post({ token: TOKEN }));

    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { refusal: string } }).error.refusal).toBe("CONFLICT");
    expect(roleOf(loser)).toBe("consultant");
  });
});

describe("the comparison", () => {
  it("matches only the exact token, whatever the lengths", () => {
    expect(bootstrapTokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(bootstrapTokenMatches(` ${TOKEN} `, TOKEN)).toBe(true);
    expect(bootstrapTokenMatches(TOKEN.slice(0, -1), TOKEN)).toBe(false);
    expect(bootstrapTokenMatches("", TOKEN)).toBe(false);
    expect(bootstrapTokenMatches(`${TOKEN}${TOKEN}`, TOKEN)).toBe(false);
  });
});
