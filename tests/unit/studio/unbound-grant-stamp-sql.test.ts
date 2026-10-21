/**
 * P0.19 review round 1: an unbound legacy grant's use stamp is ONE statement.
 *
 * Prisma sent the stamp's `updateMany` as BEGIN, UPDATE, COMMIT, three round
 * trips on a pooled connection; it is now one raw UPDATE with the same
 * conditions. The tenant guard (src/lib/db/tenant-guard.ts) does not see a
 * raw statement, so the scoping it would demand is pinned here: the caller's
 * organisation, bound as a parameter, never interpolated. The integration
 * budget test (tests/integration/governed-db-budget.test.ts) runs it on
 * PostgreSQL, and tests/unit/northbound/grant-binding-broker.test.ts reads
 * the stamp back.
 */

import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { recordUnboundGrantUse, UNBOUND_USE_STAMP_INTERVAL_MS } from "@/lib/studio/grant-binding";

const NOW = new Date("2026-10-21T10:00:00.000Z");
const flat = (sql: string) => sql.replace(/\s+/g, " ").trim();

function db() {
  const sent: Prisma.Sql[] = [];
  return { sent, $executeRaw: async (q: Prisma.Sql) => (sent.push(q), 1) };
}

describe("recordUnboundGrantUse", () => {
  it("is one UPDATE, scoped to the caller's organisation and the due grants", async () => {
    const d = db();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await recordUnboundGrantUse(d, "org_a", [{ id: "g1", unboundLastUsedAt: null }, { id: "g2", unboundLastUsedAt: new Date(NOW.getTime() - 2 * UNBOUND_USE_STAMP_INTERVAL_MS) }], NOW);
    expect(d.sent).toHaveLength(1);
    const { text, values } = d.sent[0]!;
    expect(flat(text)).toBe(
      'UPDATE "ApiAccessGrant" SET "unboundLastUsedAt" = ($1::timestamptz AT TIME ZONE \'UTC\') ' +
        'WHERE "organizationId" = $2 AND "id" IN ($3,$4) AND "interfaceId" IS NULL ' +
        'AND ("unboundLastUsedAt" IS NULL OR "unboundLastUsedAt" < ($5::timestamptz AT TIME ZONE \'UTC\'))',
    );
    expect(values).toEqual([
      NOW.toISOString(),
      "org_a",
      "g1",
      "g2",
      new Date(NOW.getTime() - UNBOUND_USE_STAMP_INTERVAL_MS).toISOString(),
    ]);
  });

  it("sends nothing when every grant was stamped within the hour", async () => {
    const d = db();
    await recordUnboundGrantUse(d, "org_a", [{ id: "g1", unboundLastUsedAt: new Date(NOW.getTime() - 60_000) }], NOW);
    expect(d.sent).toEqual([]);
  });

  it("never fails the call it stamps", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      recordUnboundGrantUse({ $executeRaw: async () => Promise.reject(new Error("db down")) }, "org_a", [{ id: "g1", unboundLastUsedAt: null }], NOW),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });
});
