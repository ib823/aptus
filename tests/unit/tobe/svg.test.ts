/**
 * 2608 WS6 — the string SVG renderer: well-formed, escaped, one lane per
 * role, every step drawn once, and snapshots so a layout change is a
 * reviewed change.
 */
import { describe, expect, it } from "vitest";

import { generateTobePack } from "@/lib/tobe/engine";
import { escapeXml, l3Rows, layoutL2, renderL1Svg, renderL2Svg, wrapText } from "@/lib/tobe/svg";

import { fixtureInput } from "./fixtures";

const doc = generateTobePack(
  fixtureInput({
    answers: [
      { questionId: "Q-1", choice: "deviate", reason: "two-level approval" },
      { questionId: "Q-3", choice: "discuss", reason: null },
    ],
  }),
);
const aaa = doc.scopeItems.find((i) => i.code === "AAA")!;

function parse(svg: string): Document {
  const d = new DOMParser().parseFromString(svg, "image/svg+xml");
  const err = d.getElementsByTagName("parsererror");
  if (err.length) throw new Error(err[0]!.textContent ?? "parse error");
  return d;
}

describe("helpers", () => {
  it("escapeXml escapes the five characters", () => {
    expect(escapeXml(`<a & "b" 'c'>`)).toBe("&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;");
  });
  it("wrapText wraps on words and ellipsises the last line", () => {
    expect(wrapText("Advanced Available-to-Promise Processing (Optional)", 18, 2)).toEqual([
      "Advanced",
      "Available-to-Prom…",
    ]);
    expect(wrapText("Short", 18, 2)).toEqual(["Short"]);
  });
});

describe("layoutL2", () => {
  it("one lane per role in first-seen order; one node per step; unnamed roles get the honest label", () => {
    const L = layoutL2(aaa);
    expect(L.lanes.map((l) => l.role)).toEqual(["Internal Sales Representative", "Sales Manager"]);
    expect(L.nodes).toHaveLength(3);
    expect(L.nodes.map((n) => n.lane)).toEqual([0, 1, 0]);
    const noRole = layoutL2({ ...aaa, steps: aaa.steps.map((s) => ({ ...s, role: "" })) });
    expect(noRole.lanes.map((l) => l.role)).toEqual(["Role not named in BPD"]);
  });
});

describe("renderL2Svg", () => {
  const svg = renderL2Svg(aaa);
  it("is well-formed XML with an accessible name", () => {
    const d = parse(svg);
    const root = d.documentElement;
    expect(root.tagName).toBe("svg");
    expect(root.getAttribute("role")).toBe("img");
    expect(root.getAttribute("aria-labelledby")).toBe("l2-AAA-title");
    expect(d.querySelector("title")?.textContent).toContain("AAA — Quotation to Order");
  });
  it("draws every step once with its state and escapes text", () => {
    expect(svg.split('data-step="').length - 1).toBe(aaa.steps.length);
    for (const s of aaa.steps) expect(svg).toContain(`>${s.index}. `);
    expect(svg).toContain("1. Create Sales");
    expect(svg).toContain('data-state="CONFIGURED"');
    expect(svg).toContain("SSCUI 102751");
    const nasty = renderL2Svg({ ...aaa, title: `<script>alert("x")</script> & co` });
    expect(nasty).not.toContain("<script>");
    expect(nasty).toContain("&lt;script&gt;");
    parse(nasty);
  });
  it("matches the snapshot", () => {
    expect(svg).toMatchSnapshot();
  });
});

describe("renderL1Svg", () => {
  const svg = renderL1Svg(doc);
  it("is well-formed and shows every chain item with its scope status", () => {
    parse(svg);
    for (const code of ["AAA", "BBB", "CCC"]) expect(svg).toContain(`data-scope="${code}"`);
    expect(svg).toContain('data-in-scope="false"');
  });
  it("falls back to the scope items when no chain touches the scope set", () => {
    const noChain = generateTobePack(fixtureInput({ chains: [] }));
    const s = renderL1Svg(noChain);
    parse(s);
    expect(s).toContain('data-scope="AAA"');
    expect(s).toContain('data-scope="BBB"');
  });
  it("matches the snapshot", () => {
    expect(svg).toMatchSnapshot();
  });
});

describe("l3Rows", () => {
  it("carries the evidence string the PDF prints and the marker text", () => {
    const rows = l3Rows(aaa);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({
      index: 2,
      step: "Approve Quotation (Optional)",
      stateLabel: "Configured (SSCUI)",
      sscui: "102751 Define Reasons for Approval Requests",
    });
    expect(rows[1]!.marker).toContain("optional in BPD");
    expect(rows[1]!.evidence).toBe("scope AAA · BPD 2608 · SSCUI 102751 · BDC Q-1");
    expect(rows[0]!.sscui).toBe("—");
  });
});
