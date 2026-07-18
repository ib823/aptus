/**
 * ABeam Workbench — the brief's verbatim copy is actually verbatim.
 *
 * §10 lists strings under "use exactly". This asserts them character-for-
 * character, so a well-meaning tweak ("we'll size it at the workshop") fails CI
 * instead of quietly changing a promise made to a client.
 *
 * These are not tautologies against src/lib/discovery/copy.ts: the expected
 * values below were transcribed from the brief, and the test's job is to catch
 * the day someone edits copy.ts. If the brief changes, both change — deliberately.
 */

import { describe, expect, it } from "vitest";

import {
  ALL_REVIEWED_BANNER,
  DIFFER_EXPECTATION_NOTE,
  FLOW_FOOTNOTE,
  NO_FLOW_FALLBACK,
  PROMISE_HERO,
  PROMISE_NOT_COMMITTED,
  PROMISE_V3,
  PROVENANCE_CLIENT,
  SYSTEM_LANE,
} from "@/lib/discovery/copy";
import { FIT_CHIP_CAPTIONS, FIT_CHIP_LABELS, FIT_LABELS } from "@/lib/discovery/fit";

describe("§10 verbatim promises", () => {
  it("hero", () => {
    expect(PROMISE_HERO).toBe("Your business on one page — before you pick a system.");
  });

  it("V3 promise", () => {
    expect(PROMISE_V3).toBe(
      "See how the standard runs your process, then tell us where you differ.",
    );
  });

  it("nothing is committed", () => {
    expect(PROMISE_NOT_COMMITTED).toBe("Nothing is committed — this is discovery, not a decision.");
  });

  it("differ expectation note", () => {
    expect(DIFFER_EXPECTATION_NOTE).toBe(
      "Noted — a difference here usually means extra build and testing, whichever product you choose. We'll size it in the workshop. Nothing is committed.",
    );
  });

  it("provenance keeps its second sentence — the product-agnostic promise", () => {
    expect(PROVENANCE_CLIENT).toBe(
      "Source: established ERP best-practice references, curated by ABeam and rendered product-neutral. The process is yours; the reference names no vendor.",
    );
    // §6/12's shorter form drops it; §10 is the use-exactly list and wins.
    expect(PROVENANCE_CLIENT).toContain("the reference names no vendor");
  });

  it("no-flow fallback", () => {
    expect(NO_FLOW_FALLBACK).toBe(
      "No step flow is catalogued for this process yet — we'll map it with you.",
    );
  });
});

describe("§6/19 flow footnote", () => {
  it("is the brief's string, without the .dc's appended sentence", () => {
    expect(FLOW_FOOTNOTE).toBe(
      "Steps are the standard happy-path; roles indicative — refine with client.",
    );
    expect(FLOW_FOOTNOTE).not.toContain("Click a step for detail");
  });

  it("names the blank-role lane exactly", () => {
    expect(SYSTEM_LANE).toBe("System / Automatic");
  });
});

describe("§7 V1 banner", () => {
  it("is verbatim", () => {
    expect(ALL_REVIEWED_BANNER).toBe("Every stream reviewed — ready for the workshop.");
  });
});

describe("§9 selector labels", () => {
  it("chip labels are the §9 table's Chip label column", () => {
    expect(FIT_CHIP_LABELS).toEqual({
      standard: "Runs as standard",
      differ: "We do this differently",
      discuss: "Discuss in workshop",
      na: "Not applicable",
    });
  });

  it("helper captions are the §9 table's Helper caption column", () => {
    expect(FIT_CHIP_CAPTIONS).toEqual({
      standard: "The standard flow fits how we work.",
      differ: "We have a specific requirement here.",
      discuss: "Unsure — raise it in the workshop.",
      na: "We don't run this process.",
    });
  });

  it("legend labels use the short differ form (§6/17, V4)", () => {
    // Two label sets on purpose — see fit.ts. The chip is first-person and
    // deliberate; the legend is compact. Conflict #15, corrected in PR-2b.
    expect(FIT_LABELS.differ).toBe("We differ");
    expect(FIT_CHIP_LABELS.differ).toBe("We do this differently");
  });
});

describe("no vendor terms in the copy module", () => {
  it("every exported string is vendor-free", async () => {
    const copy: Record<string, unknown> = await import("@/lib/discovery/copy");
    const { readFileSync } = await import("fs");
    const { join } = await import("path");
    const terms: string[] = JSON.parse(
      readFileSync(join(process.cwd(), "src/data/discovery/vendor-term-guard.json"), "utf8"),
    ).terms;

    const offenders: string[] = [];
    for (const [k, v] of Object.entries(copy)) {
      if (typeof v !== "string") continue;
      for (const t of terms) {
        if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(v)) {
          offenders.push(`${k} → ${t}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
