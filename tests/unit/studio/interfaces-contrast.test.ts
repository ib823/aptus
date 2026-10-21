/**
 * Studio · Interfaces — the token pairs its contrast fix relies on, in light
 * and dark, computed from the shipping stylesheet.
 *
 * WHAT WAS WRONG. An axe scan of the populated screen failed in both themes:
 *
 *   - Light: the selected row's secondary line was --ink-muted on
 *     --brand-navy-soft, 4.44:1. The Mapping card was drawn at opacity 0.55,
 *     which blends every ink into the page: 3.71:1, 2.11:1 and 2.61:1.
 *   - Dark: the selected row rendered light text on a LIGHT ground, 1.05:1,
 *     because the .dark block never redefined --brand-navy-soft and it stayed
 *     #E6EBF1. The Mapping card was 2.51:1.
 *
 * WHY HERE, AND WHY COMPUTED. The cause of the dark failure was a token, so the
 * fix is a token, and a token is shared: --brand-navy-soft is the selected,
 * active or "in progress" ground on dozens of surfaces (the Studio top bar's
 * avatar, Control Tower's audit filters, the manual's navigation, the affirm
 * and discovery pills). So the pairs are asserted on the VALUES the stylesheet
 * declares, resolved through the same var() chain the browser follows, rather
 * than restated here: a test that hard-codes the hex it checks passes after
 * someone changes the stylesheet. tests/unit/coreedge/token-contrast.test.ts
 * does the same for the CoreEdge scope, which this file deliberately does not
 * read — .coreedge carries its own complete token set.
 *
 * The global dark palette is written in oklch(), so this file converts it to
 * sRGB (OKLab → linear sRGB → gamma, clamped and rounded to 8 bits as the
 * browser paints it) before measuring. The converted values reproduce the
 * colours axe reported on the rendered page (#e5e5e5, #171717 composited,
 * #585858 composited), which is the check that the conversion is right.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const CSS = readFileSync(path.resolve(process.cwd(), "src/app/globals.css"), "utf8");

/* ── Reading the stylesheet ──────────────────────────────────────────────── */

/** Every top-level block whose selector line is exactly `selector {`, in source order. */
function blocks(selector: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\n)${escaped} \\{([\\s\\S]*?)\\n\\}`, "g");
  const found = [...CSS.matchAll(re)].map((m) => m[1]!);
  if (found.length === 0) throw new Error(`selector not found: ${selector}`);
  return found;
}

function declarations(bodies: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const body of bodies) {
    // Comments first: several of them quote declarations ("#C4C4C4 on paper").
    const code = body.replace(/\/\*[\s\S]*?\*\//g, "");
    for (const m of code.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) out.set(m[1]!, m[2]!.trim());
  }
  return out;
}

const ROOT = declarations(blocks(":root"));
/** `.dark` is declared twice in globals.css; the later block wins, as in the cascade. */
const DARK_ONLY = declarations(blocks(".dark"));
const DARK = new Map([...ROOT, ...DARK_ONLY]);

type Theme = "light" | "dark";
const THEMES: readonly Theme[] = ["light", "dark"];
const scope = (theme: Theme) => (theme === "light" ? ROOT : DARK);

/** Follow var() references the way the browser does, to a literal colour. */
function resolve(theme: Theme, name: string, seen: readonly string[] = []): string {
  if (seen.includes(name)) throw new Error(`var() cycle: ${[...seen, name].join(" → ")}`);
  const value = scope(theme).get(name);
  if (value === undefined) throw new Error(`--${name} is not declared for ${theme}`);
  const ref = /^var\(--([a-z0-9-]+)\s*(?:,[^)]*)?\)$/.exec(value);
  return ref ? resolve(theme, ref[1]!, [...seen, name]) : value;
}

/* ── Colour ──────────────────────────────────────────────────────────────── */

type RGB = readonly [number, number, number];

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const byte = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255);

function oklch(l: number, c: number, h: number): RGB {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    byte(toGamma(4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_)),
    byte(toGamma(-1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_)),
    byte(toGamma(-0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_)),
  ];
}

function parse(value: string): RGB {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const h = hex[1]!;
    return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as unknown as RGB;
  }
  const ok = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value);
  if (ok) return oklch(Number(ok[1]), Number(ok[2]), Number(ok[3]));
  throw new Error(`not an opaque #rrggbb or oklch() colour: ${value}`);
}

const color = (theme: Theme, name: string) => parse(resolve(theme, name));
const hexOf = (c: RGB) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;

function luminance([r, g, b]: RGB): number {
  return 0.2126 * toLinear(r / 255) + 0.7152 * toLinear(g / 255) + 0.0722 * toLinear(b / 255);
}

function contrast(fg: RGB, bg: RGB): number {
  const [x, y] = [luminance(fg), luminance(bg)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Source-over compositing at `alpha`, as `opacity` paints an element. */
function over(fg: RGB, bg: RGB, alpha: number): RGB {
  return fg.map((v, i) => Math.round(v * alpha + bg[i]! * (1 - alpha))) as unknown as RGB;
}

const ratio = (theme: Theme, fg: string, bg: string) =>
  Number(contrast(color(theme, fg), color(theme, bg)).toFixed(2));

const TEXT_FLOOR = 4.5;
const NON_TEXT_FLOOR = 3;

/* ── The pairs ───────────────────────────────────────────────────────────── */

describe("the conversion reproduces what axe measured on the page", () => {
  it("the dark inks and grounds are the colours the scan reported", () => {
    expect(hexOf(color("dark", "ink-primary"))).toBe("#e5e5e5");
    // The old Mapping card: --surface-ink-tint at opacity 0.55 over the page.
    const card = over(color("dark", "surface-ink-tint"), color("dark", "surface-cream"), 0.55);
    expect(hexOf(card)).toBe("#171717");
    expect(hexOf(over(color("dark", "ink-muted"), color("dark", "surface-cream"), 0.55))).toBe("#585858");
  });
});

describe("--brand-navy-soft has a dark value of its own", () => {
  it("differs from the light value", () => {
    // The root cause: undeclared in .dark, the light #E6EBF1 survived under the
    // dark theme's light inks.
    expect(DARK_ONLY.has("brand-navy-soft")).toBe(true);
    expect(resolve("dark", "brand-navy-soft")).not.toBe(resolve("light", "brand-navy-soft"));
  });

  it("is darker than the inks that sit on it in dark, as the light value is lighter in light", () => {
    for (const theme of THEMES) {
      const ground = luminance(color(theme, "brand-navy-soft"));
      const ink = luminance(color(theme, "ink-primary"));
      expect(theme === "light" ? ground > ink : ground < ink, theme).toBe(true);
    }
  });

  it("the defect it fixes was 1.05:1 — the light ground under the dark theme's ink", () => {
    expect(Number(contrast(color("dark", "ink-primary"), color("light", "brand-navy-soft")).toFixed(2))).toBe(1.05);
  });
});

describe("Interfaces · the selected row, in both themes", () => {
  it.each(THEMES)("%s: name, operation and version cells (--ink-primary) clear the text floor", (theme) => {
    expect(ratio(theme, "ink-primary", "brand-navy-soft")).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });

  it.each(THEMES)("%s: the secondary line (--ink-secondary when selected) clears the text floor", (theme) => {
    expect(ratio(theme, "ink-secondary", "brand-navy-soft")).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });

  it.each(THEMES)("%s: the selection bar (--brand-navy) clears the non-text floor on the row", (theme) => {
    // The non-colour cue: a bar beside the selected name, so selection does not
    // rest on the row's fill alone — which in dark is 1.37:1 from the page.
    expect(ratio(theme, "brand-navy", "brand-navy-soft")).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
  });

  it.each(THEMES)("%s: an unselected row's secondary line (--ink-muted on the page) clears it too", (theme) => {
    expect(ratio(theme, "ink-muted", "surface-cream")).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });

  /*
   * WHY THE SELECTED LINE SWITCHES TO --ink-secondary, PINNED.
   * --ink-muted on --brand-navy-soft is 4.45:1 in light — under the floor by a
   * hair, and that is the pair the scan caught. It is not fixed by moving
   * either token: --ink-muted is tuned to the page grounds and --brand-navy-soft
   * is shared by every selected state in the product. If this ever clears, the
   * Interfaces switch is no longer needed and this assertion says so.
   */
  it("light: --ink-muted on --brand-navy-soft is 4.45:1, below the floor", () => {
    expect(ratio("light", "ink-muted", "brand-navy-soft")).toBe(4.45);
    expect(ratio("light", "ink-muted", "brand-navy-soft")).toBeLessThan(TEXT_FLOOR);
  });
});

describe("Interfaces · the Mapping card, in both themes", () => {
  /*
   * Disabled by design, but its text is read: it says WHY the card is inert
   * ("not in this version", and that mappingVersion stays null). WCAG's
   * exemption is for inactive UI components, and nothing here is a component.
   * So the card is quiet by surface and copy — --surface-ink-tint and a dashed
   * edge — and every ink on it is at full strength.
   */
  it.each(THEMES)("%s: heading (--ink-primary), aside (--ink-muted) and body (--ink-secondary)", (theme) => {
    for (const ink of ["ink-primary", "ink-muted", "ink-secondary"]) {
      expect(ratio(theme, ink, "surface-ink-tint"), `${ink} on surface-ink-tint`).toBeGreaterThanOrEqual(TEXT_FLOOR);
    }
  });

  it("at the old opacity of 0.55 the same inks failed, as the scan reported", () => {
    // Why opacity is not the way to say "disabled" on a card people read.
    const fade = (theme: Theme, ink: string) => {
      const page = color(theme, "surface-cream");
      return contrast(over(color(theme, ink), page, 0.55), over(color(theme, "surface-ink-tint"), page, 0.55));
    };
    expect(fade("light", "ink-muted")).toBeLessThan(2.2);
    expect(fade("light", "ink-secondary")).toBeLessThan(2.7);
    expect(fade("light", "ink-primary")).toBeLessThan(TEXT_FLOOR);
    expect(fade("dark", "ink-muted")).toBeLessThan(2.6);
  });
});

describe("every other pair --brand-navy-soft carries, in dark", () => {
  /*
   * The inks found on a --brand-navy-soft ground across the app (grep for
   * navy-soft and --brand-navy-soft): --brand-navy (pills, chips, the Studio
   * avatar, active filters and nav items), --ink-primary / --ink-secondary /
   * --ink-muted (glossary, guides, capture fields, hovered rows), --cta-red
   * (the sample-sandbox card). All of them flip with the theme. Before this
   * token had a dark value every one of these sat on #E6EBF1 under a light ink
   * and failed; with it, every one clears the floor.
   */
  const INKS = ["brand-navy", "ink-primary", "ink-secondary", "ink-muted", "cta-red"] as const;

  it.each(INKS)("--%s on --brand-navy-soft", (ink) => {
    expect(ratio("dark", ink, "brand-navy-soft")).toBeGreaterThanOrEqual(TEXT_FLOOR);
  });

  it.each(INKS)("--%s on the light ground it used to get in dark, for the record", (ink) => {
    expect(contrast(color("dark", ink), color("light", "brand-navy-soft"))).toBeLessThan(TEXT_FLOOR);
  });

  it("and the light pairs are untouched: the token keeps #E6EBF1 in light", () => {
    expect(resolve("light", "brand-navy-soft")).toBe("#E6EBF1");
  });
});
