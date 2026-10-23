/**
 * A connection's stored service listing, summarised, or recorded as a
 * redacted test fixture (roadmap P1.2; the lab proof is P1.8).
 *
 *   pnpm coreedge:tenant-discovery --connection <key> [--org <organizationId>]
 *   pnpm coreedge:tenant-discovery --connection <key> --record [--out <file>]
 *
 * READS THE DATABASE ONLY. It never calls SAP: the listing it reads is the one
 * a person made from Discover's "On this tenant" (Read the service list),
 * through the governed console pipeline with its grant checks and audit rows.
 * A script that read the tenant itself would be the side door
 * tests/unit/security/no-side-doors.test.ts exists to refuse.
 *
 * Without --record it prints the listing's counts by class, and the
 * customer-built services by name. With --record it writes the V2 entries in
 * the shape of a Gateway catalogue page ($format=json), REDACTED: no host
 * (the stored listing holds paths, never URLs), no titles or descriptions
 * (they can name a customer's business), only the ids, names, versions and
 * paths the parser and the classifier read. Default output:
 * tests/fixtures/tenant-discovery/catalogservice-v2.lab.json.
 *
 * Exit code 0 on success, 1 when the connection or its listing is not found
 * or the key is ambiguous, 2 on any other failure.
 *
 * Runbook: docs/runbooks/coreedge-tenant-discovery.md.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaClient } from "@prisma/client";

import { groupListing, readStoredEntries } from "../../src/lib/sap-public/tenant-discovery";

/** Where an entry with no storable path is recorded as pointing: another host, so it reads back as none. */
const OTHER_HOST = "https://other-host.example.invalid/";

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function main(): Promise<number> {
  const key = arg("--connection");
  if (!key) {
    console.error("Name the connection: --connection <key>.");
    return 1;
  }
  const org = arg("--org");
  const record = process.argv.includes("--record");
  const out = arg("--out") ?? join(process.cwd(), "tests/fixtures/tenant-discovery/catalogservice-v2.lab.json");

  const prisma = new PrismaClient();
  try {
    const connections = await prisma.sapConnection.findMany({
      where: { key, ...(org ? { organizationId: org } : {}) },
      select: { id: true, organizationId: true, product: true, label: true },
    });
    if (connections.length !== 1) {
      console.error(
        connections.length === 0
          ? `No connection with the key ${key}${org ? ` in ${org}` : ""}.`
          : `${connections.length} connections have the key ${key}; name the organization with --org.`,
      );
      return 1;
    }
    const connection = connections[0]!;
    const listing = await prisma.tenantServiceListing.findFirst({
      where: { organizationId: connection.organizationId, connectionId: connection.id },
    });
    if (!listing) {
      console.error(`${connection.label} has no stored listing. Read it from Discover, On this tenant, first.`);
      return 1;
    }
    const entries = readStoredEntries(listing.entries);
    const groups = groupListing(entries);
    console.log(
      `${connection.label} (${connection.product}), listed ${listing.listedAt.toISOString()}, catalogue ${listing.catalogueStatus}, ` +
        `V4 ${listing.v4Status ?? "NOT_TRIED"}${listing.truncated ? ", truncated" : ""}, correlation ${listing.correlationId}.`,
    );
    console.log(
      `  ${entries.length} services: ${groups.customerBuilt.length} customer-built, ${groups.published.length} published, ` +
        `${groups.sapUnpublished.length} SAP not published, ${groups.unknown.length} unknown namespace.`,
    );
    for (const e of groups.customerBuilt) console.log(`    ${e.class.padEnd(19)} ${e.id}${e.path ? "" : "  (no storable path)"}`);

    if (!record) return 0;
    const v2 = entries.filter((e) => e.odataVersion === "V2");
    const fixture = {
      _recorded:
        `Recorded from the stored listing of a ${connection.product} connection on ${listing.listedAt.toISOString().slice(0, 10)} ` +
        `(correlation ${listing.correlationId}) by pnpm coreedge:tenant-discovery --record. Redacted: no host, no titles; ` +
        `the V2 entries only (${entries.length - v2.length} V4 left out). A ServiceUrl on ${OTHER_HOST} stands for an address that was not on the connection's own host.`,
      d: {
        results: v2.map((e) => ({
          ID: e.id,
          TechnicalServiceName: e.technicalName,
          TechnicalServiceVersion: Number(e.version),
          // No storable path stays none when the fixture is read back: an
          // address on another host, a placeholder one, never the real one.
          ServiceUrl: e.path ? `${e.path}/` : OTHER_HOST,
        })),
      },
    };
    writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
    console.log(`Wrote ${v2.length} entries to ${out}.`);
    return 0;
  } finally {
    await prisma.$disconnect();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  },
);
