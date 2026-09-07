/**
 * End-to-end chains — the L1 layer's only input.
 *
 * Two failures live here, and both were found by a real engagement rather than
 * by reading the code:
 *
 *   1. A finance bid scoped to Accounts Receivable (J59) drew the Order-to-Cash
 *      SALES chain, because chain selection matched on ONE shared item. The L1
 *      page of a finance pack opened on "Sales Inquiry".
 *   2. The file held exactly one chain, so every finance engagement fell back
 *      to a pseudo-chain or to somebody else's process.
 *
 * The tests below pin the fix and, more importantly, pin the honesty rule that
 * comes with it: chain ORDER is a consultant assertion, not an SAP citation,
 * and every chain must say so in its own source line.
 */
import { describe, expect, it } from "vitest";

import {
  CHAIN_MIN_PATH_HITS,
  E2E_CHAINS,
  E2E_CHAINS_ORDERING_CAVEAT,
  chainPathHits,
  chainsForScope,
} from "@/lib/tobe/chains";
import { L1_CAVEAT, shortAppLabel } from "@/lib/tobe/svg";
import type { TobeChain } from "@/lib/tobe/types";

const chain = (id: string, path: string[]): TobeChain => ({
  id,
  name: id,
  valueStreamId: "finance",
  path,
  alternates: [],
  source: "test fixture",
});

describe("chainsForScope", () => {
  const chains = [chain("a", ["P", "Q", "R", "S"]), chain("b", ["X", "Y", "Z"])];

  it("does not draw a chain off a single shared item", () => {
    // The exact shape of the bug: one item in common is a shared item, not
    // evidence that the client runs the process.
    expect(chainsForScope(["S", "M1", "M2"], chains).map((c) => c.id)).toEqual([]);
  });

  it("draws a chain once two of its path items are in scope", () => {
    expect(chainsForScope(["R", "S"], chains).map((c) => c.id)).toEqual(["a"]);
  });

  it("draws every chain the scope set genuinely runs", () => {
    expect(chainsForScope(["P", "Q", "X", "Y", "Z"], chains).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("counts only path items, never alternates: a variation cannot prove the chain", () => {
    const withAlt: TobeChain = {
      ...chain("c", ["P", "Q"]),
      alternates: [{ id: "alt", from: "P", via: ["V1", "V2"], to: "Q", note: "n" }],
    };
    expect(chainsForScope(["V1", "V2"], [withAlt])).toEqual([]);
    expect(chainsForScope(["P", "Q"], [withAlt]).map((c) => c.id)).toEqual(["c"]);
  });

  it("never demands more hits than the chain has items", () => {
    const short = chain("d", ["ONE"]);
    expect(chainsForScope(["ONE"], [short]).map((c) => c.id)).toEqual(["d"]);
  });

  it("returns nothing for an empty scope set rather than everything", () => {
    expect(chainsForScope([], chains)).toEqual([]);
    expect(chainsForScope([], E2E_CHAINS)).toEqual([]);
  });

  it("honours a caller-supplied threshold", () => {
    expect(chainsForScope(["S"], chains, 1).map((c) => c.id)).toEqual(["a"]);
    expect(chainsForScope(["P", "Q"], chains, 3)).toEqual([]);
  });
});

describe("chainPathHits", () => {
  it("counts path items in scope and ignores repeats in the scope set", () => {
    expect(chainPathHits(chain("a", ["P", "Q", "R"]), ["Q", "Q", "R", "ZZ"])).toBe(2);
  });
});

describe("the shipped chain file", () => {
  it("has no duplicate chain ids and no duplicate item inside one path", () => {
    const ids = E2E_CHAINS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of E2E_CHAINS) expect(new Set(c.path).size).toBe(c.path.length);
  });

  it("gives every chain a path long enough for the threshold to mean something", () => {
    for (const c of E2E_CHAINS) expect(c.path.length).toBeGreaterThanOrEqual(CHAIN_MIN_PATH_HITS);
  });

  it("anchors every alternate to items that are actually on its chain's path", () => {
    // An alternate that leaves from a code the chain does not contain draws an
    // arrow from nowhere.
    for (const c of E2E_CHAINS)
      for (const a of c.alternates) {
        expect(c.path, `${c.id}/${a.id} from`).toContain(a.from);
        expect(c.path, `${c.id}/${a.id} to`).toContain(a.to);
        expect(a.via.length, `${c.id}/${a.id} via`).toBeGreaterThan(0);
      }
  });

  it("uses scope-item codes in SAP's own shape, never a placeholder", () => {
    const codes = E2E_CHAINS.flatMap((c) => [...c.path, ...c.alternates.flatMap((a) => a.via)]);
    for (const code of codes) expect(code).toMatch(/^[0-9A-Z]{3}$/);
  });

  it("states a source on every chain, and never claims SAP published the order", () => {
    for (const c of E2E_CHAINS) {
      expect(c.source.length, c.id).toBeGreaterThan(10);
      // A chain authored here must say the ordering is ours. The one pilot
      // chain predates the finance set and names its own definition document.
      if (c.source.startsWith("WS16")) {
        expect(c.source, c.id).toMatch(/consultant-asserted, not SAP-published/);
      }
    }
    expect(E2E_CHAINS_ORDERING_CAVEAT).toMatch(/consultant-asserted/);
  });

  it("carries the caveat into the rendered L1, where a reader will actually see it", () => {
    expect(L1_CAVEAT).toMatch(/not an SAP publication/);
  });
});

describe("the finance chains against a real finance scope set", () => {
  // The 55 scope items of the three-entity ERP Finance engagement.
  const FINANCE_SCOPE = [
    "16R", "18J", "19E", "19M", "1BS", "1EG", "1EZ", "1F1", "1GA", "1GB", "1GP", "1HB",
    "1J2", "1MV", "1NT", "1S0", "1SG", "1Z6", "22Z", "2EQ", "2F2", "2FM", "2I3", "2LH",
    "2PD", "2QL", "2QY", "2TW", "2V7", "3L5", "3ZB", "40Y", "4PG", "4RC", "4X8", "5HG",
    "5W2", "5XU", "78L", "7MJ", "BD6", "BDQ", "BFA", "BFC", "BFH", "BKL", "BMD", "BNX",
    "J54", "J58", "J59", "J60", "J62", "J77", "J78",
  ];

  it("draws the finance chains and NOT the sales chain", () => {
    const ids = chainsForScope(FINANCE_SCOPE).map((c) => c.id);
    expect(ids).toContain("p2p-requisition-to-payment");
    expect(ids).toContain("r2r-close-to-consolidation");
    expect(ids).toContain("fin-cash-and-bank");
    // The regression itself: J59 is in scope, and that alone must not pull in
    // Sales Inquiry → Sales Quotation → Sell from Stock.
    expect(ids).not.toContain("o2c-sales");
  });

  it("names only scope items the engagement actually holds", () => {
    const inScope = new Set(FINANCE_SCOPE);
    for (const c of chainsForScope(FINANCE_SCOPE))
      for (const code of [...c.path, ...c.alternates.flatMap((a) => a.via)])
        expect(inScope, `${c.id} names ${code}`).toContain(code);
  });

  it("still draws the sales chain for the scope set that does run it", () => {
    expect(chainsForScope(["1IQ", "BDG", "BD9", "J59", "2ET"]).map((c) => c.id)).toEqual([
      "o2c-sales",
    ]);
  });
});

describe("shortAppLabel", () => {
  it("leaves a label that already fits", () => {
    expect(shortAppLabel("Manage Catalog Items (F3149)", 30)).toBe("Manage Catalog Items (F3149)");
  });

  it("keeps the Fiori app ID and elides the title, not the other way round", () => {
    // The defect: plain truncation made every Requisitioning box read
    // "My Purchase…", which identifies nothing, because the whole scope item
    // is purchase requisitions. The ID is the half that disambiguates.
    const out = shortAppLabel("My Purchase Requisitions (F1639A)", 25);
    expect(out).toContain("(F1639A)");
    expect(out.length).toBeLessThanOrEqual(25);
    expect(out).not.toBe("My Purchase…");
  });

  it("falls back to the ID alone when there is no room for any title", () => {
    expect(shortAppLabel("Something Very Long Indeed (F1639A)", 10)).toBe("(F1639A)");
  });

  it("truncates plainly when the label carries no ID", () => {
    const out = shortAppLabel("A label with no identifier at all", 12);
    expect(out.length).toBeLessThanOrEqual(12);
    expect(out.endsWith("…")).toBe(true);
  });

  it("never returns an empty string for a non-empty label", () => {
    for (const s of ["x", "(F1)", "abc def (G12345)"]) expect(shortAppLabel(s, 6).length).toBeGreaterThan(0);
  });
});
