// @vitest-environment node
/**
 * The stored-probe writes change only their own keys, on the row as it is NOW
 * (audit A23) — checked against real PostgreSQL, because the property is the SQL.
 *
 * Probe-all used to write each row back from a copy of rawMetadataJson read at
 * the start of its run, and the Rebuild spread a start-of-run copy of the whole
 * object over every row it refreshed. Either one, overlapping any other probe
 * run, erased or reverted entries that belonged to other tenants and other
 * organizations. A mocked client cannot show the fix holds — it would only
 * replay whatever the mock was told — so this file runs the statements.
 *
 * `mergeStoredProbe` is the oracle: whatever shape the column is in, the
 * database write must land exactly where the in-memory merge would.
 *
 * Opt-in on TEST_DATABASE_URL, like the idempotency race test; never an
 * application's DATABASE_URL. Rows are namespaced per run and removed after.
 */

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", async () => {
  const { PrismaClient } = await import("@prisma/client");
  return {
    prisma: new PrismaClient({
      datasourceUrl: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:1/unused",
    }),
  };
});

import { Prisma, type SapHubContentType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { mergeStoredProbe, type StoredProbe } from "@/lib/sap-public/hub-content";
import { persistStoredProbe, refreshApiProvenance } from "@/lib/sap-public/hub-probe-store";

const RUN = `probe-store-${randomUUID()}`;
const created: string[] = [];

async function row(
  rawMetadataJson: unknown,
  contentType: SapHubContentType = "API" as SapHubContentType,
): Promise<{ id: string; externalId: string }> {
  const externalId = `${RUN}-${created.length}`;
  const r = await prisma.sapHubContent.create({
    data: {
      contentType,
      externalId,
      title: "t",
      description: "",
      status: "Active",
      hubUrl: "https://api.sap.com/api/x",
      // undefined leaves the column SQL NULL; Prisma.JsonNull stores a JSON null.
      ...(rawMetadataJson === undefined ? {} : { rawMetadataJson: rawMetadataJson as Prisma.InputJsonValue }),
    },
    select: { id: true, externalId: true },
  });
  created.push(r.id);
  return r;
}

async function raw(id: string): Promise<unknown> {
  return (await prisma.sapHubContent.findUnique({ where: { id }, select: { rawMetadataJson: true } }))
    ?.rawMetadataJson;
}

const PROBE_A: StoredProbe = { http: 200, at: "2026-10-01T00:00:00.000Z", read: true, write: false };
const PROBE_B: StoredProbe = { http: 403, at: "2026-10-02T00:00:00.000Z", read: false, write: false };

describe.skipIf(!process.env.TEST_DATABASE_URL)("stored-probe writes against real PostgreSQL", () => {
  afterAll(async () => {
    await prisma.sapHubContent.deleteMany({ where: { id: { in: created } } });
    await prisma.$disconnect();
  });

  it("lands exactly where mergeStoredProbe would, whatever shape the column is in", async () => {
    const shapes: unknown[] = [
      undefined, // SQL NULL
      Prisma.JsonNull, // a JSON null
      {},
      { source: "SapApiReference", apiId: "API_PO" },
      { source: "s", probe: { http: 999 }, probes: { customizing: { http: 200 } } },
      { source: "s", probes: "not-an-object" },
      { source: "s", probes: ["not", "an", "object"] },
      ["the", "whole", "column", "is", "an", "array"],
    ];
    for (const shape of shapes) {
      const r = await row(shape);
      const before = await raw(r.id);
      await persistStoredProbe(r.id, "org:org-a:s4hana:x5m-dev", PROBE_A);
      expect(await raw(r.id), JSON.stringify(shape)).toEqual(
        mergeStoredProbe(before, "org:org-a:s4hana:x5m-dev", PROBE_A),
      );
    }
  });

  it("a later write for one key never drops an earlier write for another", async () => {
    // Trigger (2): two organizations probe the same shared row; the later writer
    // used to replace the earlier writer's entry with its own snapshot.
    const r = await row({ source: "SapApiReference", apiId: "API_PO" });
    await persistStoredProbe(r.id, "org:org-a:s4hana:x5m-100", PROBE_A);
    await persistStoredProbe(r.id, "org:org-b:s4hana:x5m-100", PROBE_B);
    expect(await raw(r.id)).toEqual({
      source: "SapApiReference",
      apiId: "API_PO",
      probes: { "org:org-a:s4hana:x5m-100": PROBE_A, "org:org-b:s4hana:x5m-100": PROBE_B },
    });
  });

  it("concurrent writes for many keys on one row all survive", async () => {
    const r = await row({ source: "s" });
    const keys = Array.from({ length: 16 }, (_, i) => `org:org-${i}:s4hana:k`);
    await Promise.all(keys.map((k, i) => persistStoredProbe(r.id, k, { http: 200 + i })));
    const probes = (await raw(r.id)) as { probes: Record<string, StoredProbe> };
    expect(Object.keys(probes.probes).sort()).toEqual([...keys].sort());
  });

  it("rewriting a key replaces only that key's verdict", async () => {
    // The fresh 403 must win over the old 200 for the SAME key — and nothing else moves.
    const r = await row({ probes: { "org:org-a:s4hana:k": PROBE_A, other: PROBE_B } });
    await persistStoredProbe(r.id, "org:org-a:s4hana:k", PROBE_B);
    expect(await raw(r.id)).toEqual({ probes: { "org:org-a:s4hana:k": PROBE_B, other: PROBE_B } });
  });

  it("a deleted row is written to nobody, not an error", async () => {
    expect(await persistStoredProbe(`${RUN}-no-such-row`, "k", PROBE_A)).toBe(0);
  });

  it("the Rebuild's provenance refresh keeps every stored probe on the row", async () => {
    // Trigger (4): a Rebuild overlapping a probe run reverted every org's entries.
    const r = await row({ source: "curated", key: "po", probes: { "org:org-a:s4hana:k": PROBE_A } });
    // A probe lands AFTER the Rebuild would have taken its snapshot…
    await persistStoredProbe(r.id, "org:org-b:s4hana:k", PROBE_B);
    // …and the Rebuild's write merges only the keys it owns.
    await refreshApiProvenance([r.externalId]);
    expect(await raw(r.id)).toEqual({
      source: "SapApiReference",
      apiId: r.externalId,
      key: "po",
      probes: { "org:org-a:s4hana:k": PROBE_A, "org:org-b:s4hana:k": PROBE_B },
    });
  });

  it("the provenance refresh fills an empty column and touches only API rows it names", async () => {
    const empty = await row(undefined);
    const notNamed = await row({ source: "x" });
    const event = await row({ source: "bundled:EVENT" }, "EVENT" as SapHubContentType);
    await refreshApiProvenance([empty.externalId, event.externalId]);
    expect(await raw(empty.id)).toEqual({ source: "SapApiReference", apiId: empty.externalId });
    expect(await raw(notNamed.id)).toEqual({ source: "x" });
    expect(await raw(event.id)).toEqual({ source: "bundled:EVENT" });
    expect(await refreshApiProvenance([])).toBe(0);
  });
});
