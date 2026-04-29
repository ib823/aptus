/**
 * Drift guard for the Aptus brand-asset single source of truth.
 *
 * `src/lib/brand/assets.ts` exports path-data constants that MUST stay
 * byte-identical to the canonical SVGs under `public/icons/`. If a designer
 * updates an SVG without bumping the constant (or vice versa), every PDF /
 * favicon / inline mark will drift apart silently. This test fails the
 * build the moment they diverge.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

import {
  APTUS_FAVICON_PATH_D,
  APTUS_LOCKUP_FONT_FAMILY,
  APTUS_LOCKUP_FONT_SIZE,
  APTUS_LOCKUP_FONT_WEIGHT,
  APTUS_LOCKUP_LETTER_SPACING,
  APTUS_LOCKUP_TEXT_X,
  APTUS_LOCKUP_TEXT_Y,
  APTUS_LOCKUP_VIEWBOX,
  APTUS_MARK_PATH_D,
} from "@/lib/brand/assets";

const PUBLIC_ICONS = path.join(process.cwd(), "public", "icons");

function extractPathD(svg: string): string {
  const match = svg.match(/d="([^"]+)"/);
  if (!match || !match[1]) throw new Error(`No path d attribute found in SVG`);
  return match[1];
}

function extractAttr(svg: string, attr: string): string | null {
  // Anchor on whitespace so `x` doesn't match inside `viewBox`, etc.
  const match = svg.match(new RegExp(`\\s${attr}="([^"]+)"`));
  return match && match[1] ? match[1] : null;
}

describe("brand assets — path drift guard", () => {
  it("APTUS_MARK_PATH_D matches public/icons/aptus-mark.svg", () => {
    const svg = readFileSync(path.join(PUBLIC_ICONS, "aptus-mark.svg"), "utf-8");
    expect(extractPathD(svg)).toBe(APTUS_MARK_PATH_D);
    expect(extractAttr(svg, "viewBox")).toBe("0 0 100 100");
  });

  it("APTUS_FAVICON_PATH_D matches public/icons/aptus-favicon.svg", () => {
    const svg = readFileSync(path.join(PUBLIC_ICONS, "aptus-favicon.svg"), "utf-8");
    expect(extractPathD(svg)).toBe(APTUS_FAVICON_PATH_D);
    expect(extractAttr(svg, "viewBox")).toBe("0 0 16 16");
  });

  it("APTUS_LOCKUP_* constants match public/icons/aptus-lockup.svg", () => {
    const svg = readFileSync(path.join(PUBLIC_ICONS, "aptus-lockup.svg"), "utf-8");
    expect(extractPathD(svg)).toBe(APTUS_MARK_PATH_D);
    expect(extractAttr(svg, "viewBox")).toBe(APTUS_LOCKUP_VIEWBOX);
    const text = svg.match(/<text[^>]*>([^<]+)<\/text>/);
    expect(text?.[1]).toBe("Aptus");
    expect(extractAttr(svg, "x")).toBe(String(APTUS_LOCKUP_TEXT_X));
    expect(extractAttr(svg, "y")).toBe(String(APTUS_LOCKUP_TEXT_Y));
    expect(extractAttr(svg, "font-size")).toBe(String(APTUS_LOCKUP_FONT_SIZE));
    expect(extractAttr(svg, "font-weight")).toBe(String(APTUS_LOCKUP_FONT_WEIGHT));
    expect(extractAttr(svg, "letter-spacing")).toBe(String(APTUS_LOCKUP_LETTER_SPACING));
    expect(extractAttr(svg, "font-family")).toBe(APTUS_LOCKUP_FONT_FAMILY);
  });
});
