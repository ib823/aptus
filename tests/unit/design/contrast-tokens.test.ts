/**
 * The colour tokens have to clear WCAG, and the ratios have to be checkable.
 *
 * `--ink-muted` was #8A8A8A — 3.45:1 on paper, against a 4.5:1 body-text
 * minimum — and it carries scope-item identifiers and SAP process-step names at
 * 10-11px on the client-facing affirm page. A fix existed but was scoped to
 * [data-sap-explorer] to avoid re-baselining visual snapshots; no snapshot
 * covers any Workbench surface, so the scoping bought nothing.
 *
 * `--shadow-focus-ring` drew 3px of `--cta-red-focus`, a #FBE9EC tint at
 * 1.17:1. That token could not simply be darkened because it is ALSO the
 * background behind CTA-red text, so the ring and the tint are now separate.
 *
 * These are parsed from globals.css rather than restated here. A test that
 * hardcodes the hex it is checking passes after someone changes the stylesheet.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const CSS = readFileSync(
  path.resolve(process.cwd(), "src/app/globals.css"),
  "utf8",
);

/** Read a `--token: #RRGGBB;` declaration from the :root-level block. */
function token(name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})\\s*;`).exec(CSS);
  if (!m) throw new Error(`token --${name} not found as a 6-digit hex in globals.css`);
  return m[1]!;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r!) + 0.7152 * channel(g!) + 0.0722 * channel(b!);
}

function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)];
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

const PAPER = () => token("surface-paper");
const CREAM = () => token("surface-cream");

/** WCAG 2.2: body text 4.5:1; non-text UI (incl. focus indicators) 3:1. */
const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

describe("text tokens clear AA on both surfaces", () => {
  const textTokens = ["ink-primary", "ink-secondary", "ink-muted"];

  for (const name of textTokens) {
    it(`--${name} is at least ${AA_TEXT}:1 on paper and cream`, () => {
      const fg = token(name);
      expect(contrast(fg, PAPER()), `${name} on paper`).toBeGreaterThanOrEqual(AA_TEXT);
      expect(contrast(fg, CREAM()), `${name} on cream`).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }

  it("--ink-muted is no longer the #8A8A8A that failed", () => {
    // Named explicitly: this is the regression, and a future edit that walks
    // it back should fail on the value as well as on the ratio.
    expect(token("ink-muted").toUpperCase()).not.toBe("#8A8A8A");
  });

  it("--ink-disabled is exempt, and is only ever used for disabled text", () => {
    // Disabled controls are excluded from the contrast minimum by WCAG 1.4.3.
    // Asserted so the exemption is a stated decision rather than an omission.
    expect(contrast(token("ink-disabled"), PAPER())).toBeLessThan(AA_TEXT);
  });
});

describe("the focus indicator is visible", () => {
  it("--focus-ring clears the 3:1 non-text minimum on paper and cream", () => {
    const ring = token("focus-ring");
    expect(contrast(ring, PAPER())).toBeGreaterThanOrEqual(AA_NON_TEXT);
    expect(contrast(ring, CREAM())).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it("the ring shadow is drawn with --focus-ring, not the pale CTA tint", () => {
    const decl = /--shadow-focus-ring:\s*([^;]+);/.exec(CSS)?.[1] ?? "";
    expect(decl).toContain("--focus-ring");
    expect(decl, "cta-red-focus is a background tint, not an indicator").not.toContain(
      "--cta-red-focus",
    );
  });

  it("--cta-red-focus stays light, because CTA-red text sits on top of it", () => {
    // bg-cta-focus text-cta appears in ContextChip, PresentFollower and the
    // inline error banner. Darkening this token to fix the ring would have
    // made all of them unreadable.
    expect(contrast(token("cta-red"), token("cta-red-focus"))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe("decision colours clear AA as text", () => {
  for (const name of ["decision-standard", "decision-configure", "decision-custom"]) {
    it(`--${name} is readable on paper`, () => {
      expect(contrast(token(name), PAPER())).toBeGreaterThanOrEqual(AA_TEXT);
    });
  }
});

describe("status pills are readable against their own backgrounds", () => {
  /*
   * Each pill sets both halves, so neither can be checked against paper — the
   * pair is the thing. `expired` sat at 4.42:1 and `nocheck` at 2.95:1, the
   * latter on a chip whose whole job is to say "not yet probed" clearly.
   */
  const PILLS = [
    "draft",
    "sent",
    "awaiting",
    "signed",
    "expired",
    "revoked",
    "nocheck",
  ];

  for (const name of PILLS) {
    it(`status-${name} clears ${AA_TEXT}:1`, () => {
      expect(contrast(token(`status-${name}-fg`), token(`status-${name}-bg`))).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    });
  }
});
