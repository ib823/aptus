/**
 * The CoreEdge token scope, and the contrast figures the design states.
 *
 * WHAT THIS IS FOR. `docs/coreedge/design/A2-tokens-v2.1-patch.css` corrects
 * three values and adds four, and every correction is justified by a measured
 * ratio. Those figures are the whole argument for the change — "A2 shipped
 * #3A4454 in dark, 1.72:1, under even the 3:1 non-text floor, so inputs read as
 * plain text" is a claim that can be checked, and if it stops being true after
 * someone edits a value, the token is wrong and the comment is lying.
 *
 * So this file recomputes them. It reads the SHIPPING stylesheet
 * (src/app/coreedge-tokens.css) rather than the design file, because the
 * shipping one is what renders; a separate test below asserts the two agree.
 *
 * EVERY RATIO IS MEASURED AGAINST THE SURFACE THE TOKEN ACTUALLY RENDERS ON,
 * which is why --ink-disabled is quoted on the nocheck chip and
 * --status-inreview-fg on the sent chip rather than both on the page ground.
 * Measuring a chip foreground against the page behind the chip reports a number
 * nobody ever sees. Getting this wrong is easy and the figures do not survive
 * it — the handoff's numbers reproduce to the second decimal only on the right
 * grounds, which is itself evidence they were measured honestly.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SHIPPED = readFileSync(path.resolve(ROOT, "src/app/coreedge-tokens.css"), "utf8");
const A2 = readFileSync(
  path.resolve(ROOT, "docs/coreedge/design/A2-coreedge-tokens-v2.css"),
  "utf8",
);
const PATCH = readFileSync(
  path.resolve(ROOT, "docs/coreedge/design/A2-tokens-v2.1-patch.css"),
  "utf8",
);

/* ── WCAG 2.1 relative luminance and contrast ────────────────────────────── */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  return (
    0.2126 * channel(Number.parseInt(h.slice(0, 2), 16)) +
    0.7152 * channel(Number.parseInt(h.slice(2, 4), 16)) +
    0.0722 * channel(Number.parseInt(h.slice(4, 6), 16))
  );
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Round the way a contrast checker reports, so the assertions read as stated. */
const ratio = (fg: string, bg: string) => Number(contrast(fg, bg).toFixed(2));

/* ── Reading a token out of a block of the shipping stylesheet ───────────── */

/**
 * Blocks are matched by their exact selector line. `.coreedge` alone would also
 * match `.coreedge[data-theme="dark"]` under a loose regex, and silently reading
 * the dark value while claiming to test the light one is precisely the class of
 * error this file exists to catch elsewhere.
 */
function block(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const found = re.exec(css);
  if (!found) throw new Error(`selector not found: ${selector}`);
  return found[1]!;
}

function token(css: string, selector: string, name: string): string {
  const body = block(css, selector);
  const re = new RegExp(`--${name}\\s*:\\s*([^;]+);`);
  const found = re.exec(body);
  if (!found) throw new Error(`--${name} not declared in ${selector}`);
  return found[1]!.trim();
}

const LIGHT = ".coreedge";
const DARK = '.coreedge[data-theme="dark"],\n.dark .coreedge';

const light = (name: string) => token(SHIPPED, LIGHT, name);
const dark = (name: string) => token(SHIPPED, DARK, name);

/* ── The figures the design states ───────────────────────────────────────── */

describe("the v2.1 patch's stated ratios reproduce", () => {
  it("--focus-ring-navy dark is 8.67:1 on --surface-cream", () => {
    // Focus is not a status: navy in both themes, because red is reserved for
    // irreversible actions and a focus ring is not one.
    expect(ratio(dark("focus-ring-navy"), dark("surface-cream"))).toBe(8.67);
  });

  it("--ink-disabled dark is 5.55:1 on --status-nocheck-bg", () => {
    // A disabled label carries the REASON a control is unavailable — it is read,
    // so it clears the 4.5:1 text floor rather than the 3:1 non-text one.
    expect(ratio(dark("ink-disabled"), dark("status-nocheck-bg"))).toBe(5.55);
  });

  it("--border-strong dark is 3.73:1 on --surface-paper", () => {
    // A border is non-text: 3:1. A2's #3A4454 was 1.72:1, so an input's edge
    // was invisible and the field read as plain text.
    expect(ratio(dark("border-strong"), dark("surface-paper"))).toBe(3.73);
  });

  it("--status-inreview-fg dark is 8.15:1 on --status-sent-bg", () => {
    // A2 had no dark value at all; the light literal #1E40AF survived the theme
    // map at 1.94:1 on paper.
    expect(ratio(dark("status-inreview-fg"), dark("status-sent-bg"))).toBe(8.15);
  });

  it("the values A2 shipped really were as bad as the patch says", () => {
    // The justification is half the patch. If these "before" figures do not
    // reproduce, the corrections were argued from numbers nobody can check.
    expect(ratio("#5A5A5A", dark("surface-ink-tint"))).toBe(2.26); // ink-disabled
    expect(ratio("#3A4454", dark("surface-paper"))).toBe(1.72); // border-strong
    expect(ratio("#1E40AF", dark("surface-paper"))).toBe(1.94); // status-inreview-fg
    expect(ratio("#C4C4C4", light("surface-ink-tint"))).toBe(1.56); // ink-disabled, light
  });
});

/* ── The floors, in both themes ──────────────────────────────────────────── */

const TEXT_FLOOR = 4.5;
const NON_TEXT_FLOOR = 3;

describe("every status pair clears the text floor, in both themes", () => {
  const PAIRS = [
    "draft",
    "sent",
    "awaiting",
    "signed",
    "expired",
    "revoked",
    "nocheck",
  ] as const;

  it.each(PAIRS)("light: --status-%s-fg on its own bg", (name) => {
    expect(ratio(light(`status-${name}-fg`), light(`status-${name}-bg`))).toBeGreaterThanOrEqual(
      TEXT_FLOOR,
    );
  });

  it.each(PAIRS)("dark: --status-%s-fg on its own bg", (name) => {
    expect(ratio(dark(`status-${name}-fg`), dark(`status-${name}-bg`))).toBeGreaterThanOrEqual(
      TEXT_FLOOR,
    );
  });
});

describe("ink clears the text floor on every surface it is read on", () => {
  const SURFACES = ["surface-cream", "surface-paper", "surface-ink-tint"] as const;
  const INK = ["ink-primary", "ink-secondary", "ink-muted"] as const;

  it.each(INK)("light: --%s", (ink) => {
    for (const surface of SURFACES) {
      expect(
        ratio(light(ink), light(surface)),
        `${ink} on ${surface}`,
      ).toBeGreaterThanOrEqual(TEXT_FLOOR);
    }
  });

  it.each(INK)("dark: --%s", (ink) => {
    for (const surface of SURFACES) {
      expect(ratio(dark(ink), dark(surface)), `${ink} on ${surface}`).toBeGreaterThanOrEqual(
        TEXT_FLOOR,
      );
    }
  });

  it("--ink-disabled clears it too, in both themes", () => {
    // The one piece of "greyed out" text that is not decorative: it is where the
    // reason lives, and the design's rule is that a disabled control keeps its
    // reason as a sibling string rather than a title attribute. Unreadable text
    // in the one place the explanation lives is the failure this prevents.
    expect(ratio(light("ink-disabled"), light("surface-ink-tint"))).toBeGreaterThanOrEqual(
      TEXT_FLOOR,
    );
    expect(ratio(dark("ink-disabled"), dark("status-nocheck-bg"))).toBeGreaterThanOrEqual(
      TEXT_FLOOR,
    );
  });
});

describe("the focus ring clears the non-text floor, in both themes", () => {
  it.each(["surface-cream", "surface-paper", "surface-ink-tint"] as const)(
    "light: on --%s",
    (surface) => {
      expect(ratio(light("focus-ring-navy"), light(surface))).toBeGreaterThanOrEqual(
        NON_TEXT_FLOOR,
      );
    },
  );

  it.each(["surface-cream", "surface-paper", "surface-ink-tint"] as const)(
    "dark: on --%s",
    (surface) => {
      expect(ratio(dark("focus-ring-navy"), dark(surface))).toBeGreaterThanOrEqual(NON_TEXT_FLOOR);
    },
  );
});

describe("--border-strong: dark clears the non-text floor, light does NOT", () => {
  it("dark clears it, which is what the patch was for", () => {
    expect(ratio(dark("border-strong"), dark("surface-paper"))).toBeGreaterThanOrEqual(
      NON_TEXT_FLOOR,
    );
  });

  /*
   * A KNOWN GAP, PINNED RATHER THAN HIDDEN.
   *
   * The patch raised the DARK value specifically to clear 3:1, giving the
   * reason "so inputs read as plain text". The same reason applies to the light
   * value and the handoff does not address it: #C4BFAE is 1.84:1 on
   * --surface-paper, well under the same floor.
   *
   * This is not fixed here. Choosing a replacement is a design decision, not a
   * transcription, and inventing one would put a colour in the product that no
   * design review has seen. What this test does is make the gap FAIL LOUDLY THE
   * DAY SOMEBODY CHANGES IT — in either direction. Raise the token and this
   * assertion breaks, telling you to delete it and move the value into the
   * clearing test above; leave it alone and the number stays visible in CI
   * rather than only in a document nobody opens.
   */
  it("light is 1.84:1 — below the floor, unchanged from A2, and awaiting a design decision", () => {
    expect(ratio(light("border-strong"), light("surface-paper"))).toBe(1.84);
    expect(ratio(light("border-strong"), light("surface-paper"))).toBeLessThan(NON_TEXT_FLOOR);
  });
});

/* ── The dark chip grounds carry almost no information ───────────────────── */

describe("in dark, the chip background is not the signal", () => {
  it("all fifteen pairs of the six status grounds sit between 1.01:1 and 1.10:1", () => {
    /*
     * The finding that makes "every status renders a glyph" a COMPONENT
     * CONTRACT rather than a styling preference. If two chips' backgrounds are
     * within 1.1:1 of each other, colour alone cannot tell them apart — so the
     * glyph (✓ i … ✕ –) and the foreground are the entire signal.
     *
     * Asserted here, on the token values, because it is a property OF THE
     * PALETTE. A component test can check that a glyph is rendered; only this
     * can show why it has to be.
     */
    const grounds = [
      "status-draft-bg",
      "status-sent-bg",
      "status-awaiting-bg",
      "status-signed-bg",
      "status-revoked-bg",
      "status-nocheck-bg",
    ].map((n) => dark(n));

    const pairs: number[] = [];
    for (let i = 0; i < grounds.length; i++) {
      for (let j = i + 1; j < grounds.length; j++) {
        pairs.push(ratio(grounds[i]!, grounds[j]!));
      }
    }

    expect(pairs).toHaveLength(15);
    expect(Math.min(...pairs)).toBeGreaterThanOrEqual(1.0);
    expect(Math.max(...pairs)).toBeLessThanOrEqual(1.1);
  });

  it("but every foreground is distinguishable from its own ground", () => {
    // Which is the other half of the same point: the pair works, the grounds
    // alone do not.
    for (const name of ["draft", "sent", "awaiting", "signed", "revoked", "nocheck"]) {
      expect(
        ratio(dark(`status-${name}-fg`), dark(`status-${name}-bg`)),
        `${name} in dark`,
      ).toBeGreaterThanOrEqual(TEXT_FLOOR);
    }
  });
});

/* ── The shipping stylesheet matches the design files ────────────────────── */

describe("the shipped scope does not drift from the design", () => {
  /** A2 declares dark as `:root[data-theme="dark"]`; the patch uses the same. */
  const a2Light = (name: string) => token(A2, ":root", name);
  const a2Dark = (name: string) => token(A2, ':root[data-theme="dark"]', name);
  const patchLight = (name: string) => token(PATCH, ":root", name);
  const patchDark = (name: string) => token(PATCH, ':root[data-theme="dark"]', name);

  const PATCHED = ["focus-ring-navy", "ink-disabled", "border-strong", "status-inreview-fg"];

  it("carries A2's value for every token the patch does NOT touch", () => {
    const unpatched = [
      "brand-navy",
      "cta-red",
      "surface-cream",
      "surface-paper",
      "surface-ink-tint",
      "surface-rail",
      "ink-primary",
      "ink-secondary",
      "ink-muted",
      "border-default",
      "success",
      "warning",
      "danger",
      "info",
      "status-draft-bg",
      "status-sent-fg",
      "status-signed-fg",
      "status-revoked-fg",
      "decision-standard",
      "radius-pill",
      "rail-width",
      "topbar-height",
    ];
    for (const name of unpatched) {
      expect(light(name), `${name} (light)`).toBe(a2Light(name));
    }
    for (const name of unpatched.filter((n) => /^(brand|cta|surface|ink|border|success|warning|danger|info|status)/.test(n))) {
      expect(dark(name), `${name} (dark)`).toBe(a2Dark(name));
    }
  });

  it("carries the PATCH's value for every token it does touch", () => {
    for (const name of PATCHED) {
      expect(light(name), `${name} (light)`).toBe(patchLight(name));
      expect(dark(name), `${name} (dark)`).toBe(patchDark(name));
    }
  });

  it("and those four genuinely differ from A2 where the patch says they do", () => {
    // Otherwise the previous test would pass trivially against an unchanged A2.
    expect(light("ink-disabled")).not.toBe(a2Light("ink-disabled"));
    expect(dark("ink-disabled")).not.toBe(a2Dark("ink-disabled"));
    expect(dark("border-strong")).not.toBe(a2Dark("border-strong"));
    // --status-inreview-fg did not exist in A2 at all.
    expect(() => a2Light("status-inreview-fg")).toThrow();
  });

  it("declares the four tokens A2 never had", () => {
    for (const name of ["rail-hover", "rail-active", "status-inreview-fg", "dur-skeleton"]) {
      expect(() => light(name), `${name} must be declared`).not.toThrow();
      expect(() => a2Light(name), `${name} must be absent from A2`).toThrow();
    }
  });

  it("keeps --dur-skeleton off the --dur-* transition scale", () => {
    // A loading pulse is a loop, not a transition that finishes. Sharing a value
    // with --dur-hero would invite someone to "simplify" them into one token.
    const skeleton = Number.parseInt(light("dur-skeleton"), 10);
    for (const step of ["dur-snap", "dur-calm", "dur-hero"]) {
      expect(skeleton).toBeGreaterThan(Number.parseInt(light(step), 10));
    }
  });

  it("gives the rail fills one alpha value, declared once and NOT restated in dark", () => {
    /*
     * Alpha over --surface-rail rather than a hex, which is the whole reason one
     * value serves both themes — the rail is the one surface that does not
     * invert, so a wash over it lands correctly either way.
     *
     * NOT RESTATING THEM IN THE DARK BLOCK IS THE POINT, not an omission. The
     * dark block declares only what CHANGES; a value repeated in both places is
     * a value someone can edit in one and not the other, which is exactly the
     * failure the alpha choice was made to avoid. This test asserts the absence
     * deliberately, so "helpfully" adding them back fails here.
     */
    expect(light("rail-hover")).toBe("rgba(255, 255, 255, 0.08)");
    expect(light("rail-active")).toBe("rgba(255, 255, 255, 0.12)");
    expect(() => dark("rail-hover")).toThrow();
    expect(() => dark("rail-active")).toThrow();
  });

  it("restates in dark only what actually differs", () => {
    /*
     * The general form of the rule above. Every token the dark block declares
     * must differ from its light value — a dark block that repeats a light value
     * is either dead weight or, worse, a second place to forget.
     */
    const darkBody = block(SHIPPED, DARK);
    const declared = [...darkBody.matchAll(/--([a-z0-9-]+)\s*:/g)].map((m) => m[1]!);
    expect(declared.length).toBeGreaterThan(20);
    for (const name of declared) {
      if (name === "focus-ring") continue; // an alias onto --focus-ring-navy; identical text, different target
      expect(dark(name), `--${name} is restated in dark but is unchanged`).not.toBe(light(name));
    }
  });
});
