/**
 * ABeam Workbench — the P4 capture pipeline's gates.
 *
 * These are the rules the method doc calls hard, and they are the ones a tired
 * consultant at 5pm would click past. So they are pure functions, tested
 * exhaustively, and enforced in the write path rather than the wizard.
 */

import { describe, expect, it } from "vitest";

import {
  SENSITIVE_SHARE_THRESHOLD,
  checkPromotion,
  isSharedVisible,
  quarterOf,
  type PromotionInput,
} from "@/lib/discovery/workbench/capture";

const AUTHOR = "user-author";
const REVIEWER = "user-reviewer";

function input(over: Partial<PromotionInput> = {}): PromotionInput {
  return {
    captureId: "cap-1",
    type: "T1-variant",
    name: "Milestone-based staged invoicing (variant)",
    description: "Invoice in stages tied to delivery milestones.",
    linkedProcessId: "18J",
    observedIndustry: "FMCG distribution",
    sensitive: false,
    authoredById: AUTHOR,
    reviewedById: REVIEWER,
    anonymizationConfirmed: true,
    ...over,
  };
}

describe("§5.5 — the second-reviewer gate", () => {
  it("passes with a distinct reviewer", () => {
    expect(checkPromotion(input())).toBeNull();
  });

  it("refuses with no reviewer", () => {
    const r = checkPromotion(input({ reviewedById: "" }));
    expect(r?.reason).toBe("reviewer_missing");
  });

  it("refuses when the reviewer IS the author — the point of the rule", () => {
    // P4 §5.5: "the author of a capture is the worst judge of whether it still
    // identifies the client". A field that merely has *a* value satisfies the
    // form and defeats the gate.
    const r = checkPromotion(input({ reviewedById: AUTHOR }));
    expect(r?.reason).toBe("reviewer_is_author");
    expect(r && "message" in r && r.message).toMatch(/different consultant/);
  });
});

describe("§5 items 1–2 — the anonymization checklist gate", () => {
  it("refuses unless explicitly confirmed", () => {
    const r = checkPromotion(input({ anonymizationConfirmed: false }));
    expect(r?.reason).toBe("anonymization_unconfirmed");
  });

  it("is not defaulted true anywhere in the input", () => {
    // The wizard makes it a required step; this asserts the write path refuses
    // regardless of what the UI let through.
    expect(checkPromotion(input({ anonymizationConfirmed: false }))).not.toBeNull();
  });
});

describe("§5.3 — the aggregation threshold", () => {
  it("threshold is 2 independent clients", () => {
    expect(SENSITIVE_SHARE_THRESHOLD).toBe(2);
  });

  it("a NON-sensitive promotion is shared immediately", () => {
    expect(isSharedVisible({ sensitive: false, observedCount: 1 })).toBe(true);
  });

  it("a sensitive promotion is register-only at count 1", () => {
    // One client's competitively distinctive practice is their secret, not
    // industry practice.
    expect(isSharedVisible({ sensitive: true, observedCount: 1 })).toBe(false);
  });

  it("a sensitive promotion becomes shared at count 2", () => {
    expect(isSharedVisible({ sensitive: true, observedCount: 2 })).toBe(true);
    expect(isSharedVisible({ sensitive: true, observedCount: 5 })).toBe(true);
  });

  it("count 0 never shares a sensitive pattern", () => {
    expect(isSharedVisible({ sensitive: true, observedCount: 0 })).toBe(false);
  });
});

describe("placement rules (P4 §3 / §4)", () => {
  it("T1/T2/T4 must attach to a real library process", () => {
    expect(checkPromotion(input({ linkedProcessId: null }))?.reason).toBe("unknown_process");
    expect(checkPromotion(input({ linkedProcessId: "NOPE" }))?.reason).toBe("unknown_process");
  });

  it("T3 net-new must NOT attach to one", () => {
    expect(checkPromotion(input({ type: "T3-process", linkedProcessId: "18J" }))?.reason).toBe(
      "bad_input",
    );
    expect(checkPromotion(input({ type: "T3-process", linkedProcessId: null }))).toBeNull();
  });

  it("a generalized name and description are required", () => {
    expect(checkPromotion(input({ name: "  " }))?.reason).toBe("bad_input");
    expect(checkPromotion(input({ description: "" }))?.reason).toBe("bad_input");
  });

  it("the observed industry is required — it is the asset's denominator", () => {
    expect(checkPromotion(input({ observedIndustry: "" }))?.reason).toBe("bad_input");
  });
});

describe("provenance shape (P4 §4)", () => {
  it("quarters are recorded at quarter granularity, not a date", () => {
    // Sharper than a quarter starts narrowing toward identification.
    expect(quarterOf(new Date("2026-07-17T00:00:00Z"))).toBe("2026-Q3");
    expect(quarterOf(new Date("2026-01-01T00:00:00Z"))).toBe("2026-Q1");
    expect(quarterOf(new Date("2026-12-31T00:00:00Z"))).toBe("2026-Q4");
  });
});

/**
 * The dual-record split (P4 §4) — the shared entry must never be able to carry
 * client identity.
 */
describe("dual records: the shared entry cannot carry attribution", () => {
  it("the shared entry model has no clientRef, rawText or engagement link", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const model = /model DiscoveryPromotedEntry \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
    expect(model.length).toBeGreaterThan(0);

    for (const field of ["clientRef", "rawText", "engagementId"]) {
      expect(model, `the shared entry must not carry ${field}`).not.toMatch(
        new RegExp(`^\\s*${field}\\b`, "m"),
      );
    }
  });

  it("the register keeps attribution, so the split is real", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const schema = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");
    const model = /model DiscoveryCapture \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
    expect(model).toMatch(/^\s*clientRef\b/m);
    expect(model).toMatch(/^\s*rawText\b/m);
  });

  it("promotedEntries() selects no attribution", async () => {
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const src = readFileSync(join(process.cwd(), "src/lib/discovery/workbench/capture.ts"), "utf8");
    const fn = /export async function promotedEntries[\s\S]*?\n}\n/.exec(src)?.[0] ?? "";
    expect(fn.length).toBeGreaterThan(0);
    // An explicit select, so a new column cannot ride along into a shared read.
    expect(fn).toContain("select:");
    for (const field of ["clientRef", "rawText", "capture:", "engagement"]) {
      expect(fn, `promotedEntries must not select ${field}`).not.toContain(field);
    }
  });
});

/**
 * The architectural directive: the committed JSON is byte-frozen. The wizard
 * writes to tables, and the library views compose.
 */
describe("the wizard never writes to the committed library", () => {
  it("no capture/promotion code writes to src/data/discovery", async () => {
    const { readFileSync, readdirSync, statSync } = await import("fs");
    const { join } = await import("path");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(n)) files.push(p);
      }
    };
    walk(join(process.cwd(), "src/lib/discovery"));
    walk(join(process.cwd(), "src/app/api/discovery"));

    const writers = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return /writeFileSync|writeFile|appendFile|fs\.promises\.write/.test(src);
    });
    expect(writers, "nothing may write to the committed library").toEqual([]);
  });
});
