/** Unit tests for the brand-role mechanism (spec §5.7).
 *
 * Critical invariant: the Aptus solution brand identity (mark, cover band,
 * table headers, thumbnail bands) MUST never inherit a client override.
 * Only chart accents may take the override. These tests guard against drift
 * if a future BrandRole is added or the switch in brandColor() is edited
 * carelessly. */

import { describe, it, expect } from "vitest";
import {
  APTUS_BRAND,
  APTUS_BRAND_TEXT,
  DEFAULT_BRANDING,
  brandColor,
  brandColorRgb,
  clientAccentOrNull,
  hexToRgb,
  isValidHex,
  type BrandRole,
  type BrandingConfig,
} from "@/lib/report/branding";

const APTUS_ONLY: BrandingConfig = { ...DEFAULT_BRANDING };

const WITH_BURSA_BLUE: BrandingConfig = {
  ...DEFAULT_BRANDING,
  clientAccent: "#003DA5",
};

const LOCKED_ROLES: BrandRole[] = [
  "aptus-mark",
  "cover-band",
  "table-header",
  "thumbnail-band",
];

const ACCENT_ROLES: BrandRole[] = [
  "score-ring",
  "chart-accent",
  "phase-segment",
  "secondary-rule",
];

describe("Aptus brand constants", () => {
  it("APTUS_BRAND is the canonical solution brand color", () => {
    expect(APTUS_BRAND).toBe("#0B0B0F");
  });

  it("APTUS_BRAND_TEXT is white (foreground on dark cover band)", () => {
    expect(APTUS_BRAND_TEXT).toBe("#FFFFFF");
  });

  it("DEFAULT_BRANDING.clientAccent is null (no override by default)", () => {
    expect(DEFAULT_BRANDING.clientAccent).toBeNull();
  });
});

describe("brandColor — LOCKED roles (spec §5.7: never overridden)", () => {
  for (const role of LOCKED_ROLES) {
    it(`${role} returns APTUS_BRAND with no client accent`, () => {
      expect(brandColor(APTUS_ONLY, role)).toBe(APTUS_BRAND);
    });

    it(`${role} STILL returns APTUS_BRAND even when client accent is set`, () => {
      expect(brandColor(WITH_BURSA_BLUE, role)).toBe(APTUS_BRAND);
    });
  }
});

describe("brandColor — OPTIONAL ACCENT roles (spec §5.7)", () => {
  for (const role of ACCENT_ROLES) {
    it(`${role} falls back to APTUS_BRAND when no client accent`, () => {
      expect(brandColor(APTUS_ONLY, role)).toBe(APTUS_BRAND);
    });

    it(`${role} returns the client accent when one is configured`, () => {
      expect(brandColor(WITH_BURSA_BLUE, role)).toBe("#003DA5");
    });
  }
});

describe("brandColorRgb — returns parseable RGB tuple for jsPDF", () => {
  it("returns the Aptus brand RGB for a locked role", () => {
    expect(brandColorRgb(APTUS_ONLY, "cover-band")).toEqual([11, 11, 15]);
  });

  it("returns the client accent RGB for an accent role with override", () => {
    expect(brandColorRgb(WITH_BURSA_BLUE, "score-ring")).toEqual([0, 61, 165]);
  });

  it("ignores client accent for locked roles even with override set", () => {
    expect(brandColorRgb(WITH_BURSA_BLUE, "table-header")).toEqual([11, 11, 15]);
  });
});

describe("clientAccentOrNull", () => {
  it("returns null when no override", () => {
    expect(clientAccentOrNull(APTUS_ONLY)).toBeNull();
  });

  it("returns the hex when override set", () => {
    expect(clientAccentOrNull(WITH_BURSA_BLUE)).toBe("#003DA5");
  });
});

describe("hexToRgb", () => {
  it("parses #003DA5 → {r:0, g:61, b:165}", () => {
    expect(hexToRgb("#003DA5")).toEqual({ r: 0, g: 61, b: 165 });
  });

  it("works without leading #", () => {
    expect(hexToRgb("0B0B0F")).toEqual({ r: 11, g: 11, b: 15 });
  });

  it("parses lowercase", () => {
    expect(hexToRgb("#15803d")).toEqual({ r: 21, g: 128, b: 61 });
  });
});

describe("isValidHex — input validator for client-accent form", () => {
  it("accepts #RRGGBB", () => {
    expect(isValidHex("#003DA5")).toBe(true);
    expect(isValidHex("#0B0B0F")).toBe(true);
    expect(isValidHex("#15803d")).toBe(true);
  });

  it("rejects shorthand #RGB", () => {
    expect(isValidHex("#03A")).toBe(false);
  });

  it("rejects alpha #RRGGBBAA", () => {
    expect(isValidHex("#003DA5FF")).toBe(false);
  });

  it("rejects missing #", () => {
    expect(isValidHex("003DA5")).toBe(false);
  });

  it("rejects non-hex characters", () => {
    expect(isValidHex("#GGGGGG")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidHex("")).toBe(false);
  });
});
