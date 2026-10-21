/**
 * A STARTER KIT'S FIXTURES, READ BY SIZE FIRST (P1.3, structural hardening
 * round 3).
 *
 * The kit used to load every stored fixture body whole before anything was
 * measured — and capture-fixture stored bodies of any size — so a fixture of
 * tens of MB cost every download seconds of database engine CPU and a pooled
 * connection, only for the kit to be refused as too large. Now the kit asks
 * the database first for each fixture's stamp and the size of its stored
 * body (octet_length of the jsonb text, which is never smaller than its
 * compact JSON), with no body; reads only the bodies of fixtures that fit the
 * bound a kit carries (LIMITS.fixture.storedTextBytes, added up); and names
 * the others as withheld, too large.
 *
 * Scoped by organisation like every other read of the table.
 */

import { Prisma } from "@prisma/client";

import { LIMITS } from "@/lib/contracts/budget";
import { jsonTextRef } from "@/lib/contracts/render-input";
import { prisma } from "@/lib/db/prisma";

export interface FixtureFacts {
  id: string;
  scenario: string;
  status: number;
  sourceStatus: number | null;
  capturedAt: Date;
  interfaceVersion: number | null;
  entitySet: string | null;
  /** octet_length of the stored body's jsonb text. */
  bytes: number;
}

/** Every stored fixture of the interface, without its body: its stamp and its stored size. */
export async function fixtureFacts(organizationId: string, interfaceId: string): Promise<FixtureFacts[]> {
  const rows = await prisma.$queryRaw<(Omit<FixtureFacts, "bytes"> & { bytes: number | bigint | null })[]>(Prisma.sql`
    SELECT "id", "scenario", "status", "sourceStatus", "capturedAt", "interfaceVersion", "entitySet",
      octet_length("body"::text) AS "bytes"
    FROM "MockFixture"
    WHERE "organizationId" = ${organizationId} AND "interfaceId" = ${interfaceId}
    ORDER BY "scenario" ASC
  `);
  return rows.map((r) => ({ ...r, bytes: Number(r.bytes ?? 0) }));
}

/**
 * Which fixtures a kit reads: in the order given, while their stored sizes
 * add up to at most `maxBytes`; the rest are too large to carry.
 */
export function fixturesWithinBound<F extends { bytes: number }>(
  fixtures: readonly F[],
  maxBytes: number = LIMITS.fixture.storedTextBytes,
): { kept: F[]; tooLarge: F[] } {
  const kept: F[] = [];
  const tooLarge: F[] = [];
  let total = 0;
  for (const f of fixtures) {
    if (total + f.bytes <= maxBytes) {
      kept.push(f);
      total += f.bytes;
    } else tooLarge.push(f);
  }
  return { kept, tooLarge };
}

/**
 * The bodies of the listed fixtures, by id (a fixture deleted meanwhile is
 * simply absent), AS THEIR STORED TEXT (structural hardening round 4): a kit
 * hands them to its render, often in the envelope, so they are never parsed,
 * walked or structured-cloned on the request thread — read as `body::text`
 * and carried as references to it (render-input.ts), parsed where the kit is
 * rendered.
 */
export async function fixtureBodies(organizationId: string, interfaceId: string, ids: readonly string[]): Promise<Map<string, unknown>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ id: string; body: string }[]>(Prisma.sql`
    SELECT "id", "body"::text AS "body"
    FROM "MockFixture"
    WHERE "organizationId" = ${organizationId} AND "interfaceId" = ${interfaceId} AND "id" IN (${Prisma.join([...ids])})
  `);
  return new Map(rows.map((r) => [r.id, jsonTextRef<unknown>(r.body)]));
}
