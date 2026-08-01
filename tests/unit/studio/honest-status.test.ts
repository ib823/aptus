/**
 * Honest-status contract — the product law of the CoreEdge console.
 *
 * Two things are pinned here:
 *   1. Every one of the seven honest statuses maps to an EXISTING status token
 *      pair. No invented colours: the chip must be visually identical to the rest
 *      of the app's status vocabulary.
 *   2. The seven statuses are visually distinguishable where it matters — in
 *      particular ACTIVATED (proven 200), NEEDS_SETUP (401/403) and NOT_CHECKED
 *      (never probed) must never collapse onto the same token, because the entire
 *      point of the contract is that "empty", "not set up" and "unknown" are
 *      different claims.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { studioStatusLabel, type HonestStatus } from "@/components/studio/StudioStatusChip";

const ALL: HonestStatus[] = [
  "ACTIVATED",
  "NEEDS_SETUP",
  "AVAILABLE",
  "NOT_PROBEABLE",
  "REFERENCE",
  "NOT_CHECKED",
  "NOT_FOUND",
];

const chipSource = readFileSync(
  path.resolve(process.cwd(), "src/components/studio/StudioStatusChip.tsx"),
  "utf8",
);
const globalsCss = readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");

/** The token pair each status is required to use (Bible §6). */
const EXPECTED_TOKENS: Record<HonestStatus, string> = {
  ACTIVATED: "--status-signed",
  NEEDS_SETUP: "--status-awaiting",
  AVAILABLE: "--status-sent",
  NOT_PROBEABLE: "--status-expired",
  REFERENCE: "--status-draft",
  NOT_CHECKED: "--status-nocheck",
  NOT_FOUND: "--status-revoked",
};

describe("honest-status token mapping", () => {
  it("maps every status to its agreed token pair", () => {
    for (const status of ALL) {
      const token = EXPECTED_TOKENS[status];
      const line = chipSource
        .split("\n")
        .find((l) => l.trimStart().startsWith(`${status}:`));
      expect(line, `${status} must have a token mapping`).toBeDefined();
      expect(line, `${status} must use ${token}-bg/fg`).toContain(`${token}-bg`);
      expect(line).toContain(`${token}-fg`);
    }
  });

  it("uses no hardcoded hex colours — tokens only", () => {
    // A literal hex in the chip would drift from the design system the moment a
    // token changes (and would break dark mode, which redefines the tokens).
    const hexes = chipSource.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexes).toEqual([]);
  });

  it("keeps ACTIVATED, NEEDS_SETUP and NOT_CHECKED on distinct tokens", () => {
    const distinct = new Set([
      EXPECTED_TOKENS.ACTIVATED,
      EXPECTED_TOKENS.NEEDS_SETUP,
      EXPECTED_TOKENS.NOT_CHECKED,
    ]);
    expect(distinct.size).toBe(3);
  });

  it("gives every status a human label", () => {
    for (const status of ALL) {
      const label = studioStatusLabel(status);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toBe(status); // not just the raw enum shouted at the user
    }
  });
});

describe("--status-nocheck-* token", () => {
  it("is defined in globals.css for light AND dark", () => {
    // NOT_CHECKED had no named var before Studio; it must exist in both themes or
    // the chip renders unstyled in one of them.
    // The exact hex is NOT asserted here any more. #8A8A8A was 2.95:1 against
    // this chip's own background — the worst pair in the set, on a chip whose
    // whole job is to say "not yet probed" clearly — and pinning the value here
    // meant a contrast fix had to fight a test that only cared the token
    // existed. contrast-tokens.test.ts owns the ratio; this owns the presence.
    expect(globalsCss).toMatch(/--status-nocheck-bg:\s*#[0-9A-Fa-f]{6}/);
    expect(globalsCss).toMatch(/--status-nocheck-fg:\s*#[0-9A-Fa-f]{6}/);
    const darkBlock = globalsCss.slice(globalsCss.indexOf(".dark"));
    expect(darkBlock).toContain("--status-nocheck-bg:");
    expect(darkBlock).toContain("--status-nocheck-fg:");
  });
});
