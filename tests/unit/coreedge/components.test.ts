/**
 * The component contracts hold across every CoreEdge component (PR-2).
 *
 * These are SOURCE-LEVEL assertions on purpose. The handoff calls them
 * "component contracts, not styling preferences", and a contract that only one
 * component honours is not a contract — so each rule is checked against every
 * file in the folder rather than against the component that happened to be
 * written first. A render test proves one component behaves; this proves the
 * next one cannot quietly not.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const DIR = path.resolve(ROOT, "src/components/coreedge");

const FILES = readdirSync(DIR)
  .filter((f) => f.endsWith(".tsx"))
  .sort();

function source(file: string): string {
  return readFileSync(path.join(DIR, file), "utf8");
}

/** Strips comments, so prose describing a rule is not mistaken for breaking it. */
function code(file: string): string {
  return source(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

describe("the folder", () => {
  it("holds the fourteen components the handoff inventories", () => {
    // "14 components. Everything in the designs is one of these — nothing is
    // bespoke to a screen."
    expect(FILES).toEqual([
      "CheckList.tsx",
      "CommandBar.tsx",
      "ConfirmDialog.tsx",
      "DecisionBar.tsx",
      "FieldPicker.tsx",
      "GateStrip.tsx",
      "LaneCard.tsx",
      "MaskedKey.tsx",
      "NeedsYouRow.tsx",
      "OpsTable.tsx",
      "Rail.tsx",
      "SkeletonRow.tsx",
      "StatusChip.tsx",
      "WhyTrace.tsx",
    ]);
  });
});

describe("the two name collisions stay apart", () => {
  /*
   * `OpsTable` also exists at src/components/ops/OpsChrome.tsx:291 and
   * `ConfirmDialog` at src/components/shared/ConfirmDialog.tsx. The build brief
   * chose to keep the new ones in this folder rather than rename either, so the
   * safety comes from neither side importing the other.
   */
  it("never imports from the existing console's component folders", () => {
    for (const file of FILES) {
      const src = code(file);
      for (const forbidden of ["components/ops", "components/shared", "components/studio"]) {
        expect(
          src.includes(forbidden),
          `${file} imports from ${forbidden}. The two OpsTables and the two ` +
            `ConfirmDialogs are different components for different consoles; ` +
            `importing across is how they become one by accident.`,
        ).toBe(false);
      }
    }
  });

  it("is not imported BY the existing console either", async () => {
    const { execFileSync } = await import("node:child_process");
    /*
     * IMPORT STATEMENTS ONLY. The first version of this grepped for the bare
     * string "components/coreedge" and flagged src/lib/coreedge/disabled.ts,
     * which names the folder in a doc comment. Describing where a rule applies
     * is not importing across it, and a test that cannot tell those apart
     * punishes the comments that explain the rule.
     */
    let hits = "";
    try {
      hits = execFileSync(
        "grep",
        [
          "-rIn",
          "-E",
          "(from|import|require)\\s*\\(?\\s*[\"']([^\"']*/)?components/coreedge",
          path.resolve(ROOT, "src"),
        ],
        { encoding: "utf8" },
      );
    } catch {
      hits = ""; // grep exits 1 when nothing matches, which is the pass case
    }
    const outside = hits
      .split("\n")
      .filter(Boolean)
      .filter((line) => !line.startsWith(path.join(ROOT, "src/components/coreedge/")));
    expect(
      outside,
      `The existing console imports the new one:\n${outside.join("\n")}`,
    ).toEqual([]);
  });
});

describe("every status carries a glyph", () => {
  it("resolves status wording through the vocabulary, never inline", () => {
    /*
     * The audit's finding: a status was mapped to colour in nine different
     * components, so the same condition was called different things on different
     * screens. Any component that renders a status has to read it from the one
     * vocabulary.
     */
    for (const file of ["StatusChip.tsx", "LaneCard.tsx"]) {
      expect(code(file)).toContain("status-vocabulary");
    }
  });

  it("gives StatusChip no way to turn the glyph off", () => {
    const src = code("StatusChip.tsx");
    expect(src).not.toMatch(/glyph\??\s*:\s*(boolean|false)/);
    expect(src).not.toMatch(/showGlyph|hideGlyph|withoutGlyph|noGlyph/);
  });

  it("gives StatusChip no way to override the label", () => {
    // The status IS the label; a `label` prop is how two screens end up calling
    // one condition two things.
    expect(code("StatusChip.tsx")).not.toMatch(/\blabel\??\s*:\s*string/);
  });
});

describe("disabled controls keep their reason and their tab stop", () => {
  it("never uses the `disabled` attribute, which removes the tab stop", () => {
    for (const file of FILES) {
      const src = code(file);
      // `aria-disabled` is the permitted form and must not trip this.
      const bare = src.match(/(?<!aria-)\bdisabled=\{?/g) ?? [];
      expect(
        bare,
        `${file} uses the disabled attribute. It removes the control from the ` +
          `tab order, so a keyboard user tabs past the thing they cannot use ` +
          `and never learns why. Use aria-disabled and refuse the click.`,
      ).toEqual([]);
    }
  });

  it("never puts an explanation in a title attribute", () => {
    for (const file of FILES) {
      expect(
        code(file).includes("title="),
        `${file} uses a title attribute. A tooltip is unreachable by touch and ` +
          `keyboard; the reason must be a sibling string.`,
      ).toBe(false);
    }
  });

  it("routes every disabled state through the one contract", () => {
    // The three components with disabled states all use the shared helper, so
    // the rules live in one file rather than three.
    for (const file of ["DecisionBar.tsx", "ConfirmDialog.tsx", "FieldPicker.tsx"]) {
      expect(code(file), `${file} does not use the shared disabled contract`).toContain(
        "coreedge/disabled",
      );
    }
  });

  it("points every blocked control at its reason with aria-describedby", () => {
    for (const file of ["DecisionBar.tsx", "ConfirmDialog.tsx", "FieldPicker.tsx"]) {
      const src = code(file);
      expect(src.includes("aria-describedby") || src.includes("blockedControlProps")).toBe(true);
    }
  });
});

describe("MaskedKey renders a reference, never a key", () => {
  const src = code("MaskedKey.tsx");

  it("has no prop that could carry a whole key", () => {
    expect(src).not.toMatch(/\b(secret|fullKey|plaintext|token|apiKey)\b/i);
  });

  it("has no reveal path at all", () => {
    // The one-time reveal is a different surface with a different guarantee
    // behind it (the claim link, PR-5 item 4). A component that CAN render a
    // secret will eventually be asked to.
    expect(src).not.toMatch(/reveal|unmask|showFull|plain/i);
  });

  it("takes the two halves separately, so a secret has nowhere to go", () => {
    expect(src).toMatch(/prefix:\s*string/);
    expect(src).toMatch(/tail:\s*string/);
  });

  it("never shows more than the last four characters", () => {
    expect(src).toContain("slice(-4)");
  });
});

describe("loading never blanks a known state", () => {
  it("offers a way to keep the last known value while refreshing", () => {
    // The handoff: "skeletons appear only where nothing has ever loaded", and
    // there is no "checking" status because it "would be a nineteenth
    // vocabulary entry for a transient".
    expect(code("SkeletonRow.tsx")).toContain("KeepLastKnown");
  });

  it("reaches for the skeleton only when there is nothing at all to show", () => {
    const src = code("SkeletonRow.tsx");
    // The fallback is the last branch: value, then lastKnown, then nothing.
    expect(src.indexOf("lastKnown !== undefined")).toBeLessThan(src.indexOf("return fallback"));
  });

  it("keeps OpsTable's empty and loading states apart", () => {
    /*
     * "No lanes match this filter" is a fact about the filter; a skeleton is a
     * fact about us. Collapsing them is how an operator concludes the estate is
     * empty during an outage.
     */
    const src = code("OpsTable.tsx");
    expect(src).toContain("loading");
    expect(src).toContain("empty");
    expect(src).toMatch(/loading !== undefined && rows\.length === 0/);
  });
});

describe("optimistic updates stay inside their three exceptions", () => {
  /*
   * The build brief permits them for exactly three things: rail badge counts,
   * flow step position, and text the user typed. Never a lane status, key,
   * approval or revocation — those are claims about the system, and a claim that
   * turns out false is worse than a slow one.
   */
  it("uses useOptimistic only where it is allowed", () => {
    const users = FILES.filter((f) => code(f).includes("useOptimistic"));
    expect(users).toEqual(["Rail.tsx"]);
  });

  it("never renders a lane status, key or decision optimistically", () => {
    for (const file of ["StatusChip.tsx", "LaneCard.tsx", "MaskedKey.tsx", "DecisionBar.tsx", "ConfirmDialog.tsx"]) {
      expect(code(file), `${file} must not use useOptimistic`).not.toContain("useOptimistic");
    }
  });
});

describe("copy comes from the deck", () => {
  it("imports its words rather than writing them, wherever it has words", () => {
    for (const file of ["LaneCard.tsx", "WhyTrace.tsx"]) {
      expect(code(file), `${file} should read its copy from copy.ts`).toContain("coreedge/copy");
    }
  });
});

describe("the rail uses on-navy inks", () => {
  /*
   * THE RAIL IS THE ONE SURFACE THAT DOES NOT INVERT — A2 keeps it navy in both
   * themes — so the inks that serve the page are wrong on it. The first version
   * of Rail.tsx used text-ink and text-ink-soft, which in light are #1A1A1A and
   * #4A4A4A: on #002B5C those measure 1.75:1 and 1.57:1 against a 4.5:1 floor.
   * Dark was fine, because --ink-primary is already light there — which is why
   * reading the token names is not enough and the axe scan found it.
   */
  const src = code("Rail.tsx");

  it("reaches for --ink-on-navy rather than the page inks", () => {
    expect(src).toContain("--ink-on-navy");
  });

  it("never puts a page ink on the navy ground", () => {
    // `text-ink` as a whole class, and its -soft/-muted siblings. Matched by
    // word boundary so `text-ink-on-navy`-style names could never trip it.
    const pageInk = /\btext-ink(-soft|-muted)?(?=[\s"'`])/;
    expect(
      pageInk.test(src),
      "Rail.tsx puts a page ink on the navy rail. Use --ink-on-navy.",
    ).toBe(false);
  });
});

describe("role gating never removes a place from the rail", () => {
  it("renders all six places and changes only the actions", () => {
    /*
     * "Every /coreedge route renders for every signed-in user, and only the
     * actions change, each disabled one carrying its reason." A rail that hides
     * what you cannot do leaves you unable to find out that it exists.
     */
    const src = code("Rail.tsx");
    expect(src).not.toMatch(/places\.filter|canSee|hasRole|visibleFor|permitted/);
    expect(src).toContain("places.map");
  });
});
