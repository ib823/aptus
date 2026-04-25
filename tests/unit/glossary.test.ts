/** Unit tests for the plain-language report glossary (spec §2.5).
 *
 * The glossary is the single source of truth for SAP-term-to-client-language
 * translations. These tests guard against drift: every ResolutionType must
 * have an entry, every "What it means for you" sentence must obey the voice
 * ladder, and the canonical labels must not be silently renamed. */

import { describe, it, expect } from "vitest";
import {
  DOT_HEX,
  DOT_TINT_HEX,
  FIT_STATUS_ENTRY,
  GLOSSARY_ENTRIES,
  OUTCOME,
  dotHex,
  dotTintHex,
  fitStatusDot,
  fitStatusLabel,
  outcomeDot,
  outcomeLabel,
  outcomeMeans,
} from "@/lib/report/glossary";
import type { FitStatus, ResolutionType } from "@/types/assessment";

const ALL_RESOLUTION_TYPES: ResolutionType[] = [
  "FIT",
  "CONFIGURE",
  "ADAPT_PROCESS",
  "ISV",
  "KEY_USER_EXT",
  "BTP_EXT",
  "CUSTOM_ABAP",
  "OUT_OF_SCOPE",
];

const ALL_FIT_STATUSES: FitStatus[] = [
  "FIT",
  "CONFIGURE",
  "GAP",
  "NA",
  "PENDING",
];

describe("OUTCOME — every ResolutionType has a complete entry", () => {
  for (const rt of ALL_RESOLUTION_TYPES) {
    it(`${rt} has term, label, explanation, dot, whatItMeansForYou`, () => {
      const entry = OUTCOME[rt];
      expect(entry.term).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.explanation).toBeTruthy();
      expect(entry.dot).toBeTruthy();
      expect(entry.whatItMeansForYou).toBeTruthy();
    });
  }
});

describe("Canonical labels — these are the strings the client sees, do not rename silently", () => {
  it.each([
    ["FIT", "Standard SAP"],
    ["CONFIGURE", "Configurable"],
    ["ADAPT_PROCESS", "Adapt to SAP"],
    ["ISV", "Trusted add-on"],
    ["KEY_USER_EXT", "Power-user extension"],
    ["BTP_EXT", "Cloud add-on (BTP)"],
    ["CUSTOM_ABAP", "Custom build"],
    ["OUT_OF_SCOPE", "Out of scope"],
  ] as const)("%s → %s", (rt, expected) => {
    expect(outcomeLabel(rt as ResolutionType)).toBe(expected);
  });
});

describe("Voice ladder — explanation length cap (spec §2.5: ≤ 18 words)", () => {
  for (const entry of GLOSSARY_ENTRIES) {
    it(`"${entry.label}" explanation is ≤ 18 words`, () => {
      const wordCount = entry.explanation.split(/\s+/).filter(Boolean).length;
      expect(wordCount).toBeLessThanOrEqual(18);
    });
  }
});

describe("Voice ladder — no abbreviated outcome labels (spec §5.4)", () => {
  it("no label uses 'ext' (must be 'extension')", () => {
    for (const entry of Object.values(OUTCOME)) {
      expect(entry.label).not.toMatch(/\bext\b/i);
      expect(entry.whatItMeansForYou ?? "").not.toMatch(/\bext\b/i);
    }
  });

  it("no label uses raw module codes (FI/CO, MM, SD, PP/WM)", () => {
    for (const entry of Object.values(OUTCOME)) {
      expect(entry.label).not.toMatch(/\b(FI\/CO|MM|SD|PP\/WM)\b/);
    }
  });
});

describe("FIT_STATUS_ENTRY — every FitStatus has an entry", () => {
  for (const fs of ALL_FIT_STATUSES) {
    it(`${fs} has a label and a dot tier`, () => {
      const entry = FIT_STATUS_ENTRY[fs];
      expect(entry.label).toBeTruthy();
      expect(entry.dot).toBeTruthy();
    });
  }
});

describe("Dot palette — matches print.css and APTUS-DESIGN-SPEC §5.2", () => {
  it("DOT_HEX values match the spec palette", () => {
    expect(DOT_HEX.success).toBe("#15803D");
    expect(DOT_HEX.warning).toBe("#B45309");
    expect(DOT_HEX.info).toBe("#1D4ED8");
    expect(DOT_HEX.danger).toBe("#B91C1C");
    expect(DOT_HEX.neutral).toBe("#52525B");
  });

  it("DOT_TINT_HEX values are 50-tone equivalents", () => {
    expect(DOT_TINT_HEX.success).toBe("#DCFCE7");
    expect(DOT_TINT_HEX.warning).toBe("#FEF3C7");
    expect(DOT_TINT_HEX.info).toBe("#DBEAFE");
    expect(DOT_TINT_HEX.danger).toBe("#FEE2E2");
    expect(DOT_TINT_HEX.neutral).toBe("#F4F4F5");
  });
});

describe("GLOSSARY_ENTRIES — printable §2.5 table", () => {
  it("contains exactly 20 entries (spec §2.5 v1.2 row count: 19 original + OData/API)", () => {
    expect(GLOSSARY_ENTRIES).toHaveLength(20);
  });

  it("starts with the 8 outcome variants in the spec order", () => {
    const first8Labels = GLOSSARY_ENTRIES.slice(0, 8).map((e) => e.label);
    expect(first8Labels).toEqual([
      "Standard SAP",
      "Configurable",
      "Adapt to SAP",
      "Trusted add-on",
      "Power-user extension",
      "Cloud add-on (BTP)",
      "Custom build",
      "Out of scope",
    ]);
  });

  it("includes OData / API (added in v1.2)", () => {
    const odata = GLOSSARY_ENTRIES.find((e) => e.term === "OData / API");
    expect(odata).toBeDefined();
    expect(odata?.label).toBe("Data feed");
  });
});

describe("Helpers", () => {
  it("outcomeMeans falls back to explanation when whatItMeansForYou is missing", () => {
    expect(outcomeMeans("FIT")).toBe(OUTCOME.FIT.whatItMeansForYou);
  });

  it("outcomeDot returns the correct tier", () => {
    expect(outcomeDot("FIT")).toBe("success");
    expect(outcomeDot("CUSTOM_ABAP")).toBe("danger");
    expect(outcomeDot("OUT_OF_SCOPE")).toBe("neutral");
  });

  it("fitStatusLabel translates to plain language", () => {
    expect(fitStatusLabel("FIT")).toBe("Standard SAP");
    expect(fitStatusLabel("GAP")).toBe("Needs work");
    expect(fitStatusLabel("NA")).toBe("Not applicable");
    expect(fitStatusLabel("PENDING")).toBe("Not yet reviewed");
  });

  it("fitStatusDot returns the correct tier", () => {
    expect(fitStatusDot("FIT")).toBe("success");
    expect(fitStatusDot("GAP")).toBe("danger");
    expect(fitStatusDot("CONFIGURE")).toBe("warning");
  });

  it("dotHex / dotTintHex are pure passthroughs", () => {
    expect(dotHex("success")).toBe("#15803D");
    expect(dotTintHex("danger")).toBe("#FEE2E2");
  });
});
