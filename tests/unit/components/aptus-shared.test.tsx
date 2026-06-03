/**
 * Unit tests for the App-2 shared components.
 *
 * Focus: invariants and tone resolution. Visual rendering is covered by
 * the visual-regression suite (App-8); these tests guard the logic.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  AptusMark,
  AptusWordmark,
  CoverageBar,
  StatusPill,
  StepRail,
  STEPS,
} from "@/components/aptus";

describe("AptusMark", () => {
  it("renders an SVG with the canonical viewBox (matches public/icons/aptus-mark.svg)", () => {
    const { container } = render(<AptusMark />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // ViewBox matches the live app's /icons/aptus-mark.svg asset
    expect(svg?.getAttribute("viewBox")).toBe("0 0 100 100");
  });

  it("respects the size prop", () => {
    const { container } = render(<AptusMark size={48} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("48");
    expect(svg?.getAttribute("height")).toBe("48");
  });

  it("uses currentColor fill so it inherits surrounding text color", () => {
    const { container } = render(<AptusMark />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("fill")).toBe("currentColor");
  });

  it("uses fill-rule even-odd for the cutout (single-path with hole)", () => {
    const { container } = render(<AptusMark />);
    const path = container.querySelector("path");
    expect(path?.getAttribute("fill-rule")).toBe("evenodd");
  });
});

describe("AptusWordmark", () => {
  it("renders 'ABeam Workbench' text", () => {
    const { container } = render(<AptusWordmark />);
    expect(container.textContent).toBe("ABeam Workbench");
  });

  it("scales the mark to size + 6", () => {
    const { container } = render(<AptusWordmark size={20} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("26"); // 20 + 6
  });
});

describe("StatusPill — tone resolution", () => {
  it("resolves canonical OOTB → success", () => {
    const { container } = render(<StatusPill status="OOTB" />);
    const pill = container.querySelector(".a-pill");
    expect(pill?.className).toContain("a-pill-success");
  });

  it("resolves Gap → danger", () => {
    const { container } = render(<StatusPill status="Gap" />);
    expect(container.querySelector(".a-pill")?.className).toContain("a-pill-danger");
  });

  it("resolves Mandatory → warning", () => {
    const { container } = render(<StatusPill status="Mandatory" />);
    expect(container.querySelector(".a-pill")?.className).toContain("a-pill-warning");
  });

  it("falls back to neutral for unknown status", () => {
    const { container } = render(<StatusPill status="Xyzzy-not-a-real-status" />);
    expect(container.querySelector(".a-pill")?.className).toContain("a-pill-neutral");
  });

  it("explicit tone wins over PILL_MAP", () => {
    const { container } = render(<StatusPill status="OOTB" tone="danger" />);
    expect(container.querySelector(".a-pill")?.className).toContain("a-pill-danger");
  });

  it("includes plain-language outcome labels (from glossary)", () => {
    expect(render(<StatusPill status="Standard SAP" />).container.querySelector(".a-pill")?.className).toContain("a-pill-success");
    expect(render(<StatusPill status="Configurable" />).container.querySelector(".a-pill")?.className).toContain("a-pill-warning");
    expect(render(<StatusPill status="Trusted add-on" />).container.querySelector(".a-pill")?.className).toContain("a-pill-info");
    expect(render(<StatusPill status="Custom build" />).container.querySelector(".a-pill")?.className).toContain("a-pill-danger");
    expect(render(<StatusPill status="Out of scope" />).container.querySelector(".a-pill")?.className).toContain("a-pill-neutral");
  });

  it("renders chevron only when withChevron=true", () => {
    const noChev = render(<StatusPill status="In Analyze" />).container;
    const withChev = render(<StatusPill status="In Analyze" withChevron />).container;
    // lucide-react renders SVGs with class="lucide-chevron-down" — easier check:
    expect(noChev.querySelectorAll("svg").length).toBe(0);
    expect(withChev.querySelectorAll("svg").length).toBe(1);
  });
});

describe("CoverageBar", () => {
  it("default 'stacked' renders 3 segments", () => {
    const { container } = render(<CoverageBar ootb={60} config={20} gap={20} />);
    expect(container.querySelectorAll(".a-coverage-seg").length).toBe(3);
  });

  it("'donut' renders an SVG", () => {
    const { container } = render(<CoverageBar ootb={60} config={20} gap={20} variant="donut" />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("'numbers' renders three values", () => {
    const { container } = render(<CoverageBar ootb={62} config={17} gap={21} variant="numbers" />);
    const text = container.textContent ?? "";
    expect(text).toContain("62%");
    expect(text).toContain("17%");
    expect(text).toContain("21%");
  });

  it("handles zero total without divide-by-zero (renders 0% segments)", () => {
    expect(() => render(<CoverageBar ootb={0} config={0} gap={0} />)).not.toThrow();
  });
});

describe("StepRail — STEPS canonical contract", () => {
  it("exports exactly 5 steps", () => {
    expect(STEPS).toHaveLength(5);
  });

  it("step keys are exactly the spec's 5: profile/scope/analyze/adjust/export", () => {
    expect(STEPS.map((s) => s.key)).toEqual(["profile", "scope", "analyze", "adjust", "export"]);
  });

  it("step numbers are 1..5 sequential", () => {
    expect(STEPS.map((s) => s.n)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("StepRail — render variants", () => {
  it("'rail' renders 5 step items", () => {
    const { container } = render(<StepRail current={3} completed={[1, 2]} />);
    expect(container.querySelectorAll(".a-step-item").length).toBe(5);
  });

  it("marks completed steps + current step correctly", () => {
    const { container } = render(<StepRail current={3} completed={[1, 2]} />);
    const items = container.querySelectorAll(".a-step-item");
    expect(items[0]?.className).toContain("a-complete");
    expect(items[1]?.className).toContain("a-complete");
    expect(items[2]?.className).toContain("a-active");
    expect(items[3]?.className).not.toContain("a-active");
    expect(items[3]?.className).not.toContain("a-locked"); // 4 is reachable from 3
    expect(items[4]?.className).toContain("a-locked"); // 5 is gated by 4
  });

  it("'progress' renders 5 segments", () => {
    const { container } = render(<StepRail current={3} completed={[1, 2]} variant="progress" />);
    // 5 segments rendered as inner divs of the bar
    expect(container.querySelectorAll(".a-step-progress > div").length).toBe(5);
  });

  it("'breadcrumb' renders 5 buttons", () => {
    const { container } = render(<StepRail current={3} completed={[1, 2]} variant="breadcrumb" />);
    expect(container.querySelectorAll("button").length).toBe(5);
  });
});
