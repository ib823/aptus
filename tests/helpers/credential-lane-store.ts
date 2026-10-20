/**
 * An in-memory stand-in for the four tables a lane's key lives across:
 * Solution, SolutionClient, KeyClaimLink and ConfigAudit.
 *
 * WHY A STORE AND NOT PER-CALL MOCKS. The defects it exists for are about
 * ORDER across modules — a link sent, then a key revoked in another door, then
 * the link opened — and a mock that answers each call in isolation cannot say
 * what the third step found after the first two wrote. This keeps rows, so a
 * test can drive the real issue, revoke, claim, write-key and authenticate
 * code paths one after another and read what is actually left.
 *
 * It implements only the query shapes those modules use, and THROWS on any
 * other: a fake that quietly matched a `where` it did not understand would
 * pass tests the real database would fail.
 */

import { randomUUID } from "node:crypto";

type Row = Record<string, unknown>;

function isPlainValue(v: unknown): boolean {
  return v === null || v instanceof Date || ["string", "number", "boolean"].includes(typeof v);
}

/** Equality on every key of a flat `where`. Anything nested is refused. */
function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (!isPlainValue(expected)) {
      throw new Error(`credential-lane-store: unsupported where on ${key}: ${JSON.stringify(expected)}`);
    }
    const actual = row[key];
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
    return actual === expected;
  });
}

function apply(row: Row, data: Row): Row {
  for (const [key, value] of Object.entries(data)) row[key] = value;
  row.updatedAt = new Date();
  return row;
}

export class CredentialLaneStore {
  solutions: Row[] = [];
  clients: Row[] = [];
  links: Row[] = [];
  audits: Row[] = [];
  /**
   * Owner ids that are NOT live members of their organization (deactivated,
   * deleted or moved away). Every other id the modules ask about is treated as
   * an active user of the organization asked about, so a test names only the
   * people who have left (A69).
   */
  departedUsers = new Set<string>();
  /** Every Solution row lock taken (owner-lock.ts), in order: [organizationId, solutionId]. */
  locks: [unknown, unknown][] = [];

  reset(): void {
    this.solutions = [];
    this.clients = [];
    this.links = [];
    this.audits = [];
    this.departedUsers = new Set();
    this.locks = [];
  }

  /** The Prisma surface the modules under test touch, and nothing else. */
  readonly client = {
    solution: {
      findFirst: async ({ where }: { where: Row }) =>
        this.solutions.find((r) => matches(r, where)) ?? null,
    },
    solutionClient: {
      findFirst: async ({ where }: { where: Row }) =>
        this.clients.find((r) => matches(r, where)) ?? null,
      findUnique: async ({ where }: { where: Row }) =>
        this.clients.find((r) => matches(r, where)) ?? null,
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = this.clients.find((r) => matches(r, where));
        if (!row) throw new Error("credential-lane-store: update matched no SolutionClient");
        return apply(row, data);
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { organizationId_solutionId_environment: Row };
        create: Row;
        update: Row;
      }) => {
        const key = where.organizationId_solutionId_environment;
        const row = this.clients.find((r) => matches(r, key));
        if (row) return apply(row, update);
        const now = new Date();
        const created: Row = {
          id: `client_${randomUUID()}`,
          sapClient: null,
          secretsCiphertext: null,
          isActive: true,
          lastUsedAt: null,
          expiresAt: null,
          revokedAt: null,
          // The database defaults (P0.11): a key minted before prefixes, and
          // no previous key overlapping.
          tokenPrefix: "ce_",
          previousTokenHash: null,
          previousValidUntil: null,
          overlapForTokenHash: null,
          createdAt: now,
          updatedAt: now,
          ...create,
        };
        this.clients.push(created);
        return created;
      },
    },
    keyClaimLink: {
      findUnique: async ({ where }: { where: Row }) =>
        this.links.find((r) => matches(r, where)) ?? null,
      create: async ({ data }: { data: Row }) => {
        const row: Row = {
          id: `link_${randomUUID()}`,
          createdAt: new Date(),
          claimedAt: null,
          claimedClientId: null,
          revokedAt: null,
          revokedReason: null,
          ...data,
        };
        this.links.push(row);
        return row;
      },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = this.links.find((r) => matches(r, where));
        if (!row) throw new Error("credential-lane-store: update matched no KeyClaimLink");
        return apply(row, data);
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const hit = this.links.filter((r) => matches(r, where));
        for (const row of hit) apply(row, data);
        return { count: hit.length };
      },
    },
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] }; organizationId: string; isActive: true } }) => {
        if (!where?.id?.in || where.isActive !== true || typeof where.organizationId !== "string") {
          throw new Error(`credential-lane-store: unsupported user.findMany where ${JSON.stringify(where)}`);
        }
        return where.id.in.filter((id) => !this.departedUsers.has(id)).map((id) => ({ id }));
      },
    },
    configAudit: {
      create: async ({ data }: { data: Row }) => {
        this.audits.push(data);
        return { id: `audit_${this.audits.length}` };
      },
    },
    // No isolation: each test drives one request at a time.
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(this.client),
    // The Solution row lock (lib/studio/owner-lock.ts): recorded, never contended.
    $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
      this.locks.push([values[1], values[0]]);
      return [];
    },
  };
}

export const laneStore = new CredentialLaneStore();
