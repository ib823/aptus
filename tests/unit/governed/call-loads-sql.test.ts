/**
 * P0.19: the scoping the tenant guard cannot see, pinned in the SQL.
 *
 * The guard (src/lib/db/tenant-guard.ts) inspects Prisma model operations; a
 * raw statement passes it by. So the two statements in
 * src/lib/governed/call-loads.ts carry their scoping in the SQL itself, and
 * this test reads it back:
 *
 *   - the credential lookup's only unscoped predicates are equalities on the
 *     presented hash, against the three columns UNSCOPED_BY_DESIGN already
 *     sanctions, and the solution it joins is matched on the row's own
 *     organization as well as its id;
 *   - every tenant table the access load reads is filtered by the caller's
 *     organizationId, bound as a parameter, never interpolated.
 *
 * tests/integration/governed-call-loads.test.ts proves on PostgreSQL that the
 * rows returned are the rows the replaced queries returned.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const seen = vi.hoisted(() => ({ calls: [] as { sql: string; values: unknown[] }[] }));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      // Each parameter as $n, the way PostgreSQL receives it.
      seen.calls.push({ sql: strings.reduce((acc, s, i) => `${acc}$${i}${s}`), values });
      return [];
    },
  },
}));

import { loadConsoleConnection, loadInterfaceAccess, lookupCredential } from "@/lib/governed/call-loads";
import { isUnscopedByDesign } from "@/lib/db/tenant-guard";

const flat = (sql: string) => sql.replace(/\s+/g, " ");

beforeEach(() => {
  seen.calls = [];
});

describe("the credential lookup", () => {
  it("names the presented hash only, and only on the sanctioned columns", async () => {
    await lookupCredential("hash-abc", { withWriteKey: false });
    const { sql, values } = seen.calls[0]!;
    // The hash is bound as a parameter (three times), never part of the text.
    expect(sql).not.toContain("hash-abc");
    expect(values.filter((v) => v === "hash-abc")).toHaveLength(3);
    const wheres = [...flat(sql).matchAll(/WHERE ([^)]*?)(?= UNION| \) c|$)/g)].map((m) => m[1]!.trim());
    expect(wheres).toEqual([
      'k."tokenHash" = $2',
      'k."previousTokenHash" = $3',
      'r."tokenHash" = $4',
    ]);
    // Each is a lookup the tenant guard already sanctions for the Prisma form.
    expect(isUnscopedByDesign("SolutionClient", "findUnique", { where: { tokenHash: "h" } })).toBe(true);
    expect(isUnscopedByDesign("SolutionClient", "findUnique", { where: { previousTokenHash: "h" } })).toBe(true);
    expect(isUnscopedByDesign("RetiredClientToken", "findUnique", { where: { tokenHash: "h" } })).toBe(true);
  });

  it("joins the solution on the row's own organization, never its id alone", async () => {
    await lookupCredential("hash-abc");
    expect(flat(seen.calls[0]!.sql)).toContain(
      'LEFT JOIN "Solution" s ON s."id" = c."solutionId" AND s."organizationId" = c."organizationId"',
    );
  });

  it("selects the sealed write key only behind the caller's flag", async () => {
    await lookupCredential("hash-abc", { withWriteKey: false });
    await lookupCredential("hash-abc", { withWriteKey: true });
    expect(flat(seen.calls[0]!.sql)).toContain('CASE WHEN $1::boolean THEN c."secretsCiphertext" ELSE NULL END');
    expect(seen.calls.map((c) => c.values[0])).toEqual([false, true]);
  });
});

describe("the access load", () => {
  it("filters every tenant table by the caller's organization, as a parameter", async () => {
    await loadInterfaceAccess("org_a", "sol_1", "if_1", "DEV", { withConnections: true });
    const { sql, values } = seen.calls[0]!;
    const text = flat(sql);
    expect(text).not.toContain("org_a");
    const orgParams = values.flatMap((v, i) => (v === "org_a" ? [`$${i + 1}`] : []));
    expect(orgParams).toHaveLength(3);
    const [iface, grant, connection] = orgParams;
    expect(text).toContain(`FROM "Interface" WHERE "id" = $1 AND "organizationId" = ${iface}`);
    expect(text).toContain(`WHERE g."organizationId" = ${grant} AND g."solutionId" = $4 AND g."environment" = $5`);
    expect(text).toContain(`AND c."organizationId" = ${connection} AND c."product" = i."sapProduct" AND c."isActive" = true`);
    expect(values.slice(0, 5)).toEqual(["if_1", "org_a", "org_a", "sol_1", "DEV"]);
    // The grants and connections are read only beside the caller's interface.
    expect(text).toContain('FROM "ApiAccessGrant" g, i');
    expect(text).toContain('FROM "SapConnection" c, i');
  });

  it("keeps grantsForInterfaceWhere's tuple in the SQL", async () => {
    await loadInterfaceAccess("org_a", "sol_1", "if_1", "DEV");
    expect(flat(seen.calls[0]!.sql)).toContain(
      'AND g."externalId" = i."externalId" AND g."operation" = i."operation" AND ((g."interfaceId" = i."id" AND g."sapProduct" = i."sapProduct") OR g."interfaceId" IS NULL)',
    );
  });
});

/* P0.14b review round 5: a console read's connection with its ceiling's grants. */
describe("the console connection load", () => {
  it("filters the connection and its grants by the caller's organization, as a parameter", async () => {
    await loadConsoleConnection("org_a", "s4hana", "conn-key");
    const { sql, values } = seen.calls[0]!;
    const text = flat(sql);
    expect(text).not.toContain("org_a");
    expect(text).not.toContain("conn-key");
    expect(values).toEqual(["org_a", "s4hana", "conn-key", "org_a"]);
    expect(text).toContain('FROM "SapConnection" WHERE "organizationId" = $1 AND "product" = $2 AND "key" = $3 AND "isActive" = true');
    // The grants: the caller's organization, the connection's own environment, read only beside it.
    expect(text).toContain('FROM "ApiAccessGrant" g, c WHERE g."organizationId" = $4 AND g."environment" = c."environment"::text');
    // Each grant's app status (wave 2 integration review round 3): the grant's
    // own app, in the grant's organization, which the line above binds to $4.
    expect(text).toContain('FROM "Solution" s WHERE s."id" = g."solutionId" AND s."organizationId" = g."organizationId"');
  });

  it("is what the tenant guard demands of the queries it replaced", async () => {
    // Each replaced query is scoped by organizationId, so the guard passes it without a by-design exception.
    expect(isUnscopedByDesign("SapConnection", "findMany", { where: { product: "s4hana", key: "k" } })).toBe(false);
    expect(isUnscopedByDesign("ApiAccessGrant", "findMany", { where: { environment: "PROD" } })).toBe(false);
  });
});
