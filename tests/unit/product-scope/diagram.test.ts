import { describe, expect, it } from "vitest";
import { renderScopeDiagram } from "@/lib/product-scope/diagram";

describe("source-backed process diagram", () => {
  it("does not draw a diagram without ordered source steps", () => {
    expect(() => renderScopeDiagram({ code: "FP0", title: "People Profile", steps: [] })).toThrow("No source steps");
  });

  it("escapes SAP text rather than injecting markup into the SVG", () => {
    const svg = renderScopeDiagram({ code: "A&B", title: "Invoice <Review>", steps: [{ sequence: 1, title: "Check <script>alert(1)</script>" }] });
    expect(svg).toContain("Invoice &lt;Review&gt;");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("Aptus generated from imported SAP steps");
  });
});
