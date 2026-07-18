/**
 * ABeam Workbench — the two-lane export, tested by CONSTRUCTION (brief §9.3).
 *
 * The plan's words: "client pack serializer reuses PR-1 allowlist so it *cannot*
 * contain the product map — test by construction, not by review."
 *
 * So this generates BOTH artifacts against a mocked client and asserts on the
 * real bytes: the client pack scans clean against the vendor-term guard, and the
 * internal pack demonstrably carries the map. If the client pack ever came back
 * dirty, the wall would have failed at the last inch — the one that ends in a
 * client's inbox.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ENGAGEMENT_ID = "eng-pack-1";
const SECRET_NOTE = "PRIVATE facilitator note — the CFO is worried about SAP licensing";
const CLIENT_RAW = "We invoice PETRONAS-style milestone billing per the JDA";
const CLIENT_REF = "CRM-2026-014";
const DIFFER_REASON = "We invoice in stages tied to delivery milestones, not all at once.";

const db = {
  engagement: {
    id: ENGAGEMENT_ID,
    client: "Pack Test Co",
    state: "submitted",
    valueStreamIds: ["VS2"],
  },
  decisions: [
    { processId: "22Z", status: "standard", reason: null },
    { processId: "18J", status: "differ", reason: DIFFER_REASON },
    { processId: "22K", status: "discuss", reason: null },
  ],
  productMaps: [{ processId: "18J", oracleRef: "ORA-P2P-01", netsuiteRef: null, otherRef: null }],
  captures: [
    {
      type: "T1-variant",
      rawText: CLIENT_RAW,
      clientRef: CLIENT_REF,
      linkedProcessId: "18J",
      status: "candidate",
      promotedAs: null,
    },
  ],
  notes: [{ processId: "18J", body: SECRET_NOTE }],
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    discoveryEngagement: { findUnique: async () => db.engagement },
    discoveryDecision: {
      findMany: async (args: { where?: { status?: string } }) =>
        args?.where?.status
          ? db.decisions.filter((d) => d.status === args.where!.status)
          : db.decisions,
    },
    discoveryProductMap: { findMany: async () => db.productMaps },
    discoveryCapture: { findMany: async () => db.captures },
    discoveryNote: { findMany: async () => db.notes },
  },
}));

const { buildClientPack, buildInternalPack } = await import("@/lib/discovery/workbench/packs");

const guardTerms: string[] = JSON.parse(
  readFileSync(join(process.cwd(), "src/data/discovery/vendor-term-guard.json"), "utf8"),
).terms;

/** Strip comments so a source scan matches CODE, not the prose documenting it. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/^\s*\*.*$/gm, "");
}

function vendorHits(text: string): Record<string, number> {
  const hits: Record<string, number> = {};
  for (const t of guardTerms) {
    const n =
      text.match(new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"))?.length ?? 0;
    if (n > 0) hits[t] = n;
  }
  return hits;
}

beforeEach(() => vi.clearAllMocks());

describe("the client pack is neutral by construction (INVARIANT 1)", () => {
  it("scans clean against every vendor term", async () => {
    const pack = await buildClientPack(ENGAGEMENT_ID);
    // The generated artifact, not the source that made it.
    expect(vendorHits(JSON.stringify(pack))).toEqual({});
  });

  it("the scan is not vacuous — it catches a vendor term in the same shape", () => {
    expect(vendorHits(JSON.stringify({ a: "we run SAP and Oracle" }))).toEqual({ SAP: 1, Oracle: 1 });
  });

  it("carries no product map, notes, park detail, or capture register", async () => {
    const raw = JSON.stringify(await buildClientPack(ENGAGEMENT_ID));
    expect(raw).not.toContain(SECRET_NOTE);
    expect(raw).not.toContain(CLIENT_RAW);
    expect(raw).not.toContain(CLIENT_REF);
    expect(raw).not.toContain("ORA-P2P-01");
    for (const key of ["productMap", "captureRegister", "notes", "clientRef", "rawText"]) {
      expect(raw, `client pack must not contain "${key}"`).not.toContain(key);
    }
  });

  it("its TYPE has nowhere to put the map — the wall is the shape, not a filter", async () => {
    const pack = (await buildClientPack(ENGAGEMENT_ID))!;
    expect(Object.keys(pack).sort()).toEqual(
      [
        "client",
        "coverage",
        "decided",
        "draft",
        "generated",
        "incomplete",
        "lane",
        "processCount",
        "provenance",
        "scoped",
        "streams",
        "totals",
      ].sort(),
    );
    expect(pack.lane).toBe("client");
  });

  it("the client's OWN words come back to them — that is theirs to see", async () => {
    const pack = (await buildClientPack(ENGAGEMENT_ID))!;
    const differ = pack.streams.flatMap((s) => s.processes).find((p) => p.id === "18J");
    expect(differ?.reason).toBe(DIFFER_REASON);
  });

  it("honours the session scope", async () => {
    const pack = (await buildClientPack(ENGAGEMENT_ID))!;
    // Scoped to VS2 — one stream, not ten.
    expect(pack.streams).toHaveLength(1);
    expect(pack.streams[0]!.id).toBe("VS2");
    expect(pack.scoped).toBe(true);
  });

  it("is honest about being a draft", async () => {
    const pack = (await buildClientPack(ENGAGEMENT_ID))!;
    // 3 decided of 61 in VS2 — a pack that looked final here would lie.
    expect(pack.draft).toBe(true);
    expect(pack.decided).toBe(3);
  });

  it("flags the incomplete differ rather than hiding it", async () => {
    // 18J is a differ WITH a reason, so it is complete; make one without.
    db.decisions.push({ processId: "1QR", status: "differ", reason: null });
    const pack = (await buildClientPack(ENGAGEMENT_ID))!;
    expect(pack.incomplete).toBe(1);
    db.decisions.pop();
  });
});

describe("the internal pack carries the fence", () => {
  it("contains the product map", async () => {
    const pack = (await buildInternalPack(ENGAGEMENT_ID))!;
    expect(pack.lane).toBe("internal");
    expect(pack.productMap.length).toBe(742);
    expect(pack.productMap.find((r) => r.scopeId === "18J")?.oracle).toBe("ORA-P2P-01");
  });

  it("derives SAP the same way C6 does — never a stored fill", async () => {
    const pack = (await buildInternalPack(ENGAGEMENT_ID))!;
    // A base-catalogue process references itself…
    expect(pack.productMap.find((r) => r.scopeId === "31G")?.sap).toBe("31G");
    expect(pack.productMap.find((r) => r.scopeId === "18J")?.sap).toBe("18J");
    // …and every overlay process is honestly unmapped.
    const overlayRows = pack.productMap.filter((r) => r.sap === null);
    expect(overlayRows.length).toBe(88);
  });

  it("contains the capture register WITH attribution", async () => {
    const raw = JSON.stringify(await buildInternalPack(ENGAGEMENT_ID));
    expect(raw).toContain(CLIENT_RAW);
    expect(raw).toContain(CLIENT_REF);
    expect(raw).toContain(SECRET_NOTE);
  });

  it("carries its own guard copy", async () => {
    const pack = (await buildInternalPack(ENGAGEMENT_ID))!;
    expect(pack.guard).toContain("never send this file to the client");
  });

  it("COMPOSES the client pack rather than rebuilding it", async () => {
    // So the two lanes can never disagree about what a decision says.
    const client = await buildClientPack(ENGAGEMENT_ID);
    const internal = await buildInternalPack(ENGAGEMENT_ID);
    expect(internal!.client.streams).toEqual(client!.streams);
  });
});

describe("two serializers, not one with a flag (§9.3)", () => {
  it("buildClientPack has no reference to the product map at all", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/discovery/workbench/packs.ts"), "utf8");
    const fn = /export async function buildClientPack[\s\S]*?\n}\n/.exec(stripComments(src))?.[0] ?? "";
    expect(fn.length).toBeGreaterThan(0);
    // Not "filters it out" — cannot see it.
    for (const forbidden of ["discoveryProductMap", "discoveryNote", "discoveryCapture"]) {
      expect(fn, `buildClientPack must not touch ${forbidden}`).not.toContain(forbidden);
    }
  });

  it("neither builder takes an include/omit flag", () => {
    // Comments stripped first: the module's own header explains why a single
    // builder with such a flag would be wrong, and naming the anti-pattern in
    // prose is not committing it. (Fourth time a scan of mine has matched its
    // own documentation — see D10, PR-3's notes guard, D14's meta scan.)
    const src = stripComments(
      readFileSync(join(process.cwd(), "src/lib/discovery/workbench/packs.ts"), "utf8"),
    );
    expect(src).not.toMatch(/includeProductMap|withProductMap|internal\s*[?:]\s*boolean/);
  });
});
